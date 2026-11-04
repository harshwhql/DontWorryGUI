import { useMemo, useState } from 'react'
import {
  Activity,
  Globe,
  Network,
  Plus,
  Radar,
  Router,
  Shield,
  ShieldOff,
  Trash2,
  Waves
} from 'lucide-react'
import type { FirewallState, ListeningPort, NetInterface, RouteEntry } from '@shared/types'
import { cn } from '../../lib/format'
import { useResource } from '../../lib/hooks'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Panel,
  PanelHeader,
  Segmented,
  Select
} from '../../components/ui/primitives'
import { CodeBlock, DataTable, KeyValue, type Column } from '../../components/ui/data'
import { Modal } from '../../components/ui/overlay'
import { ActionButton, CommandPeek } from '../../components/ActionButton'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'

const WELL_KNOWN: Record<number, string> = {
  22: 'SSH',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP',
  110: 'POP3',
  143: 'IMAP',
  443: 'HTTPS',
  465: 'SMTPS',
  587: 'SMTP submission',
  993: 'IMAPS',
  3000: 'app server',
  3306: 'MySQL',
  5432: 'PostgreSQL',
  6379: 'Redis',
  8080: 'HTTP alt',
  9000: 'app server',
  27017: 'MongoDB'
}

export function NetworkView(): React.JSX.Element {
  const run = useApp((s) => s.run)
  const facts = useApp((s) => s.activeConnection()?.facts)

  const [tab, setTab] = useState<'ports' | 'interfaces' | 'routes' | 'firewall' | 'tools'>('ports')
  const [ruleOpen, setRuleOpen] = useState(false)
  const [port, setPort] = useState('')
  const [protocol, setProtocol] = useState('tcp')
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('1.1.1.1')
  const [toolOutput, setToolOutput] = useState('')

  const ports = useResource<ListeningPort[]>('network.ports', {}, { intervalMs: 20_000 })
  const interfaces = useResource<NetInterface[]>('network.interfaces', {})
  const routes = useResource<RouteEntry[]>('network.routes', {}, { enabled: tab === 'routes' })
  const firewall = useResource<FirewallState>('firewall.status', {}, { enabled: tab === 'firewall' })
  const dns = useResource<string>('network.dns', {}, { enabled: tab === 'interfaces' })

  const portColumns: Column<ListeningPort>[] = [
    {
      key: 'port',
      header: 'Port',
      width: '72px',
      align: 'right',
      sort: (row) => row.port,
      render: (row) => <span className="mono font-medium text-ink">{row.port}</span>
    },
    {
      key: 'protocol',
      header: 'Proto',
      width: '58px',
      sort: (row) => row.protocol,
      className: 'mono text-[10.5px]',
      render: (row) => row.protocol
    },
    {
      key: 'service',
      header: 'Likely service',
      width: 'minmax(110px,150px)',
      sort: (row) => WELL_KNOWN[row.port] ?? '',
      render: (row) =>
        WELL_KNOWN[row.port] ? (
          <span className="text-info">{WELL_KNOWN[row.port]}</span>
        ) : (
          <span className="text-ink-ghost">—</span>
        )
    },
    {
      key: 'address',
      header: 'Bound to',
      width: 'minmax(120px,1fr)',
      sort: (row) => row.localAddress,
      className: 'mono text-[10.5px]',
      render: (row) => (
        <span
          className={
            row.localAddress === '0.0.0.0' || row.localAddress === '*' || row.localAddress === '[::]'
              ? 'text-warn'
              : undefined
          }
          title={
            row.localAddress === '0.0.0.0' || row.localAddress === '*'
              ? 'Reachable from any network interface'
              : 'Bound to a specific address'
          }
        >
          {row.localAddress}
        </span>
      )
    },
    {
      key: 'process',
      header: 'Process',
      width: 'minmax(100px,1fr)',
      sort: (row) => row.process ?? '',
      render: (row) =>
        row.process ? (
          <span className="mono">
            {row.process}
            {row.pid ? <span className="text-ink-ghost"> ({row.pid})</span> : null}
          </span>
        ) : (
          <span className="text-ink-ghost">needs root</span>
        )
    },
    {
      key: 'actions',
      header: '',
      width: '92px',
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-0.5">
          <CommandPeek
            actionId="firewall.allow"
            params={{ port: String(row.port), protocol: row.protocol.replace('6', '') }}
          />
          <IconButton
            icon={Shield}
            label={`Allow port ${row.port} through the firewall`}
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              void run(
                'firewall.allow',
                { port: String(row.port), protocol: row.protocol.replace('6', '') },
                { successMessage: `Port ${row.port} allowed` }
              ).then(() => firewall.refresh(true))
            }}
          />
        </span>
      )
    }
  ]

  const exposed = useMemo(
    () =>
      (ports.data ?? []).filter(
        (p) => p.localAddress === '0.0.0.0' || p.localAddress === '*' || p.localAddress === '[::]'
      ).length,
    [ports.data]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={Network}
        title="Network & firewall"
        subtitle={`${ports.data?.length ?? 0} listening sockets · ${exposed} reachable from anywhere · firewall: ${facts?.firewall ?? 'unknown'}`}
        onRefresh={() => {
          void ports.refresh()
          void interfaces.refresh()
          if (tab === 'firewall') void firewall.refresh()
          if (tab === 'routes') void routes.refresh()
        }}
        refreshing={ports.loading || interfaces.loading}
        lastUpdated={ports.lastUpdated}
      >
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ports', label: 'Open ports' },
            { value: 'interfaces', label: 'Interfaces' },
            { value: 'routes', label: 'Routes' },
            { value: 'firewall', label: 'Firewall' },
            { value: 'tools', label: 'Diagnostics' }
          ]}
        />
      </ViewHeader>

      {tab === 'ports' ? (
        <>
          {ports.error ? <ErrorNote message={ports.error} onRetry={() => void ports.refresh()} /> : null}
          <DataTable
            rows={ports.data ?? []}
            columns={portColumns}
            rowKey={(row) => `${row.protocol}-${row.localAddress}-${row.port}`}
            defaultSortKey="port"
            defaultSortDir="asc"
            rowTone={(row) =>
              row.localAddress === '0.0.0.0' || row.localAddress === '*' ? 'bg-warn/4' : undefined
            }
            emptyState={
              <EmptyState
                icon={Radar}
                title={ports.initial ? 'Scanning listening sockets' : 'Nothing is listening'}
                message={
                  ports.initial
                    ? undefined
                    : 'Either nothing is bound to a port, or the account cannot read socket owners.'
                }
              />
            }
            footer={
              <>
                <span>Amber rows are bound to every interface, so they are reachable from the network.</span>
                <span className="mono">ss -tulpnH</span>
              </>
            }
          />
        </>
      ) : null}

      {tab === 'interfaces' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(interfaces.data ?? []).map((iface) => (
              <Panel key={iface.name}>
                <PanelHeader
                  title={<span className="mono">{iface.name}</span>}
                  icon={Waves}
                  subtitle={iface.mac}
                  actions={
                    <Badge tone={iface.state === 'up' ? 'run' : 'neutral'}>{iface.state}</Badge>
                  }
                />
                <div className="p-3">
                  {iface.addresses.length === 0 ? (
                    <p className="text-[11.5px] text-ink-ghost">No addresses assigned.</p>
                  ) : (
                    <KeyValue
                      dense
                      rows={iface.addresses.map((address) => ({
                        label: address.family === 'inet' ? 'IPv4' : 'IPv6',
                        value: `${address.address}/${address.prefix}`,
                        mono: true
                      }))}
                    />
                  )}
                  {iface.mtu ? (
                    <p className="mono mt-2 text-[10.5px] text-ink-ghost">MTU {iface.mtu}</p>
                  ) : null}
                </div>
              </Panel>
            ))}
            {interfaces.data?.length === 0 ? (
              <EmptyState icon={Network} title="No interfaces reported" />
            ) : null}
          </div>

          <Panel className="mt-3">
            <PanelHeader title="DNS resolution" icon={Globe} />
            <div className="p-2.5">
              <CodeBlock code={dns.data ?? 'Reading…'} tone="ink" maxHeight="max-h-64" wrap />
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === 'routes' ? (
        <DataTable
          rows={routes.data ?? []}
          columns={[
            {
              key: 'destination',
              header: 'Destination',
              width: 'minmax(140px,1fr)',
              sort: (row) => row.destination,
              className: 'mono',
              render: (row) => (
                <span className={row.destination === 'default' ? 'text-run-bright' : 'text-ink'}>
                  {row.destination}
                </span>
              )
            },
            {
              key: 'gateway',
              header: 'Via',
              width: 'minmax(120px,180px)',
              sort: (row) => row.gateway ?? '',
              className: 'mono text-[10.5px]',
              render: (row) => row.gateway ?? '—'
            },
            {
              key: 'dev',
              header: 'Interface',
              width: 'minmax(90px,140px)',
              sort: (row) => row.dev ?? '',
              className: 'mono text-[10.5px]',
              render: (row) => row.dev ?? '—'
            },
            {
              key: 'protocol',
              header: 'Protocol',
              width: 'minmax(80px,120px)',
              className: 'text-[10.5px]',
              render: (row) => row.protocol ?? '—'
            },
            {
              key: 'metric',
              header: 'Metric',
              width: '70px',
              align: 'right',
              sort: (row) => row.metric ?? 0,
              className: 'mono text-[10.5px]',
              render: (row) => row.metric ?? '—'
            }
          ]}
          rowKey={(row) => `${row.destination}-${row.dev}-${row.gateway}`}
          emptyState={<EmptyState icon={Router} title="No routes returned" />}
          footer={<span className="mono">ip route show</span>}
        />
      ) : null}

      {tab === 'firewall' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {facts?.firewall === 'none' ? (
            <Panel>
              <EmptyState
                icon={ShieldOff}
                title="No firewall tool installed"
                message="Install ufw or firewalld on the server and reconnect, and this page will manage it for you."
              />
            </Panel>
          ) : (
            <>
              <Panel className="mb-3">
                <PanelHeader
                  title={`${facts?.firewall} firewall`}
                  icon={Shield}
                  subtitle={
                    firewall.data?.active
                      ? 'Active: rules below are enforced'
                      : 'Inactive: every port is reachable'
                  }
                  actions={
                    <>
                      <Badge tone={firewall.data?.active ? 'run' : 'danger'}>
                        {firewall.data?.active ? 'active' : 'inactive'}
                      </Badge>
                      <Button size="xs" variant="primary" icon={Plus} onClick={() => setRuleOpen(true)}>
                        Add rule
                      </Button>
                      {firewall.data?.active ? (
                        <ActionButton
                          actionId="firewall.disable"
                          icon={ShieldOff}
                          variant="danger"
                          size="xs"
                          options={{ successMessage: 'Firewall disabled' }}
                          onDone={() => void firewall.refresh(true)}
                        >
                          Turn off
                        </ActionButton>
                      ) : (
                        <ActionButton
                          actionId="firewall.enable"
                          icon={Shield}
                          variant="warn"
                          size="xs"
                          options={{
                            successMessage: 'Firewall enabled',
                            confirmBody:
                              'Make sure SSH is allowed before enabling the firewall, or this session will be your last one.'
                          }}
                          onDone={() => void firewall.refresh(true)}
                        >
                          Turn on
                        </ActionButton>
                      )}
                    </>
                  }
                />
                <div className="grid grid-cols-2 gap-4 p-3">
                  <KeyValue
                    dense
                    rows={[
                      { label: 'Backend', value: firewall.data?.backend ?? '—', mono: true },
                      { label: 'Incoming default', value: firewall.data?.defaultIncoming ?? '—' },
                      { label: 'Outgoing default', value: firewall.data?.defaultOutgoing ?? '—' },
                      { label: 'Rules', value: String(firewall.data?.rules.length ?? 0), mono: true }
                    ]}
                  />
                  <p className="text-[11.5px] leading-relaxed text-ink-faint">
                    Rules are applied in order. Adding a rule here runs the native command for this
                    backend. Tap the{' '}
                    <span className="text-run-bright">command icon</span> on any button to read it
                    first.
                  </p>
                </div>
              </Panel>

              <Panel>
                <PanelHeader title="Rules" icon={Shield} />
                {(firewall.data?.rules.length ?? 0) === 0 ? (
                  <EmptyState
                    icon={Shield}
                    title={firewall.initial ? 'Reading the rule set' : 'No rules configured'}
                    compact
                  />
                ) : (
                  <ul className="divide-y divide-line/50">
                    {firewall.data!.rules.map((rule, index) => (
                      <li
                        key={`${rule.raw}-${index}`}
                        className="flex items-center gap-2.5 px-3 py-1.5"
                      >
                        <span
                          className={cn(
                            'size-1.5 shrink-0 rounded-full',
                            rule.action === 'ALLOW'
                              ? 'bg-run'
                              : rule.action === 'LIMIT'
                                ? 'bg-warn'
                                : 'bg-danger'
                          )}
                          aria-hidden
                        />
                        <code className="min-w-0 flex-1 truncate text-[11px] text-ink-dim">
                          {rule.raw}
                        </code>
                        {rule.action ? (
                          <Badge tone={rule.action === 'ALLOW' ? 'run' : 'danger'}>{rule.action}</Badge>
                        ) : null}
                        {facts?.firewall === 'ufw' ? (
                          <ActionButton
                            actionId="firewall.deleteRule"
                            params={{ rule: rule.to ?? rule.raw }}
                            icon={Trash2}
                            variant="danger"
                            size="xs"
                            peek={false}
                            options={{ successMessage: 'Rule deleted' }}
                            onDone={() => void firewall.refresh(true)}
                          >
                            Delete
                          </ActionButton>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </div>
      ) : null}

      {tab === 'tools' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <Panel className="mb-3">
            <PanelHeader
              title="Reachability"
              icon={Activity}
              subtitle="Run the classic tools from the server's point of view"
            />
            <div className="flex flex-col gap-3 p-3">
              <div className="flex items-end gap-2">
                <Field label="Target host or IP" className="max-w-xs flex-1">
                  <Input
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    placeholder="1.1.1.1"
                    mono
                  />
                </Field>
                <ActionButton
                  actionId="network.ping"
                  params={{ target, count: 4 }}
                  size="sm"
                  options={{ quiet: true }}
                  onDone={(data) => setToolOutput(String(data ?? ''))}
                >
                  Ping
                </ActionButton>
                <ActionButton
                  actionId="network.traceroute"
                  params={{ target }}
                  size="sm"
                  variant="outline"
                  options={{ quiet: true }}
                  onDone={(data) => setToolOutput(String(data ?? ''))}
                >
                  Trace route
                </ActionButton>
                <ActionButton
                  actionId="network.speedCheck"
                  size="sm"
                  variant="outline"
                  options={{ quiet: true }}
                  onDone={(data) => setToolOutput(String(data ?? ''))}
                >
                  Download speed
                </ActionButton>
              </div>
              <CodeBlock
                code={toolOutput || 'Pick a tool above. The output lands here.'}
                tone="ink"
                maxHeight="max-h-[420px]"
                wrap
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Established connections" icon={Globe} />
            <EstablishedList />
          </Panel>
        </div>
      ) : null}

      {/* add rule */}
      <Modal
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        title="Add a firewall rule"
        subtitle={`Applied with ${facts?.firewall}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRuleOpen(false)}>
              Cancel
            </Button>
            <ActionButton
              actionId="firewall.deny"
              params={{ port, protocol }}
              variant="danger"
              size="sm"
              disabled={!port.trim()}
              options={{ successMessage: `Port ${port} blocked` }}
              onDone={() => {
                setRuleOpen(false)
                void firewall.refresh(true)
              }}
            >
              Block
            </ActionButton>
            <ActionButton
              actionId="firewall.allow"
              params={{ port, protocol, from: source || undefined }}
              variant="primary"
              size="sm"
              disabled={!port.trim()}
              options={{ successMessage: `Port ${port} allowed` }}
              onDone={() => {
                setRuleOpen(false)
                void firewall.refresh(true)
              }}
            >
              Allow
            </ActionButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Port" required hint="A single port, or a range like 8000:8010.">
              <Input value={port} onChange={(event) => setPort(event.target.value)} placeholder="443" mono />
            </Field>
            <Field label="Protocol">
              <Select value={protocol} onChange={(event) => setProtocol(event.target.value)}>
                <option value="tcp">tcp</option>
                <option value="udp">udp</option>
                <option value="any">any</option>
              </Select>
            </Field>
          </div>
          <Field
            label="Only from this source"
            hint="Optional. An address or CIDR block, for example 10.0.0.0/8."
          >
            <Input value={source} onChange={(event) => setSource(event.target.value)} mono />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function EstablishedList(): React.JSX.Element {
  const connections = useResource<
    { raw: string; local: string; peer: string; process?: string; pid?: number }[]
  >('network.connections', {}, { intervalMs: 15_000 })

  if ((connections.data?.length ?? 0) === 0) {
    return (
      <EmptyState
        icon={Globe}
        title={connections.initial ? 'Reading sockets' : 'No established connections'}
        compact
      />
    )
  }

  return (
    <ul className="max-h-72 divide-y divide-line/50 overflow-y-auto">
      {connections.data!.map((row, index) => (
        <li key={`${row.raw}-${index}`} className="flex items-center gap-2.5 px-3 py-1">
          <code className="mono w-44 shrink-0 truncate text-[10.5px] text-ink-faint">{row.local}</code>
          <span className="text-ink-ghost">→</span>
          <code className="mono w-44 shrink-0 truncate text-[10.5px] text-ink-dim">{row.peer}</code>
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-ghost">
            {row.process ? `${row.process}${row.pid ? ` (${row.pid})` : ''}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
