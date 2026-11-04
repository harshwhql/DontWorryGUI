import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function bytes(value: number | undefined, digits = 1): string {
  if (!value || value <= 0 || !Number.isFinite(value)) return '0 B'
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), BYTE_UNITS.length - 1)
  const scaled = value / 1024 ** exponent
  const places = exponent === 0 ? 0 : scaled >= 100 ? 0 : digits
  return `${scaled.toFixed(places)} ${BYTE_UNITS[exponent]}`
}

export function rate(bytesPerSecond: number | undefined): string {
  if (!bytesPerSecond || bytesPerSecond < 1) return '0 B/s'
  return `${bytes(bytesPerSecond, 1)}/s`
}

export function percent(value: number | undefined, digits = 0): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}%`
}

export function duration(seconds: number | undefined): string {
  if (!seconds || seconds < 0 || !Number.isFinite(seconds)) return '—'
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export function millis(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value < 1000) return `${Math.round(value)}ms`
  if (value < 60_000) return `${(value / 1000).toFixed(2)}s`
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`
}

export function clockTime(at: number | undefined): string {
  if (!at) return '—'
  return new Date(at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

export function dateTime(at: number | undefined): string {
  if (!at) return '—'
  return new Date(at).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function relative(at: number | undefined): string {
  if (!at) return 'never'
  const delta = Date.now() - at
  if (delta < 0) return 'just now'
  const seconds = Math.floor(delta / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

export function truncateMiddle(value: string, max = 56): string {
  if (value.length <= max) return value
  const half = Math.floor((max - 1) / 2)
  return `${value.slice(0, half)}…${value.slice(-half)}`
}

export function octal(mode: number): string {
  return (mode & 0o7777).toString(8).padStart(4, '0')
}

/** split a path into clickable breadcrumb segments */
export function breadcrumbs(path: string): { label: string; path: string }[] {
  const parts = path.split('/').filter(Boolean)
  const crumbs = [{ label: '/', path: '/' }]
  let acc = ''
  for (const part of parts) {
    acc += `/${part}`
    crumbs.push({ label: part, path: acc })
  }
  return crumbs
}

/** very small fuzzy matcher for the command palette */
export function fuzzyScore(needle: string, haystack: string): number {
  if (!needle) return 1
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()
  if (h === n) return 1000
  if (h.startsWith(n)) return 800
  const direct = h.indexOf(n)
  if (direct >= 0) return 600 - direct
  let score = 0
  let index = 0
  let streak = 0
  for (const char of n) {
    const found = h.indexOf(char, index)
    if (found < 0) return 0
    streak = found === index ? streak + 1 : 0
    score += 10 + streak * 4 - Math.min(found - index, 8)
    index = found + 1
  }
  return Math.max(score, 1)
}

export const RISK_TONE = {
  read: {
    label: 'Read only',
    dot: 'bg-info',
    text: 'text-info',
    chip: 'bg-info/12 text-info border-info/25'
  },
  write: {
    label: 'Changes state',
    dot: 'bg-warn',
    text: 'text-warn',
    chip: 'bg-warn/12 text-warn border-warn/25'
  },
  destructive: {
    label: 'Irreversible',
    dot: 'bg-danger',
    text: 'text-danger',
    chip: 'bg-danger/12 text-danger border-danger/25'
  }
} as const

export function usageTone(value: number): string {
  if (value >= 90) return 'text-danger'
  if (value >= 75) return 'text-warn'
  return 'text-run-bright'
}

export function usageBar(value: number): string {
  if (value >= 90) return 'bg-danger'
  if (value >= 75) return 'bg-warn'
  return 'bg-run'
}
