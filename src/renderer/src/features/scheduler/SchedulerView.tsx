import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  Clock,
  FileCode2,
  Play,
  Plus,
  Timer,
  ToggleLeft,
  ToggleRight,
  Trash2
} from 'lucide-react'
import type { CronJob } from '@shared/types'
import { cn } from '../../lib/format'
import { useResource } from '../../lib/hooks'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Panel,
  PanelHeader,
  Segmented,
  Select,
  Textarea
} from '../../components/ui/primitives'
import { CodeBlock, DataTable, type Column } from '../../components/ui/data'
import { Modal } from '../../components/ui/overlay'
import { ActionButton, CommandPeek } from '../../components/ActionButton'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'

interface CronPayload {
  jobs: CronJob[]
  raw: Record<string, string>
  systemFiles: { path: string; content: string }[]
}

interface TimerRow {
  unit: string
  next: string
  left: string
  last: string
  activates: string
}

const PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Hourly, on the hour', value: '0 * * * *' },
  { label: 'Daily at 03:00', value: '0 3 * * *' },
  { label: 'Weekly, Sunday 04:00', value: '0 4 * * 0' },
  { label: 'Monthly, 1st at 05:00', value: '0 5 1 * *' },
  { label: 'At every reboot', value: '@reboot' }
]

const FIELD_NAMES = ['minute', 'hour', 'day of month', 'month', 'day of week']

/** Turn a cron expression into a sentence, so nobody has to decode five columns. */
function describeSchedule(schedule: string): string {
  const aliases: Record<string, string> = {
    '@reboot': 'Once, every time the server boots',
    '@hourly': 'Every hour',
    '@daily': 'Every day at midnight',
    '@midnight': 'Every day at midnight',
    '@weekly': 'Every Sunday at midnight',
    '@monthly': 'On the 1st of each month at midnight',
    '@yearly': 'On 1 January at midnight',
    '@annually': 'On 1 January at midnight'
  }
  if (aliases[schedule]) return aliases[schedule]

  const parts = schedule.trim().split(/\s+/)
  if (parts.length < 5) return schedule

  const [minute, hour, dom, month, dow] = parts
  const every = (value: string, name: string): string | null => {
    if (value === '*') return null
    const step = value.match(/^\*\/(\d+)$/)
    if (step) return `every ${step[1]} ${name}s`
    return `${name} ${value}`
  }

  if (minute === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*')
    return 'Every minute'

  const bits: string[] = []
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
    bits.push(`at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`)
  } else {
    const m = every(minute, 'minute')
    const h = every(hour, 'hour')
    if (m) bits.push(m)
    if (h) bits.push(h)
  }
  const d = every(dom, 'day of the month')
  const mo = every(month, 'month')
  const w = every(dow, 'weekday')
  if (d) bits.push(d)
  if (mo) bits.push(mo)
  if (w) bits.push(w)

  return bits.length ? `Runs ${bits.join(', ')}` : schedule
}

export function SchedulerView(): React.JSX.Element {
  const facts = useApp((s) => s.activeConnection()?.facts)
  const toast = useApp((s) => s.toast)

  const [tab, setTab] = useState<'cron' | 'timers' | 'files'>('cron')
  const [user, setUser] = useState<string>('')
  const [editor, setEditor] = useState<{ open: boolean; user: string; content: string }>({
    open: false,
    user: '',
    content: ''
  })
  const [addOpen, setAddOpen] = useState(false)
  const [schedule, setSchedule] = useState('0 3 * * *')
  const [command, setCommand] = useState('')
  const [comment, setComment] = useState('')

  const cron = useResource<CronPayload>('cron.list', {})
  const timers = useResource<TimerRow[]>('cron.timers', {}, { enabled: tab === 'timers' })

  const users = useMemo(() => Object.keys(cron.data?.raw ?? {}).sort(), [cron.data])

  useEffect(() => {
    if (!user && users.length) setUser(facts && users.includes(facts.user) ? facts.user : users[0])
  }, [users, user, facts])

  const jobs = useMemo(() => {
    const all = cron.data?.jobs ?? []
    return user ? all.filter((job) => job.user === user || job.id.startsWith('system')) : all
  }, [cron.data, user])

  const targetUser = user || facts?.user || 'root'

  /** rebuild the whole crontab text with one job toggled or removed */
  const rewrite = (mutate: (lines: string[]) => string[]): string => {
    const current = cron.data?.raw[targetUser] ?? ''
    return mutate(current.split('\n')).join('\n')
  }

  const columns: Column<CronJob>[] = [
    {
      key: 'enabled',
      header: '',
      width: '14px',
      render: (row) => (
        <span
          className={cn('block size-1.5 rounded-full', row.enabled ? 'bg-run' : 'bg-ink-ghost')}
          title={row.enabled ? 'active' : 'commented out'}
        />
      )
    },
    {
      key: 'schedule',
      header: 'Schedule',
      width: 'minmax(120px,160px)',
      sort: (row) => row.schedule,
      render: (row) => <span className="mono text-ink">{row.schedule}</span>
    },
    {
      key: 'human',
      header: 'In plain words',
      width: 'minmax(150px,1fr)',
      render: (row) => <span className="text-ink-faint">{describeSchedule(row.schedule)}</span>
    },
    {
      key: 'command',
      header: 'Command',
      width: 'minmax(0,1.6fr)',
      sort: (row) => row.command,
      render: (row) => (
        <span className="mono truncate text-[11px]" title={row.command}>
          {row.command}
        </span>
      )
    },
    {
      key: 'user',
      header: 'Runs as',
      width: '96px',
      sort: (row) => row.user,
      className: 'mono text-[10.5px]',
      render: (row) => (
        <span className={row.user === 'root' ? 'text-root' : undefined}>{row.user}</span>
      )
    },
    {
      key: 'actions',
      header: '',
      width: '172px',
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-0.5">
          <ActionButton
            actionId="cron.runNow"
            params={{ command: row.command }}
            icon={Play}
            size="xs"
            variant="outline"
            peek={false}
            options={{ successMessage: 'Job executed once' }}
          >
            Run now
          </ActionButton>
          <ActionButton
            actionId="cron.save"
            params={{
              user: targetUser,
              content: rewrite((lines) =>
                lines.map((line) =>
                  line.trim() === row.raw.trim()
                    ? row.enabled
                      ? `# ${line.trim()}`
                      : line.replace(/^#+\s*/, '')
                    : line
                )
              )
            }}
            icon={row.enabled ? ToggleRight : ToggleLeft}
            size="xs"
            variant="outline"
            peek={false}
            options={{ successMessage: row.enabled ? 'Job disabled' : 'Job enabled' }}
            onDone={() => void cron.refresh(true)}
            disabled={!row.id.startsWith('user')}
            title={
              row.id.startsWith('user')
                ? undefined
                : 'System crontabs are edited as files, not with crontab -'
            }
          >
            {row.enabled ? 'Disable' : 'Enable'}
          </ActionButton>
          <ActionButton
            actionId="cron.save"
            params={{
              user: targetUser,
              content: rewrite((lines) => lines.filter((line) => line.trim() !== row.raw.trim()))
            }}
            icon={Trash2}
            variant="danger"
            size="xs"
            peek={false}
            options={{ successMessage: 'Job removed' }}
            onDone={() => void cron.refresh(true)}
            disabled={!row.id.startsWith('user')}
          >
            Delete
          </ActionButton>
        </span>
      )
    }
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={CalendarClock}
        title="Scheduled jobs"
        subtitle={`${cron.data?.jobs.length ?? 0} cron entries across ${users.length || 1} crontab(s)`}
        onRefresh={() => void (tab === 'timers' ? timers.refresh() : cron.refresh())}
        refreshing={cron.loading || timers.loading}
        lastUpdated={cron.lastUpdated}
      >
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'cron', label: 'Cron' },
            { value: 'timers', label: 'systemd timers' },
            { value: 'files', label: 'System files' }
          ]}
        />
        {tab === 'cron' ? (
          <>
            <Select
              value={user}
              onChange={(event) => setUser(event.target.value)}
              className="h-7 w-40 text-[11.5px]"
              aria-label="Crontab owner"
            >
              {users.length === 0 ? <option value="">{facts?.user ?? 'current user'}</option> : null}
              {users.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="outline"
              icon={FileCode2}
              onClick={() =>
                setEditor({
                  open: true,
                  user: targetUser,
                  content: cron.data?.raw[targetUser] ?? ''
                })
              }
            >
              Edit raw crontab
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={Plus}
              onClick={() => {
                setSchedule('0 3 * * *')
                setCommand('')
                setComment('')
                setAddOpen(true)
              }}
            >
              Add job
            </Button>
          </>
        ) : null}
      </ViewHeader>

      {cron.error ? <ErrorNote message={cron.error} onRetry={() => void cron.refresh()} /> : null}

      {tab === 'cron' ? (
        <DataTable
          rows={jobs}
          columns={columns}
          rowKey={(row) => row.id}
          defaultSortKey="schedule"
          defaultSortDir="asc"
          rowTone={(row) => (row.enabled ? undefined : 'opacity-60')}
          emptyState={
            <EmptyState
              icon={CalendarClock}
              title={cron.initial ? 'Reading crontabs' : 'No scheduled jobs'}
              message={
                cron.initial
                  ? undefined
                  : 'Nothing is scheduled for this account. Add a job and it is installed with crontab -.'
              }
              action={
                <Button size="sm" variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
                  Add the first job
                </Button>
              }
            />
          }
          footer={
            <>
              <span>Disabled jobs are kept in the crontab, commented out.</span>
              <span className="mono">crontab -l -u {targetUser}</span>
            </>
          }
        />
      ) : null}

      {tab === 'timers' ? (
        <DataTable
          rows={timers.data ?? []}
          columns={[
            {
              key: 'unit',
              header: 'Timer',
              width: 'minmax(160px,1fr)',
              sort: (row) => row.unit,
              render: (row) => <span className="mono text-ink">{row.unit}</span>
            },
            {
              key: 'next',
              header: 'Next run',
              width: 'minmax(140px,200px)',
              sort: (row) => row.next,
              className: 'mono text-[10.5px]',
              render: (row) => row.next
            },
            {
              key: 'left',
              header: 'In',
              width: 'minmax(90px,130px)',
              className: 'text-[10.5px] text-run-bright',
              render: (row) => row.left
            },
            {
              key: 'last',
              header: 'Last run',
              width: 'minmax(140px,200px)',
              className: 'mono text-[10.5px]',
              render: (row) => row.last
            },
            {
              key: 'activates',
              header: 'Starts',
              width: 'minmax(0,1fr)',
              className: 'mono text-[10.5px] text-ink-faint',
              render: (row) => row.activates
            }
          ]}
          rowKey={(row) => row.unit}
          emptyState={
            <EmptyState
              icon={Timer}
              title={timers.initial ? 'Reading timers' : 'No systemd timers'}
              message={
                timers.initial ? undefined : 'This server schedules work with cron rather than timers.'
              }
            />
          }
          footer={<span className="mono">systemctl list-timers --all</span>}
        />
      ) : null}

      {tab === 'files' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {(cron.data?.systemFiles.length ?? 0) === 0 ? (
            <Panel>
              <EmptyState icon={FileCode2} title="No system cron files found" compact />
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              {cron.data!.systemFiles.map((file) => (
                <Panel key={file.path}>
                  <PanelHeader
                    title={<span className="mono">{file.path}</span>}
                    icon={FileCode2}
                    subtitle="Edit these through the Files section; they are plain files, not crontabs"
                  />
                  <div className="p-2.5">
                    <CodeBlock code={file.content || '(empty)'} tone="ink" maxHeight="max-h-64" wrap />
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* add job */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a scheduled job"
        subtitle={`Appended to ${targetUser}'s crontab and installed atomically`}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <ActionButton
              actionId="cron.save"
              params={{
                user: targetUser,
                content: [
                  cron.data?.raw[targetUser]?.trimEnd(),
                  comment ? `# ${comment}` : null,
                  `${schedule} ${command}`
                ]
                  .filter(Boolean)
                  .join('\n')
              }}
              variant="primary"
              size="sm"
              disabled={!command.trim() || !schedule.trim()}
              options={{ successMessage: 'Job scheduled' }}
              onDone={() => {
                setAddOpen(false)
                void cron.refresh(true)
                toast({ tone: 'info', title: `Installed into ${targetUser}'s crontab` })
              }}
            >
              Schedule it
            </ActionButton>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <Field label="When should it run?" required>
            <div className="flex flex-col gap-2">
              <Select
                value={PRESETS.some((p) => p.value === schedule) ? schedule : 'custom'}
                onChange={(event) => {
                  if (event.target.value !== 'custom') setSchedule(event.target.value)
                }}
              >
                {PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label} · {preset.value}
                  </option>
                ))}
                <option value="custom">Custom expression…</option>
              </Select>
              <Input value={schedule} onChange={(event) => setSchedule(event.target.value)} mono />
              <div className="flex items-center gap-2 rounded-md border border-line bg-void/50 px-2.5 py-1.5">
                <Clock size={11} className="shrink-0 text-run-bright" aria-hidden />
                <span className="text-[11.5px] text-ink-dim">{describeSchedule(schedule)}</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {FIELD_NAMES.map((name, index) => (
                  <div key={name} className="rounded-sm border border-line/60 bg-void/40 px-1.5 py-1">
                    <p className="mono text-center text-[12px] text-ink">
                      {schedule.startsWith('@') ? '—' : (schedule.trim().split(/\s+/)[index] ?? '*')}
                    </p>
                    <p className="text-center text-[9px] uppercase tracking-wide text-ink-ghost">
                      {name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Field>

          <Field
            label="Command to run"
            required
            hint="Use absolute paths: cron runs with a minimal PATH and no interactive shell."
          >
            <Textarea
              rows={3}
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="/usr/bin/certbot renew --quiet"
            />
          </Field>

          <Field label="Note" hint="Written above the entry as a comment so the next person knows why.">
            <Input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Renew TLS certificates"
            />
          </Field>
        </div>
      </Modal>

      {/* raw editor */}
      <Modal
        open={editor.open}
        onClose={() => setEditor({ ...editor, open: false })}
        title={`${editor.user}'s crontab`}
        subtitle="Saved with crontab -, which validates the whole file before installing it"
        width="max-w-3xl"
        footer={
          <>
            <CommandPeek actionId="cron.save" params={{ user: editor.user }} size="sm" variant="outline" />
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => setEditor({ ...editor, open: false })}>
              Cancel
            </Button>
            <ActionButton
              actionId="cron.save"
              params={{ user: editor.user, content: editor.content }}
              variant="primary"
              size="sm"
              peek={false}
              options={{ successMessage: 'Crontab installed' }}
              onDone={() => {
                setEditor({ ...editor, open: false })
                void cron.refresh(true)
              }}
            >
              Install crontab
            </ActionButton>
          </>
        }
      >
        <Textarea
          rows={18}
          value={editor.content}
          onChange={(event) => setEditor({ ...editor, content: event.target.value })}
          placeholder={'# m h dom mon dow   command\n0 3 * * *  /usr/local/bin/backup.sh'}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-ghost">
          Five fields then the command: minute, hour, day of month, month, day of week. A line
          starting with <code className="text-ink-faint">#</code> is a comment, which is how this app
          disables a job without losing it.
        </p>
      </Modal>
    </div>
  )
}
