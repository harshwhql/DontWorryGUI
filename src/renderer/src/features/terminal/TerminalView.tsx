import { useEffect, useRef, useState } from 'react'
import {
  Clipboard,
  Eraser,
  Minus,
  Plus,
  Search,
  SquareTerminal,
  Type,
  X
} from 'lucide-react'
import { cn } from '../../lib/format'
import { Badge, Button, EmptyState, IconButton, Input } from '../../components/ui/primitives'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'
import { TerminalPane, type TerminalHandle } from './TerminalPane'

interface Tab {
  id: string
  title: string
  dead?: boolean
}

let tabSeq = 0

export function TerminalView(): React.JSX.Element {
  const hostId = useApp((s) => s.activeHostId)
  const connected = useApp((s) => Boolean(hostId && s.connections[hostId!]?.status === 'connected'))
  const facts = useApp((s) => s.activeConnection()?.facts)
  const settings = useApp((s) => s.settings)
  const patchSettings = useApp((s) => s.patchSettings)
  const terminalQueue = useApp((s) => s.terminalQueue)
  const queueTerminal = useApp((s) => s.queueTerminal)
  const toast = useApp((s) => s.toast)

  const [tabs, setTabs] = useState<Tab[]>([{ id: `t${++tabSeq}`, title: 'shell 1' }])
  const [activeId, setActiveId] = useState<string>(() => tabs[0].id)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const handles = useRef(new Map<string, TerminalHandle | null>())

  // a queued command from "Run in terminal instead" lands here, unexecuted
  useEffect(() => {
    if (!terminalQueue) return
    const handle = handles.current.get(activeId)
    if (!handle) return
    const timer = window.setTimeout(() => {
      handle.paste(terminalQueue)
      handle.focus()
      toast({
        tone: 'info',
        title: 'Command pasted, not run',
        message: 'Read it over and press Enter when you are happy with it.'
      })
      queueTerminal(null)
    }, 220)
    return () => window.clearTimeout(timer)
  }, [terminalQueue, activeId, queueTerminal, toast])

  const addTab = (): void => {
    const tab = { id: `t${++tabSeq}`, title: `shell ${tabs.length + 1}` }
    setTabs((prev) => [...prev, tab])
    setActiveId(tab.id)
  }

  const closeTab = (id: string): void => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (next.length === 0) {
        const fresh = { id: `t${++tabSeq}`, title: 'shell 1' }
        setActiveId(fresh.id)
        return [fresh]
      }
      if (id === activeId) setActiveId(next[next.length - 1].id)
      return next
    })
    handles.current.delete(id)
  }

  if (!connected || !hostId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ViewHeader icon={SquareTerminal} title="Terminal" subtitle="A real shell on the server" />
        <EmptyState
          icon={SquareTerminal}
          title="Connect to a server first"
          message="The terminal opens a genuine SSH shell channel, so it needs a live connection."
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={SquareTerminal}
        title="Terminal"
        subtitle={
          facts ? `${facts.user}@${facts.hostname} · ${facts.shell}` : 'Interactive SSH shell'
        }
      >
        <Badge tone="run">pty · xterm-256color</Badge>
        <IconButton
          icon={Search}
          label="Search the scrollback"
          active={searchOpen}
          onClick={() => setSearchOpen((v) => !v)}
        />
        <IconButton
          icon={Clipboard}
          label="Copy the selection"
          onClick={() => {
            const text = handles.current.get(activeId)?.selection() ?? ''
            if (!text) {
              toast({ tone: 'info', title: 'Select some text in the terminal first' })
              return
            }
            void navigator.clipboard.writeText(text)
            toast({ tone: 'success', title: 'Selection copied' })
          }}
        />
        <IconButton
          icon={Eraser}
          label="Clear the screen"
          onClick={() => handles.current.get(activeId)?.clear()}
        />
        <div className="flex items-center gap-0.5 rounded-md border border-line px-0.5">
          <IconButton
            icon={Minus}
            label="Smaller text"
            size="xs"
            onClick={() =>
              void patchSettings({ terminalFontSize: Math.max(9, settings.terminalFontSize - 1) })
            }
          />
          <span className="tabular flex items-center gap-1 px-1 text-[10.5px] text-ink-faint">
            <Type size={10} aria-hidden />
            {settings.terminalFontSize}
          </span>
          <IconButton
            icon={Plus}
            label="Larger text"
            size="xs"
            onClick={() =>
              void patchSettings({ terminalFontSize: Math.min(22, settings.terminalFontSize + 1) })
            }
          />
        </div>
      </ViewHeader>

      {searchOpen ? (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-line bg-surface/40 px-4 py-1.5">
          <Search size={12} className="text-ink-ghost" aria-hidden />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handles.current.get(activeId)?.search(query, !event.shiftKey)
              } else if (event.key === 'Escape') {
                setSearchOpen(false)
              }
            }}
            placeholder="Find in scrollback. Enter for next, Shift+Enter for previous"
            className="h-6 max-w-md text-[11.5px]"
            aria-label="Find in terminal"
          />
          <IconButton icon={X} label="Close search" size="xs" onClick={() => setSearchOpen(false)} />
        </div>
      ) : null}

      {/* tab strip */}
      <div className="flex shrink-0 items-center gap-1 border-b border-line bg-void/50 px-2 py-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn(
              'group flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors',
              tab.id === activeId
                ? 'border-run/35 bg-run/10 text-run-bright'
                : 'border-transparent text-ink-faint hover:bg-hover/60 hover:text-ink-dim'
            )}
          >
            <button type="button" onClick={() => setActiveId(tab.id)} className="mono">
              {tab.title}
              {tab.dead ? ' · closed' : ''}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={() => closeTab(tab.id)}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              <X size={10} aria-hidden />
            </button>
          </div>
        ))}
        <Button size="xs" variant="ghost" icon={Plus} onClick={addTab}>
          New shell
        </Button>
        <div className="flex-1" />
        <span className="text-[10.5px] text-ink-ghost">
          Commands typed here are logged as “manual” in the command log
        </span>
      </div>

      {/* panes */}
      <div className="relative min-h-0 flex-1 bg-void">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn('absolute inset-0', tab.id === activeId ? 'block' : 'hidden')}
            aria-hidden={tab.id !== activeId}
          >
            <TerminalPane
              ref={(handle) => {
                handles.current.set(tab.id, handle)
              }}
              hostId={hostId}
              fontSize={settings.terminalFontSize}
              active={tab.id === activeId}
              onExit={() =>
                setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, dead: true } : t)))
              }
            />
          </div>
        ))}
      </div>
    </div>
  )
}
