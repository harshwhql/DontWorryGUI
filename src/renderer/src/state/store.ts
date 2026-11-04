import { create } from 'zustand'
import type {
  ActionDescriptor,
  AppSettings,
  CommandRecord,
  ConnectionState,
  HostConfig,
  RunResult
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { api } from '../lib/api'

export type ViewId =
  | 'overview'
  | 'files'
  | 'processes'
  | 'services'
  | 'packages'
  | 'network'
  | 'users'
  | 'docker'
  | 'logs'
  | 'scheduler'
  | 'terminal'
  | 'settings'

export interface Toast {
  id: string
  tone: 'success' | 'error' | 'info' | 'warn'
  title: string
  message?: string
  command?: string
}

export interface ConfirmRequest {
  title: string
  body?: string
  command: string
  risk: 'read' | 'write' | 'destructive'
  confirmLabel: string
  /** when set, the user must type this exact text to proceed */
  typeToConfirm?: string
}

export interface RunOptions {
  /** skip the confirm dialog even for destructive actions */
  force?: boolean
  /** show a toast on success */
  successMessage?: string
  /** suppress the error toast (the caller renders the error itself) */
  quiet?: boolean
  /** mark the command as a background poll so the inspector can dim it */
  poll?: boolean
  /** label shown in the confirm dialog instead of the action label */
  confirmTitle?: string
  confirmBody?: string
  typeToConfirm?: string
}

interface AppState {
  booted: boolean
  hosts: HostConfig[]
  connections: Record<string, ConnectionState>
  activeHostId: string | null
  view: ViewId
  settings: AppSettings
  descriptors: ActionDescriptor[]
  audit: CommandRecord[]
  toasts: Toast[]
  paletteOpen: boolean
  inspectorOpen: boolean
  inspectorHeight: number
  confirm: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null
  /** command queued for the terminal view by "Run in terminal" */
  terminalQueue: string | null
  appInfo: {
    actionCount: number
    encryptionAvailable: boolean
    platform: string
    electron: string
    node: string
  } | null

  boot: () => Promise<void>
  refreshHosts: () => Promise<void>
  saveHost: (host: Partial<HostConfig>) => Promise<HostConfig>
  deleteHost: (id: string) => Promise<void>
  connect: (id: string) => Promise<boolean>
  disconnect: (id: string) => Promise<void>
  setActiveHost: (id: string | null) => void
  setView: (view: ViewId) => void
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>
  toast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  setPaletteOpen: (open: boolean) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorHeight: (height: number) => void
  clearAudit: () => Promise<void>
  askConfirm: (request: ConfirmRequest) => Promise<boolean>
  resolveConfirm: (ok: boolean) => void
  queueTerminal: (command: string | null) => void
  run: <T>(actionId: string, params?: Record<string, unknown>, options?: RunOptions) => Promise<T | undefined>
  runRaw: (command: string, privileged?: boolean) => Promise<RunResult<string> | undefined>
  activeConnection: () => ConnectionState | undefined
  activeHost: () => HostConfig | undefined
}

const DESTRUCTIVE_TYPE_TO_CONFIRM = new Set([
  'system.reboot',
  'system.shutdown',
  'files.remove',
  'users.delete',
  'docker.prune',
  'docker.removeVolume',
  'packages.upgradeAll',
  'firewall.enable',
  'firewall.disable'
])

let toastSeq = 0

export const useApp = create<AppState>((set, get) => ({
  booted: false,
  hosts: [],
  connections: {},
  activeHostId: null,
  view: 'overview',
  settings: { ...DEFAULT_SETTINGS },
  descriptors: [],
  audit: [],
  toasts: [],
  paletteOpen: false,
  inspectorOpen: true,
  inspectorHeight: 232,
  confirm: null,
  terminalQueue: null,
  appInfo: null,

  async boot() {
    const [hosts, settings, descriptors, states, audit, appInfo] = await Promise.all([
      api.hosts.list(),
      api.settings.get(),
      api.actions.describe(),
      api.connection.states(),
      api.audit.list(),
      api.system.info()
    ])

    const connections: Record<string, ConnectionState> = {}
    for (const state of states) connections[state.hostId] = state

    set({
      hosts,
      settings,
      descriptors,
      connections,
      audit,
      appInfo,
      inspectorOpen: settings.showCommandInspector,
      booted: true
    })

    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion)

    api.connection.onChange((state) => {
      set((prev) => ({ connections: { ...prev.connections, [state.hostId]: state } }))
      if (state.status === 'error' && state.message) {
        get().toast({ tone: 'error', title: 'Connection problem', message: state.message })
      }
    })

    api.audit.onRecord((record) => {
      set((prev) => {
        const next = [...prev.audit, record]
        return { audit: next.length > 400 ? next.slice(next.length - 400) : next }
      })
    })
  },

  async refreshHosts() {
    set({ hosts: await api.hosts.list() })
  },

  async saveHost(host) {
    const saved = await api.hosts.save(host)
    await get().refreshHosts()
    return saved
  },

  async deleteHost(id) {
    await api.hosts.remove(id)
    await get().refreshHosts()
    set((prev) => {
      const connections = { ...prev.connections }
      delete connections[id]
      return {
        connections,
        activeHostId: prev.activeHostId === id ? null : prev.activeHostId
      }
    })
  },

  async connect(id) {
    try {
      await api.connection.connect(id)
      set({ activeHostId: id })
      const host = get().hosts.find((h) => h.id === id)
      get().toast({ tone: 'success', title: `Connected to ${host?.label ?? id}` })
      await get().refreshHosts()
      return true
    } catch (err) {
      get().toast({
        tone: 'error',
        title: 'Could not connect',
        message: (err as Error).message
      })
      return false
    }
  },

  async disconnect(id) {
    await api.connection.disconnect(id)
  },

  setActiveHost(id) {
    set({ activeHostId: id, view: 'overview' })
  },

  setView(view) {
    set({ view })
  },

  async patchSettings(patch) {
    const settings = await api.settings.set(patch)
    set({ settings })
    if (patch.reduceMotion !== undefined) {
      document.documentElement.dataset.reduceMotion = String(patch.reduceMotion)
    }
    if (patch.showCommandInspector !== undefined) {
      set({ inspectorOpen: patch.showCommandInspector })
    }
  },

  toast(toast) {
    const id = `t${++toastSeq}`
    set((prev) => ({ toasts: [...prev.toasts, { ...toast, id }] }))
    const ttl = toast.tone === 'error' ? 7000 : 4200
    window.setTimeout(() => get().dismissToast(id), ttl)
  },

  dismissToast(id) {
    set((prev) => ({ toasts: prev.toasts.filter((t) => t.id !== id) }))
  },

  setPaletteOpen(open) {
    set({ paletteOpen: open })
  },

  setInspectorOpen(open) {
    set({ inspectorOpen: open })
  },

  setInspectorHeight(height) {
    set({ inspectorHeight: Math.max(120, Math.min(560, height)) })
  },

  async clearAudit() {
    await api.audit.clear()
    set({ audit: [] })
  },

  askConfirm(request) {
    return new Promise<boolean>((resolve) => {
      set({ confirm: { ...request, resolve } })
    })
  },

  resolveConfirm(ok) {
    const current = get().confirm
    set({ confirm: null })
    current?.resolve(ok)
  },

  queueTerminal(command) {
    set({ terminalQueue: command })
  },

  async run<T>(
    actionId: string,
    params: Record<string, unknown> = {},
    options: RunOptions = {}
  ): Promise<T | undefined> {
    const { activeHostId, settings, descriptors } = get()
    if (!activeHostId) {
      get().toast({ tone: 'warn', title: 'Pick a server first' })
      return undefined
    }

    const descriptor = descriptors.find((d) => d.id === actionId)
    const risk = descriptor?.risk ?? 'write'
    const needsConfirm =
      !options.force &&
      ((risk === 'destructive' && settings.confirmDestructive) ||
        (risk === 'write' && settings.confirmWrites))

    if (needsConfirm) {
      let command = '(command unavailable)'
      try {
        command = (await api.actions.preview(activeHostId, actionId, params)).command
      } catch {
        /* preview is best effort */
      }
      const ok = await get().askConfirm({
        title: options.confirmTitle ?? descriptor?.label ?? actionId,
        body: options.confirmBody ?? descriptor?.description,
        command,
        risk,
        confirmLabel: risk === 'destructive' ? 'Run it anyway' : 'Run command',
        typeToConfirm:
          options.typeToConfirm ??
          (DESTRUCTIVE_TYPE_TO_CONFIRM.has(actionId) ? 'confirm' : undefined)
      })
      if (!ok) return undefined
    }

    try {
      const result = await api.actions.run<T>(
        activeHostId,
        actionId,
        params,
        options.poll ? 'poll' : 'gui'
      )

      if (result.record.status === 'dry-run') {
        get().toast({
          tone: 'info',
          title: 'Dry run — nothing was executed',
          message: 'Turn dry run off in the title bar to let this command through.',
          command: result.record.command
        })
        return undefined
      }

      if (!result.ok) {
        if (!options.quiet) {
          get().toast({
            tone: 'error',
            title: descriptor?.label ?? actionId,
            message: result.error,
            command: result.record.command
          })
        }
        return undefined
      }

      if (options.successMessage) {
        get().toast({ tone: 'success', title: options.successMessage, command: result.record.command })
      }
      return result.data
    } catch (err) {
      if (!options.quiet) {
        get().toast({ tone: 'error', title: 'Command failed', message: (err as Error).message })
      }
      return undefined
    }
  },

  async runRaw(command: string, privileged = false) {
    const { activeHostId } = get()
    if (!activeHostId) return undefined
    try {
      return await api.actions.raw(activeHostId, command, privileged)
    } catch (err) {
      get().toast({ tone: 'error', title: 'Command failed', message: (err as Error).message })
      return undefined
    }
  },

  activeConnection() {
    const { activeHostId, connections } = get()
    return activeHostId ? connections[activeHostId] : undefined
  },

  activeHost() {
    const { activeHostId, hosts } = get()
    return hosts.find((h) => h.id === activeHostId)
  }
}))

/** true when the active host has a live SSH session */
export function useIsConnected(): boolean {
  return useApp((s) => {
    const id = s.activeHostId
    return Boolean(id && s.connections[id]?.status === 'connected')
  })
}
