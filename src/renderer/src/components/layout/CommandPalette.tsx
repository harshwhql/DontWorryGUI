import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, CornerDownLeft, Server, SquareTerminal, Zap } from 'lucide-react'
import { cn, fuzzyScore, RISK_TONE } from '../../lib/format'
import { useHotkey } from '../../lib/hooks'
import { Badge, Kbd } from '../ui/primitives'
import { useApp, type ViewId } from '../../state/store'
import { NAV_ITEMS } from './nav'

type Entry =
  | { kind: 'view'; id: string; title: string; hint: string; view: ViewId }
  | { kind: 'host'; id: string; title: string; hint: string; hostId: string }
  | { kind: 'action'; id: string; title: string; hint: string; actionId: string; risk: 'read' | 'write' | 'destructive' }
  | { kind: 'raw'; id: string; title: string; hint: string; command: string }

export function CommandPalette(): React.JSX.Element | null {
  const open = useApp((s) => s.paletteOpen)
  const setOpen = useApp((s) => s.setPaletteOpen)
  const setView = useApp((s) => s.setView)
  const setActiveHost = useApp((s) => s.setActiveHost)
  const connect = useApp((s) => s.connect)
  const hosts = useApp((s) => s.hosts)
  const descriptors = useApp((s) => s.descriptors)
  const connections = useApp((s) => s.connections)
  const activeHostId = useApp((s) => s.activeHostId)
  const run = useApp((s) => s.run)
  const queueTerminal = useApp((s) => s.queueTerminal)

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useHotkey('mod+k', (event) => {
    event.preventDefault()
    setOpen(true)
  })

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      window.setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const rawMode = query.startsWith('$') || query.startsWith('>')

  const entries = useMemo<Entry[]>(() => {
    if (rawMode) {
      const command = query.slice(1).trim()
      return command
        ? [
            {
              kind: 'raw',
              id: 'raw',
              title: command,
              hint: 'Run this exact command on the active server',
              command
            }
          ]
        : []
    }

    const all: Entry[] = [
      ...NAV_ITEMS.map((item) => ({
        kind: 'view' as const,
        id: `view:${item.id}`,
        title: item.label,
        hint: `${item.group} · go to section`,
        view: item.id
      })),
      ...hosts.map((host) => ({
        kind: 'host' as const,
        id: `host:${host.id}`,
        title: host.label,
        hint: `${host.username}@${host.host} · ${connections[host.id]?.status ?? 'disconnected'}`,
        hostId: host.id
      })),
      ...descriptors.map((descriptor) => ({
        kind: 'action' as const,
        id: `action:${descriptor.id}`,
        title: descriptor.label,
        hint: `${descriptor.category} · ${descriptor.id}`,
        actionId: descriptor.id,
        risk: descriptor.risk
      }))
    ]

    if (!query.trim()) {
      return all.filter((entry) => entry.kind !== 'action').slice(0, 22)
    }

    return all
      .map((entry) => ({
        entry,
        score:
          Math.max(fuzzyScore(query, entry.title), fuzzyScore(query, entry.hint) * 0.55) +
          (entry.kind === 'view' ? 60 : entry.kind === 'host' ? 40 : 0)
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((row) => row.entry)
  }, [query, rawMode, hosts, descriptors, connections])

  useEffect(() => {
    setCursor(0)
  }, [query])

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
    element?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const pick = (entry: Entry | undefined): void => {
    if (!entry) return
    setOpen(false)
    switch (entry.kind) {
      case 'view':
        setView(entry.view)
        break
      case 'host':
        setActiveHost(entry.hostId)
        if (connections[entry.hostId]?.status !== 'connected') void connect(entry.hostId)
        break
      case 'action':
        // actions that need parameters are safer to open in the terminal
        void run(entry.actionId, {}, { successMessage: undefined })
        break
      case 'raw':
        queueTerminal(entry.command)
        setView('terminal')
        break
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center pt-[12vh]"
      style={{ zIndex: 'var(--z-palette)' }}
    >
      <div className="absolute inset-0 bg-void/70 backdrop-blur-[3px]" onClick={() => setOpen(false)} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="anim-scale-in glass relative flex max-h-[62vh] w-[640px] flex-col overflow-hidden rounded-xl shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-line/70 px-3.5">
          {rawMode ? (
            <SquareTerminal size={15} className="shrink-0 text-warn" aria-hidden />
          ) : (
            <Zap size={15} className="shrink-0 text-run-bright" aria-hidden />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setCursor((c) => Math.min(c + 1, entries.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                pick(entries[cursor])
              } else if (event.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder="Search sections, servers and commands, or start with $ to type a raw command"
            className="h-11 flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-ink-ghost focus:outline-none"
            aria-label="Search"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-ink-ghost">
              {rawMode ? 'Type a command after the $' : 'Nothing matched that.'}
            </p>
          ) : (
            entries.map((entry, index) => {
              const selected = index === cursor
              const risk = entry.kind === 'action' ? RISK_TONE[entry.risk] : null
              return (
                <button
                  key={entry.id}
                  data-index={index}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => pick(entry)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors duration-100',
                    selected ? 'bg-run/12' : 'hover:bg-hover/50'
                  )}
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-void/60">
                    {entry.kind === 'host' ? (
                      <Server size={11} className="text-ink-faint" aria-hidden />
                    ) : entry.kind === 'raw' ? (
                      <SquareTerminal size={11} className="text-warn" aria-hidden />
                    ) : entry.kind === 'action' ? (
                      <span className={cn('size-1.5 rounded-full', risk?.dot)} aria-hidden />
                    ) : (
                      <ChevronRight size={11} className="text-ink-faint" aria-hidden />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-[12.5px]',
                        selected ? 'text-ink' : 'text-ink-dim',
                        entry.kind === 'raw' && 'mono'
                      )}
                    >
                      {entry.title}
                    </span>
                    <span className="block truncate text-[10.5px] text-ink-ghost">{entry.hint}</span>
                  </span>

                  {entry.kind === 'action' && entry.risk !== 'read' ? (
                    <Badge tone={entry.risk === 'write' ? 'warn' : 'danger'}>{risk?.label}</Badge>
                  ) : null}

                  {selected ? (
                    <CornerDownLeft size={11} className="shrink-0 text-ink-faint" aria-hidden />
                  ) : null}
                </button>
              )
            })
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-line/70 px-3.5 py-1.5 text-[10.5px] text-ink-ghost">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> select
          </span>
          <span className="flex items-center gap-1">
            <Kbd>$</Kbd> raw command
          </span>
          <div className="flex-1" />
          <span>
            {descriptors.length} actions ·{' '}
            {activeHostId ? 'scoped to the active server' : 'no server selected'}
          </span>
        </footer>
      </div>
    </div>,
    document.body
  )
}
