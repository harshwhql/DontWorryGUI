import type { ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn, relative } from '../../lib/format'
import { IconButton } from '../ui/primitives'

export function ViewHeader({
  icon: Icon,
  title,
  subtitle,
  onRefresh,
  refreshing,
  lastUpdated,
  children,
  className
}: {
  icon: LucideIcon
  title: string
  subtitle?: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
  lastUpdated?: number | null
  children?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <header
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface/50 px-4 py-2.5',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-overlay/60">
          <Icon size={14} className="text-ink-dim" aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-[14px] font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle ? (
            <p className="truncate text-[11px] leading-tight text-ink-faint">{subtitle}</p>
          ) : null}
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex flex-wrap items-center gap-1.5">{children}</div>

      {onRefresh ? (
        <div className="flex items-center gap-1.5">
          {lastUpdated ? (
            <span className="tabular hidden text-[10.5px] text-ink-ghost lg:inline">
              {relative(lastUpdated)}
            </span>
          ) : null}
          <IconButton
            icon={RefreshCw}
            label="Refresh"
            loading={refreshing}
            onClick={onRefresh}
            className={refreshing ? 'text-accent-bright' : undefined}
          />
        </div>
      ) : null}
    </header>
  )
}
