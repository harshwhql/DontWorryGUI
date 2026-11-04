import { defineActions } from './types'
import { q } from './system'

interface JournalParams {
  unit?: string
  priority?: string
  lines?: number
  since?: string
  grep?: string
  identifier?: string
}

function journalCommand(p: JournalParams): string {
  const flags = [
    '--no-pager',
    '-o short-iso',
    '--no-hostname',
    `-n ${Number(p.lines ?? 500)}`,
    p.unit ? `-u ${q(p.unit)}` : '',
    p.identifier ? `-t ${q(p.identifier)}` : '',
    p.priority && p.priority !== 'all' ? `-p ${q(p.priority)}` : '',
    p.since ? `--since ${q(p.since)}` : '',
    p.grep ? `--grep ${q(p.grep)}` : ''
  ].filter(Boolean)
  return `journalctl ${flags.join(' ')}`
}

export const logActions = defineActions([
  {
    id: 'logs.journal',
    label: (p: JournalParams) => (p.unit ? `Read the journal for ${p.unit}` : 'Read the system journal'),
    category: 'Logs',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 60_000,
    description: 'systemd journal with the filters you picked applied server-side.',
    build: (p: JournalParams) => journalCommand(p),
    parse: (out) => out.stdout || out.stderr
  },
  {
    id: 'logs.units',
    label: 'List units that write to the journal',
    category: 'Logs',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 60_000,
    build: () => `journalctl --no-pager -F _SYSTEMD_UNIT 2>/dev/null | sort -u | head -n 400`,
    parse: (out) => out.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  },
  {
    id: 'logs.boot',
    label: 'Read this boot',
    category: 'Logs',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: (p: { lines?: number }) =>
      `journalctl -b --no-pager -o short-iso --no-hostname -n ${Number(p?.lines ?? 500)}`,
    parse: (out) => out.stdout || out.stderr
  },
  {
    id: 'logs.failedUnits',
    label: 'List failed units',
    category: 'Logs',
    risk: 'read',
    allowFailure: true,
    build: () => `systemctl list-units --failed --no-pager --plain --no-legend`,
    parse: (out) =>
      out.stdout
        .split('\n')
        .map((l) => l.trim().replace(/^[●*>x✕●✘]\s*/, ''))
        .filter(Boolean)
        .map((raw) => {
          const parts = raw.split(/\s+/)
          return { unit: parts[0], active: parts[2], sub: parts[3], description: parts.slice(4).join(' ') }
        })
        .filter((u) => u.unit)
  },
  {
    id: 'logs.dmesg',
    label: 'Read kernel messages',
    category: 'Logs',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: (p: { lines?: number }) =>
      `dmesg -T 2>/dev/null | tail -n ${Number(p?.lines ?? 400)} || dmesg | tail -n ${Number(p?.lines ?? 400)}`,
    parse: (out) => out.stdout || out.stderr
  },
  {
    id: 'logs.files',
    label: 'List log files',
    category: 'Logs',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 60_000,
    build: () =>
      `find /var/log -maxdepth 2 -type f -size +0 -printf '%s\\t%TY-%Tm-%Td %TH:%TM\\t%p\\n' 2>/dev/null | sort -rn | head -n 120`,
    parse: (out) =>
      out.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [size, modified, ...rest] = line.split('\t')
          return { sizeBytes: Number(size) || 0, modified, path: rest.join('\t') }
        })
        .filter((row) => row.path)
  },
  {
    id: 'logs.tailFile',
    label: (p: { path: string }) => `Tail ${p.path}`,
    category: 'Logs',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 40_000,
    build: (p: { path: string; lines?: number; grep?: string }) =>
      p.grep
        ? `tail -n ${Number(p.lines ?? 500)} ${q(p.path)} | grep -i -- ${q(p.grep)}`
        : `tail -n ${Number(p.lines ?? 500)} ${q(p.path)}`,
    parse: (out) => out.stdout || out.stderr
  },
  {
    id: 'logs.authFailures',
    label: 'Find failed sign-in attempts',
    category: 'Logs',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 60_000,
    description: 'Scans the journal and auth log for rejected SSH logins.',
    build: () =>
      `{ journalctl -u ssh -u sshd --no-pager -o short-iso --no-hostname -n 2000 2>/dev/null; cat /var/log/auth.log 2>/dev/null | tail -n 2000; cat /var/log/secure 2>/dev/null | tail -n 2000; } | grep -Ei 'failed password|invalid user|authentication failure' | tail -n 200`,
    parse: (out) => out.stdout.split('\n').filter(Boolean)
  },
  {
    id: 'logs.lastLogins',
    label: 'Show recent logins',
    category: 'Logs',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: () => `last -n 40 2>/dev/null || lastlog 2>/dev/null | head -n 40`,
    parse: (out) => out.stdout.split('\n').filter(Boolean)
  }
])
