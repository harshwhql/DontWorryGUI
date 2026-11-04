import { contextBridge, ipcRenderer } from 'electron'
import type {
  ActionDescriptor,
  AppSettings,
  CommandRecord,
  ConnectionState,
  HostConfig,
  RiskLevel,
  RunResult
} from '@shared/types'
import { CHANNELS } from '@shared/channels'

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string }

async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, payload)) as Envelope<T>
  if (!result.ok) throw new Error(result.error)
  return result.data
}

function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

const api = {
  hosts: {
    list: () => call<HostConfig[]>(CHANNELS.hostsList),
    save: (host: Partial<HostConfig>) => call<HostConfig>(CHANNELS.hostsSave, host),
    remove: (id: string) => call<boolean>(CHANNELS.hostsDelete, id),
    test: (id: string) => call<ConnectionState>(CHANNELS.hostsTest, id)
  },
  connection: {
    connect: (id: string) => call<ConnectionState>(CHANNELS.connect, id),
    disconnect: (id: string) => call<boolean>(CHANNELS.disconnect, id),
    states: () => call<ConnectionState[]>(CHANNELS.states),
    onChange: (handler: (state: ConnectionState) => void) =>
      subscribe<ConnectionState>(CHANNELS.evConnection, handler)
  },
  actions: {
    run: <T>(hostId: string, actionId: string, params?: Record<string, unknown>, origin?: 'gui' | 'poll') =>
      call<RunResult<T>>(CHANNELS.runAction, { hostId, actionId, params, origin }),
    preview: (hostId: string, actionId: string, params?: Record<string, unknown>) =>
      call<{ command: string; label: string; risk: RiskLevel; privileged: boolean }>(
        CHANNELS.previewAction,
        { hostId, actionId, params }
      ),
    raw: (hostId: string, command: string, privileged?: boolean) =>
      call<RunResult<string>>(CHANNELS.runRaw, { hostId, command, privileged }),
    describe: () => call<ActionDescriptor[]>(CHANNELS.describeActions)
  },
  audit: {
    list: (hostId?: string) => call<CommandRecord[]>(CHANNELS.auditList, hostId),
    clear: () => call<boolean>(CHANNELS.auditClear),
    onRecord: (handler: (record: CommandRecord) => void) =>
      subscribe<CommandRecord>(CHANNELS.evCommand, handler)
  },
  settings: {
    get: () => call<AppSettings>(CHANNELS.settingsGet),
    set: (patch: Partial<AppSettings>) => call<AppSettings>(CHANNELS.settingsSet, patch)
  },
  terminal: {
    open: (hostId: string, cols: number, rows: number) =>
      call<string>(CHANNELS.termOpen, { hostId, cols, rows }),
    write: (sessionId: string, data: string) =>
      ipcRenderer.send(CHANNELS.termWrite, { sessionId, data }),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send(CHANNELS.termResize, { sessionId, cols, rows }),
    close: (sessionId: string) => ipcRenderer.send(CHANNELS.termClose, sessionId),
    onData: (handler: (payload: { sessionId: string; data: string }) => void) =>
      subscribe<{ sessionId: string; data: string }>(CHANNELS.evTerminalData, handler),
    onExit: (handler: (payload: { sessionId: string }) => void) =>
      subscribe<{ sessionId: string }>(CHANNELS.evTerminalExit, handler)
  },
  dialog: {
    pickFile: (options?: { multiple?: boolean; title?: string }) =>
      call<string[]>(CHANNELS.pickFile, options),
    pickDirectory: (options?: { title?: string }) =>
      call<string | null>(CHANNELS.pickDirectory, options),
    pickSaveTarget: (suggestedName: string) =>
      call<string | null>(CHANNELS.pickSaveTarget, { suggestedName })
  },
  system: {
    reveal: (path: string) => call<boolean>(CHANNELS.revealPath, path),
    openExternal: (url: string) => call<boolean>(CHANNELS.openExternal, url),
    info: () =>
      call<{
        actionCount: number
        encryptionAvailable: boolean
        platform: string
        electron: string
        node: string
      }>(CHANNELS.appInfo)
  }
}

export type DwgApi = typeof api

contextBridge.exposeInMainWorld('dwg', api)
