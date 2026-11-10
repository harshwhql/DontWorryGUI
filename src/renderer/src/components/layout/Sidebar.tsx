import { LogOut, Plug } from 'lucide-react'
import { cn, duration } from '../../lib/format'
import { Badge, Button } from '../ui/primitives'
import { useApp } from '../../state/store'
import { GROUPS } from './nav'

export function Sidebar(): React.JSX.Element {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const host = useApp((s) => s.activeHost())
  const connection = useApp((s) => s.activeConnection())
  const disconnect = useApp((s) => s.disconnect)
  const connect = useApp((s) => s.connect)
  const toast = useApp((s) => s.toast)

  const facts = connection?.facts
  const connected = connection?.status === 'connected'
  const uptime = facts?.bootTime ? (Date.now() - facts.bootTime) / 1000 : undefined

  return (
    <aside
      className="flex shrink-0 flex-col border-r border-line bg-surface/55"
      style={{ width: 'var(--sidebar)' }}
    >
      {/* server summary */}
      <div className="border-b border-line px-3 py-2.5">
        {host ? (
          <>
            <p className="truncate text-[13px] font-semibold tracking-tight text-ink">{host.label}</p>
            <p className="mono mt-0.5 truncate text-[10.5px] text-ink-ghost">
              {host.username}@{host.host}:{host.port}
            </p>
            {facts ? (
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge tone="neutral" mono>
                  {facts.prettyName.length > 22 ? facts.distroId : facts.prettyName}
                </Badge>
                <Badge tone="neutral" mono>
                  {facts.arch}
                </Badge>
                {facts.packageManager !== 'unknown' ? (
                  <Badge tone="info" mono>
                    {facts.packageManager}
                  </Badge>
                ) : null}
              </div>
            ) : null}
            {uptime !== undefined ? (
              <p className="mt-2 text-[10.5px] text-ink-faint">
                Up {duration(uptime)} · {facts?.cpuCores} cores
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[12px] text-ink-ghost">Choose a server on the left.</p>
        )}
      </div>

      {/* navigation */}
      <nav aria-label="Sections" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {GROUPS.map((group) => (
          <div key={group.title} className="mb-3 last:mb-0">
            <p className="px-2 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-ghost">
              {group.title}
            </p>
            <ul className="flex flex-col gap-px">
              {group.items.map((item) => {
                const reason = item.unavailable?.(facts)
                const active = view === item.id
                const Icon = item.icon
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (reason) {
                          toast({ tone: 'info', title: item.label, message: reason })
                          return
                        }
                        setView(item.id)
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] transition-colors duration-150',
                        active
                          ? 'bg-accent/12 font-medium text-accent-bright'
                          : reason
                            ? 'text-ink-ghost hover:bg-hover/40'
                            : 'text-ink-dim hover:bg-hover hover:text-ink'
                      )}
                      title={reason}
                    >
                      <Icon
                        size={14}
                        className={cn('shrink-0', active ? 'text-accent-bright' : 'text-ink-faint')}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {reason ? (
                        <span className="text-[9px] uppercase tracking-wide text-ink-ghost">n/a</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* connection control */}
      {host ? (
        <div className="border-t border-line p-2">
          {connected ? (
            <Button
              variant="ghost"
              size="sm"
              icon={LogOut}
              className="w-full justify-start"
              onClick={() => void disconnect(host.id)}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              icon={Plug}
              className="w-full"
              loading={connection?.status === 'connecting'}
              onClick={() => void connect(host.id)}
            >
              Connect
            </Button>
          )}
        </div>
      ) : null}
    </aside>
  )
}

