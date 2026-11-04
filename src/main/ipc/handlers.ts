import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { basename } from 'node:path'
import type { AppSettings, HostConfig } from '@shared/types'
import { sshManager } from '../ssh/manager'
import { registry } from '../actions/registry'
import { store } from '../store/vault'
import { CHANNELS } from '@shared/channels'

export { CHANNELS }


function wrap<T>(fn: () => Promise<T> | T): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ ok: true as const, data }))
    .catch((err: Error) => ({ ok: false as const, error: err?.message ?? String(err) }))
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  /* ---------------- hosts ---------------- */
  ipcMain.handle(CHANNELS.hostsList, () => wrap(() => store.listHosts()))

  ipcMain.handle(CHANNELS.hostsSave, (_e, input: Partial<HostConfig>) =>
    wrap(() => store.upsertHost(input))
  )

  ipcMain.handle(CHANNELS.hostsDelete, (_e, id: string) =>
    wrap(() => {
      sshManager.disconnect(id)
      store.deleteHost(id)
      return true
    })
  )

  ipcMain.handle(CHANNELS.hostsTest, (_e, id: string) =>
    wrap(async () => {
      const host = store.resolveHost(id)
      if (!host) throw new Error('That server is not in the host book any more.')
      const state = await sshManager.connect(host)
      return state
    })
  )

  /* ---------------- connections ---------------- */
  ipcMain.handle(CHANNELS.connect, (_e, id: string) =>
    wrap(async () => {
      const host = store.resolveHost(id)
      if (!host) throw new Error('That server is not in the host book any more.')
      return sshManager.connect(host)
    })
  )

  ipcMain.handle(CHANNELS.disconnect, (_e, id: string) =>
    wrap(() => {
      sshManager.disconnect(id)
      return true
    })
  )

  ipcMain.handle(CHANNELS.states, () => wrap(() => sshManager.allStates()))

  /* ---------------- actions ---------------- */
  ipcMain.handle(
    CHANNELS.runAction,
    (_e, payload: { hostId: string; actionId: string; params?: Record<string, unknown>; origin?: 'gui' | 'poll' }) =>
      wrap(() =>
        sshManager.runAction(
          payload.hostId,
          payload.actionId,
          payload.params ?? {},
          payload.origin ?? 'gui'
        )
      )
  )

  ipcMain.handle(
    CHANNELS.previewAction,
    (_e, payload: { hostId: string; actionId: string; params?: Record<string, unknown> }) =>
      wrap(() => sshManager.previewAction(payload.hostId, payload.actionId, payload.params ?? {}))
  )

  ipcMain.handle(
    CHANNELS.runRaw,
    (_e, payload: { hostId: string; command: string; privileged?: boolean }) =>
      wrap(() => sshManager.runRaw(payload.hostId, payload.command, payload.privileged ?? false))
  )

  ipcMain.handle(CHANNELS.describeActions, () => wrap(() => registry.describe()))

  /* ---------------- audit ---------------- */
  ipcMain.handle(CHANNELS.auditList, (_e, hostId?: string) => wrap(() => sshManager.getAudit(hostId)))
  ipcMain.handle(CHANNELS.auditClear, () =>
    wrap(() => {
      sshManager.clearAudit()
      return true
    })
  )

  /* ---------------- settings ---------------- */
  ipcMain.handle(CHANNELS.settingsGet, () => wrap(() => store.getSettings()))
  ipcMain.handle(CHANNELS.settingsSet, (_e, patch: Partial<AppSettings>) =>
    wrap(() => store.saveSettings(patch))
  )

  /* ---------------- terminal ---------------- */
  ipcMain.handle(CHANNELS.termOpen, (_e, payload: { hostId: string; cols: number; rows: number }) =>
    wrap(() => sshManager.openTerminal(payload.hostId, payload.cols, payload.rows))
  )
  ipcMain.on(CHANNELS.termWrite, (_e, payload: { sessionId: string; data: string }) => {
    sshManager.writeTerminal(payload.sessionId, payload.data)
  })
  ipcMain.on(CHANNELS.termResize, (_e, payload: { sessionId: string; cols: number; rows: number }) => {
    sshManager.resizeTerminal(payload.sessionId, payload.cols, payload.rows)
  })
  ipcMain.on(CHANNELS.termClose, (_e, sessionId: string) => {
    sshManager.closeTerminal(sessionId)
  })

  /* ---------------- native dialogs ---------------- */
  ipcMain.handle(CHANNELS.pickFile, (_e, options?: { multiple?: boolean; title?: string }) =>
    wrap(async () => {
      const win = getWindow()
      if (!win) return []
      const result = await dialog.showOpenDialog(win, {
        title: options?.title ?? 'Choose a file',
        properties: options?.multiple ? ['openFile', 'multiSelections'] : ['openFile']
      })
      return result.canceled ? [] : result.filePaths
    })
  )

  ipcMain.handle(CHANNELS.pickDirectory, (_e, options?: { title?: string }) =>
    wrap(async () => {
      const win = getWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, {
        title: options?.title ?? 'Choose a folder',
        properties: ['openDirectory', 'createDirectory']
      })
      return result.canceled ? null : result.filePaths[0]
    })
  )

  ipcMain.handle(CHANNELS.pickSaveTarget, (_e, options: { suggestedName: string }) =>
    wrap(async () => {
      const win = getWindow()
      if (!win) return null
      const result = await dialog.showSaveDialog(win, {
        title: 'Save to',
        defaultPath: basename(options.suggestedName)
      })
      return result.canceled ? null : result.filePath
    })
  )

  ipcMain.handle(CHANNELS.revealPath, (_e, path: string) =>
    wrap(() => {
      shell.showItemInFolder(path)
      return true
    })
  )

  ipcMain.handle(CHANNELS.openExternal, (_e, url: string) =>
    wrap(async () => {
      if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) links can be opened.')
      await shell.openExternal(url)
      return true
    })
  )

  ipcMain.handle(CHANNELS.appInfo, () =>
    wrap(() => ({
      actionCount: registry.size,
      encryptionAvailable: store.encryptionAvailable(),
      platform: process.platform,
      electron: process.versions.electron,
      node: process.versions.node
    }))
  )

  /* ---------------- push events ---------------- */
  const send = (channel: string, payload: unknown): void => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  sshManager.on('connection', (state) => send(CHANNELS.evConnection, state))
  sshManager.on('command', (record) => send(CHANNELS.evCommand, record))
  sshManager.on('terminal:data', (payload) => send(CHANNELS.evTerminalData, payload))
  sshManager.on('terminal:exit', (payload) => send(CHANNELS.evTerminalExit, payload))
}
