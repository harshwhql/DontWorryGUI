import { useMemo, useState } from 'react'
import { Activity, Gauge, Search, Skull, SlidersHorizontal, Square, X } from 'lucide-react'
import type { ProcessEntry } from '@shared/types'
import { bytes, cn, duration, usageTone } from '../../lib/format'
import { useDebounced, useResource } from '../../lib/hooks'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Segmented,
  Select
} from '../../components/ui/primitives'
import { CodeBlock, DataTable, KeyValue, type Column } from '../../components/ui/data'
import { ActionButton, CommandPeek } from '../../components/ActionButton'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'

const STATE_LABELS: Record<string, string> = {
  R: 'running',
  S: 'sleeping',
  D: 'waiting on disk',
  Z: 'zombie',
  T: 'stopped',
  t: 'traced',
  I: 'idle kernel thread'
}

export function ProcessesView(): React.JSX.Element {
  const settings = useApp((s) => s.settings)
  const run = useApp((s) => s.run)

  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'all' | 'user' | 'busy'>('all')
  const [selected, setSelected] = useState<ProcessEntry | null>(null)
  const [detail, setDetail] = useState<string>('')
  const [niceValue, setNiceValue] = useState('0')
  const debounced = useDebounced(search, 200)

  const user = useApp((s) => s.activeConnection()?.facts?.user)
  const processes = useResource<ProcessEntry[]>('processes.list', {}, {
    intervalMs: Math.max(settings.pollIntervalMs, 4000)
  })

  const rows = useMemo(() => {
    const all = processes.data ?? []
    const term = debounced.trim().toLowerCase()
    return all.filter((proc) => {
      if (scope === 'user' && proc.user !== user) return false
      if (scope === 'busy' && proc.cpu < 1 && proc.mem < 1) return false
      if (!term) return true
      return (
        proc.command.toLowerCase().includes(term) ||
        proc.fullCommand.toLowerCase().includes(term) ||
        String(proc.pid) === term ||
        proc.user.toLowerCase().includes(term)
      )
    })
  }, [processes.data, debounced, scope, user])

  const totals = useMemo(() => {
    const all = processes.data ?? []
    return {
      count: all.length,
      cpu: all.reduce((sum, p) => sum + p.cpu, 0),
      mem: all.reduce((sum, p) => sum + p.rssBytes, 0)
    }
  }, [processes.data])

  const openDetail = async (proc: ProcessEntry): Promise<void> => {
    setSelected(proc)
    setDetail('')
    setNiceValue(String(proc.nice))
    const text = await run<string>('processes.detail', { pid: proc.pid }, { quiet: true })
    setDetail(text ?? 'Could not read /proc for that PID. It may have exited.')
  }

  const columns: Column<ProcessEntry>[] = [
    {
      key: 'pid',
      header: 'PID',
      width: '58px',
      align: 'right',
      sort: (row) => row.pid,
      className: 'mono text-ink-faint',
      render: (row) => row.pid
    },
    {
      key: 'user',
      header: 'User',
      width: 'minmax(70px,100px)',
      sort: (row) => row.user,
      className: 'mono',
      render: (row) => (
        <span className={row.user === 'root' ? 'text-root' : undefined}>{row.user}</span>
      )
    },
    {
      key: 'cpu',
      header: 'CPU',
      width: '56px',
      align: 'right',
      sort: (row) => row.cpu,
      render: (row) => (
        <span className={cn('tabular font-medium', usageTone(row.cpu))}>{row.cpu.toFixed(1)}%</span>
      )
    },
    {
      key: 'mem',
      header: 'Mem',
      width: '56px',
      align: 'right',
      sort: (row) => row.mem,
      render: (row) => <span className="tabular">{row.mem.toFixed(1)}%</span>
    },
    {
      key: 'rss',
      header: 'Resident',
      width: '74px',
      align: 'right',
      sort: (row) => row.rssBytes,
      className: 'mono',
      render: (row) => bytes(row.rssBytes)
    },
    {
      key: 'state',
      header: 'State',
      width: '64px',
      sort: (row) => row.state,
      render: (row) => (
        <span
          className={cn('mono', row.state.startsWith('Z') && 'text-danger')}
          title={STATE_LABELS[row.state[0]] ?? row.state}
        >
          {row.state}
        </span>
      )
    },
    {
      key: 'elapsed',
      header: 'Age',
      width: '66px',
      align: 'right',
      sort: (row) => row.elapsedSeconds,
      className: 'mono',
      render: (row) => duration(row.elapsedSeconds)
    },
    {
      key: 'command',
      header: 'Command',
      width: 'minmax(0,1fr)',
      sort: (row) => row.command,
      render: (row) => (
        <span className="flex items-baseline gap-1.5" title={row.fullCommand}>
          <span className="text-ink">{row.command}</span>
          <span className="mono truncate text-[10.5px] text-ink-ghost">
            {row.fullCommand.slice(row.command.length).trim()}
          </span>
        </span>
      )
    },
    {
      key: 'actions',
      header: '',
      width: '96px',
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-0.5">
          <CommandPeek actionId="processes.kill" params={{ pid: row.pid, name: row.command }} />
          <IconButton
            icon={Square}
            label={`Stop PID ${row.pid}`}
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              void run(
                'processes.kill',
                { pid: row.pid, name: row.command },
                { successMessage: `Sent SIGTERM to ${row.command}` }
              ).then(() => processes.refresh(true))
            }}
          />
          <IconButton
            icon={Skull}
            label={`Force kill PID ${row.pid}`}
            size="xs"
            variant="danger"
            onClick={(event) => {
              event.stopPropagation()
              void run(
                'processes.kill9',
                { pid: row.pid, name: row.command },
                { successMessage: `Sent SIGKILL to ${row.command}` }
              ).then(() => processes.refresh(true))
            }}
          />
        </span>
      )
    }
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={Activity}
        title="Processes"
        subtitle={`${totals.count} processes · ${totals.cpu.toFixed(0)}% CPU · ${bytes(totals.mem)} resident`}
        onRefresh={() => void processes.refresh()}
        refreshing={processes.loading}
        lastUpdated={processes.lastUpdated}
      >
        <div className="relative w-56">
          <Search
            size={12}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-ghost"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by name, PID or user"
            className="pl-7"
            aria-label="Filter processes"
          />
        </div>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'All' },
            { value: 'user', label: 'Mine' },
            { value: 'busy', label: 'Busy' }
          ]}
        />
      </ViewHeader>

      {processes.error ? (
        <ErrorNote message={processes.error} onRetry={() => void processes.refresh()} />
      ) : null}

      <div className="flex min-h-0 flex-1">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => String(row.pid)}
          onRowClick={(row) => void openDetail(row)}
          isSelected={(row) => selected?.pid === row.pid}
          defaultSortKey="cpu"
          rowTone={(row) => (row.state.startsWith('Z') ? 'bg-danger/5' : undefined)}
          emptyState={
            <EmptyState
              icon={Activity}
              title={processes.initial ? 'Reading the process table' : 'Nothing matched'}
              message={
                processes.initial
                  ? undefined
                  : 'Try a different search term, or switch the scope back to All.'
              }
            />
          }
          footer={
            <>
              <span>{rows.length} of {totals.count} processes shown</span>
              <span className="mono">ps -eo pid,ppid,user,pcpu,pmem,rss,stat,etimes,nice,args</span>
            </>
          }
        />

        {/* detail drawer */}
        {selected ? (
          <aside className="anim-fade-up flex w-[400px] shrink-0 flex-col border-l border-line bg-surface/60">
            <header className="flex items-start gap-2 border-b border-line px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="truncate text-[13px] font-semibold text-ink">{selected.command}</h2>
                  <Badge tone="neutral" mono>
                    {selected.pid}
                  </Badge>
                </div>
                <p className="mono mt-0.5 truncate text-[10.5px] text-ink-ghost">
                  {selected.fullCommand}
                </p>
              </div>
              <IconButton icon={X} label="Close details" onClick={() => setSelected(null)} />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <KeyValue
                dense
                rows={[
                  { label: 'Owner', value: selected.user, mono: true },
                  { label: 'Parent PID', value: String(selected.ppid), mono: true },
                  {
                    label: 'State',
                    value: `${selected.state} (${STATE_LABELS[selected.state[0]] ?? 'unknown'})`
                  },
                  { label: 'CPU', value: `${selected.cpu.toFixed(1)}%`, mono: true },
                  {
                    label: 'Memory',
                    value: `${bytes(selected.rssBytes)} (${selected.mem.toFixed(1)}%)`,
                    mono: true
                  },
                  { label: 'Running for', value: duration(selected.elapsedSeconds) },
                  { label: 'Nice', value: String(selected.nice), mono: true }
                ]}
              />

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <ActionButton
                  actionId="processes.kill"
                  params={{ pid: selected.pid, name: selected.command }}
                  icon={Square}
                  variant="warn"
                  size="xs"
                  options={{ successMessage: 'SIGTERM sent' }}
                  onDone={() => void processes.refresh(true)}
                >
                  Graceful stop
                </ActionButton>
                <ActionButton
                  actionId="processes.kill9"
                  params={{ pid: selected.pid, name: selected.command }}
                  icon={Skull}
                  variant="danger"
                  size="xs"
                  options={{ successMessage: 'SIGKILL sent' }}
                  onDone={() => void processes.refresh(true)}
                >
                  Force kill
                </ActionButton>
              </div>

              <div className="mt-3 rounded-md border border-line bg-void/40 p-2.5">
                <Field label="Scheduling priority" hint="-20 gets the most CPU time, 19 the least.">
                  <div className="flex gap-1.5">
                    <Select
                      value={niceValue}
                      onChange={(event) => setNiceValue(event.target.value)}
                      className="w-24"
                    >
                      {[-20, -10, -5, 0, 5, 10, 19].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </Select>
                    <ActionButton
                      actionId="processes.renice"
                      params={{ pid: selected.pid, nice: Number(niceValue) }}
                      icon={SlidersHorizontal}
                      size="sm"
                      options={{ successMessage: 'Priority changed' }}
                      onDone={() => void processes.refresh(true)}
                    >
                      Apply
                    </ActionButton>
                  </div>
                </Field>
              </div>

              <div className="mt-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Gauge size={11} className="text-ink-ghost" aria-hidden />
                  <span className="text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">
                    /proc/{selected.pid}
                  </span>
                  <div className="flex-1" />
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => void openDetail(selected)}
                  >
                    Reload
                  </Button>
                </div>
                <CodeBlock code={detail || 'Reading…'} tone="ink" maxHeight="max-h-[420px]" wrap />
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
