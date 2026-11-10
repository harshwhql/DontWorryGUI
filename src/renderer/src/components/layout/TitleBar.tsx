import { FlaskConical, PanelBottom, Search, ShieldCheck, Terminal, Zap } from 'lucide-react'
import { cn } from '../../lib/format'
import { Badge, IconButton, Kbd } from '../ui/primitives'
import { useApp } from '../../state/store'

const STATUS_LOOK = {
  connected: { dot: 'bg-run', text: 'text-run-bright', label: 'live' },
  connecting: { dot: 'bg-warn', text: 'text-warn', label: 'connecting' },
  reconnecting: { dot: 'bg-warn', text: 'text-warn', label: 'reconnecting' },
  error: { dot: 'bg-danger', text: 'text-danger', label: 'error' },
  disconnected: { dot: 'bg-ink-ghost', text: 'text-ink-faint', label: 'offline' }
} as const

export function TitleBar(): React.JSX.Element {
  const host = useApp((s) => s.activeHost())
  const connection = useApp((s) => s.activeConnection())
  const settings = useApp((s) => s.settings)
  const patchSettings = useApp((s) => s.patchSettings)
  const inspectorOpen = useApp((s) => s.inspectorOpen)
  const setInspectorOpen = useApp((s) => s.setInspectorOpen)
  const setPaletteOpen = useApp((s) => s.setPaletteOpen)
  const setView = useApp((s) => s.setView)

  const status = connection?.status ?? 'disconnected'
  const look = STATUS_LOOK[status]
  const facts = connection?.facts

  return (
    <header
      className="drag-region relative flex shrink-0 items-center gap-3 border-b border-line bg-void/85 pr-[146px] pl-3 backdrop-blur-xl"
      style={{ height: 'var(--titlebar)', zIndex: 'var(--z-sticky)' }}
    >
      {/* brand */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="grid size-6 place-items-center rounded-md bg-accent/14 ring-1 ring-accent/30">
          <Terminal size={13} className="text-accent-bright" aria-hidden />
        </div>
        <div className="leading-none">
          <span className="text-[12.5px] font-semibold tracking-tight text-ink">DontWorry</span>
          <span className="text-[12.5px] font-semibold tracking-tight text-accent-bright">GUI</span>
        </div>
      </div>

      <span className="h-4 w-px shrink-0 bg-line" aria-hidden />

      {/* active host */}
      {host ? (
        <div className="no-drag flex min-w-0 items-center gap-2">
          <span className={cn('size-1.5 shrink-0 rounded-full', look.dot, status === 'connected' && 'anim-live')} aria-hidden />
          <span className="truncate text-[12.5px] font-medium text-ink">{host.label}</span>
          <span className="mono hidden truncate text-[11px] text-ink-ghost md:inline">
            {host.username}@{host.host}
            {host.port !== 22 ? `:${host.port}` : ''}
          </span>
          <span className={cn('text-[10px] uppercase tracking-wide', look.text)}>{look.label}</span>
          {facts?.isRoot ? (
            <Badge tone="root" icon={ShieldCheck}>
              root
            </Badge>
          ) : facts?.hasSudo && host.useSudo ? (
            <Badge tone="info">sudo</Badge>
          ) : null}
        </div>
      ) : (
        <span className="text-[12px] text-ink-ghost">No server selected</span>
      )}

      <div className="flex-1" />

      {/* dry run is the single most important switch in the app */}
      <button
        type="button"
        onClick={() => void patchSettings({ dryRun: !settings.dryRun })}
        aria-pressed={settings.dryRun}
        className={cn(
          'no-drag flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors duration-150',
          settings.dryRun
            ? 'border-warn/45 bg-warn/14 text-warn'
            : 'border-line text-ink-faint hover:border-edge hover:text-ink-dim'
        )}
        title={
          settings.dryRun
            ? 'Dry run is on: commands are shown but never sent'
            : 'Turn on dry run to preview commands without running them'
        }
      >
        {settings.dryRun ? <FlaskConical size={11} aria-hidden /> : <Zap size={11} aria-hidden />}
        {settings.dryRun ? 'Dry run' : 'Live'}
      </button>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="no-drag flex h-6 shrink-0 items-center gap-2 rounded-md border border-line bg-void/60 pr-1.5 pl-2 text-[11px] text-ink-faint transition-colors hover:border-edge hover:text-ink-dim"
      >
        <Search size={11} aria-hidden />
        <span className="hidden lg:inline">Jump to or run anything</span>
        <Kbd>Ctrl K</Kbd>
      </button>

      <div className="no-drag flex shrink-0 items-center gap-0.5">
        <IconButton
          icon={Terminal}
          label="Open the terminal"
          onClick={() => setView('terminal')}
        />
        <IconButton
          icon={PanelBottom}
          label={inspectorOpen ? 'Hide the command log' : 'Show the command log'}
          active={inspectorOpen}
          onClick={() => setInspectorOpen(!inspectorOpen)}
        />
      </div>
    </header>
  )
}
