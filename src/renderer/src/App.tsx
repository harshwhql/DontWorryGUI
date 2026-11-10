import { useEffect, useState } from 'react'
import { Plug, Server, Terminal, Unplug } from 'lucide-react'
import { Button, EmptyState, Spinner } from './components/ui/primitives'
import { ConfirmDialog, Toasts } from './components/ui/overlay'
import { TitleBar } from './components/layout/TitleBar'
import { HostRail } from './components/layout/HostRail'
import { Sidebar } from './components/layout/Sidebar'
import { StatusBar } from './components/layout/StatusBar'
import { CommandInspector } from './components/layout/CommandInspector'
import { CommandPalette } from './components/layout/CommandPalette'
import { ConnectionsView } from './features/connections/ConnectionsView'
import { HostForm } from './features/connections/HostForm'
import { DashboardView } from './features/dashboard/DashboardView'
import { FilesView } from './features/files/FilesView'
import { ProcessesView } from './features/processes/ProcessesView'
import { ServicesView } from './features/services/ServicesView'
import { PackagesView } from './features/packages/PackagesView'
import { NetworkView } from './features/network/NetworkView'
import { UsersView } from './features/users/UsersView'
import { DockerView } from './features/docker/DockerView'
import { LogsView } from './features/logs/LogsView'
import { SchedulerView } from './features/scheduler/SchedulerView'
import { SettingsView } from './features/settings/SettingsView'
import { TerminalView } from './features/terminal/TerminalView'
import { bridgeAvailable } from './lib/api'
import { applyTheme, resolveThemeId } from './lib/theme'
import { useApp } from './state/store'
import { useHotkey } from './lib/hooks'

export default function App(): React.JSX.Element {
  const booted = useApp((s) => s.booted)
  const boot = useApp((s) => s.boot)
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const activeHostId = useApp((s) => s.activeHostId)
  const connection = useApp((s) => s.activeConnection())
  const connect = useApp((s) => s.connect)
  const host = useApp((s) => s.activeHost())
  const toast = useApp((s) => s.toast)
  const [hostForm, setHostForm] = useState<'new' | 'edit' | null>(null)

  const [bootError, setBootError] = useState<string | null>(null)

  // each server can carry its own theme, so this follows the active host
  const hostTheme = useApp((s) => s.hosts.find((h) => h.id === s.activeHostId)?.theme)
  const defaultTheme = useApp((s) => s.settings.defaultTheme)
  const density = useApp((s) => s.settings.density)
  const themeId = resolveThemeId(hostTheme, defaultTheme)

  useEffect(() => {
    if (!booted) return
    applyTheme(themeId, density)
  }, [booted, themeId, density])

  useEffect(() => {
    if (!bridgeAvailable) return
    void boot().catch((err: Error) => setBootError(err.message))
  }, [boot])

  useHotkey('mod+`', (event) => {
    event.preventDefault()
    setView('terminal')
  })
  useHotkey('mod+1', (event) => {
    event.preventDefault()
    setView('overview')
  })
  useHotkey('mod+r', (event) => {
    // the browser reload shortcut would throw away every live session
    event.preventDefault()
    toast({ tone: 'info', title: 'Use the refresh button in each section' })
  })

  if (!bridgeAvailable) {
    return (
      <div className="grid h-full place-items-center bg-base p-8">
        <div className="panel-raised max-w-md p-5 text-center">
          <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-warn/14 ring-1 ring-warn/30">
            <Unplug size={18} className="text-warn" aria-hidden />
          </div>
          <h1 className="text-[15px] font-semibold text-ink">
            This page needs the DontWorryGUI desktop shell
          </h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
            The renderer is running, but the privileged bridge that opens SSH connections is not
            there, so this is the Vite dev URL in an ordinary browser rather than the app window.
            Run <code className="text-accent-bright">npm run dev</code> and use the window it opens.
          </p>
        </div>
      </div>
    )
  }

  if (bootError) {
    return (
      <div className="grid h-full place-items-center bg-base p-8">
        <div className="panel-raised max-w-md p-5 text-center">
          <h1 className="text-[15px] font-semibold text-danger">DontWorryGUI could not start</h1>
          <p className="mono mt-2 text-[11.5px] leading-relaxed text-ink-dim">{bootError}</p>
        </div>
      </div>
    )
  }

  if (!booted) {
    return (
      <div className="grid h-full place-items-center bg-base">
        <div className="flex flex-col items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-accent/14 ring-1 ring-accent/30">
            <Terminal size={18} className="text-accent-bright" aria-hidden />
          </div>
          <div className="flex items-center gap-2 text-[12px] text-ink-faint">
            <Spinner /> Opening the host book…
          </div>
        </div>
      </div>
    )
  }

  const connected = connection?.status === 'connected'
  const showWorkspace = Boolean(activeHostId)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <HostRail onAddHost={() => setHostForm('new')} />

        {showWorkspace ? <Sidebar /> : null}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!showWorkspace ? (
              <ConnectionsView />
            ) : view === 'settings' ? (
              <SettingsView />
            ) : !connected ? (
              <div className="grid-fade flex min-h-0 flex-1 items-center justify-center">
                <EmptyState
                  icon={Server}
                  title={
                    connection?.status === 'connecting'
                      ? `Connecting to ${host?.label ?? 'the server'}…`
                      : `${host?.label ?? 'This server'} is not connected`
                  }
                  message={
                    connection?.message ??
                    'Open a session and DontWorryGUI will probe the distro, package manager and privileges, then unlock the sections this box supports.'
                  }
                  action={
                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        icon={Plug}
                        loading={connection?.status === 'connecting'}
                        onClick={() => activeHostId && void connect(activeHostId)}
                      >
                        Connect
                      </Button>
                      <Button variant="ghost" onClick={() => setHostForm('edit')}>
                        Edit connection
                      </Button>
                    </div>
                  }
                />
              </div>
            ) : view === 'overview' ? (
              <DashboardView />
            ) : view === 'files' ? (
              <FilesView />
            ) : view === 'processes' ? (
              <ProcessesView />
            ) : view === 'services' ? (
              <ServicesView />
            ) : view === 'packages' ? (
              <PackagesView />
            ) : view === 'network' ? (
              <NetworkView />
            ) : view === 'users' ? (
              <UsersView />
            ) : view === 'docker' ? (
              <DockerView />
            ) : view === 'logs' ? (
              <LogsView />
            ) : view === 'scheduler' ? (
              <SchedulerView />
            ) : view === 'terminal' ? (
              <TerminalView />
            ) : (
              <DashboardView />
            )}
          </div>

          <CommandInspector />
        </main>
      </div>

      <StatusBar />

      <CommandPalette />
      <ConfirmDialog />
      <Toasts />
      <HostForm
        open={hostForm !== null}
        host={hostForm === 'edit' ? (host ?? null) : null}
        onClose={() => setHostForm(null)}
      />
    </div>
  )
}
