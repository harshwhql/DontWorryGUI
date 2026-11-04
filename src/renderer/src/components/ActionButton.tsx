import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Code2, Copy, SquareTerminal, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import { cn, RISK_TONE } from '../lib/format'
import { useCopy } from '../lib/hooks'
import { useApp, type RunOptions } from '../state/store'
import { Button, IconButton, Spinner, type ButtonProps } from './ui/primitives'

interface Preview {
  command: string
  label: string
  risk: 'read' | 'write' | 'destructive'
  privileged: boolean
}

// The "show me the command" button that sits beside every action in the app.

export function CommandPeek({
  actionId,
  params,
  size = 'xs',
  className,
  variant = 'ghost'
}: {
  actionId: string
  params?: Record<string, unknown>
  size?: 'xs' | 'sm'
  className?: string
  variant?: ButtonProps['variant']
}): React.JSX.Element {
  const hostId = useApp((s) => s.activeHostId)
  const queueTerminal = useApp((s) => s.queueTerminal)
  const setView = useApp((s) => s.setView)
  const copy = useCopy()

  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const load = useCallback(async () => {
    if (!hostId) return
    setError(null)
    setPreview(null)
    try {
      setPreview(await api.actions.preview(hostId, actionId, params ?? {}))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [actionId, hostId, params])

  const toggle = (): void => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = anchorRef.current?.getBoundingClientRect()
    if (rect) {
      const width = 460
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)
      const below = rect.bottom + 8
      setCoords({ top: below, left })
    }
    setOpen(true)
    void load()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onScroll = (): void => setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onScroll, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onScroll)
    }
  }, [open])

  const tone = preview ? RISK_TONE[preview.risk] : null

  return (
    <>
      <IconButton
        ref={anchorRef}
        icon={Code2}
        label="Show the command this runs"
        size={size}
        variant={variant}
        active={open}
        className={className}
        onClick={(event) => {
          event.stopPropagation()
          toggle()
        }}
      />
      {open
        ? createPortal(
            <>
              <div
                className="fixed inset-0"
                style={{ zIndex: 'var(--z-overlay)' }}
                onClick={() => setOpen(false)}
                aria-hidden
              />
              <div
                role="dialog"
                aria-label="Command preview"
                className="anim-scale-in glass fixed w-[460px] overflow-hidden rounded-lg shadow-2xl"
                style={{ top: coords.top, left: coords.left, zIndex: 'calc(var(--z-overlay) + 1)' }}
                onClick={(event) => event.stopPropagation()}
              >
                <header className="flex items-center gap-2 border-b border-line/70 px-3 py-2">
                  <span className={cn('size-1.5 rounded-full', tone?.dot ?? 'bg-ink-ghost')} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                    {preview?.label ?? 'Reading command…'}
                  </span>
                  {preview ? (
                    <span className={cn('text-[10px] uppercase tracking-wide', tone?.text)}>
                      {tone?.label}
                    </span>
                  ) : null}
                  <IconButton icon={X} label="Close" size="xs" onClick={() => setOpen(false)} />
                </header>

                <div className="p-3">
                  {error ? (
                    <p className="text-[11.5px] text-danger">{error}</p>
                  ) : !preview ? (
                    <div className="flex items-center gap-2 py-2 text-[11.5px] text-ink-faint">
                      <Spinner /> Building the command…
                    </div>
                  ) : (
                    <>
                      <pre className="selectable max-h-44 overflow-auto rounded-md border border-line bg-void px-2.5 py-2 text-[11.5px] leading-relaxed whitespace-pre-wrap break-words text-run-bright">
                        {preview.command}
                      </pre>
                      <p className="mt-2 text-[10.5px] leading-snug text-ink-ghost">
                        {preview.privileged
                          ? 'Runs with sudo on the server when your account is not root.'
                          : 'Runs as your login account on the server.'}
                      </p>
                      <div className="mt-2.5 flex items-center gap-1.5">
                        <Button
                          size="xs"
                          variant="outline"
                          icon={Copy}
                          onClick={() => copy(preview.command, 'Command copied')}
                        >
                          Copy
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          icon={SquareTerminal}
                          onClick={() => {
                            queueTerminal(preview.command)
                            setView('terminal')
                            setOpen(false)
                          }}
                        >
                          Run in terminal instead
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </>
  )
}

// A button bound to a registry action, with the command peek attached.
// Handles confirm, dry run, toasts and the busy state.

export function ActionButton({
  actionId,
  params,
  children,
  icon,
  variant = 'secondary',
  size = 'sm',
  peek = true,
  options,
  onDone,
  disabled,
  className,
  title
}: {
  actionId: string
  params?: Record<string, unknown>
  children?: ReactNode
  icon?: LucideIcon
  variant?: ButtonProps['variant']
  size?: 'xs' | 'sm' | 'md'
  peek?: boolean
  options?: RunOptions
  onDone?: (data: unknown) => void
  disabled?: boolean
  className?: string
  title?: string
}): React.JSX.Element {
  const run = useApp((s) => s.run)
  const [busy, setBusy] = useState(false)

  const execute = async (): Promise<void> => {
    setBusy(true)
    try {
      const data = await run(actionId, params ?? {}, options)
      onDone?.(data)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className={cn('inline-flex items-center', peek && 'gap-px', className)}>
      <Button
        variant={variant}
        size={size}
        icon={icon}
        loading={busy}
        disabled={disabled}
        title={title}
        onClick={(event) => {
          event.stopPropagation()
          void execute()
        }}
        className={peek ? 'rounded-r-none' : undefined}
      >
        {children}
      </Button>
      {peek ? (
        <CommandPeek
          actionId={actionId}
          params={params}
          size={size === 'md' ? 'sm' : 'xs'}
          variant={variant === 'primary' ? 'secondary' : variant}
          className="rounded-l-none border-l border-void/30"
        />
      ) : null}
    </span>
  )
}
