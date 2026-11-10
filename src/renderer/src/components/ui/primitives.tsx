import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/format'

// Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warn' | 'outline'
type Size = 'xs' | 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-on-accent font-semibold hover:bg-accent-bright active:bg-accent shadow-[0_1px_0_0_rgba(255,255,255,.18)_inset]',
  secondary: 'bg-overlay text-ink hover:bg-hover border border-edge/70',
  ghost: 'text-ink-dim hover:text-ink hover:bg-hover',
  outline: 'border border-edge text-ink-dim hover:text-ink hover:border-ink-faint hover:bg-hover/60',
  danger: 'bg-danger/14 text-danger border border-danger/35 hover:bg-danger/22',
  warn: 'bg-warn/14 text-warn border border-warn/35 hover:bg-warn/22'
}

const SIZES: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 rounded-sm',
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-md'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', icon: Icon, iconRight: IconRight, loading, className, children, disabled, ...rest },
  ref
) {
  const iconSize = size === 'xs' ? 12 : size === 'sm' ? 13 : 15
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium',
        'transition-[background-color,color,border-color,transform] duration-150 ease-out',
        'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40',
        SIZES[size],
        VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} className="anim-spin" aria-hidden />
      ) : Icon ? (
        <Icon size={iconSize} aria-hidden />
      ) : null}
      {children}
      {IconRight && !loading ? <IconRight size={iconSize} aria-hidden /> : null}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  /** required: an icon on its own is not a label */
  label: string
  variant?: Variant
  size?: Size
  active?: boolean
  loading?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', size = 'sm', active, loading, className, ...rest },
  ref
) {
  const box = size === 'xs' ? 'size-6' : size === 'sm' ? 'size-7' : 'size-9'
  const iconSize = size === 'xs' ? 12 : size === 'sm' ? 14 : 16
  return (
    <button
      ref={ref}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md',
        'transition-[background-color,color,border-color] duration-150 ease-out',
        'active:scale-95 disabled:pointer-events-none disabled:opacity-40',
        box,
        VARIANTS[variant],
        active && 'bg-accent/15 text-accent-bright',
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} className="anim-spin" aria-hidden />
      ) : (
        <Icon size={iconSize} aria-hidden />
      )}
    </button>
  )
})

// Badges & chips

export type Tone = 'neutral' | 'run' | 'info' | 'warn' | 'danger' | 'root'

const TONES: Record<Tone, string> = {
  neutral: 'bg-overlay/80 text-ink-dim border-line',
  run: 'bg-run/12 text-run-bright border-run/30',
  info: 'bg-info/12 text-info border-info/30',
  warn: 'bg-warn/12 text-warn border-warn/30',
  danger: 'bg-danger/12 text-danger border-danger/30',
  root: 'bg-root/12 text-root border-root/30'
}

export function Badge({
  tone = 'neutral',
  mono,
  children,
  className,
  icon: Icon
}: {
  tone?: Tone
  mono?: boolean
  children: ReactNode
  className?: string
  icon?: LucideIcon
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[10.5px] font-medium uppercase tracking-wide',
        TONES[tone],
        mono && 'mono tracking-normal normal-case',
        className
      )}
    >
      {Icon ? <Icon size={10} aria-hidden /> : null}
      {children}
    </span>
  )
}

export function Dot({ tone = 'neutral', pulse }: { tone?: Tone; pulse?: boolean }): React.JSX.Element {
  const colors: Record<Tone, string> = {
    neutral: 'bg-ink-ghost',
    run: 'bg-run',
    info: 'bg-info',
    warn: 'bg-warn',
    danger: 'bg-danger',
    root: 'bg-root'
  }
  return (
    <span
      className={cn('size-1.5 shrink-0 rounded-full', colors[tone], pulse && 'anim-live')}
      aria-hidden
    />
  )
}

export function Kbd({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <kbd className="rounded-xs border border-line bg-overlay px-1 py-px text-[10px] font-medium text-ink-faint">
      {children}
    </kbd>
  )
}

// Inputs

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(
  function Input({ className, mono, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-8 w-full min-w-0 rounded-md border border-line bg-void/60 px-2.5 text-[13px] text-ink',
          'placeholder:text-ink-ghost transition-colors duration-150',
          'hover:border-edge focus:border-run/60 focus:bg-void focus:outline-none',
          'disabled:opacity-50',
          mono && 'mono text-xs',
          className
        )}
        {...rest}
      />
    )
  }
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        spellCheck={false}
        className={cn(
          'mono w-full resize-none rounded-md border border-line bg-void/60 p-2.5 text-xs leading-relaxed text-ink',
          'placeholder:text-ink-ghost transition-colors duration-150',
          'hover:border-edge focus:border-run/60 focus:bg-void focus:outline-none',
          className
        )}
        {...rest}
      />
    )
  }
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-8 w-full appearance-none rounded-md border border-line bg-void/60 px-2.5 pr-7 text-[13px] text-ink',
          "bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a93a3' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>\")]",
          'bg-[length:14px] bg-[right_6px_center] bg-no-repeat',
          'transition-colors duration-150 hover:border-edge focus:border-run/60 focus:outline-none',
          className
        )}
        {...rest}
      >
        {children}
      </select>
    )
  }
)

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="flex items-center gap-1 text-[11px] font-medium text-ink-dim">
        {label}
        {required ? <span className="text-danger">*</span> : null}
      </span>
      {children}
      {error ? (
        <span role="alert" className="text-[11px] text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[11px] leading-snug text-ink-ghost">{hint}</span>
      ) : null}
    </label>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  tone = 'run',
  disabled
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
  tone?: 'run' | 'warn'
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left transition-colors',
        'hover:bg-hover/50 disabled:pointer-events-none disabled:opacity-50'
      )}
    >
      <span
        className={cn(
          'relative h-[18px] w-8 shrink-0 rounded-full border transition-colors duration-200',
          checked
            ? tone === 'warn'
              ? 'border-warn/50 bg-warn/30'
              : 'border-accent/50 bg-accent/30'
            : 'border-line bg-void'
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] size-[12px] rounded-full transition-[left,background-color] duration-200 ease-out',
            checked
              ? tone === 'warn'
                ? 'left-[16px] bg-warn'
                : 'left-[16px] bg-accent-bright'
              : 'left-[2px] bg-ink-ghost'
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium text-ink">{label}</span>
        {hint ? <span className="block text-[11px] leading-snug text-ink-faint">{hint}</span> : null}
      </span>
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm'
}: {
  value: T
  options: { value: T; label: string; icon?: LucideIcon }[]
  onChange: (next: T) => void
  size?: 'xs' | 'sm'
}): React.JSX.Element {
  return (
    <div
      role="tablist"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-line bg-void/50 p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm font-medium transition-colors duration-150',
              size === 'xs' ? 'h-5 px-1.5 text-[10.5px]' : 'h-6 px-2 text-[11.5px]',
              active ? 'bg-overlay text-ink shadow-sm' : 'text-ink-faint hover:text-ink-dim'
            )}
          >
            {Icon ? <Icon size={size === 'xs' ? 10 : 12} aria-hidden /> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

// Structure

export function Panel({
  children,
  className,
  raised
}: {
  children: ReactNode
  className?: string
  raised?: boolean
}): React.JSX.Element {
  return <div className={cn(raised ? 'panel-raised' : 'panel', className)}>{children}</div>
}

export function PanelHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  className
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <header
      className={cn(
        'flex min-h-10 items-center gap-2.5 border-b border-line px-3 py-2',
        className
      )}
    >
      {Icon ? <Icon size={14} className="shrink-0 text-ink-faint" aria-hidden /> : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[12.5px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle ? (
          <p className="truncate text-[11px] leading-tight text-ink-faint">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </header>
  )
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }): React.JSX.Element {
  return <Loader2 size={size} className={cn('anim-spin text-ink-faint', className)} aria-hidden />
}

export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return (
    <div
      className={cn('relative overflow-hidden rounded-sm bg-overlay/60 sweep', className)}
      aria-hidden
    />
  )
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  compact
}: {
  icon: LucideIcon
  title: string
  message?: string
  action?: ReactNode
  compact?: boolean
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        compact ? 'p-6' : 'p-12'
      )}
    >
      <div className="grid size-10 place-items-center rounded-lg border border-line bg-overlay/50">
        <Icon size={17} className="text-ink-ghost" aria-hidden />
      </div>
      <p className="text-[13px] font-medium text-ink-dim">{title}</p>
      {message ? (
        <p className="max-w-sm text-[11.5px] leading-relaxed text-ink-ghost">{message}</p>
      ) : null}
      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }): React.JSX.Element {
  return (
    <div
      role="alert"
      className="m-3 flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger/8 p-3"
    >
      <div className="mt-0.5 size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-danger">That command did not work</p>
        <p className="mono selectable mt-1 break-words text-[11px] leading-relaxed text-ink-dim">
          {message}
        </p>
      </div>
      {onRetry ? (
        <Button size="xs" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
