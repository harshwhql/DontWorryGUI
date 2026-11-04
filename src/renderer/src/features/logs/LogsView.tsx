import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertOctagon,
  ArrowDownToLine,
  Cpu,
  FileText,
  Radio,
  ScrollText,
  Search,
  ShieldAlert
} from 'lucide-react'
import { bytes, cn } from '../../lib/format'
import { useDebounced, useResource } from '../../lib/hooks'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  IconButton,
  Input,
  Panel,
  Segmented,
  Select
} from '../../components/ui/primitives'
import { CommandPeek } from '../../components/ActionButton'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'

type Tab = 'journal' | 'kernel' | 'files' | 'security'

const PRIORITIES = [
  { value: 'all', label: 'Every level' },
  { value: 'err', label: 'Errors and worse' },
  { value: 'warning', label: 'Warnings and worse' },
  { value: 'notice', label: 'Notices and worse' },
  { value: 'info', label: 'Info and worse' }
]

export function LogsView(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('journal')
  const [unit, setUnit] = useState('')
  const [priority, setPriority] = useState('all')
  const [grep, setGrep] = useState('')
  const [lines, setLines] = useState(500)
  const [live, setLive] = useState(false)
  const [filePath, setFilePath] = useState('')
  const [highlight, setHighlight] = useState('')
  const debouncedGrep = useDebounced(grep, 400)
  const bottomRef = useRef<HTMLDivElement>(null)

  const units = useResource<string[]>('logs.units', {}, { enabled: tab === 'journal' })

  const journalParams = useMemo(
    () => ({ unit: unit || undefined, priority, lines, grep: debouncedGrep || undefined }),
    [unit, priority, lines, debouncedGrep]
  )

  const journal = useResource<string>('logs.journal', journalParams, {
    enabled: tab === 'journal',
    intervalMs: live && tab === 'journal' ? 4000 : undefined
  })
  const kernel = useResource<string>('logs.dmesg', { lines }, {
    enabled: tab === 'kernel',
    intervalMs: live && tab === 'kernel' ? 5000 : undefined
  })
  const files = useResource<{ sizeBytes: number; modified: string; path: string }[]>(
    'logs.files',
    {},
    { enabled: tab === 'files' }
  )
  const fileTail = useResource<string>(
    'logs.tailFile',
    { path: filePath, lines, grep: debouncedGrep || undefined },
    { enabled: tab === 'files' && Boolean(filePath), intervalMs: live && filePath ? 4000 : undefined }
  )
  const authFailures = useResource<string[]>('logs.authFailures', {}, { enabled: tab === 'security' })
  const lastLogins = useResource<string[]>('logs.lastLogins', {}, { enabled: tab === 'security' })
  const failedUnits = useResource<{ unit: string; description: string }[]>(
    'logs.failedUnits',
    {},
    { enabled: tab === 'security' }
  )

  const text =
    tab === 'journal'
      ? journal.data
      : tab === 'kernel'
        ? kernel.data
        : tab === 'files'
          ? fileTail.data
          : undefined

  const active =
    tab === 'journal' ? journal : tab === 'kernel' ? kernel : tab === 'files' ? fileTail : authFailures

  useEffect(() => {
    if (!live) return
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [text, live])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={ScrollText}
        title="Logs"
        subtitle={
          tab === 'journal'
            ? `systemd journal${unit ? ` · ${unit}` : ' · all units'}`
            : tab === 'kernel'
              ? 'Kernel ring buffer'
              : tab === 'files'
                ? filePath || 'Files under /var/log'
                : 'Sign-in attempts and failed units'
        }
        onRefresh={() => void active.refresh()}
        refreshing={active.loading}
        lastUpdated={active.lastUpdated}
      >
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'journal', label: 'Journal' },
            { value: 'kernel', label: 'Kernel' },
            { value: 'files', label: 'Log files' },
            { value: 'security', label: 'Security' }
          ]}
        />
        {tab !== 'security' ? (
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            aria-pressed={live}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors',
              live
                ? 'border-run/45 bg-run/12 text-run-bright'
                : 'border-line text-ink-faint hover:text-ink-dim'
            )}
          >
            <Radio size={11} className={live ? 'anim-live rounded-full' : ''} aria-hidden />
            {live ? 'Following' : 'Follow'}
          </button>
        ) : null}
      </ViewHeader>

      {/* filter bar */}
      {tab !== 'security' ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-void/40 px-3 py-1.5">
          {tab === 'journal' ? (
            <>
              <Select
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                className="h-7 w-56 text-[11.5px]"
                aria-label="Filter by unit"
              >
                <option value="">All units</option>
                {(units.data ?? []).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
              <Select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className="h-7 w-44 text-[11.5px]"
                aria-label="Minimum priority"
              >
                {PRIORITIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </>
          ) : null}

          {tab === 'files' ? (
            <Select
              value={filePath}
              onChange={(event) => setFilePath(event.target.value)}
              className="h-7 w-72 text-[11.5px]"
              aria-label="Choose a log file"
            >
              <option value="">Choose a log file…</option>
              {(files.data ?? []).map((file) => (
                <option key={file.path} value={file.path}>
                  {file.path} ({bytes(file.sizeBytes)})
                </option>
              ))}
            </Select>
          ) : null}

          <div className="relative w-56">
            <Search
              size={12}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-ghost"
              aria-hidden
            />
            <Input
              value={grep}
              onChange={(event) => setGrep(event.target.value)}
              placeholder="Filter on the server (grep)"
              className="h-7 pl-7 text-[11.5px]"
              aria-label="Filter log lines on the server"
            />
          </div>

          <div className="relative w-44">
            <Input
              value={highlight}
              onChange={(event) => setHighlight(event.target.value)}
              placeholder="Highlight in view"
              className="h-7 text-[11.5px]"
              aria-label="Highlight text in the viewer"
            />
          </div>

          <Select
            value={String(lines)}
            onChange={(event) => setLines(Number(event.target.value))}
            className="h-7 w-28 text-[11.5px]"
            aria-label="Number of lines"
          >
            {[200, 500, 1000, 2000, 5000].map((value) => (
              <option key={value} value={value}>
                {value} lines
              </option>
            ))}
          </Select>

          <div className="flex-1" />

          <CommandPeek
            actionId={tab === 'journal' ? 'logs.journal' : tab === 'kernel' ? 'logs.dmesg' : 'logs.tailFile'}
            params={
              tab === 'journal'
                ? journalParams
                : tab === 'kernel'
                  ? { lines }
                  : { path: filePath, lines, grep: debouncedGrep || undefined }
            }
            size="sm"
            variant="outline"
          />
          <IconButton
            icon={ArrowDownToLine}
            label="Jump to the newest line"
            onClick={() => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })}
          />
        </div>
      ) : null}

      {active.error ? <ErrorNote message={active.error} onRetry={() => void active.refresh()} /> : null}

      {/* content */}
      {tab === 'security' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Panel>
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <ShieldAlert size={13} className="text-danger" aria-hidden />
                <h2 className="flex-1 text-[12.5px] font-semibold text-ink">Failed sign-in attempts</h2>
                <Badge tone={authFailures.data?.length ? 'danger' : 'run'}>
                  {authFailures.data?.length ?? 0}
                </Badge>
                <CommandPeek actionId="logs.authFailures" />
              </div>
              <LogBody lines={authFailures.data} highlight={highlight} empty="No rejected logins found." />
            </Panel>

            <Panel>
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <AlertOctagon size={13} className="text-warn" aria-hidden />
                <h2 className="flex-1 text-[12.5px] font-semibold text-ink">Failed units</h2>
                <Badge tone={failedUnits.data?.length ? 'danger' : 'run'}>
                  {failedUnits.data?.length ?? 0}
                </Badge>
                <CommandPeek actionId="logs.failedUnits" />
              </div>
              <LogBody
                lines={failedUnits.data?.map((u) => `${u.unit}  ${u.description}`)}
                highlight={highlight}
                empty="Every unit is healthy."
              />
            </Panel>

            <Panel className="xl:col-span-2">
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <FileText size={13} className="text-info" aria-hidden />
                <h2 className="flex-1 text-[12.5px] font-semibold text-ink">Recent logins</h2>
                <CommandPeek actionId="logs.lastLogins" />
              </div>
              <LogBody lines={lastLogins.data} highlight={highlight} empty="No login history available." />
            </Panel>
          </div>
        </div>
      ) : tab === 'files' && !filePath ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <Panel>
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <FileText size={13} className="text-ink-faint" aria-hidden />
              <h2 className="flex-1 text-[12.5px] font-semibold text-ink">Files under /var/log</h2>
              <Badge tone="neutral">{files.data?.length ?? 0}</Badge>
            </div>
            {(files.data?.length ?? 0) === 0 ? (
              <EmptyState
                icon={FileText}
                title={files.initial ? 'Looking for log files' : 'Nothing readable in /var/log'}
                compact
              />
            ) : (
              <ul className="divide-y divide-line/50">
                {files.data!.map((file) => (
                  <li key={file.path}>
                    <button
                      type="button"
                      onClick={() => setFilePath(file.path)}
                      className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-hover/50"
                    >
                      <span className="mono min-w-0 flex-1 truncate text-[11.5px] text-ink-dim">
                        {file.path}
                      </span>
                      <span className="mono shrink-0 text-[10.5px] text-ink-ghost">
                        {file.modified}
                      </span>
                      <span className="mono w-20 shrink-0 text-right text-[10.5px] text-ink-faint">
                        {bytes(file.sizeBytes)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto bg-void">
          <LogViewer text={text} highlight={highlight} loading={active.initial} />
          <div ref={bottomRef} />
        </div>
      )}

      {tab !== 'security' ? (
        <footer className="flex shrink-0 items-center gap-3 border-t border-line px-3 py-1 text-[10.5px] text-ink-ghost">
          <span>{text ? text.split('\n').length : 0} lines loaded</span>
          {live ? <Badge tone="run">refreshing every few seconds</Badge> : null}
          <div className="flex-1" />
          <span className="mono">
            {tab === 'journal'
              ? 'journalctl'
              : tab === 'kernel'
                ? 'dmesg -T'
                : `tail -n ${lines}`}
          </span>
        </footer>
      ) : null}
    </div>
  )
}

// Severity is read from the line itself, so errors stand out without altering the raw text.

function severityClass(line: string): string {
  if (/\b(emerg|alert|crit|critical|fatal|error|err|failed|failure|denied|refused|panic)\b/i.test(line))
    return 'text-danger'
  if (/\b(warn|warning|deprecated|timeout|retry)\b/i.test(line)) return 'text-warn'
  if (/\b(started|starting|success|ready|listening|accepted|active)\b/i.test(line))
    return 'text-run-bright'
  return 'text-ink-dim'
}

function LogViewer({
  text,
  highlight,
  loading
}: {
  text: string | undefined
  highlight: string
  loading: boolean
}): React.JSX.Element {
  const lines = useMemo(() => (text ? text.split('\n') : []), [text])

  if (loading && lines.length === 0) {
    return <EmptyState icon={ScrollText} title="Reading the log" />
  }
  if (lines.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Nothing to show"
        message="No lines came back for these filters. Try a wider priority or clear the search."
      />
    )
  }

  return (
    <div className="mono selectable px-3 py-2 text-[11.5px] leading-[1.65]">
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            'flex gap-3 rounded-xs px-1 hover:bg-hover/40',
            severityClass(line),
            highlight && line.toLowerCase().includes(highlight.toLowerCase()) && 'bg-warn/14'
          )}
        >
          <span className="w-10 shrink-0 select-none text-right text-ink-ghost">{index + 1}</span>
          <span className="min-w-0 break-words whitespace-pre-wrap">{line || ' '}</span>
        </div>
      ))}
    </div>
  )
}

function LogBody({
  lines,
  highlight,
  empty
}: {
  lines: string[] | undefined
  highlight: string
  empty: string
}): React.JSX.Element {
  if (!lines) {
    return <p className="px-3 py-2 text-[11px] text-ink-ghost">Reading…</p>
  }
  if (lines.length === 0) {
    return <EmptyState icon={Cpu} title={empty} compact />
  }
  return (
    <div className="mono selectable max-h-72 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed">
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            'break-words whitespace-pre-wrap',
            severityClass(line),
            highlight && line.toLowerCase().includes(highlight.toLowerCase()) && 'bg-warn/14'
          )}
        >
          {line}
        </div>
      ))}
    </div>
  )
}
