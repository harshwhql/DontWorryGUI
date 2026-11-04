import type { ProcessEntry } from '@shared/types'
import { defineActions } from './types'
import { q } from './system'

const PS_PRIMARY =
  `ps -eo pid=,ppid=,user=,pcpu=,pmem=,rss=,stat=,etimes=,nice=,args= --sort=-pcpu 2>/dev/null` +
  ` || ps -eo pid=,ppid=,user=,pcpu=,pmem=,rss=,stat=,time=,nice=,args= 2>/dev/null` +
  ` || ps aux`

function basename(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? ''
  const cleaned = first.replace(/:$/, '')
  const parts = cleaned.split('/')
  return parts[parts.length - 1] || cleaned || command.slice(0, 20)
}

function parseElapsed(token: string): number {
  if (/^\d+$/.test(token)) return Number(token)
  // HH:MM:SS or MM:SS from the `time=` fallback
  const parts = token.split(':').map(Number).reverse()
  return parts.reduce((acc, value, index) => acc + (Number.isFinite(value) ? value * 60 ** index : 0), 0)
}

export function parseProcessList(stdout: string): ProcessEntry[] {
  const rows: ProcessEntry[] = []
  for (const raw of stdout.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) continue
    if (/^\s*(PID|USER)\b/.test(line)) continue
    const parts = line.trim().split(/\s+/)
    if (parts.length < 10) continue
    const pid = Number(parts[0])
    if (!Number.isFinite(pid)) continue
    const fullCommand = parts.slice(9).join(' ')
    rows.push({
      pid,
      ppid: Number(parts[1]) || 0,
      user: parts[2],
      cpu: Number(parts[3]) || 0,
      mem: Number(parts[4]) || 0,
      rssBytes: (Number(parts[5]) || 0) * 1024,
      state: parts[6],
      elapsedSeconds: parseElapsed(parts[7]),
      nice: Number(parts[8]) || 0,
      command: basename(fullCommand),
      fullCommand
    })
  }
  return rows
}

export const processActions = defineActions([
  {
    id: 'processes.list',
    label: 'List running processes',
    category: 'Processes',
    risk: 'read',
    description: 'Every process with its CPU, memory and elapsed time.',
    timeoutMs: 25_000,
    build: () => PS_PRIMARY,
    parse: (out) => parseProcessList(out.stdout)
  },
  {
    id: 'processes.tree',
    label: 'Show the process tree',
    category: 'Processes',
    risk: 'read',
    build: () => `ps -e --forest -o pid,user,pcpu,pmem,args 2>/dev/null | head -n 400`,
    allowFailure: true,
    parse: (out) => out.stdout
  },
  {
    id: 'processes.detail',
    label: (p: { pid: number }) => `Inspect PID ${p.pid}`,
    category: 'Processes',
    risk: 'read',
    build: (p: { pid: number }) =>
      [
        `echo '@@CMD'; tr '\\0' ' ' < /proc/${p.pid}/cmdline 2>/dev/null`,
        `echo; echo '@@STATUS'; cat /proc/${p.pid}/status 2>/dev/null | head -n 30`,
        `echo '@@CWD'; readlink /proc/${p.pid}/cwd 2>/dev/null`,
        `echo '@@EXE'; readlink /proc/${p.pid}/exe 2>/dev/null`,
        `echo '@@OPEN'; ls -l /proc/${p.pid}/fd 2>/dev/null | head -n 25`,
        `echo '@@PORTS'; ss -tulpn 2>/dev/null | grep -F 'pid=${p.pid},' || true`
      ].join('; '),
    allowFailure: true,
    parse: (out) => out.stdout
  },
  {
    id: 'processes.kill',
    label: (p: { pid: number; name?: string }) =>
      `Stop ${p.name ? `${p.name} ` : ''}(PID ${p.pid})`,
    category: 'Processes',
    risk: 'destructive',
    privileged: true,
    description: 'Sends SIGTERM so the process can shut down cleanly.',
    build: (p: { pid: number }) => `kill -TERM ${Number(p.pid)}`
  },
  {
    id: 'processes.kill9',
    label: (p: { pid: number; name?: string }) =>
      `Force kill ${p.name ? `${p.name} ` : ''}(PID ${p.pid})`,
    category: 'Processes',
    risk: 'destructive',
    privileged: true,
    description: 'Sends SIGKILL. The process cannot save state or clean up.',
    build: (p: { pid: number }) => `kill -KILL ${Number(p.pid)}`
  },
  {
    id: 'processes.killByName',
    label: (p: { name: string }) => `Stop every "${p.name}" process`,
    category: 'Processes',
    risk: 'destructive',
    privileged: true,
    build: (p: { name: string }) => `pkill -TERM -f ${q(p.name)}`
  },
  {
    id: 'processes.renice',
    label: (p: { pid: number; nice: number }) => `Set PID ${p.pid} priority to ${p.nice}`,
    category: 'Processes',
    risk: 'write',
    privileged: true,
    description: 'Lower numbers get more CPU time. Range is -20 to 19.',
    build: (p: { pid: number; nice: number }) => `renice -n ${Number(p.nice)} -p ${Number(p.pid)}`
  }
])
