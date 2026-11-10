import { Check, Moon, Sun } from 'lucide-react'
import { THEMES, type Theme } from '@shared/themes'
import { cn } from '../lib/format'

function Swatch({ theme }: { theme: Theme }): React.JSX.Element {
  const [base, overlay, accent] = theme.swatch
  return (
    <span
      className="flex h-9 w-full overflow-hidden rounded-md border border-line/70"
      style={{ background: base }}
      aria-hidden
    >
      <span className="h-full w-1/4" style={{ background: overlay }} />
      <span className="h-full flex-1" style={{ background: base }} />
      <span className="my-2 mr-2 ml-auto w-1.5 rounded-full" style={{ background: accent }} />
    </span>
  )
}

/**
 * Theme chooser. `value` of undefined means "inherit the default", which is
 * what a server uses until it is given one of its own.
 */
export function ThemePicker({
  value,
  onChange,
  allowInherit,
  inheritLabel,
  columns = 3
}: {
  value: string | undefined
  onChange: (next: string | undefined) => void
  allowInherit?: boolean
  inheritLabel?: string
  columns?: number
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {allowInherit ? (
        <button
          type="button"
          role="radio"
          aria-checked={value === undefined}
          onClick={() => onChange(undefined)}
          className={cn(
            'flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors',
            value === undefined
              ? 'border-accent/60 bg-accent/8'
              : 'border-line hover:border-edge hover:bg-hover/50'
          )}
        >
          <span className="grid h-9 w-full place-items-center rounded-md border border-dashed border-line/80 text-[10px] text-ink-ghost">
            inherit
          </span>
          <span className="flex items-center gap-1">
            <span className="truncate text-[11.5px] font-medium text-ink">Use the default</span>
            {value === undefined ? (
              <Check size={11} className="ml-auto shrink-0 text-accent-bright" aria-hidden />
            ) : null}
          </span>
          <span className="truncate text-[10px] text-ink-ghost">{inheritLabel ?? 'Follows Settings'}</span>
        </button>
      ) : null}

      {THEMES.map((theme) => {
        const selected = value === theme.id
        const Icon = theme.mode === 'light' ? Sun : Moon
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(theme.id)}
            title={theme.description}
            className={cn(
              'flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors',
              selected ? 'border-accent/60 bg-accent/8' : 'border-line hover:border-edge hover:bg-hover/50'
            )}
          >
            <Swatch theme={theme} />
            <span className="flex items-center gap-1">
              <Icon size={10} className="shrink-0 text-ink-ghost" aria-hidden />
              <span className="truncate text-[11.5px] font-medium text-ink">{theme.label}</span>
              {selected ? (
                <Check size={11} className="ml-auto shrink-0 text-accent-bright" aria-hidden />
              ) : null}
            </span>
            <span className="truncate text-[10px] text-ink-ghost">{theme.description}</span>
          </button>
        )
      })}
    </div>
  )
}
