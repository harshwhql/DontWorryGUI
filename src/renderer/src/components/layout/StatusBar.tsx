import { Activity, Cpu, FlaskConical, HardDrive, Lock, Unlock } from 'lucide-react'
import { cn, duration } from '../../lib/format'
import { useApp } from '../../state/store'

export function StatusBar(): React.JSX.Element {
  const connection = useApp((s) => s.activeConnection())
  const audit = useApp((s) => s.audit)
  const settings = useApp((s) => s.settings)
  const appInfo = useApp((s) => s.appInfo)
  const activeHostId = useApp((s) => s.activeHostId)

  const facts = connection?.facts
  const scoped = activeHostId ? audit.filter((r) => r.hostId === activeHostId) : audit
  const changes = scoped.filter((r) => r.risk !== 'read' && r.status === 'success').length
  const failures = scoped.filter((r) => r.status === 'error').length
  const lastDuration = scoped.at(-1)?.durationMs

  return (
    <footer
      className="flex shrink-0 items-center gap-3 border-t border-line bg-void/85 px-3 text-[10.5px] text-ink-ghost"
      style={{ height: 'var(--statusbar)' }}
    >
      {facts ? (
        <>
          <span className="flex items-center gap-1">
            <Cpu size={10} aria-hidden />
            <span className="mono">{facts.cpuCores} cores</span>
          </span>
          <span className="flex items-center gap-1">
            <HardDrive size={10} aria-hidden />
            <span className="mono">{facts.kernel}</span>
          </span>
          {facts.bootTime ? (
            <span className="mono">up {duration((Date.now() - facts.bootTime) / 1000)}</span>
          ) : null}
          {facts.virtualization && facts.virtualization !== 'none' ? (
            <span className="mono">{facts.virtualization}</span>
          ) : null}
        </>
      ) : (
        <span>Not connected</span>
      )}

      <div className="flex-1" />

      {settings.dryRun ? (
        <span className="flex items-center gap-1 text-warn">
          <FlaskConical size={10} aria-hidden />
          dry run: writes blocked
        </span>
      ) : null}

      <span className="flex items-center gap-1" title="Commands that changed server state">
        <Activity size={10} aria-hidden />
        <span className="mono">{changes} changes</span>
      </span>

      {failures > 0 ? (
        <span className="mono text-danger">{failures} failed</span>
      ) : null}

      {lastDuration !== undefined ? (
        <span className="mono" title="Round trip of the last command">
          {Math.round(lastDuration)}ms
        </span>
      ) : null}

      <span
        className={cn('flex items-center gap-1', appInfo?.encryptionAvailable ? '' : 'text-warn')}
        title={
          appInfo?.encryptionAvailable
            ? 'Saved credentials are encrypted with the OS keystore'
            : 'The OS keystore is unavailable, so credentials are stored as plain text'
        }
      >
        {appInfo?.encryptionAvailable ? <Lock size={10} aria-hidden /> : <Unlock size={10} aria-hidden />}
        vault
      </span>
    </footer>
  )
}
