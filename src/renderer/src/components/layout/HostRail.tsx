import { Plus, Server, Settings } from 'lucide-react'
import type { HostConfig } from '@shared/types'
import { cn } from '../../lib/format'
import { IconButton } from '../ui/primitives'
import { useApp } from '../../state/store'

const ACCENTS: Record<string, { bg: string; ring: string; text: string }> = {
  emerald: { bg: 'bg-run/16', ring: 'ring-run/45', text: 'text-run-bright' },
  blue: { bg: 'bg-info/16', ring: 'ring-info/45', text: 'text-info' },
  violet: { bg: 'bg-root/16', ring: 'ring-root/45', text: 'text-root' },
  amber: { bg: 'bg-warn/16', ring: 'ring-warn/45', text: 'text-warn' },
  rose: { bg: 'bg-danger/16', ring: 'ring-danger/45', text: 'text-danger' },
  slate: { bg: 'bg-overlay', ring: 'ring-edge', text: 'text-ink-dim' }
}

function initials(label: string): string {
  const parts = label.trim().split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return label.slice(0, 2).toUpperCase()
}

export function HostRail({ onAddHost }: { onAddHost: () => void }): React.JSX.Element {
  const hosts = useApp((s) => s.hosts)
  const connections = useApp((s) => s.connections)
  const activeHostId = useApp((s) => s.activeHostId)
  const setActiveHost = useApp((s) => s.setActiveHost)
  const setView = useApp((s) => s.setView)
  const view = useApp((s) => s.view)

  return (
    <nav
      aria-label="Servers"
      className="flex shrink-0 flex-col items-center gap-1.5 border-r border-line bg-void/70 py-2.5"
      style={{ width: 'var(--rail)' }}
    >
      {hosts.map((host) => (
        <HostDot
          key={host.id}
          host={host}
          status={connections[host.id]?.status ?? 'disconnected'}
          active={host.id === activeHostId}
          onClick={() => setActiveHost(host.id)}
        />
      ))}

      <IconButton
        icon={Plus}
        label="Add a server"
        size="md"
        variant="outline"
        className="mt-1 border-dashed"
        onClick={onAddHost}
      />

      <div className="flex-1" />

      <IconButton
        icon={Server}
        label="All servers"
        size="md"
        active={activeHostId === null}
        onClick={() => setActiveHost(null)}
      />
      <IconButton
        icon={Settings}
        label="Settings"
        size="md"
        active={view === 'settings'}
        onClick={() => setView('settings')}
      />
    </nav>
  )
}

function HostDot({
  host,
  status,
  active,
  onClick
}: {
  host: HostConfig
  status: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  const accent = ACCENTS[host.accent] ?? ACCENTS.emerald
  const statusColor =
    status === 'connected'
      ? 'bg-run'
      : status === 'connecting' || status === 'reconnecting'
        ? 'bg-warn'
        : status === 'error'
          ? 'bg-danger'
          : 'bg-ink-ghost'

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${host.label} · ${host.username}@${host.host}`}
      aria-label={`${host.label}, ${status}`}
      aria-current={active}
      className="group relative grid size-9 shrink-0 place-items-center"
    >
      {/* active indicator rail */}
      <span
        className={cn(
          'absolute -left-2.5 w-[3px] rounded-r-full bg-run transition-all duration-200 ease-out',
          active ? 'h-5 opacity-100' : 'h-1.5 opacity-0 group-hover:opacity-60'
        )}
        aria-hidden
      />
      <span
        className={cn(
          'grid size-8 place-items-center rounded-lg text-[11px] font-semibold ring-1 transition-[transform,box-shadow] duration-150',
          accent.bg,
          accent.text,
          active ? accent.ring : 'ring-line',
          'group-hover:scale-[1.06] group-active:scale-95'
        )}
      >
        {initials(host.label)}
      </span>
      <span
        className={cn(
          'absolute right-0 bottom-0 size-2 rounded-full ring-2 ring-void',
          statusColor,
          status === 'connected' && 'anim-live'
        )}
        aria-hidden
      />
    </button>
  )
}
