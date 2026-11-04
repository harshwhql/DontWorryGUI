import { useEffect, useMemo, useState } from 'react'
import {
  CirclePlay,
  CircleStop,
  Cog,
  PowerOff,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  X,
  Zap
} from 'lucide-react'
import type { ServiceDetail, ServiceEntry } from '@shared/types'
import { bytes, cn, dateTime } from '../../lib/format'
import { useDebounced, useResource } from '../../lib/hooks'
import {
  Badge,
  EmptyState,
  ErrorNote,
  IconButton,
  Input,
  Segmented
} from '../../components/ui/primitives'
import { CodeBlock, DataTable, KeyValue, type Column } from '../../components/ui/data'
import { ActionButton, CommandPeek } from '../../components/ActionButton'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'

type Scope = 'all' | 'running' | 'failed' | 'enabled'
type DetailTab = 'summary' | 'status' | 'logs'

export function ServicesView(): React.JSX.Element {
  const run = useApp((s) => s.run)
  const [scope, setScope] = useState<Scope>('running')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ServiceEntry | null>(null)
  const [tab, setTab] = useState<DetailTab>('summary')
  const [detail, setDetail] = useState<ServiceDetail | null>(null)
  const [statusText, setStatusText] = useState('')
  const [logText, setLogText] = useState('')
  const [busy, setBusy] = useState(false)
  const debounced = useDebounced(search, 200)

  const services = useResource<ServiceEntry[]>('services.list', {}, { intervalMs: 15_000 })

  const counts = useMemo(() => {
    const all = services.data ?? []
    return {
      total: all.length,
      running: all.filter((s) => s.sub === 'running').length,
      failed: all.filter((s) => s.active === 'failed' || s.sub === 'failed').length,
      enabled: all.filter((s) => s.enabled === 'enabled').length
    }
  }, [services.data])

  const rows = useMemo(() => {
    const all = services.data ?? []
    const term = debounced.trim().toLowerCase()
    return all.filter((service) => {
      if (scope === 'running' && service.sub !== 'running') return false
      if (scope === 'failed' && service.active !== 'failed' && service.sub !== 'failed') return false
      if (scope === 'enabled' && service.enabled !== 'enabled') return false
      if (!term) return true
      return (
        service.name.toLowerCase().includes(term) ||
        service.description.toLowerCase().includes(term)
      )
    })
  }, [services.data, scope, debounced])

  const loadDetail = async (service: ServiceEntry, which: DetailTab = tab): Promise<void> => {
    setBusy(true)
    try {
      if (which === 'summary' || !detail || detail.unit !== service.unit) {
        setDetail((await run<ServiceDetail>('services.detail', { unit: service.unit }, { quiet: true })) ?? null)
      }
      if (which === 'status') {
        setStatusText((await run<string>('services.status', { unit: service.unit }, { quiet: true })) ?? '')
      }
      if (which === 'logs') {
        setLogText(
          (await run<string>('services.logs', { unit: service.unit, lines: 300 }, { quiet: true })) ?? ''
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const select = (service: ServiceEntry): void => {
    setSelected(service)
    setDetail(null)
    setStatusText('')
    setLogText('')
    setTab('summary')
    void loadDetail(service, 'summary')
  }

  useEffect(() => {
    if (!selected) return
    void loadDetail(selected, tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const afterChange = (): void => {
    void services.refresh(true)
    if (selected) void loadDetail(selected, 'summary')
  }

  const columns: Column<ServiceEntry>[] = [
    {
      key: 'state',
      header: '',
      width: '14px',
      render: (row) => (
        <span
          className={cn(
            'block size-1.5 rounded-full',
            row.sub === 'running'
              ? 'bg-run'
              : row.active === 'failed' || row.sub === 'failed'
                ? 'bg-danger'
                : row.active === 'activating'
                  ? 'bg-warn'
                  : 'bg-ink-ghost'
          )}
          title={`${row.active} / ${row.sub}`}
        />
      )
    },
    {
      key: 'name',
      header: 'Service',
      width: 'minmax(140px,1.1fr)',
      sort: (row) => row.name,
      render: (row) => <span className="mono text-ink">{row.name}</span>
    },
    {
      key: 'active',
      header: 'Active',
      width: '82px',
      sort: (row) => row.active,
      render: (row) => (
        <span
          className={cn(
            'text-[11px]',
            row.active === 'active'
              ? 'text-run-bright'
              : row.active === 'failed'
                ? 'text-danger'
                : 'text-ink-faint'
          )}
        >
          {row.active}
        </span>
      )
    },
    {
      key: 'sub',
      header: 'Sub',
      width: '78px',
      sort: (row) => row.sub,
      className: 'mono text-[10.5px]',
      render: (row) => row.sub
    },
    {
      key: 'enabled',
      header: 'At boot',
      width: '78px',
      sort: (row) => row.enabled ?? '',
      render: (row) =>
        row.enabled ? (
          <Badge tone={row.enabled === 'enabled' ? 'info' : 'neutral'}>{row.enabled}</Badge>
        ) : (
          <span className="text-ink-ghost">—</span>
        )
    },
    {
      key: 'description',
      header: 'Description',
      width: 'minmax(0,1.4fr)',
      sort: (row) => row.description,
      render: (row) => <span className="truncate text-ink-faint">{row.description}</span>
    },
    {
      key: 'actions',
      header: '',
      width: '120px',
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-0.5">
          <CommandPeek actionId="services.restart" params={{ unit: row.unit }} />
          {row.sub === 'running' ? (
            <IconButton
              icon={CircleStop}
              label={`Stop ${row.name}`}
              size="xs"
              onClick={(event) => {
                event.stopPropagation()
                void run('services.stop', { unit: row.unit }, { successMessage: `${row.name} stopped` }).then(
                  afterChange
                )
              }}
            />
          ) : (
            <IconButton
              icon={CirclePlay}
              label={`Start ${row.name}`}
              size="xs"
              onClick={(event) => {
                event.stopPropagation()
                void run('services.start', { unit: row.unit }, { successMessage: `${row.name} started` }).then(
                  afterChange
                )
              }}
            />
          )}
          <IconButton
            icon={RotateCw}
            label={`Restart ${row.name}`}
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              void run('services.restart', { unit: row.unit }, { successMessage: `${row.name} restarted` }).then(
                afterChange
              )
            }}
          />
        </span>
      )
    }
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={Cog}
        title="Services"
        subtitle={`${counts.running} running · ${counts.failed} failed · ${counts.enabled} start at boot · ${counts.total} units`}
        onRefresh={() => void services.refresh()}
        refreshing={services.loading}
        lastUpdated={services.lastUpdated}
      >
        <div className="relative w-52">
          <Search
            size={12}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-ghost"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter services"
            className="pl-7"
            aria-label="Filter services"
          />
        </div>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'running', label: 'Running' },
            { value: 'failed', label: `Failed${counts.failed ? ` ${counts.failed}` : ''}` },
            { value: 'enabled', label: 'At boot' },
            { value: 'all', label: 'All' }
          ]}
        />
        <ActionButton
          actionId="services.daemonReload"
          icon={RefreshCw}
          variant="outline"
          size="sm"
          options={{ successMessage: 'Unit files reloaded' }}
          onDone={() => void services.refresh(true)}
        >
          daemon-reload
        </ActionButton>
      </ViewHeader>

      {services.error ? (
        <ErrorNote message={services.error} onRetry={() => void services.refresh()} />
      ) : null}

      <div className="flex min-h-0 flex-1">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.unit}
          onRowClick={select}
          isSelected={(row) => selected?.unit === row.unit}
          defaultSortKey="name"
          defaultSortDir="asc"
          rowTone={(row) => (row.active === 'failed' ? 'bg-danger/5' : undefined)}
          emptyState={
            <EmptyState
              icon={Cog}
              title={services.initial ? 'Reading systemd units' : 'No services match'}
              message={
                services.initial ? undefined : 'Switch the filter to All to see inactive units too.'
              }
            />
          }
          footer={
            <>
              <span>
                {rows.length} of {counts.total} units
              </span>
              <span className="mono">systemctl list-units --type=service --all</span>
            </>
          }
        />

        {selected ? (
          <aside className="anim-fade-up flex w-[440px] shrink-0 flex-col border-l border-line bg-surface/60">
            <header className="flex items-start gap-2 border-b border-line px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <h2 className="mono truncate text-[13px] font-semibold text-ink">{selected.unit}</h2>
                <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                  {selected.description || 'No description provided by the unit file'}
                </p>
              </div>
              <IconButton icon={X} label="Close details" onClick={() => setSelected(null)} />
            </header>

            <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
              <ActionButton
                actionId="services.start"
                params={{ unit: selected.unit }}
                icon={CirclePlay}
                variant="primary"
                size="xs"
                options={{ successMessage: 'Service started' }}
                onDone={afterChange}
                disabled={selected.sub === 'running'}
              >
                Start
              </ActionButton>
              <ActionButton
                actionId="services.restart"
                params={{ unit: selected.unit }}
                icon={RotateCw}
                size="xs"
                options={{ successMessage: 'Service restarted' }}
                onDone={afterChange}
              >
                Restart
              </ActionButton>
              <ActionButton
                actionId="services.reload"
                params={{ unit: selected.unit }}
                icon={Sparkles}
                size="xs"
                options={{ successMessage: 'Configuration reloaded' }}
                onDone={afterChange}
              >
                Reload
              </ActionButton>
              <ActionButton
                actionId="services.stop"
                params={{ unit: selected.unit }}
                icon={CircleStop}
                variant="danger"
                size="xs"
                options={{ successMessage: 'Service stopped' }}
                onDone={afterChange}
                disabled={selected.sub !== 'running'}
              >
                Stop
              </ActionButton>
              {selected.enabled === 'enabled' ? (
                <ActionButton
                  actionId="services.disable"
                  params={{ unit: selected.unit }}
                  icon={PowerOff}
                  variant="warn"
                  size="xs"
                  options={{ successMessage: 'Will no longer start at boot' }}
                  onDone={afterChange}
                >
                  Disable at boot
                </ActionButton>
              ) : (
                <ActionButton
                  actionId="services.enable"
                  params={{ unit: selected.unit }}
                  icon={Zap}
                  size="xs"
                  options={{ successMessage: 'Will start at boot' }}
                  onDone={afterChange}
                >
                  Enable at boot
                </ActionButton>
              )}
            </div>

            <div className="border-b border-line px-3 py-1.5">
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'summary', label: 'Summary' },
                  { value: 'status', label: 'systemctl status' },
                  { value: 'logs', label: 'Journal' }
                ]}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {tab === 'summary' ? (
                detail ? (
                  <KeyValue
                    rows={[
                      { label: 'Active state', value: `${detail.activeState} (${detail.subState})` },
                      { label: 'Unit file', value: detail.unitFileState },
                      { label: 'Main PID', value: detail.mainPid ? String(detail.mainPid) : '—', mono: true },
                      {
                        label: 'Memory',
                        value: detail.memoryBytes ? bytes(detail.memoryBytes) : '—',
                        mono: true
                      },
                      {
                        label: 'CPU time',
                        value: detail.cpuUsageNs
                          ? `${(detail.cpuUsageNs / 1e9).toFixed(1)}s`
                          : '—',
                        mono: true
                      },
                      {
                        label: 'Active since',
                        value: detail.since && detail.since !== '' ? detail.since : '—'
                      },
                      { label: 'Restart policy', value: detail.restart ?? '—', mono: true },
                      { label: 'Unit path', value: detail.fragmentPath ?? '—', mono: true },
                      { label: 'ExecStart', value: detail.execStart ?? '—', mono: true }
                    ]}
                  />
                ) : (
                  <p className="text-[11.5px] text-ink-ghost">
                    {busy ? 'Reading unit properties…' : 'No properties returned.'}
                  </p>
                )
              ) : tab === 'status' ? (
                <CodeBlock
                  code={statusText || (busy ? 'Reading…' : 'No status output.')}
                  tone="ink"
                  maxHeight="max-h-[520px]"
                  wrap
                />
              ) : (
                <CodeBlock
                  code={logText || (busy ? 'Reading…' : 'No journal entries for this unit.')}
                  tone="ink"
                  maxHeight="max-h-[520px]"
                  wrap
                />
              )}
            </div>

            {selected.enabled !== 'enabled' ? (
              <p className="border-t border-line px-3 py-2 text-[10.5px] leading-snug text-ink-ghost">
                This unit does not start automatically. Enabling it creates the symlinks systemd
                reads at boot.
              </p>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
