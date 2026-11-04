import type { DiskEntry, MetricsSnapshot, NetSample } from '@shared/types'
import { defineActions, type ActionContext } from './types'
import { FACTS_SCRIPT } from '../ssh/facts'

const PSEUDO_FS =
  /^(devtmpfs|tmpfs|squashfs|proc|sysfs|cgroup|cgroup2|efivarfs|debugfs|tracefs|mqueue|hugetlbfs|pstore|securityfs|configfs|fusectl|binfmt_misc|nsfs|autofs|ramfs|devpts|rpc_pipefs|selinuxfs|bpf|fuse\.gvfsd)$/

export const METRICS_COMMAND = [
  `echo '@@STAT'; grep '^cpu' /proc/stat`,
  `echo '@@MEM'; cat /proc/meminfo`,
  `echo '@@LOAD'; cat /proc/loadavg`,
  `echo '@@UP'; cat /proc/uptime`,
  `echo '@@DISK'; { df -PTk 2>/dev/null || df -Pk 2>/dev/null || df -k; } | tail -n +2`,
  `echo '@@NET'; cat /proc/net/dev`,
  `echo '@@PROC'; ls -1 /proc 2>/dev/null | grep -c '^[0-9]'`,
  `echo '@@WHO'; who 2>/dev/null | wc -l`,
  `echo '@@TEMP'; cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || true`
].join('; ')

interface CpuTick {
  total: number
  idle: number
}

function splitSections(stdout: string): Map<string, string[]> {
  const sections = new Map<string, string[]>()
  let current = ''
  for (const line of stdout.split('\n')) {
    const marker = line.match(/^@@([A-Z]+)\s*$/)
    if (marker) {
      current = marker[1]
      sections.set(current, [])
      continue
    }
    if (current) sections.get(current)!.push(line)
  }
  return sections
}

function parseCpuTicks(lines: string[]): { aggregate: CpuTick; cores: CpuTick[] } {
  let aggregate: CpuTick = { total: 0, idle: 0 }
  const cores: CpuTick[] = []
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (!parts[0]?.startsWith('cpu')) continue
    const values = parts.slice(1).map(Number).filter((n) => Number.isFinite(n))
    if (values.length < 4) continue
    const total = values.reduce((a, b) => a + b, 0)
    const idle = (values[3] ?? 0) + (values[4] ?? 0) // idle + iowait
    if (parts[0] === 'cpu') aggregate = { total, idle }
    else cores.push({ total, idle })
  }
  return { aggregate, cores }
}

function tickDelta(prev: CpuTick | undefined, next: CpuTick): number {
  if (!prev) return 0
  const totalDelta = next.total - prev.total
  const idleDelta = next.idle - prev.idle
  if (totalDelta <= 0) return 0
  return clampPercent(((totalDelta - idleDelta) / totalDelta) * 100)
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10))
}

function parseMeminfo(lines: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const line of lines) {
    const match = line.match(/^(\w+):\s+(\d+)/)
    if (match) out[match[1]] = Number(match[2]) * 1024
  }
  return out
}

function parseDisks(lines: string[]): DiskEntry[] {
  const disks: DiskEntry[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(/\s+/)
    // with -T: fs type 1k used avail cap mount   | without: fs 1k used avail cap mount
    const withType = parts.length >= 7 && !/^\d+$/.test(parts[1])
    const fs = parts[0]
    const type = withType ? parts[1] : 'unknown'
    const offset = withType ? 2 : 1
    const total = Number(parts[offset]) * 1024
    const used = Number(parts[offset + 1]) * 1024
    const avail = Number(parts[offset + 2]) * 1024
    const mount = parts.slice(offset + 4).join(' ')
    if (!mount || !Number.isFinite(total) || total <= 0) continue
    if (PSEUDO_FS.test(type)) continue
    if (type === 'unknown' && /^(tmpfs|devtmpfs|udev|none)$/.test(fs)) continue
    disks.push({
      filesystem: fs,
      type,
      mount,
      totalBytes: total,
      usedBytes: used,
      availableBytes: avail,
      usePercent: total > 0 ? clampPercent((used / total) * 100) : 0
    })
  }
  return disks.sort((a, b) => (a.mount === '/' ? -1 : b.mount === '/' ? 1 : b.totalBytes - a.totalBytes))
}

function parseNet(
  lines: string[],
  prev: { at: number; counters: Record<string, { rx: number; tx: number }> } | undefined,
  now: number
): { samples: NetSample[]; counters: Record<string, { rx: number; tx: number }> } {
  const counters: Record<string, { rx: number; tx: number }> = {}
  const samples: NetSample[] = []
  for (const line of lines) {
    const match = line.match(/^\s*([^:]+):\s*(.*)$/)
    if (!match) continue
    const iface = match[1].trim()
    if (iface === 'lo' || iface.startsWith('veth')) continue
    const values = match[2].trim().split(/\s+/).map(Number)
    const rx = values[0] ?? 0
    const tx = values[8] ?? 0
    counters[iface] = { rx, tx }
    const before = prev?.counters[iface]
    const seconds = prev ? Math.max(0.2, (now - prev.at) / 1000) : 0
    samples.push({
      iface,
      rxBytes: rx,
      txBytes: tx,
      rxRate: before && seconds ? Math.max(0, (rx - before.rx) / seconds) : 0,
      txRate: before && seconds ? Math.max(0, (tx - before.tx) / seconds) : 0
    })
  }
  return {
    samples: samples.sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes)),
    counters
  }
}

export const systemActions = defineActions([
  {
    id: 'system.facts',
    label: 'Read server details',
    category: 'System',
    risk: 'read',
    description: 'Distro, kernel, CPU, package manager, init system and privileges.',
    build: () => FACTS_SCRIPT,
    parse: (_out, _p, ctx: ActionContext) => ctx.facts
  },
  {
    id: 'system.metrics',
    label: 'Sample live metrics',
    category: 'System',
    risk: 'read',
    description: 'CPU, memory, disk, network and load, read straight from /proc.',
    timeoutMs: 20_000,
    build: () => METRICS_COMMAND,
    parse: (out, _params, ctx): MetricsSnapshot => {
      const now = Date.now()
      const sections = splitSections(out.stdout)

      const ticks = parseCpuTicks(sections.get('STAT') ?? [])
      const prevAgg = ctx.cache.get('cpu:aggregate') as CpuTick | undefined
      const prevCores = (ctx.cache.get('cpu:cores') as CpuTick[] | undefined) ?? []
      const usagePercent = tickDelta(prevAgg, ticks.aggregate)
      const perCore = ticks.cores.map((core, i) => tickDelta(prevCores[i], core))
      ctx.cache.set('cpu:aggregate', ticks.aggregate)
      ctx.cache.set('cpu:cores', ticks.cores)

      const mem = parseMeminfo(sections.get('MEM') ?? [])
      const memTotal = mem.MemTotal ?? 0
      const memAvailable = mem.MemAvailable ?? mem.MemFree ?? 0
      const swapTotal = mem.SwapTotal ?? 0

      const loadParts = (sections.get('LOAD')?.[0] ?? '').trim().split(/\s+/)
      const uptime = Number((sections.get('UP')?.[0] ?? '0').trim().split(/\s+/)[0] ?? 0)

      const prevNet = ctx.cache.get('net:prev') as
        | { at: number; counters: Record<string, { rx: number; tx: number }> }
        | undefined
      const net = parseNet(sections.get('NET') ?? [], prevNet, now)
      ctx.cache.set('net:prev', { at: now, counters: net.counters })

      const tempRaw = Number((sections.get('TEMP')?.[0] ?? '').trim())

      return {
        at: now,
        uptimeSeconds: uptime,
        cpu: {
          usagePercent,
          perCore,
          loadAvg: [
            Number(loadParts[0] ?? 0) || 0,
            Number(loadParts[1] ?? 0) || 0,
            Number(loadParts[2] ?? 0) || 0
          ]
        },
        memory: {
          totalBytes: memTotal,
          availableBytes: memAvailable,
          usedBytes: Math.max(0, memTotal - memAvailable),
          freeBytes: mem.MemFree ?? 0,
          cachedBytes: mem.Cached ?? 0,
          buffersBytes: mem.Buffers ?? 0,
          swapTotalBytes: swapTotal,
          swapUsedBytes: Math.max(0, swapTotal - (mem.SwapFree ?? 0))
        },
        disks: parseDisks(sections.get('DISK') ?? []),
        net: net.samples,
        processCount: Number((sections.get('PROC')?.[0] ?? '0').trim()) || 0,
        loggedInUsers: Number((sections.get('WHO')?.[0] ?? '0').trim()) || 0,
        temperatureC: Number.isFinite(tempRaw) && tempRaw > 1000 ? Math.round(tempRaw / 100) / 10 : undefined
      }
    }
  },
  {
    id: 'system.who',
    label: 'List signed-in sessions',
    category: 'System',
    risk: 'read',
    build: () => `who -u 2>/dev/null || w -h 2>/dev/null || true`,
    allowFailure: true,
    parse: (out) =>
      out.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((raw) => {
          const parts = raw.split(/\s+/)
          return { user: parts[0], tty: parts[1], since: parts.slice(2, 4).join(' '), from: parts.at(-1), raw }
        })
  },
  {
    id: 'system.hostname.set',
    label: (p: { hostname: string }) => `Rename server to ${p.hostname}`,
    category: 'System',
    risk: 'write',
    privileged: true,
    build: (p: { hostname: string }) => `hostnamectl set-hostname ${q(p.hostname)}`
  },
  {
    id: 'system.timezone.list',
    label: 'List timezones',
    category: 'System',
    risk: 'read',
    build: () => `timedatectl list-timezones 2>/dev/null || cat /usr/share/zoneinfo/zone.tab 2>/dev/null | awk '{print $3}'`,
    allowFailure: true,
    parse: (out) => out.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  },
  {
    id: 'system.timezone.set',
    label: (p: { timezone: string }) => `Set timezone to ${p.timezone}`,
    category: 'System',
    risk: 'write',
    privileged: true,
    build: (p: { timezone: string }) => `timedatectl set-timezone ${q(p.timezone)}`
  },
  {
    id: 'system.reboot',
    label: 'Reboot the server',
    category: 'System',
    risk: 'destructive',
    privileged: true,
    description: 'Every session drops immediately and the box restarts.',
    allowFailure: true,
    build: () => `systemctl reboot || reboot`
  },
  {
    id: 'system.shutdown',
    label: 'Power off the server',
    category: 'System',
    risk: 'destructive',
    privileged: true,
    description: 'The machine powers down. You will need out-of-band access to bring it back.',
    allowFailure: true,
    build: () => `systemctl poweroff || poweroff`
  }
])

export function q(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}
