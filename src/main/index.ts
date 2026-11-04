import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, shell, Menu } from 'electron'
import { registerIpc } from './ipc/handlers'
import { store } from './store/vault'
import { sshManager } from './ssh/manager'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: '#070a12',
    title: 'DontWorryGUI',
    titleBarStyle: process.platform === 'win32' ? 'hidden' : 'hiddenInset',
    titleBarOverlay:
      process.platform === 'win32'
        ? { color: '#070a12', symbolColor: '#8b9ab4', height: 40 }
        : undefined,
    trafficLightPosition: { x: 16, y: 13 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  window.once('ready-to-show', () => window.show())

  // never let the renderer navigate itself somewhere else
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.ELECTRON_RENDERER_URL
    if (devServer && url.startsWith(devServer)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling')

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark'
    Menu.setApplicationMenu(null)
    store.init()
    registerIpc(() => mainWindow)
    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    sshManager.disconnectAll()
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    sshManager.disconnectAll()
  })
}
