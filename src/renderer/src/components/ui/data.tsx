import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { ArrowDown, ArrowUp, Check, Copy, type LucideIcon } from 'lucide-react'
import { cn, usageBar, usageTone } from '../../lib/format'
import { IconButton } from './primitives'
import { useCopy } from '../../lib/hooks'

// One series, area and line, no axes. The exact value always sits next to it as text.

export function Sparkline({
  values,
  max,
  height = 34,
  tone = 'run',
  className,
  label
}: {
  values: number[]
  max?: number
  height?: number
  tone?: 'run' | 'info' | 'warn' | 'danger' | 'root'
  className?: string
  label?: string
}): React.JSX.Element {
  const colors = {
    run: 'var(--color-run-bright)',
    info: 'var(--color-info)',
    warn: 'var(--color-warn)',
    danger: 'var(--color-danger)',
    root: 'var(--color-root)'
  }
  const stroke = colors[tone]
  const width = 100
  const ceiling = Math.max(max ?? Math.max(...values, 1), 0.0001)
  const points = values.length > 1 ? values : [...values, ...values]

  const coords = points.map((value, index) => {
    const x = (index / (points.length - 1)) * width
    const y = height - Math.min(Math.max(value / ceiling, 0), 1) * (height - 2) - 1
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2, 9)}`, [])

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      style={{ height }}
      role="img"
      aria-label={label ?? 'trend over the last samples'}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {values.length > 0 ? (
        <>
          <polygon
            points={`0,${height} ${coords.join(' ')} ${width},${height}`}
            fill={`url(#${id})`}
          />
          <polyline
            points={coords.join(' ')}
            fill="none"
            stroke={stroke}
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
    </svg>
  )
}

// Ring gauge

export function Ring({
  value,
  size = 68,
  thickness = 6,
  label,
  sublabel
}: {
  value: number
  size?: number
  thickness?: number
  label?: string
  sublabel?: string
}): React.JSX.Element {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  const color =
    clamped >= 90 ? 'var(--color-danger)' : clamped >= 75 ? 'var(--color-warn)' : 'var(--color-run)'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label ?? 'usage'} ${clamped}%`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-overlay)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 420ms var(--ease-out-expo), stroke 300ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('tabular text-[15px] font-semibold leading-none', usageTone(clamped))}>
          {Math.round(clamped)}
          <span className="text-[9px] font-normal text-ink-faint">%</span>
        </span>
        {sublabel ? (
          <span className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-ghost">{sublabel}</span>
        ) : null}
      </div>
    </div>
  )
}

// A labelled horizontal bar.

export function Meter({
  value,
  label,
  right,
  sublabel,
  tone
}: {
  value: number
  label: ReactNode
  right?: ReactNode
  sublabel?: ReactNode
  tone?: string
}): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11.5px] text-ink-dim">{label}</span>
        {right ? <span className="tabular shrink-0 text-[11px] text-ink-faint">{right}</span> : null}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-void">
        <div
          className={cn('h-full rounded-full', tone ?? usageBar(clamped))}
          style={{ width: `${clamped}%`, transition: 'width 380ms var(--ease-out-expo)' }}
          role="meter"
          aria-valuenow={Math.round(clamped)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {sublabel ? <span className="text-[10.5px] text-ink-ghost">{sublabel}</span> : null}
    </div>
  )
}

// Stat tile

export function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  tone = 'text-ink',
  children
}: {
  icon?: LucideIcon
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  tone?: string
  children?: ReactNode
}): React.JSX.Element {
  return (
    <div className="panel flex min-w-0 flex-col gap-1.5 p-3">
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon size={12} className="shrink-0 text-ink-ghost" aria-hidden /> : null}
        <span className="truncate text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn('tabular text-[21px] font-semibold leading-none tracking-tight', tone)}>
          {value}
        </span>
        {unit ? <span className="text-[11px] text-ink-faint">{unit}</span> : null}
      </div>
      {children}
      {hint ? <div className="text-[10.5px] leading-snug text-ink-ghost">{hint}</div> : null}
    </div>
  )
}

// Key/value list

export function KeyValue({
  rows,
  className,
  dense
}: {
  rows: { label: string; value: ReactNode; mono?: boolean }[]
  className?: string
  dense?: boolean
}): React.JSX.Element {
  return (
    <dl className={cn('grid grid-cols-[minmax(84px,auto)_1fr]', dense ? 'gap-x-3 gap-y-1' : 'gap-x-4 gap-y-1.5', className)}>
      {rows.map((row) => (
        <div key={row.label} className="col-span-2 grid grid-cols-subgrid items-baseline">
          <dt className="truncate text-[11px] text-ink-faint">{row.label}</dt>
          <dd
            className={cn(
              'selectable min-w-0 break-words text-[11.5px] text-ink-dim',
              row.mono && 'mono text-[11px]'
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// Code block

export function CodeBlock({
  code,
  title,
  tone = 'run',
  className,
  maxHeight = 'max-h-80',
  wrap
}: {
  code: string
  title?: string
  tone?: 'run' | 'ink' | 'danger'
  className?: string
  maxHeight?: string
  wrap?: boolean
}): React.JSX.Element {
  const copy = useCopy()
  const [copied, setCopied] = useState(false)
  const toneClass = tone === 'run' ? 'text-run-bright' : tone === 'danger' ? 'text-danger' : 'text-ink-dim'

  return (
    <div className={cn('group relative overflow-hidden rounded-md border border-line bg-void', className)}>
      {title ? (
        <div className="flex items-center justify-between border-b border-line px-2.5 py-1">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">
            {title}
          </span>
        </div>
      ) : null}
      <IconButton
        icon={copied ? Check : Copy}
        label="Copy"
        size="xs"
        className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => {
          copy(code)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1400)
        }}
      />
      <pre
        className={cn(
          'selectable overflow-auto px-3 py-2 text-[11.5px] leading-relaxed',
          wrap && 'whitespace-pre-wrap break-words',
          maxHeight,
          toneClass
        )}
      >
        {code || '(no output)'}
      </pre>
    </div>
  )
}

// Virtualised data table

export interface Column<T> {
  key: string
  header: ReactNode
  /** grid-template-columns entry, e.g. "minmax(0,1fr)" or "72px" */
  width: string
  align?: 'left' | 'right' | 'center'
  render: (row: T) => ReactNode
  sort?: (row: T) => string | number
  className?: string
  headerClassName?: string
}

const ROW_HEIGHT = 30

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  onRowDoubleClick,
  isSelected,
  defaultSortKey,
  defaultSortDir = 'desc',
  rowTone,
  emptyState,
  footer,
  className
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  onRowDoubleClick?: (row: T) => void
  isSelected?: (row: T) => boolean
  defaultSortKey?: string
  defaultSortDir?: 'asc' | 'desc'
  rowTone?: (row: T) => string | undefined
  emptyState?: ReactNode
  footer?: ReactNode
  className?: string
}): React.JSX.Element {
  const [sortKey, setSortKey] = useState(defaultSortKey)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ start: 0, end: 60 })
  const [height, setHeight] = useState(600)

  const template = columns.map((c) => c.width).join(' ')

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey)
    if (!column?.sort) return rows
    const factor = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const left = column.sort!(a)
      const right = column.sort!(b)
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor
      return String(left).localeCompare(String(right), undefined, { numeric: true }) * factor
    })
  }, [rows, columns, sortKey, sortDir])

  const recalc = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const viewportHeight = element.clientHeight || 600
    setHeight(viewportHeight)
    const start = Math.max(0, Math.floor(element.scrollTop / ROW_HEIGHT) - 12)
    const visible = Math.ceil(viewportHeight / ROW_HEIGHT) + 24
    setViewport({ start, end: start + visible })
  }, [])

  useLayoutEffect(() => {
    recalc()
  }, [recalc, sorted.length])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(recalc)
    observer.observe(element)
    return () => observer.disconnect()
  }, [recalc])

  const virtual = sorted.length > 120
  const slice = virtual ? sorted.slice(viewport.start, viewport.end) : sorted
  const padTop = virtual ? viewport.start * ROW_HEIGHT : 0
  const padBottom = virtual ? Math.max(0, (sorted.length - viewport.end) * ROW_HEIGHT) : 0

  const toggleSort = (column: Column<T>): void => {
    if (!column.sort) return
    if (sortKey === column.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(column.key)
      setSortDir('desc')
    }
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {/* header */}
      <div
        className="sticky top-0 grid shrink-0 items-center gap-2 border-b border-line bg-surface/95 px-3 py-1.5 backdrop-blur"
        style={{ gridTemplateColumns: template, zIndex: 2 }}
        role="row"
      >
        {columns.map((column) => {
          const active = sortKey === column.key
          return (
            <button
              key={column.key}
              role="columnheader"
              aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              onClick={() => toggleSort(column)}
              disabled={!column.sort}
              className={cn(
                'flex min-w-0 items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide',
                column.align === 'right' && 'justify-end',
                column.align === 'center' && 'justify-center',
                column.sort ? 'text-ink-faint hover:text-ink-dim' : 'cursor-default text-ink-ghost',
                active && 'text-ink-dim',
                column.headerClassName
              )}
            >
              <span className="truncate">{column.header}</span>
              {active ? (
                sortDir === 'asc' ? (
                  <ArrowUp size={10} aria-hidden />
                ) : (
                  <ArrowDown size={10} aria-hidden />
                )
              ) : null}
            </button>
          )
        })}
      </div>

      {/* body */}
      <div ref={scrollRef} onScroll={recalc} className="min-h-0 flex-1 overflow-auto">
        {sorted.length === 0 ? (
          emptyState
        ) : (
          <>
            {padTop > 0 ? <div style={{ height: padTop }} aria-hidden /> : null}
            <div role="rowgroup">
              {slice.map((row) => {
                const selected = isSelected?.(row) ?? false
                return (
                  <div
                    key={rowKey(row)}
                    role="row"
                    tabIndex={onRowClick ? 0 : -1}
                    onClick={() => onRowClick?.(row)}
                    onDoubleClick={() => onRowDoubleClick?.(row)}
                    onKeyDown={(event) => {
                      if (onRowClick && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault()
                        onRowClick(row)
                      }
                    }}
                    className={cn(
                      'grid items-center gap-2 border-b border-line/45 px-3 transition-colors duration-100',
                      onRowClick && 'cursor-pointer hover:bg-hover/55',
                      selected && 'bg-run/8 hover:bg-run/12',
                      rowTone?.(row)
                    )}
                    style={{ gridTemplateColumns: template, height: ROW_HEIGHT }}
                  >
                    {columns.map((column) => (
                      <div
                        key={column.key}
                        role="cell"
                        className={cn(
                          'min-w-0 truncate text-[11.5px] text-ink-dim',
                          column.align === 'right' && 'text-right',
                          column.align === 'center' && 'text-center',
                          column.className
                        )}
                      >
                        {column.render(row)}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
            {padBottom > 0 ? <div style={{ height: padBottom }} aria-hidden /> : null}
          </>
        )}
      </div>

      {footer ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-3 py-1.5 text-[10.5px] text-ink-ghost">
          {footer}
        </div>
      ) : null}
      <span className="hidden" aria-hidden>
        {height}
      </span>
    </div>
  )
}
