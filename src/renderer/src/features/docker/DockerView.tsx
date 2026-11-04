import { useMemo, useState } from 'react'
import {
  Box,
  CirclePlay,
  CircleStop,
  Container,
  Download,
  HardDrive,
  Layers,
  Network,
  Pause,
  Play,
  RotateCw,
  ScrollText,
  Trash2,
  Trash,
  X
} from 'lucide-react'
import type { DockerContainer, DockerImage, DockerStat, DockerVolume } from '@shared/types'
import { cn, usageTone } from '../../lib/format'
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
  Segmented
} from '../../components/ui/primitives'
import { CodeBlock, DataTable, Meter, type Column } from '../../components/ui/data'
import { Modal } from '../../components/ui/overlay'
import { ActionButton, CommandPeek } from '../../components/ActionButton'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'

type Tab = 'containers' | 'images' | 'volumes' | 'networks'

export function DockerView(): React.JSX.Element {
  const run = useApp((s) => s.run)
  const queueTerminal = useApp((s) => s.queueTerminal)
  const setView = useApp((s) => s.setView)
  const version = useApp((s) => s.activeConnection()?.facts?.dockerVersion)

  const [tab, setTab] = useState<Tab>('containers')
  const [selected, setSelected] = useState<DockerContainer | null>(null)
  const [logs, setLogs] = useState('')
  const [inspect, setInspect] = useState('')
  const [detailTab, setDetailTab] = useState<'logs' | 'inspect'>('logs')
  const [pullOpen, setPullOpen] = useState(false)
  const [image, setImage] = useState('')
  const [pullOutput, setPullOutput] = useState('')

  const containers = useResource<DockerContainer[]>('docker.containers', {}, { intervalMs: 10_000 })
  const stats = useResource<DockerStat[]>('docker.stats', {}, {
    intervalMs: 12_000,
    enabled: tab === 'containers'
  })
  const images = useResource<DockerImage[]>('docker.images', {}, { enabled: tab === 'images' })
  const volumes = useResource<DockerVolume[]>('docker.volumes', {}, { enabled: tab === 'volumes' })
  const networks = useResource<{ id: string; name: string; driver: string; scope: string }[]>(
    'docker.networks',
    {},
    { enabled: tab === 'networks' }
  )

  const statsById = useMemo(() => {
    const map = new Map<string, DockerStat>()
    for (const stat of stats.data ?? []) map.set(stat.name, stat)
    return map
  }, [stats.data])

  const counts = useMemo(() => {
    const all = containers.data ?? []
    return {
      total: all.length,
      running: all.filter((c) => c.state === 'running').length,
      exited: all.filter((c) => c.state === 'exited').length
    }
  }, [containers.data])

  const openDetail = async (container: DockerContainer, which = detailTab): Promise<void> => {
    setSelected(container)
    setDetailTab(which)
    if (which === 'logs') {
      setLogs('Reading…')
      setLogs((await run<string>('docker.logs', { id: container.id, lines: 400 }, { quiet: true })) ?? '')
    } else {
      setInspect('Reading…')
      setInspect((await run<string>('docker.inspect', { id: container.id }, { quiet: true })) ?? '')
    }
  }

  const afterChange = (): void => {
    void containers.refresh(true)
    void stats.refresh(true)
  }

  const containerColumns: Column<DockerContainer>[] = [
    {
      key: 'state',
      header: '',
      width: '14px',
      render: (row) => (
        <span
          className={cn(
            'block size-1.5 rounded-full',
            row.state === 'running'
              ? 'bg-run'
              : row.state === 'paused'
                ? 'bg-warn'
                : row.state === 'restarting'
                  ? 'bg-info'
                  : 'bg-ink-ghost'
          )}
          title={row.state}
        />
      )
    },
    {
      key: 'name',
      header: 'Container',
      width: 'minmax(130px,1fr)',
      sort: (row) => row.name,
      render: (row) => <span className="mono text-ink">{row.name}</span>
    },
    {
      key: 'image',
      header: 'Image',
      width: 'minmax(130px,1fr)',
      sort: (row) => row.image,
      className: 'mono text-[10.5px]',
      render: (row) => row.image
    },
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(110px,160px)',
      sort: (row) => row.status,
      render: (row) => (
        <span className={row.state === 'running' ? 'text-run-bright' : 'text-ink-faint'}>
          {row.status}
        </span>
      )
    },
    {
      key: 'cpu',
      header: 'CPU',
      width: '66px',
      align: 'right',
      sort: (row) => statsById.get(row.name)?.cpuPercent ?? -1,
      render: (row) => {
        const stat = statsById.get(row.name)
        return stat ? (
          <span className={cn('tabular', usageTone(stat.cpuPercent))}>
            {stat.cpuPercent.toFixed(1)}%
          </span>
        ) : (
          <span className="text-ink-ghost">—</span>
        )
      }
    },
    {
      key: 'mem',
      header: 'Memory',
      width: 'minmax(96px,130px)',
      align: 'right',
      sort: (row) => statsById.get(row.name)?.memPercent ?? -1,
      className: 'mono text-[10.5px]',
      render: (row) => statsById.get(row.name)?.memUsage ?? '—'
    },
    {
      key: 'ports',
      header: 'Ports',
      width: 'minmax(0,1fr)',
      sort: (row) => row.ports,
      className: 'mono text-[10.5px]',
      render: (row) => <span className="truncate">{row.ports || '—'}</span>
    },
    {
      key: 'actions',
      header: '',
      width: '134px',
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-0.5">
          <CommandPeek actionId="docker.restart" params={{ id: row.id }} />
          {row.state === 'running' ? (
            <>
              <IconButton
                icon={CircleStop}
                label={`Stop ${row.name}`}
                size="xs"
                onClick={(event) => {
                  event.stopPropagation()
                  void run('docker.stop', { id: row.id }, { successMessage: `${row.name} stopped` }).then(
                    afterChange
                  )
                }}
              />
              <IconButton
                icon={RotateCw}
                label={`Restart ${row.name}`}
                size="xs"
                onClick={(event) => {
                  event.stopPropagation()
                  void run('docker.restart', { id: row.id }, { successMessage: `${row.name} restarted` }).then(
                    afterChange
                  )
                }}
              />
            </>
          ) : (
            <IconButton
              icon={CirclePlay}
              label={`Start ${row.name}`}
              size="xs"
              onClick={(event) => {
                event.stopPropagation()
                void run('docker.start', { id: row.id }, { successMessage: `${row.name} started` }).then(
                  afterChange
                )
              }}
            />
          )}
          <IconButton
            icon={ScrollText}
            label={`Logs for ${row.name}`}
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              void openDetail(row, 'logs')
            }}
          />
        </span>
      )
    }
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={Container}
        title="Containers"
        subtitle={
          version
            ? `${version} · ${counts.running} running, ${counts.exited} exited of ${counts.total}`
            : 'Docker'
        }
        onRefresh={() => {
          void containers.refresh()
          void stats.refresh()
          if (tab === 'images') void images.refresh()
          if (tab === 'volumes') void volumes.refresh()
        }}
        refreshing={containers.loading}
        lastUpdated={containers.lastUpdated}
      >
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'containers', label: `Containers${counts.total ? ` ${counts.total}` : ''}` },
            { value: 'images', label: 'Images' },
            { value: 'volumes', label: 'Volumes' },
            { value: 'networks', label: 'Networks' }
          ]}
        />
        <Button size="sm" variant="outline" icon={Download} onClick={() => setPullOpen(true)}>
          Pull image
        </Button>
        <ActionButton
          actionId="docker.prune"
          icon={Trash}
          variant="danger"
          size="sm"
          options={{ successMessage: 'Unused Docker data removed' }}
          onDone={(data) => {
            setPullOutput(String(data ?? ''))
            afterChange()
          }}
        >
          Prune
        </ActionButton>
      </ViewHeader>

      {containers.error ? (
        <ErrorNote message={containers.error} onRetry={() => void containers.refresh()} />
      ) : null}

      <div className="flex min-h-0 flex-1">
        {tab === 'containers' ? (
          <DataTable
            rows={containers.data ?? []}
            columns={containerColumns}
            rowKey={(row) => row.id}
            onRowClick={(row) => void openDetail(row, 'logs')}
            isSelected={(row) => selected?.id === row.id}
            defaultSortKey="name"
            defaultSortDir="asc"
            emptyState={
              <EmptyState
                icon={Container}
                title={containers.initial ? 'Asking Docker for containers' : 'No containers yet'}
                message={
                  containers.initial
                    ? undefined
                    : 'Pull an image and start something, or check that the signed-in account can reach the Docker socket.'
                }
              />
            }
            footer={
              <>
                <span>CPU and memory come from a one-shot docker stats sample.</span>
                <span className="mono">docker ps -a --format &apos;&#123;&#123;json .&#125;&#125;&apos;</span>
              </>
            }
          />
        ) : null}

        {tab === 'images' ? (
          <DataTable
            rows={images.data ?? []}
            columns={[
              {
                key: 'repository',
                header: 'Repository',
                width: 'minmax(160px,1.4fr)',
                sort: (row) => row.repository,
                render: (row) => <span className="mono text-ink">{row.repository}</span>
              },
              {
                key: 'tag',
                header: 'Tag',
                width: 'minmax(90px,140px)',
                sort: (row) => row.tag,
                className: 'mono text-[10.5px]',
                render: (row) => row.tag
              },
              {
                key: 'id',
                header: 'Image ID',
                width: '110px',
                className: 'mono text-[10.5px] text-ink-ghost',
                render: (row) => row.id
              },
              {
                key: 'size',
                header: 'Size',
                width: '86px',
                align: 'right',
                sort: (row) => row.size,
                className: 'mono',
                render: (row) => row.size
              },
              {
                key: 'created',
                header: 'Created',
                width: 'minmax(100px,150px)',
                className: 'text-[10.5px]',
                render: (row) => row.createdSince
              },
              {
                key: 'actions',
                header: '',
                width: '96px',
                align: 'right',
                render: (row) => (
                  <ActionButton
                    actionId="docker.removeImage"
                    params={{ id: `${row.repository}:${row.tag}`, force: false }}
                    icon={Trash2}
                    variant="danger"
                    size="xs"
                    peek={false}
                    options={{ successMessage: 'Image deleted' }}
                    onDone={() => void images.refresh(true)}
                  >
                    Delete
                  </ActionButton>
                )
              }
            ]}
            rowKey={(row) => `${row.repository}:${row.tag}:${row.id}`}
            defaultSortKey="repository"
            defaultSortDir="asc"
            emptyState={<EmptyState icon={Layers} title="No images on this server" />}
            footer={<span className="mono">docker images</span>}
          />
        ) : null}

        {tab === 'volumes' ? (
          <DataTable
            rows={volumes.data ?? []}
            columns={[
              {
                key: 'name',
                header: 'Volume',
                width: 'minmax(180px,1.4fr)',
                sort: (row) => row.name,
                render: (row) => <span className="mono text-ink">{row.name}</span>
              },
              {
                key: 'driver',
                header: 'Driver',
                width: '110px',
                className: 'mono text-[10.5px]',
                render: (row) => row.driver
              },
              {
                key: 'mount',
                header: 'Mount point',
                width: 'minmax(0,2fr)',
                className: 'mono text-[10.5px] text-ink-faint',
                render: (row) => <span className="truncate">{row.mountpoint}</span>
              },
              {
                key: 'actions',
                header: '',
                width: '96px',
                align: 'right',
                render: (row) => (
                  <ActionButton
                    actionId="docker.removeVolume"
                    params={{ name: row.name }}
                    icon={Trash2}
                    variant="danger"
                    size="xs"
                    peek={false}
                    options={{
                      successMessage: 'Volume deleted',
                      confirmBody: 'Everything stored in this volume is deleted permanently.'
                    }}
                    onDone={() => void volumes.refresh(true)}
                  >
                    Delete
                  </ActionButton>
                )
              }
            ]}
            rowKey={(row) => row.name}
            defaultSortKey="name"
            defaultSortDir="asc"
            emptyState={<EmptyState icon={HardDrive} title="No volumes" />}
            footer={<span className="mono">docker volume ls</span>}
          />
        ) : null}

        {tab === 'networks' ? (
          <DataTable
            rows={networks.data ?? []}
            columns={[
              {
                key: 'name',
                header: 'Network',
                width: 'minmax(160px,1fr)',
                sort: (row) => row.name,
                render: (row) => <span className="mono text-ink">{row.name}</span>
              },
              {
                key: 'driver',
                header: 'Driver',
                width: '120px',
                className: 'mono text-[10.5px]',
                render: (row) => row.driver
              },
              {
                key: 'scope',
                header: 'Scope',
                width: '120px',
                className: 'text-[10.5px]',
                render: (row) => row.scope
              },
              {
                key: 'id',
                header: 'ID',
                width: 'minmax(0,1fr)',
                className: 'mono text-[10.5px] text-ink-ghost',
                render: (row) => row.id
              }
            ]}
            rowKey={(row) => row.id}
            emptyState={<EmptyState icon={Network} title="No networks" />}
            footer={<span className="mono">docker network ls</span>}
          />
        ) : null}

        {/* container detail */}
        {selected && tab === 'containers' ? (
          <aside className="anim-fade-up flex w-[480px] shrink-0 flex-col border-l border-line bg-surface/60">
            <header className="flex items-start gap-2 border-b border-line px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="mono truncate text-[13px] font-semibold text-ink">{selected.name}</h2>
                  <Badge tone={selected.state === 'running' ? 'run' : 'neutral'}>{selected.state}</Badge>
                </div>
                <p className="mono mt-0.5 truncate text-[10.5px] text-ink-ghost">
                  {selected.image} · {selected.id}
                </p>
              </div>
              <IconButton icon={X} label="Close details" onClick={() => setSelected(null)} />
            </header>

            {statsById.get(selected.name) ? (
              <div className="grid grid-cols-2 gap-3 border-b border-line px-3 py-2.5">
                <Meter
                  value={statsById.get(selected.name)!.cpuPercent}
                  label="CPU"
                  right={`${statsById.get(selected.name)!.cpuPercent.toFixed(1)}%`}
                />
                <Meter
                  value={statsById.get(selected.name)!.memPercent}
                  label="Memory"
                  right={statsById.get(selected.name)!.memUsage}
                />
                <p className="mono col-span-2 text-[10.5px] text-ink-ghost">
                  net {statsById.get(selected.name)!.netIO} · block{' '}
                  {statsById.get(selected.name)!.blockIO}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
              {selected.state === 'running' ? (
                <>
                  <ActionButton
                    actionId="docker.stop"
                    params={{ id: selected.id }}
                    icon={CircleStop}
                    variant="danger"
                    size="xs"
                    options={{ successMessage: 'Container stopped' }}
                    onDone={afterChange}
                  >
                    Stop
                  </ActionButton>
                  <ActionButton
                    actionId="docker.pause"
                    params={{ id: selected.id }}
                    icon={Pause}
                    size="xs"
                    options={{ successMessage: 'Container paused' }}
                    onDone={afterChange}
                  >
                    Pause
                  </ActionButton>
                </>
              ) : (
                <ActionButton
                  actionId="docker.start"
                  params={{ id: selected.id }}
                  icon={Play}
                  variant="primary"
                  size="xs"
                  options={{ successMessage: 'Container started' }}
                  onDone={afterChange}
                >
                  Start
                </ActionButton>
              )}
              <ActionButton
                actionId="docker.restart"
                params={{ id: selected.id }}
                icon={RotateCw}
                size="xs"
                options={{ successMessage: 'Container restarted' }}
                onDone={afterChange}
              >
                Restart
              </ActionButton>
              <Button
                size="xs"
                variant="outline"
                icon={Box}
                onClick={() => {
                  queueTerminal(`docker exec -it ${selected.id} sh`)
                  setView('terminal')
                }}
              >
                Shell inside
              </Button>
              <ActionButton
                actionId="docker.remove"
                params={{ id: selected.id, force: selected.state === 'running' }}
                icon={Trash2}
                variant="danger"
                size="xs"
                options={{ successMessage: 'Container deleted' }}
                onDone={() => {
                  setSelected(null)
                  afterChange()
                }}
              >
                Delete
              </ActionButton>
            </div>

            <div className="border-b border-line px-3 py-1.5">
              <Segmented
                value={detailTab}
                onChange={(next) => {
                  setDetailTab(next)
                  void openDetail(selected, next)
                }}
                options={[
                  { value: 'logs', label: 'Logs' },
                  { value: 'inspect', label: 'Inspect' }
                ]}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <CodeBlock
                code={detailTab === 'logs' ? logs || 'No log output.' : inspect || 'No data.'}
                tone="ink"
                maxHeight="max-h-[520px]"
                wrap
              />
            </div>
          </aside>
        ) : null}
      </div>

      {pullOutput ? (
        <Panel className="m-3 shrink-0">
          <PanelHeader
            title="Docker output"
            actions={
              <Button size="xs" variant="ghost" onClick={() => setPullOutput('')}>
                Dismiss
              </Button>
            }
          />
          <div className="p-2.5">
            <CodeBlock code={pullOutput} tone="ink" maxHeight="max-h-48" wrap />
          </div>
        </Panel>
      ) : null}

      <Modal
        open={pullOpen}
        onClose={() => setPullOpen(false)}
        title="Pull an image"
        subtitle="Downloads from the registry onto the server."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPullOpen(false)}>
              Cancel
            </Button>
            <ActionButton
              actionId="docker.pull"
              params={{ image }}
              variant="primary"
              size="sm"
              disabled={!image.trim()}
              options={{ successMessage: `${image} pulled` }}
              onDone={(data) => {
                setPullOutput(String(data ?? ''))
                setPullOpen(false)
                void images.refresh(true)
              }}
            >
              Pull
            </ActionButton>
          </>
        }
      >
        <Field label="Image reference" required hint="For example nginx:1.27-alpine or ghcr.io/owner/app:latest">
          <Input
            value={image}
            onChange={(event) => setImage(event.target.value)}
            placeholder="nginx:alpine"
            mono
          />
        </Field>
      </Modal>
    </div>
  )
}
