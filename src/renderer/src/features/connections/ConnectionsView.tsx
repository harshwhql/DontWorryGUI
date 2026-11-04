import { useState } from 'react'
import {
  ArrowRight,
  Code2,
  Eye,
  FlaskConical,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  Server,
  ShieldCheck,
  Terminal
} from 'lucide-react'
import type { HostConfig } from '@shared/types'
import { cn, duration, relative } from '../../lib/format'
import { Badge, Button, EmptyState, IconButton, Panel } from '../../components/ui/primitives'
import { useApp } from '../../state/store'
import { HostForm } from './HostForm'

export function ConnectionsView(): React.JSX.Element {
  const hosts = useApp((s) => s.hosts)
  const connections = useApp((s) => s.connections)
  const connect = useApp((s) => s.connect)
  const disconnect = useApp((s) => s.disconnect)
  const setActiveHost = useApp((s) => s.setActiveHost)
  const appInfo = useApp((s) => s.appInfo)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<HostConfig | null>(null)

  const openNew = (): void => {
    setEditing(null)
    setFormOpen(true)
  }

  return (
    <div className="grid-fade flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-7">
        <div className="anim-fade-up mb-6">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink">
            Your servers
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-dim">
            Pick a server to manage its files, services, packages, containers, users and firewall
            rules. The <Code2 size={11} className="inline align-[-1px] text-run-bright" /> next to
            any action shows the shell command it runs, every command is logged at the bottom of
            the window, and the terminal is one keystroke away.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="primary" size="md" icon={Plus} onClick={openNew}>
              Add a server
            </Button>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="run" icon={Code2}>
                {appInfo?.actionCount ?? 0} mapped commands
              </Badge>
              <Badge tone="warn" icon={FlaskConical}>
                dry run mode
              </Badge>
              <Badge tone="info" icon={Terminal}>
                built-in SSH terminal
              </Badge>
              <Badge tone={appInfo?.encryptionAvailable ? 'root' : 'danger'} icon={ShieldCheck}>
                {appInfo?.encryptionAvailable ? 'OS-encrypted vault' : 'vault unencrypted'}
              </Badge>
            </div>
          </div>
        </div>

        {/* host grid */}
        {hosts.length === 0 ? (
          <Panel className="anim-fade-up">
            <EmptyState
              icon={Server}
              title="No servers yet"
              message="Add the first one and DontWorryGUI will probe the distro, package manager, init system and privileges for you, then unlock the sections that box supports."
              action={
                <Button variant="primary" icon={Plus} onClick={openNew}>
                  Add a server
                </Button>
              }
            />
          </Panel>
        ) : (
          <div className="stagger grid grid-cols-1 gap-3 lg:grid-cols-2">
            {hosts.map((host) => {
              const state = connections[host.id]
              const status = state?.status ?? 'disconnected'
              const connected = status === 'connected'
              const facts = state?.facts

              return (
                <Panel key={host.id} raised className="group flex flex-col overflow-hidden">
                  <div className="flex items-start gap-3 p-3.5">
                    <span
                      className={cn(
                        'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg text-[12px] font-semibold ring-1',
                        connected
                          ? 'bg-run/14 text-run-bright ring-run/35'
                          : status === 'error'
                            ? 'bg-danger/12 text-danger ring-danger/30'
                            : 'bg-overlay text-ink-faint ring-line'
                      )}
                    >
                      {host.label.slice(0, 2).toUpperCase()}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[14px] font-semibold tracking-tight text-ink">
                          {host.label}
                        </h3>
                        {host.group ? <Badge tone="neutral">{host.group}</Badge> : null}
                      </div>
                      <p className="mono mt-0.5 truncate text-[11px] text-ink-faint">
                        {host.username}@{host.host}:{host.port}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge
                          tone={
                            connected
                              ? 'run'
                              : status === 'error'
                                ? 'danger'
                                : status === 'connecting'
                                  ? 'warn'
                                  : 'neutral'
                          }
                        >
                          {status}
                        </Badge>
                        <Badge tone="neutral" mono>
                          {host.authMethod === 'key'
                            ? 'key'
                            : host.authMethod === 'agent'
                              ? 'agent'
                              : 'password'}
                        </Badge>
                        {facts ? (
                          <>
                            <Badge tone="neutral" mono>
                              {facts.distroId} {facts.version}
                            </Badge>
                            {facts.isRoot ? <Badge tone="root">root</Badge> : null}
                            {facts.hasDocker ? <Badge tone="info">docker</Badge> : null}
                          </>
                        ) : null}
                      </div>

                      <p className="mt-2 text-[10.5px] text-ink-ghost">
                        {connected && facts?.bootTime
                          ? `Server up ${duration((Date.now() - facts.bootTime) / 1000)}`
                          : `Last connected ${relative(host.lastConnectedAt)}`}
                        {host.notes ? ` · ${host.notes}` : ''}
                      </p>

                      {status === 'error' && state?.message ? (
                        <p className="mt-2 rounded-md border border-danger/25 bg-danger/8 px-2 py-1 text-[11px] leading-snug text-danger">
                          {state.message}
                        </p>
                      ) : null}
                    </div>

                    <IconButton
                      icon={Pencil}
                      label={`Edit ${host.label}`}
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => {
                        setEditing(host)
                        setFormOpen(true)
                      }}
                    />
                  </div>

                  <div className="mt-auto flex items-center gap-1.5 border-t border-line bg-void/30 px-3 py-2">
                    {connected ? (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          iconRight={ArrowRight}
                          onClick={() => setActiveHost(host.id)}
                        >
                          Open
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void disconnect(host.id)}>
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={status === 'connecting' ? PlugZap : Plug}
                        loading={status === 'connecting'}
                        onClick={() => void connect(host.id)}
                      >
                        Connect
                      </Button>
                    )}
                    <div className="flex-1" />
                    <IconButton
                      icon={Eye}
                      label="Make this the active server"
                      onClick={() => setActiveHost(host.id)}
                    />
                  </div>
                </Panel>
              )
            })}
          </div>
        )}
      </div>

      <HostForm open={formOpen} host={editing} onClose={() => setFormOpen(false)} />
    </div>
  )
}
