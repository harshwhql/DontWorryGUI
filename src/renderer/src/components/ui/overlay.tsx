import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Info, X, XCircle } from 'lucide-react'
import { cn } from '../../lib/format'
import { Button, IconButton } from './primitives'
import { useApp } from '../../state/store'

// Modal

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
  dismissable = true
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
  dismissable?: boolean
}): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissable) {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    // move focus into the dialog for keyboard and screen-reader users
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input,select,textarea,button:not([aria-label="Close"])'
      )
      focusable?.focus()
    }, 40)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.clearTimeout(timer)
    }
  }, [open, onClose, dismissable])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 grid place-items-center p-6"
      style={{ zIndex: 'var(--z-modal)' }}
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-scrim backdrop-blur-[3px]"
        onClick={() => dismissable && onClose()}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'anim-scale-in panel-raised relative flex max-h-[86vh] w-full flex-col overflow-hidden',
          width
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h2>
            {subtitle ? (
              <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">{subtitle}</p>
            ) : null}
          </div>
          {dismissable ? <IconButton icon={X} label="Close" onClick={onClose} /> : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-void/40 px-4 py-2.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

// Confirm dialog. Always shows the literal command.

export function ConfirmDialog(): React.JSX.Element | null {
  const confirm = useApp((s) => s.confirm)
  const resolveConfirm = useApp((s) => s.resolveConfirm)
  const [typed, setTyped] = useState('')

  // reset the typed confirmation whenever a different command is queued
  const requiredPhrase = confirm?.typeToConfirm
  const commandKey = confirm?.command
  useEffect(() => {
    setTyped('')
  }, [requiredPhrase, commandKey])

  if (!confirm) return null

  const requiresTyping = Boolean(requiredPhrase)
  const canProceed = !requiresTyping || typed.trim() === confirm.typeToConfirm
  const destructive = confirm.risk === 'destructive'

  return (
    <Modal
      open
      onClose={() => resolveConfirm(false)}
      title={confirm.title}
      subtitle={
        destructive
          ? 'This cannot be undone from here. Read the command before you run it.'
          : 'This changes the state of the server.'
      }
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => resolveConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            disabled={!canProceed}
            onClick={() => {
              setTyped('')
              resolveConfirm(true)
            }}
          >
            {confirm.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {confirm.body ? (
          <p className="text-[12.5px] leading-relaxed text-ink-dim">{confirm.body}</p>
        ) : null}

        <div className="overflow-hidden rounded-md border border-line bg-void">
          <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5">
            <span
              className={cn(
                'size-1.5 rounded-full',
                destructive ? 'bg-danger' : 'bg-warn'
              )}
              aria-hidden
            />
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">
              Command that will run
            </span>
          </div>
          <pre className="selectable max-h-48 overflow-auto px-3 py-2.5 text-[11.5px] leading-relaxed text-accent-bright">
            {confirm.command}
          </pre>
        </div>

        {requiresTyping ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-ink-dim">
              Type <code className="text-warn">{confirm.typeToConfirm}</code> to unlock the button
            </span>
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              className="mono h-8 rounded-md border border-line bg-void/60 px-2.5 text-xs text-ink focus:border-danger/60 focus:outline-none"
              placeholder={confirm.typeToConfirm}
            />
          </label>
        ) : null}
      </div>
    </Modal>
  )
}

// Toasts

const TOAST_STYLE = {
  success: { icon: Check, cls: 'border-run/35 bg-run/10', text: 'text-run-bright' },
  error: { icon: XCircle, cls: 'border-danger/35 bg-danger/10', text: 'text-danger' },
  warn: { icon: AlertTriangle, cls: 'border-warn/35 bg-warn/10', text: 'text-warn' },
  info: { icon: Info, cls: 'border-info/35 bg-info/10', text: 'text-info' }
} as const

export function Toasts(): React.JSX.Element {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)

  return createPortal(
    <div
      className="pointer-events-none fixed right-4 bottom-4 flex w-[360px] flex-col gap-2"
      style={{ zIndex: 'var(--z-toast)' }}
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const style = TOAST_STYLE[toast.tone]
        const Icon = style.icon
        return (
          <div
            key={toast.id}
            className={cn(
              'anim-fade-up glass pointer-events-auto flex items-start gap-2.5 rounded-lg border p-3 shadow-2xl',
              style.cls
            )}
          >
            <Icon size={14} className={cn('mt-0.5 shrink-0', style.text)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-ink">{toast.title}</p>
              {toast.message ? (
                <p className="mt-0.5 break-words text-[11.5px] leading-snug text-ink-dim">
                  {toast.message}
                </p>
              ) : null}
              {toast.command ? (
                <pre className="selectable mono mt-1.5 max-h-20 overflow-auto rounded-xs border border-line/60 bg-void/60 px-2 py-1 text-[10.5px] leading-relaxed text-ink-faint">
                  {toast.command}
                </pre>
              ) : null}
            </div>
            <IconButton icon={X} label="Dismiss" size="xs" onClick={() => dismiss(toast.id)} />
          </div>
        )
      })}
    </div>,
    document.body
  )
}
