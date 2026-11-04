import { useMemo } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  Package,
  Power,
  RotateCcw,
  Thermometer,
  Users
} from 'lucide-react'
import type { MetricsSnapshot, PackageEntry, ProcessEntry } from '@shared/types'
import { bytes, cn, duration, percent, rate, usageBar, usageTone } from '../../lib/format'
import { useHistory, useResource } from '../../lib/hooks'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  Panel,
  PanelHeader,
  Skeleton
} from '../../components/ui/primitives'
import { KeyValue, Meter, Ring, Sparkline, StatTile } from '../../components/ui/data'
import { ActionButton } from '../../components/ActionButton'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'

export function DashboardView(): React.JSX.Element {
  const settings = useApp((s) => s.settings)
  const connection = useApp((s) => s.activeConnection())
  const setView = useApp((s) => s.setView)
  const facts = connection?.facts

  const metrics = useResource<MetricsSnapshot>('system.metrics', {}, {
    intervalMs: settings.pollIntervalMs
  })
  const failed = useResource<{ unit: string; description: string }[]>('logs.failedUnits', {}, {
    intervalMs: 30_000
  })
  const processes = useResource<ProcessEntry[]>('processes.list', {}, { intervalMs: 8000 })
  const updates = useResource<PackageEntry[]>('packages.upgradable', {})

  const snapshot = metrics.data
  const cpuHistory = useHistory(snapshot?.cpu.usagePercent, 70)
  const memPercent = snapshot
    ? (snapshot.memory.usedBytes / Math.max(snapshot.memory.totalBytes, 1)) * 100
    : 0
  const memHistory = useHistory(snapshot ? Math.round(memPercent * 10) / 10 : undefined, 70)

  const primaryNet = snapshot?.net[0]
  const rxHistory = useHistory(primaryNet ? Math.round(primaryNet.rxRate) : undefined, 70)
  const txHistory = useHistory(primaryNet ? Math.round(primaryNet.txRate) : undefined, 70)

  const topProcesses = useMemo(
    () => (processes.data ?? []).slice(0, 7),
    [processes.data]
  )

  const rootDisk = snapshot?.disks.find((d) => d.mount === '/') ?? snapshot?.disks[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={Gauge}
        title={facts?.hostname ?? 'Overview'}
        subtitle={
          facts
            ? `${facts.prettyName} · ${facts.kernel} · ${facts.cpuModel}`
            : 'Reading the server…'
        }
        onRefresh={() => void metrics.refresh()}
        refreshing={metrics.loading}
        lastUpdated={metrics.lastUpdated}
      >
        <Badge tone="run">live every {Math.round(settings.pollIntervalMs / 1000)}s</Badge>
        <ActionButton
          actionId="services.daemonReload"
          icon={RotateCcw}
          variant="outline"
          size="sm"
          options={{ successMessage: 'systemd reloaded its unit files' }}
        >
          Reload systemd
        </ActionButton>
        <ActionButton
          actionId="system.reboot"
          icon={RotateCcw}
          variant="warn"
          size="sm"
          options={{ successMessage: 'Reboot requested' }}
        >
          Reboot
        </ActionButton>
        <ActionButton
          actionId="system.shutdown"
          icon={Power}
          variant="danger"
          size="sm"
          options={{ successMessage: 'Shutdown requested' }}
        >
          Power off
        </ActionButton>
      </ViewHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {metrics.error ? (
          <ErrorNote message={metrics.error} onRetry={() => void metrics.refresh()} />
        ) : null}

        {/* alerts band */}
        {(failed.data?.length ?? 0) > 0 || (updates.data?.length ?? 0) > 0 ? (
          <div className="mb-4 flex flex-col gap-2">
            {(failed.data?.length ?? 0) > 0 ? (
              <Alert
                tone="danger"
                icon={AlertTriangle}
                title={`${failed.data!.length} unit${failed.data!.length === 1 ? '' : 's'} failed`}
                body={failed.data!.slice(0, 4).map((u) => u.unit).join(', ')}
                action={
                  <Button size="xs" variant="outline" onClick={() => setView('services')}>
                    Open services
                  </Button>
                }
              />
            ) : null}
            {(updates.data?.length ?? 0) > 0 ? (
              <Alert
                tone="warn"
                icon={Package}
                title={`${updates.data!.length} package update${updates.data!.length === 1 ? '' : 's'} available`}
                body={updates
                  .data!.slice(0, 5)
                  .map((p) => p.name)
                  .join(', ')}
                action={
                  <Button size="xs" variant="outline" onClick={() => setView('packages')}>
                    Review updates
                  </Button>
                }
              />
            ) : null}
          </div>
        ) : null}

        {/* top stat row */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Panel className="col-span-2 flex items-center gap-3.5 p-3 md:col-span-1">
            <Ring value={snapshot?.cpu.usagePercent ?? 0} sublabel="cpu" />
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">
                Processor
              </p>
              <Sparkline values={cpuHistory} max={100} height={26} label="CPU usage trend" />
              <p className="tabular mt-1 text-[10.5px] text-ink-ghost">
                load {snapshot?.cpu.loadAvg.map((l) => l.toFixed(2)).join(' · ') ?? '—'}
              </p>
            </div>
          </Panel>

          <Panel className="col-span-2 flex items-center gap-3.5 p-3 md:col-span-1">
            <Ring value={memPercent} sublabel="mem" />
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">
                Memory
              </p>
              <Sparkline values={memHistory} max={100} height={26} tone="info" label="Memory usage trend" />
              <p className="tabular mt-1 text-[10.5px] text-ink-ghost">
                {bytes(snapshot?.memory.usedBytes)} / {bytes(snapshot?.memory.totalBytes)}
              </p>
            </div>
          </Panel>

          <StatTile
            icon={Clock}
            label="Uptime"
            value={snapshot ? duration(snapshot.uptimeSeconds) : '—'}
            hint={facts?.bootTime ? `booted ${new Date(facts.bootTime).toLocaleString()}` : undefined}
          />

          <StatTile
            icon={HardDrive}
            label={rootDisk ? `Disk ${rootDisk.mount}` : 'Disk'}
            value={rootDisk ? percent(rootDisk.usePercent) : '—'}
            tone={rootDisk ? usageTone(rootDisk.usePercent) : undefined}
            hint={rootDisk ? `${bytes(rootDisk.availableBytes)} free` : undefined}
          >
            {rootDisk ? (
              <div className="h-1 overflow-hidden rounded-full bg-void">
                <div
                  className={cn('h-full rounded-full', usageBar(rootDisk.usePercent))}
                  style={{ width: `${rootDisk.usePercent}%` }}
                />
              </div>
            ) : null}
          </StatTile>

          <StatTile
            icon={Cpu}
            label="Processes"
            value={snapshot?.processCount ?? '—'}
            hint={`${facts?.cpuCores ?? '?'} cores available`}
          />

          <StatTile
            icon={snapshot?.temperatureC ? Thermometer : Users}
            label={snapshot?.temperatureC ? 'Temperature' : 'Sessions'}
            value={snapshot?.temperatureC ?? snapshot?.loggedInUsers ?? '—'}
            unit={snapshot?.temperatureC ? '°C' : 'signed in'}
          />
        </div>

        {/* main grid */}
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
          {/* memory detail */}
          <Panel>
            <PanelHeader title="Memory" icon={MemoryStick} subtitle="Resident, cache and swap" />
            <div className="flex flex-col gap-3 p-3">
              {snapshot ? (
                <>
                  <Meter
                    value={memPercent}
                    label="In use"
                    right={`${bytes(snapshot.memory.usedBytes)} of ${bytes(snapshot.memory.totalBytes)}`}
                  />
                  <Meter
                    value={(snapshot.memory.cachedBytes / Math.max(snapshot.memory.totalBytes, 1)) * 100}
                    label="Page cache"
                    right={bytes(snapshot.memory.cachedBytes)}
                    tone="bg-info/70"
                  />
                  <Meter
                    value={
                      snapshot.memory.swapTotalBytes > 0
                        ? (snapshot.memory.swapUsedBytes / snapshot.memory.swapTotalBytes) * 100
                        : 0
                    }
                    label="Swap"
                    right={
                      snapshot.memory.swapTotalBytes > 0
                        ? `${bytes(snapshot.memory.swapUsedBytes)} of ${bytes(snapshot.memory.swapTotalBytes)}`
                        : 'not configured'
                    }
                    tone="bg-root/70"
                  />
                  <KeyValue
                    dense
                    className="mt-1"
                    rows={[
                      { label: 'Available', value: bytes(snapshot.memory.availableBytes), mono: true },
                      { label: 'Free', value: bytes(snapshot.memory.freeBytes), mono: true },
                      { label: 'Buffers', value: bytes(snapshot.memory.buffersBytes), mono: true }
                    ]}
                  />
                </>
              ) : (
                <SkeletonRows rows={4} />
              )}
            </div>
          </Panel>

          {/* per-core */}
          <Panel>
            <PanelHeader
              title="Cores"
              icon={Cpu}
              subtitle={facts?.cpuModel}
              actions={
                snapshot ? (
                  <Badge tone="neutral" mono>
                    {snapshot.cpu.perCore.length} threads
                  </Badge>
                ) : null
              }
            />
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-3">
              {snapshot?.cpu.perCore.length ? (
                snapshot.cpu.perCore.slice(0, 16).map((value, index) => (
                  <Meter key={index} value={value} label={`cpu${index}`} right={percent(value)} />
                ))
              ) : (
                <div className="col-span-2">
                  <SkeletonRows rows={4} />
                </div>
              )}
            </div>
          </Panel>

          {/* network */}
          <Panel>
            <PanelHeader title="Network" icon={ArrowDownToLine} subtitle="Throughput per interface" />
            <div className="flex flex-col gap-3 p-3">
              {primaryNet ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-ink-faint">
                        <ArrowDownToLine size={10} aria-hidden /> down
                      </p>
                      <p className="tabular text-[16px] font-semibold text-run-bright">
                        {rate(primaryNet.rxRate)}
                      </p>
                      <Sparkline values={rxHistory} height={24} label="Download trend" />
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-[10.5px] uppercase tracking-wide text-ink-faint">
                        <ArrowUpFromLine size={10} aria-hidden /> up
                      </p>
                      <p className="tabular text-[16px] font-semibold text-info">
                        {rate(primaryNet.txRate)}
                      </p>
                      <Sparkline values={txHistory} height={24} tone="info" label="Upload trend" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
                    {snapshot!.net.slice(0, 5).map((iface) => (
                      <div key={iface.iface} className="flex items-center justify-between gap-2">
                        <span className="mono truncate text-[11px] text-ink-dim">{iface.iface}</span>
                        <span className="tabular shrink-0 text-[10.5px] text-ink-ghost">
                          ↓{bytes(iface.rxBytes)} ↑{bytes(iface.txBytes)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <SkeletonRows rows={3} />
              )}
            </div>
          </Panel>

          {/* disks */}
          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Storage"
              icon={HardDrive}
              subtitle="Mounted filesystems, excluding pseudo mounts"
              actions={
                <ActionButton
                  actionId="files.largest"
                  params={{ path: '/' }}
                  variant="outline"
                  size="xs"
                  options={{ quiet: true }}
                  onDone={() => setView('files')}
                >
                  Find big files
                </ActionButton>
              }
            />
            <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 p-3 md:grid-cols-2">
              {snapshot?.disks.length ? (
                snapshot.disks.map((disk) => (
                  <Meter
                    key={disk.mount}
                    value={disk.usePercent}
                    label={
                      <span className="flex items-center gap-1.5">
                        <span className="mono truncate text-ink">{disk.mount}</span>
                        <span className="text-[10px] text-ink-ghost">{disk.type}</span>
                      </span>
                    }
                    right={`${bytes(disk.usedBytes)} / ${bytes(disk.totalBytes)}`}
                    sublabel={`${bytes(disk.availableBytes)} free on ${disk.filesystem}`}
                  />
                ))
              ) : (
                <div className="md:col-span-2">
                  <SkeletonRows rows={3} />
                </div>
              )}
            </div>
          </Panel>

          {/* top processes */}
          <Panel>
            <PanelHeader
              title="Heaviest processes"
              icon={Cpu}
              actions={
                <Button size="xs" variant="ghost" onClick={() => setView('processes')}>
                  See all
                </Button>
              }
            />
            <div className="flex flex-col p-1.5">
              {topProcesses.length === 0 ? (
                <div className="p-2">
                  <SkeletonRows rows={5} />
                </div>
              ) : (
                topProcesses.map((proc) => (
                  <div
                    key={proc.pid}
                    className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-hover/50"
                  >
                    <span className="mono w-11 shrink-0 text-right text-[10.5px] text-ink-ghost">
                      {proc.pid}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-dim" title={proc.fullCommand}>
                      {proc.command}
                    </span>
                    <span className="mono w-14 shrink-0 text-right text-[10.5px] text-ink-faint">
                      {bytes(proc.rssBytes)}
                    </span>
                    <span
                      className={cn(
                        'tabular w-11 shrink-0 text-right text-[11px] font-medium',
                        usageTone(proc.cpu)
                      )}
                    >
                      {proc.cpu.toFixed(1)}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </Panel>

          {/* server identity */}
          <Panel className="xl:col-span-3">
            <PanelHeader title="This server" icon={Gauge} subtitle="Detected on connect" />
            <div className="grid grid-cols-1 gap-x-8 gap-y-1 p-3 md:grid-cols-2 xl:grid-cols-3">
              {facts ? (
                <>
                  <KeyValue
                    rows={[
                      { label: 'Hostname', value: facts.hostname, mono: true },
                      { label: 'Distribution', value: facts.prettyName },
                      { label: 'Kernel', value: facts.kernel, mono: true },
                      { label: 'Architecture', value: facts.arch, mono: true }
                    ]}
                  />
                  <KeyValue
                    rows={[
                      { label: 'CPU', value: facts.cpuModel },
                      { label: 'Cores', value: String(facts.cpuCores), mono: true },
                      { label: 'Total memory', value: bytes(facts.totalMemBytes), mono: true },
                      { label: 'Virtualisation', value: facts.virtualization || 'bare metal' }
                    ]}
                  />
                  <KeyValue
                    rows={[
                      { label: 'Signed in as', value: facts.user, mono: true },
                      {
                        label: 'Privileges',
                        value: facts.isRoot ? 'root' : facts.hasSudo ? 'sudo available' : 'unprivileged'
                      },
                      { label: 'Package manager', value: facts.packageManager, mono: true },
                      {
                        label: 'Init / firewall',
                        value: `${facts.hasSystemd ? 'systemd' : 'non-systemd'} · ${facts.firewall}`
                      }
                    ]}
                  />
                </>
              ) : (
                <EmptyState icon={Gauge} title="Waiting for the server probe" compact />
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Alert({
  tone,
  icon: Icon,
  title,
  body,
  action
}: {
  tone: 'danger' | 'warn'
  icon: typeof AlertTriangle
  title: string
  body?: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'anim-fade-up flex items-center gap-2.5 rounded-lg border px-3 py-2',
        tone === 'danger' ? 'border-danger/30 bg-danger/8' : 'border-warn/30 bg-warn/8'
      )}
      role="status"
    >
      <Icon
        size={14}
        className={cn('shrink-0', tone === 'danger' ? 'text-danger' : 'text-warn')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-[12px] font-medium', tone === 'danger' ? 'text-danger' : 'text-warn')}>
          {title}
        </p>
        {body ? <p className="mono truncate text-[10.5px] text-ink-faint">{body}</p> : null}
      </div>
      {action}
    </div>
  )
}

function SkeletonRows({ rows }: { rows: number }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-3.5 w-full" />
      ))}
    </div>
  )
}
