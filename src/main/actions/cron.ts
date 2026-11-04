import type { CronJob } from '@shared/types'
import { defineActions, type ActionContext } from './types'
import { q } from './system'

const LIST_COMMAND = [
  `echo '@@USERS'`,
  `for u in $(cut -d: -f1 /etc/passwd 2>/dev/null); do c=$(crontab -l -u "$u" 2>/dev/null); if [ -n "$c" ]; then echo "##USER:$u"; echo "$c"; fi; done`,
  `echo '@@SELF'`,
  `crontab -l 2>/dev/null || true`,
  `echo '@@SYSTEM'`,
  `cat /etc/crontab 2>/dev/null || true`,
  `echo '@@DROPIN'`,
  `for f in /etc/cron.d/*; do [ -f "$f" ] && { echo "##FILE:$f"; cat "$f"; }; done 2>/dev/null`
].join('; ')

function section(stdout: string, name: string): string[] {
  const parts = stdout.split(new RegExp(`^@@${name}\\s*$`, 'm'))
  if (parts.length < 2) return []
  return parts[1].split(/^@@[A-Z]+\s*$/m)[0].split('\n')
}

const SCHEDULE_ALIASES = /^@(reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)$/

/**
 * One cron field: `*`, `5`, `1-5`, `1,3,5`, `*‍/15`, `mon`, `jan-mar`, or any
 * comma-separated mix of those. Written out in full rather than assembled from
 * strings so the escapes survive.
 */
const CRON_FIELD =
  /^(?:\*|(?:\d+|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sun|mon|tue|wed|thu|fri|sat)(?:-(?:\d+|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sun|mon|tue|wed|thu|fri|sat))?)(?:\/\d+)?(?:,(?:\*|(?:\d+|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sun|mon|tue|wed|thu|fri|sat)(?:-(?:\d+|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sun|mon|tue|wed|thu|fri|sat))?)(?:\/\d+)?)*$/i
const USER_FIELD = /^[a-z_][a-z0-9_-]*\$?$/i

function isSchedule(fields: string[]): boolean {
  return fields.length === 5 && fields.every((field) => CRON_FIELD.test(field))
}

/**
 * Split a crontab line into schedule + command, handling @daily style aliases.
 * Every field is validated, because the prose comments at the top of
 * /etc/crontab otherwise parse as perfectly plausible five-field schedules.
 */
function splitCronLine(line: string, hasUserColumn: boolean): { schedule: string; command: string } | null {
  const parts = line.trim().split(/\s+/)
  if (parts.length < 2) return null

  if (SCHEDULE_ALIASES.test(parts[0])) {
    if (hasUserColumn && !USER_FIELD.test(parts[1] ?? '')) return null
    const rest = hasUserColumn ? parts.slice(2) : parts.slice(1)
    if (rest.length === 0) return null
    return { schedule: parts[0], command: rest.join(' ') }
  }

  if (parts.length < (hasUserColumn ? 7 : 6)) return null
  if (!isSchedule(parts.slice(0, 5))) return null
  if (hasUserColumn && !USER_FIELD.test(parts[5])) return null

  return {
    schedule: parts.slice(0, 5).join(' '),
    command: parts.slice(hasUserColumn ? 6 : 5).join(' ')
  }
}

/**
 * `includeDisabled` is only true for per-user crontabs. Commenting a line out
 * is how this app disables a job there, so those entries matter. The system
 * files ship worked examples inside comments that are valid cron syntax, and
 * listing them as disabled jobs would be pure noise.
 */
function parseBlock(
  lines: string[],
  user: string,
  hasUserColumn: boolean,
  idPrefix: string,
  includeDisabled: boolean
): CronJob[] {
  const jobs: CronJob[] = []
  let pendingComment = ''
  lines.forEach((raw, index) => {
    const line = raw.trim()
    if (!line) return
    if (/^[A-Z_]+=/.test(line)) return // environment assignment

    const commented = line.startsWith('#')
    const body = commented ? line.replace(/^#+\s*/, '') : line

    if (commented && (!includeDisabled || !splitCronLine(body, hasUserColumn))) {
      pendingComment = body
      return
    }

    const split = splitCronLine(body, hasUserColumn)
    if (!split) return

    const effectiveUser = hasUserColumn ? body.trim().split(/\s+/)[5] ?? user : user
    jobs.push({
      id: `${idPrefix}:${index}`,
      schedule: split.schedule,
      command: split.command,
      raw,
      comment: pendingComment || undefined,
      enabled: !commented,
      user: SCHEDULE_ALIASES.test(body.trim().split(/\s+/)[0]) && hasUserColumn
        ? body.trim().split(/\s+/)[1] ?? user
        : effectiveUser
    })
    pendingComment = ''
  })
  return jobs
}

export interface CronPayload {
  jobs: CronJob[]
  /** raw crontab text per user, so edits round-trip losslessly */
  raw: Record<string, string>
  systemFiles: { path: string; content: string }[]
}

export const cronActions = defineActions([
  {
    id: 'cron.list',
    label: 'List scheduled jobs',
    category: 'Scheduler',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 60_000,
    description: 'Per-user crontabs, /etc/crontab and every file in /etc/cron.d.',
    build: () => LIST_COMMAND,
    parse: (out, _p, ctx: ActionContext): CronPayload => {
      const jobs: CronJob[] = []
      const raw: Record<string, string> = {}

      // per-user crontabs
      let currentUser = ''
      let buffer: string[] = []
      const flush = (): void => {
        if (!currentUser) return
        raw[currentUser] = buffer.join('\n')
        jobs.push(...parseBlock(buffer, currentUser, false, `user:${currentUser}`, true))
        buffer = []
      }
      for (const line of section(out.stdout, 'USERS')) {
        const header = line.match(/^##USER:(.+)$/)
        if (header) {
          flush()
          currentUser = header[1].trim()
          continue
        }
        if (currentUser) buffer.push(line)
      }
      flush()

      // the connected account's own crontab (covers non-root sessions)
      const self = section(out.stdout, 'SELF').filter((l) => l.trim().length > 0)
      if (self.length && !raw[ctx.facts.user]) {
        raw[ctx.facts.user] = self.join('\n')
        jobs.push(...parseBlock(self, ctx.facts.user, false, `user:${ctx.facts.user}`, true))
      }

      // /etc/crontab has a user column
      const systemLines = section(out.stdout, 'SYSTEM')
      jobs.push(...parseBlock(systemLines, 'root', true, 'system', false))

      // /etc/cron.d/*
      const systemFiles: { path: string; content: string }[] = []
      let currentFile = ''
      let fileBuffer: string[] = []
      const flushFile = (): void => {
        if (!currentFile) return
        systemFiles.push({ path: currentFile, content: fileBuffer.join('\n') })
        jobs.push(...parseBlock(fileBuffer, 'root', true, `file:${currentFile}`, false))
        fileBuffer = []
      }
      for (const line of section(out.stdout, 'DROPIN')) {
        const header = line.match(/^##FILE:(.+)$/)
        if (header) {
          flushFile()
          currentFile = header[1].trim()
          continue
        }
        if (currentFile) fileBuffer.push(line)
      }
      flushFile()

      if (systemLines.some((l) => l.trim())) {
        systemFiles.unshift({ path: '/etc/crontab', content: systemLines.join('\n') })
      }

      return { jobs, raw, systemFiles }
    }
  },
  {
    id: 'cron.save',
    label: (p: { user: string }) => `Replace ${p.user}'s crontab`,
    category: 'Scheduler',
    risk: 'write',
    privileged: true,
    description: 'Installs the full crontab in one atomic write, exactly like `crontab -`.',
    preview: (p: { user: string }) => `crontab -u ${q(p.user)} -   # new crontab piped on stdin`,
    custom: async (p: { user: string; content: string }, ctx: ActionContext) => {
      const content = p.content.endsWith('\n') ? p.content : `${p.content}\n`
      const command = `crontab -u ${q(p.user)} -`
      const out = await ctx.exec(command, { privileged: true, stdin: content })
      if (out.code !== 0) {
        throw new Error(out.stderr.trim() || `crontab exited with ${out.code}`)
      }
      return {
        command: `${command}   # ${content.split('\n').filter(Boolean).length} lines piped on stdin`,
        plain: `crontab -u ${q(p.user)} -`,
        stdout: 'Crontab installed.',
        exitCode: 0
      }
    }
  },
  {
    id: 'cron.raw',
    label: (p: { user: string }) => `Read ${p.user}'s crontab`,
    category: 'Scheduler',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: (p: { user: string }) => `crontab -l -u ${q(p.user)} 2>/dev/null || true`,
    parse: (out) => out.stdout
  },
  {
    id: 'cron.runNow',
    label: (p: { command: string }) => `Run "${truncate(p.command)}" now`,
    category: 'Scheduler',
    risk: 'write',
    privileged: true,
    timeoutMs: 300_000,
    description: 'Executes the job command immediately in a login shell.',
    build: (p: { command: string }) => p.command,
    parse: (out) => out.stdout + (out.stderr ? `\n${out.stderr}` : '')
  },
  {
    id: 'cron.timers',
    label: 'List systemd timers',
    category: 'Scheduler',
    risk: 'read',
    allowFailure: true,
    build: () => `systemctl list-timers --all --no-pager --no-legend 2>/dev/null`,
    parse: (out) =>
      out.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((raw) => {
          const parts = raw.split(/\s{2,}/)
          return {
            next: parts[0] ?? '',
            left: parts[1] ?? '',
            last: parts[2] ?? '',
            unit: parts.find((p) => p.endsWith('.timer')) ?? '',
            activates: parts.at(-1) ?? '',
            raw
          }
        })
        .filter((t) => t.unit)
  }
])

function truncate(value: string, max = 40): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}
