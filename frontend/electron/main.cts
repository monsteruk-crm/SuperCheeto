import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, screen, session, shell } from 'electron'
import path from 'path'
import { validateWindowChange, validateNativeSender, selectPrimaryScreen } from './native-contract.cjs'
import { WindowState } from './window-state.cjs'

const isDev = () => Boolean(process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development')
const shortcuts = {answer: false, capture: false}
let mainWindow: BrowserWindow | null = null
let windowState: WindowState | null = null
const ANSWER_SHORTCUT = 'CommandOrControl+Alt+Enter'
const CAPTURE_SCREEN_SHORTCUT = 'CommandOrControl+Alt+C'

app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')

const buildContentSecurityPolicy = () =>
  [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss: http: https:",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; ')

const installContentSecurityPolicy = () => {
  if (isDev()) {
    return
  }
  const contentSecurityPolicy = buildContentSecurityPolicy()
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {}
    responseHeaders['Content-Security-Policy'] = [contentSecurityPolicy]
    callback({ responseHeaders })
  })
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  windowState = new WindowState(win, bounds => screen.getDisplayMatching(bounds).workArea)
  win.on('closed', () => { mainWindow = null; windowState = null })
  win.on('always-on-top-changed', () => publishNativeState())

  // Markdown links open in the external browser; they never navigate a renderer
  // that has the screenshot preload bridge.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { const parsed = new URL(url); if (parsed.protocol === 'https:' || parsed.protocol === 'http:') void shell.openExternal(parsed.toString()) } catch { /* reject malformed links */ }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  if (isDev()) {
    win.loadURL(devUrl)
    if (process.env.OPEN_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

const sendCaptureScreenShortcut = () => {
  const win = mainWindow
  if (!win || win.isDestroyed()) {
    return
  }
  win.webContents.send('capture-screen-hotkey')
}

const assertSender = (event: Electron.IpcMainInvokeEvent) => {
  validateNativeSender(event, mainWindow)
}
const publishNativeState = () => {
  if (mainWindow && !mainWindow.isDestroyed() && windowState) mainWindow.webContents.send('native-state', windowState.read(shortcuts))
}
ipcMain.handle('get-native-state', event => { assertSender(event); return windowState!.read(shortcuts) })
ipcMain.handle('set-window-state', (event, change: unknown) => {
  assertSender(event); windowState!.apply(validateWindowChange(change)); publishNativeState(); return windowState!.read(shortcuts)
})
let captureTask: Promise<string | null> | null = null
const capturePrimaryScreen = async (): Promise<string | null> => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const targetWidth = Math.max(1280, Math.floor(primaryDisplay.size.width * 0.75))
  const targetHeight = Math.max(720, Math.floor(primaryDisplay.size.height * 0.75))
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: targetWidth, height: targetHeight }
  })
  const source = selectPrimaryScreen(sources, String(primaryDisplay.id), process.platform === 'linux' && Boolean(process.env.WAYLAND_DISPLAY))
  const jpeg = source.thumbnail.toJPEG(72)
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}
ipcMain.handle('capture-screen', event => {
  assertSender(event)
  if (!captureTask) captureTask = capturePrimaryScreen().finally(() => { captureTask = null })
  return captureTask
})

app.whenReady().then(() => {
  installContentSecurityPolicy()
  createWindow()
  for (const [action, accelerator, callback] of [
    ['answer', ANSWER_SHORTCUT, () => mainWindow?.webContents.send('answer-hotkey')],
    ['capture', CAPTURE_SCREEN_SHORTCUT, sendCaptureScreenShortcut]
  ] as const) {
    try { shortcuts[action] = globalShortcut.register(accelerator, callback) } catch { shortcuts[action] = false }
    if (!shortcuts[action]) console.warn(`Failed to register global shortcut: ${accelerator}`)
  }
  publishNativeState()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
