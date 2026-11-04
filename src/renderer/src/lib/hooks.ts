import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { useApp } from '../state/store'

interface ResourceOptions {
  enabled?: boolean
  /** poll every N ms while the view is mounted and the window is visible */
  intervalMs?: number
  /** show errors as toasts (default: inline only) */
  toastErrors?: boolean
}

export interface Resource<T> {
  data: T | undefined
  loading: boolean
  /** true only for the very first load, so refreshes never blank the view */
  initial: boolean
  error: string | null
  refresh: (silent?: boolean) => Promise<void>
  lastUpdated: number | null
}

/**
 * Reads a registry action as a resource. Every fetch goes through the same
 * audited path as a button click, so the inspector shows background polls too.
 */
export function useResource<T>(
  actionId: string,
  params: Record<string, unknown> = {},
  options: ResourceOptions = {}
): Resource<T> {
  const hostId = useApp((s) => s.activeHostId)
  const connected = useApp((s) => Boolean(s.activeHostId && s.connections[s.activeHostId]?.status === 'connected'))
  const toast = useApp((s) => s.toast)

  const key = useMemo(() => JSON.stringify(params), [params])
  const enabled = (options.enabled ?? true) && connected && Boolean(hostId)

  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [initial, setInitial] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refresh = useCallback(
    async (silent = false) => {
      if (!hostId || !enabled || inFlight.current) return
      inFlight.current = true
      if (!silent) setLoading(true)
      try {
        const result = await api.actions.run<T>(hostId, actionId, JSON.parse(key), silent ? 'poll' : 'gui')
        if (!mounted.current) return
        if (result.ok) {
          setData(result.data)
          setError(null)
          setLastUpdated(Date.now())
        } else if (result.record.status !== 'dry-run') {
          setError(result.error ?? 'Command failed')
          if (options.toastErrors) {
            toast({ tone: 'error', title: 'Could not load', message: result.error })
          }
        }
      } catch (err) {
        if (mounted.current) setError((err as Error).message)
      } finally {
        inFlight.current = false
        if (mounted.current) {
          setLoading(false)
          setInitial(false)
        }
      }
    },
    [actionId, enabled, hostId, key, options.toastErrors, toast]
  )

  // reset when the host or parameters change
  useEffect(() => {
    setInitial(true)
    setData(undefined)
    setError(null)
  }, [hostId, key])

  useEffect(() => {
    if (!enabled) return
    void refresh(false)
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled || !options.intervalMs) return
    let timer = 0
    const tick = (): void => {
      if (document.visibilityState === 'visible') void refresh(true)
      timer = window.setTimeout(tick, options.intervalMs)
    }
    timer = window.setTimeout(tick, options.intervalMs)
    return () => window.clearTimeout(timer)
  }, [enabled, options.intervalMs, refresh])

  return { data, loading, initial, error, refresh, lastUpdated }
}

/** keep the last N samples of a value for sparklines */
export function useHistory<T>(value: T | undefined, size = 60): T[] {
  const [history, setHistory] = useState<T[]>([])
  const lastRef = useRef<T | undefined>(undefined)

  useEffect(() => {
    if (value === undefined || value === lastRef.current) return
    lastRef.current = value
    setHistory((prev) => {
      const next = [...prev, value]
      return next.length > size ? next.slice(next.length - size) : next
    })
  }, [value, size])

  return history
}

type Handler = (event: KeyboardEvent) => void

/** global shortcut: "mod+k", "shift+?", "escape" */
export function useHotkey(combo: string, handler: Handler, enabled = true): void {
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!enabled) return
    const parts = combo.toLowerCase().split('+')
    const key = parts[parts.length - 1]
    const needMod = parts.includes('mod') || parts.includes('ctrl') || parts.includes('cmd')
    const needShift = parts.includes('shift')
    const needAlt = parts.includes('alt')

    const listener = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey
      if (needMod !== mod) return
      if (needShift !== event.shiftKey) return
      if (needAlt !== event.altKey) return
      if (event.key.toLowerCase() !== key) return
      ref.current(event)
    }

    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [combo, enabled])
}

export function useCopy(): (text: string, label?: string) => void {
  const toast = useApp((s) => s.toast)
  return useCallback(
    (text: string, label = 'Copied to clipboard') => {
      void navigator.clipboard
        .writeText(text)
        .then(() => toast({ tone: 'success', title: label }))
        .catch(() => toast({ tone: 'error', title: 'Clipboard unavailable' }))
    },
    [toast]
  )
}

/** debounce any fast-changing value (search inputs, resize) */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}
