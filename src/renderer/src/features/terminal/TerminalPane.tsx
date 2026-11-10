import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import type { Theme } from '@shared/themes'
import { api } from '../../lib/api'
import { useActiveTheme } from '../../lib/hooks'
import { useApp } from '../../state/store'

export interface TerminalHandle {
  paste: (text: string) => void
  focus: () => void
  fit: () => void
  search: (query: string, forward: boolean) => void
  clear: () => void
  selection: () => string
}


/** xterm wants a flat colour map; the cursor accent matches the background. */
function xtermTheme(theme: Theme): Record<string, string> {
  const t = theme.terminal
  return {
    background: t.background,
    foreground: t.foreground,
    cursor: t.cursor,
    cursorAccent: t.background,
    selectionBackground: t.selectionBackground,
    selectionForeground: t.foreground,
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite
  }
}

export const TerminalPane = forwardRef<
  TerminalHandle,
  {
    hostId: string
    fontSize: number
    active: boolean
    onExit: () => void
    onReady?: () => void
  }
>(function TerminalPane({ hostId, fontSize, active, onExit, onReady }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const sessionRef = useRef<string | null>(null)
  const toast = useApp((s) => s.toast)
  const theme = useActiveTheme()
  const themeRef = useRef(theme)
  themeRef.current = theme

  useImperativeHandle(ref, () => ({
    paste: (text: string) => {
      termRef.current?.focus()
      // write locally so the user can read and edit before pressing Enter
      if (sessionRef.current) api.terminal.write(sessionRef.current, text)
    },
    focus: () => termRef.current?.focus(),
    fit: () => {
      try {
        fitRef.current?.fit()
      } catch {
        /* container not measurable yet */
      }
    },
    search: (query, forward) => {
      if (!query) return
      if (forward) searchRef.current?.findNext(query)
      else searchRef.current?.findPrevious(query)
    },
    clear: () => termRef.current?.clear(),
    selection: () => termRef.current?.getSelection() ?? ''
  }))

  // create the terminal + remote shell once
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily:
        "'JetBrains Mono Variable', 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace",
      fontSize,
      lineHeight: 1.25,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      allowProposedApi: true,
      scrollback: 20_000,
      smoothScrollDuration: 90,
      theme: xtermTheme(themeRef.current),
      macOptionIsMeta: true,
      rightClickSelectsWord: true
    })

    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.loadAddon(new WebLinksAddon((_event, uri) => void api.system.openExternal(uri)))
    const unicode = new Unicode11Addon()
    term.loadAddon(unicode)
    term.unicode.activeVersion = '11'

    term.open(container)
    termRef.current = term
    fitRef.current = fit
    searchRef.current = search

    let disposed = false
    let offData: (() => void) | undefined
    let offExit: (() => void) | undefined

    const start = async (): Promise<void> => {
      try {
        fit.fit()
      } catch {
        /* ignore */
      }
      try {
        const sessionId = await api.terminal.open(hostId, term.cols, term.rows)
        if (disposed) {
          api.terminal.close(sessionId)
          return
        }
        sessionRef.current = sessionId

        offData = api.terminal.onData((payload) => {
          if (payload.sessionId === sessionId) term.write(payload.data)
        })
        offExit = api.terminal.onExit((payload) => {
          if (payload.sessionId !== sessionId) return
          term.writeln('\r\n\x1b[38;5;203m● session closed\x1b[0m')
          sessionRef.current = null
          onExit()
        })

        term.onData((data) => {
          if (sessionRef.current) api.terminal.write(sessionRef.current, data)
        })
        term.onResize(({ cols, rows }) => {
          if (sessionRef.current) api.terminal.resize(sessionRef.current, cols, rows)
        })

        onReady?.()
      } catch (err) {
        term.writeln(`\r\n\x1b[38;5;203m${(err as Error).message}\x1b[0m`)
        toast({ tone: 'error', title: 'Could not open a shell', message: (err as Error).message })
      }
    }

    void start()

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* ignore */
      }
    })
    observer.observe(container)

    return () => {
      disposed = true
      observer.disconnect()
      offData?.()
      offExit?.()
      if (sessionRef.current) api.terminal.close(sessionRef.current)
      term.dispose()
      termRef.current = null
    }
    // the shell is bound to one host for the pane's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId])

  // a theme switch repaints the terminal in place
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = xtermTheme(theme)
  }, [theme])

  // font size changes without tearing the session down
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = fontSize
    try {
      fitRef.current?.fit()
    } catch {
      /* ignore */
    }
  }, [fontSize])

  // refit and focus when this tab becomes visible
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* ignore */
      }
      termRef.current?.focus()
    }, 50)
    return () => window.clearTimeout(timer)
  }, [active])

  return <div ref={containerRef} className="h-full w-full" />
})
