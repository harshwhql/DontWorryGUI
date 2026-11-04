import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eraser,
  FlaskConical,
  GripHorizontal,
  Radio,
  Search,
  SquareTerminal,
  X
} from 'lucide-react'
import type { CommandRecord } from '@shared/types'
import { cn, millis, clockTime, RISK_TONE } from '../../lib/format'
import { useCopy } from '../../lib/hooks'
import { Badge, IconButton, Input, Segmented } from '../ui/primitives'
import { useApp } from '../../state/store'

type Filter = 'all' | 'changes' | 'errors'

const STATUS_LOOK: Record<CommandRecord['status'], { text: string; label: string }> = {
  running: { text: 'text-warn', label: 'running' },
  success: { text: 'text-run-bright', label: 'ok' },
  error: { text: 'text-danger', label: 'failed' },
  'dry-run': { text: 'text-warn', label: 'dry run' }
}

export function CommandInspector(): React.JSX.Element | null {
  const open = useApp((s) => s.inspectorOpen)
  const setOpen = useApp((s) => s.setInspectorOpen)
  const height = useApp((s) => s.inspectorHeight)
  const setHeight = useApp((s) => s.setInspectorHeight)
  const audit = useApp((s) => s.audit)
  const activeHostId = useApp((s) => s.activeHostId)
  const clearAudit = useApp((s) => s.clearAudit)
  const dryRun = useApp((s) => s.settings.dryRun)

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showPolls, setShowPolls] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startY: number; startHeight: number } | null>(null)

  const records = useMemo(() => {
    const term = query.trim().toLowerCase()
    return audit
      .filter((record) => (activeHostId ? record.hostId === activeHostId : true))
      .filter((record) => (showPolls ? true : record.origin !== 'poll'))
      .filter((record) => {
        if (filter === 'changes') return record.risk !== 'read'
        if (filter === 'errors') return record.status === 'error'
        return true
      })
      .filter((record) =>
        term
          ? record.command.toLowerCase().includes(term) || record.label.toLowerCase().includes(term)
          : true
      )
      .slice(-300)
  }, [audit, activeHostId, filter, query, showPolls])

  useEffect(() => {
    if (!autoScroll || !open) return
    const element = listRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [records.length, autoScroll, open])

  useEffect(() => {
    const onMove = (event: MouseEvent): void => {
      if (!dragState.current) return
      const delta = dragState.current.startY - event.clientY
      setHeight(dragState.current.startHeight + delta)
    }
    const onUp = (): void => {
      dragState.current = null
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [setHeight])

  const changeCount = audit.filter(
    (r) => r.risk !== 'read' && (activeHostId ? r.hostId === activeHostId : true)
  ).length

  if (!open) return null

  return (
    <section
      aria-label="Command log"
      className="flex shrink-0 flex-col border-t border-line bg-surface/80"
      style={{ height, zIndex: 'var(--z-drawer)' }}
    >
      {/* drag handle */}
      <div
        role="separator"
        aria-label="Resize the command log"
        onMouseDown={(event) => {
          dragState.current = { startY: event.clientY, startHeight: height }
          document.body.style.cursor = 'ns-resize'
        }}
        className="group flex h-2 shrink-0 cursor-ns-resize items-center justify-center hover:bg-run/10"
      >
        <GripHorizontal
          size={11}
          className="text-ink-ghost opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>

      {/* toolbar */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 pb-1.5">
        <div className="flex items-center gap-1.5">
          <Radio size={12} className="text-run-bright" aria-hidden />
          <h2 className="text-[11.5px] font-semibold tracking-tight text-ink">Command log</h2>
          <span className="tabular text-[10.5px] text-ink-ghost">
            {records.length} shown · {changeCount} changed state
          </span>
        </div>

        {dryRun ? (
          <Badge tone="warn" icon={FlaskConical}>
            dry run
          </Badge>
        ) : null}

        <div className="flex-1" />

        <div className="relative w-44">
          <Search
            size={11}
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-ghost"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter commands"
            className="h-6 pl-6.5 text-[11px]"
            aria-label="Filter commands"
          />
        </div>

        <Segmented
          size="xs"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'changes', label: 'Changes' },
            { value: 'errors', label: 'Errors' }
          ]}
        />

        <IconButton
          icon={Radio}
          label={showPolls ? 'Hide background refreshes' : 'Show background refreshes'}
          size="xs"
          active={showPolls}
          onClick={() => setShowPolls((v) => !v)}
        />
        <IconButton
          icon={ChevronDown}
          label={autoScroll ? 'Stop following new commands' : 'Follow new commands'}
          size="xs"
          active={autoScroll}
          onClick={() => setAutoScroll((v) => !v)}
        />
        <IconButton icon={Eraser} label="Clear the log" size="xs" onClick={() => void clearAudit()} />
        <IconButton icon={X} label="Hide the command log" size="xs" onClick={() => setOpen(false)} />
      </header>

      {/* rows */}
      <div
        ref={listRef}
        onScroll={(event) => {
          const el = event.currentTarget
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          if (!atBottom && autoScroll) setAutoScroll(false)
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {records.length === 0 ? (
          <p className="px-3 py-4 text-[11.5px] text-ink-ghost">
            Nothing yet. Every command this app runs on your behalf shows up here, with its exit
            code and output.
          </p>
        ) : (
          records.map((record) => (
            <Row
              key={record.id}
              record={record}
              expanded={expanded === record.id}
              onToggle={() => setExpanded((prev) => (prev === record.id ? null : record.id))}
            />
          ))
        )}
      </div>
    </section>
  )
}

function Row({
  record,
  expanded,
  onToggle
}: {
  record: CommandRecord
  expanded: boolean
  onToggle: () => void
}): React.JSX.Element {
  const copy = useCopy()
  const queueTerminal = useApp((s) => s.queueTerminal)
  const setView = useApp((s) => s.setView)
  const tone = RISK_TONE[record.risk]
  const status = STATUS_LOOK[record.status]
  const output = [record.stdout, record.stderr].filter(Boolean).join('\n').trim()

  return (
    <div
      className={cn(
        'border-b border-line/40 transition-colors',
        record.origin === 'poll' && 'opacity-55',
        expanded && 'bg-void/40'
      )}
    >
      <div
        className="group grid cursor-pointer items-center gap-2 px-3 py-1 hover:bg-hover/40"
        style={{ gridTemplateColumns: '12px 60px 10px minmax(0,1fr) 54px 46px 58px' }}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
      >
        {expanded ? (
          <ChevronDown size={11} className="text-ink-faint" aria-hidden />
        ) : (
          <ChevronRight size={11} className="text-ink-ghost" aria-hidden />
        )}

        <span className="tabular text-[10.5px] text-ink-ghost">{clockTime(record.startedAt)}</span>

        <span
          className={cn('size-1.5 rounded-full justify-self-center', tone.dot)}
          title={tone.label}
          aria-hidden
        />

        <code className="truncate text-[11.5px] text-ink-dim group-hover:text-ink">
          {record.command || record.label}
        </code>

        <span className={cn('tabular text-right text-[10.5px]', status.text)}>{status.label}</span>

        <span className="tabular text-right text-[10.5px] text-ink-ghost">
          {record.exitCode !== undefined && record.exitCode !== null ? `↳${record.exitCode}` : ''}
        </span>

        <span className="tabular text-right text-[10.5px] text-ink-faint">
          {millis(record.durationMs)}
        </span>
      </div>

      {expanded ? (
        <div className="anim-fade-up px-3 pb-2.5 pl-[86px]">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={record.risk === 'read' ? 'info' : record.risk === 'write' ? 'warn' : 'danger'}>
              {tone.label}
            </Badge>
            <Badge tone="neutral" mono>
              {record.transport}
            </Badge>
            <Badge tone="neutral" mono>
              {record.actionId}
            </Badge>
            <span className="text-[10.5px] text-ink-ghost">{record.label}</span>
            <div className="flex-1" />
            <IconButton
              icon={Copy}
              label="Copy the command"
              size="xs"
              onClick={() => copy(record.command, 'Command copied')}
            />
            <IconButton
              icon={SquareTerminal}
              label="Run this in the terminal"
              size="xs"
              onClick={() => {
                queueTerminal(record.command)
                setView('terminal')
              }}
            />
          </div>

          <pre className="selectable mono max-h-28 overflow-auto rounded-md border border-line bg-void px-2.5 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap break-words text-run-bright">
            {record.command}
          </pre>

          {output ? (
            <pre
              className={cn(
                'selectable mono mt-1.5 max-h-48 overflow-auto rounded-md border border-line bg-void px-2.5 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap break-words',
                record.status === 'error' ? 'text-danger' : 'text-ink-faint'
              )}
            >
              {output}
            </pre>
          ) : (
            <p className="mt-1.5 text-[10.5px] text-ink-ghost">No output.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
