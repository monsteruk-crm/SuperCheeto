import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, screen, session } from 'electron'
import path from 'path'

const isDev = () => Boolean(process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development')
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

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  if (isDev()) {
    win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

const sendCaptureScreenShortcut = () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) {
    return
  }
  win.webContents.send('capture-screen-hotkey')
}

ipcMain.handle('capture-screen', async () => {
  const primaryDisplay = screen.getPrimaryDisplay()
  const targetWidth = Math.max(1280, Math.floor(primaryDisplay.size.width * 0.75))
  const targetHeight = Math.max(720, Math.floor(primaryDisplay.size.height * 0.75))
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: targetWidth, height: targetHeight }
  })
  const source = sources[0]
  if (!source) return null
  const jpeg = source.thumbnail.toJPEG(72)
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
})

app.whenReady().then(() => {
  installContentSecurityPolicy()
  createWindow()
  if (!globalShortcut.register(CAPTURE_SCREEN_SHORTCUT, sendCaptureScreenShortcut)) {
    console.warn(`Failed to register global shortcut: ${CAPTURE_SCREEN_SHORTCUT}`)
  }

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
