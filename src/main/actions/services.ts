import type { ServiceDetail, ServiceEntry } from '@shared/types'
import { defineActions } from './types'
import { q } from './system'

const LIST_COMMAND = [
  `echo '@@UNITS'`,
  `systemctl list-units --type=service --all --no-pager --plain --no-legend 2>/dev/null`,
  `echo '@@FILES'`,
  `systemctl list-unit-files --type=service --no-pager --plain --no-legend 2>/dev/null`
].join('; ')

const SHOW_PROPS = [
  'Id',
  'Description',
  'ActiveState',
  'SubState',
  'UnitFileState',
  'MainPID',
  'MemoryCurrent',
  'CPUUsageNSec',
  'ActiveEnterTimestamp',
  'FragmentPath',
  'ExecStart',
  'Restart'
].join(',')

function section(stdout: string, name: string): string[] {
  const parts = stdout.split(new RegExp(`^@@${name}\\s*$`, 'm'))
  if (parts.length < 2) return []
  return parts[1].split(/^@@[A-Z]+\s*$/m)[0].split('\n')
}

export const serviceActions = defineActions([
  {
    id: 'services.list',
    label: 'List systemd services',
    category: 'Services',
    risk: 'read',
    description: 'Every service unit with its active state and whether it starts at boot.',
    timeoutMs: 30_000,
    allowFailure: true,
    build: () => LIST_COMMAND,
    parse: (out): ServiceEntry[] => {
      const enabledMap = new Map<string, string>()
      for (const line of section(out.stdout, 'FILES')) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 2 && parts[0].endsWith('.service')) enabledMap.set(parts[0], parts[1])
      }

      const rows: ServiceEntry[] = []
      for (const line of section(out.stdout, 'UNITS')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        // leading bullet for failed units
        const cleaned = trimmed.replace(/^[●*>x✕●✘]\s*/, '')
        const parts = cleaned.split(/\s+/)
        if (parts.length < 4 || !parts[0].includes('.service')) continue
        const unit = parts[0]
        rows.push({
          unit,
          name: unit.replace(/\.service$/, ''),
          load: parts[1],
          active: parts[2],
          sub: parts[3],
          description: parts.slice(4).join(' '),
          enabled: enabledMap.get(unit)
        })
      }

      // units that exist on disk but are not loaded still deserve a row
      for (const [unit, state] of enabledMap) {
        if (rows.some((r) => r.unit === unit)) continue
        rows.push({
          unit,
          name: unit.replace(/\.service$/, ''),
          load: 'not-loaded',
          active: 'inactive',
          sub: 'dead',
          description: '',
          enabled: state
        })
      }

      return rows.sort((a, b) => a.name.localeCompare(b.name))
    }
  },
  {
    id: 'services.detail',
    label: (p: { unit: string }) => `Inspect ${p.unit}`,
    category: 'Services',
    risk: 'read',
    allowFailure: true,
    build: (p: { unit: string }) => `systemctl show ${q(p.unit)} --no-pager --property=${SHOW_PROPS}`,
    parse: (out, p: { unit: string }): ServiceDetail => {
      const map = new Map<string, string>()
      for (const line of out.stdout.split('\n')) {
        const idx = line.indexOf('=')
        if (idx > 0) map.set(line.slice(0, idx), line.slice(idx + 1))
      }
      const num = (key: string): number | undefined => {
        const value = Number(map.get(key))
        return Number.isFinite(value) && value > 0 ? value : undefined
      }
      return {
        unit: map.get('Id') || p.unit,
        description: map.get('Description') || '',
        activeState: map.get('ActiveState') || 'unknown',
        subState: map.get('SubState') || '',
        unitFileState: map.get('UnitFileState') || 'unknown',
        mainPid: num('MainPID'),
        memoryBytes: num('MemoryCurrent'),
        cpuUsageNs: num('CPUUsageNSec'),
        since: map.get('ActiveEnterTimestamp') || undefined,
        fragmentPath: map.get('FragmentPath') || undefined,
        execStart: map.get('ExecStart') || undefined,
        restart: map.get('Restart') || undefined
      }
    }
  },
  {
    id: 'services.status',
    label: (p: { unit: string }) => `Read ${p.unit} status`,
    category: 'Services',
    risk: 'read',
    allowFailure: true,
    build: (p: { unit: string }) => `systemctl status ${q(p.unit)} --no-pager -l -n 30`,
    parse: (out) => out.stdout || out.stderr
  },
  {
    id: 'services.logs',
    label: (p: { unit: string }) => `Read ${p.unit} journal`,
    category: 'Services',
    risk: 'read',
    allowFailure: true,
    timeoutMs: 30_000,
    build: (p: { unit: string; lines?: number }) =>
      `journalctl -u ${q(p.unit)} -n ${Number(p.lines ?? 300)} --no-pager -o short-iso --no-hostname 2>/dev/null || journalctl -u ${q(p.unit)} -n ${Number(p.lines ?? 300)} --no-pager`,
    parse: (out) => out.stdout || out.stderr
  },
  {
    id: 'services.start',
    label: (p: { unit: string }) => `Start ${p.unit}`,
    category: 'Services',
    risk: 'write',
    privileged: true,
    build: (p: { unit: string }) => `systemctl start ${q(p.unit)}`
  },
  {
    id: 'services.stop',
    label: (p: { unit: string }) => `Stop ${p.unit}`,
    category: 'Services',
    risk: 'destructive',
    privileged: true,
    description: 'Anything depending on this service goes down with it.',
    build: (p: { unit: string }) => `systemctl stop ${q(p.unit)}`
  },
  {
    id: 'services.restart',
    label: (p: { unit: string }) => `Restart ${p.unit}`,
    category: 'Services',
    risk: 'write',
    privileged: true,
    description: 'Brief downtime while the service comes back up.',
    build: (p: { unit: string }) => `systemctl restart ${q(p.unit)}`
  },
  {
    id: 'services.reload',
    label: (p: { unit: string }) => `Reload ${p.unit} config`,
    category: 'Services',
    risk: 'write',
    privileged: true,
    build: (p: { unit: string }) => `systemctl reload ${q(p.unit)}`
  },
  {
    id: 'services.enable',
    label: (p: { unit: string }) => `Enable ${p.unit} at boot`,
    category: 'Services',
    risk: 'write',
    privileged: true,
    build: (p: { unit: string }) => `systemctl enable ${q(p.unit)}`
  },
  {
    id: 'services.disable',
    label: (p: { unit: string }) => `Stop ${p.unit} starting at boot`,
    category: 'Services',
    risk: 'write',
    privileged: true,
    build: (p: { unit: string }) => `systemctl disable ${q(p.unit)}`
  },
  {
    id: 'services.daemonReload',
    label: 'Reload systemd unit files',
    category: 'Services',
    risk: 'write',
    privileged: true,
    build: () => `systemctl daemon-reload`
  },
  {
    id: 'services.timers',
    label: 'List systemd timers',
    category: 'Services',
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
            unit: parts[4] ?? parts.at(-2) ?? '',
            activates: parts.at(-1) ?? ''
          }
        })
        .filter((t) => t.unit)
  }
])
