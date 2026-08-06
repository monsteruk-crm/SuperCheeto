"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const isDev = () => Boolean(process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development');
const CAPTURE_SCREEN_SHORTCUT = 'CommandOrControl+Alt+C';
electron_1.app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
const buildContentSecurityPolicy = () => [
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
].join('; ');
const installContentSecurityPolicy = () => {
    if (isDev()) {
        return;
    }
    const contentSecurityPolicy = buildContentSecurityPolicy();
    electron_1.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = details.responseHeaders || {};
        responseHeaders['Content-Security-Policy'] = [contentSecurityPolicy];
        callback({ responseHeaders });
    });
};
const createWindow = () => {
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: '#0f0f0f',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    if (isDev()) {
        win.loadURL(devUrl);
        win.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        win.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
};
const sendCaptureScreenShortcut = () => {
    const win = electron_1.BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) {
        return;
    }
    win.webContents.send('capture-screen-hotkey');
};
electron_1.ipcMain.handle('capture-screen', async () => {
    const primaryDisplay = electron_1.screen.getPrimaryDisplay();
    const targetWidth = Math.max(1280, Math.floor(primaryDisplay.size.width * 0.75));
    const targetHeight = Math.max(720, Math.floor(primaryDisplay.size.height * 0.75));
    const sources = await electron_1.desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: targetWidth, height: targetHeight }
    });
    const source = sources[0];
    if (!source)
        return null;
    const jpeg = source.thumbnail.toJPEG(72);
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
});
electron_1.app.whenReady().then(() => {
    installContentSecurityPolicy();
    createWindow();
    if (!electron_1.globalShortcut.register(CAPTURE_SCREEN_SHORTCUT, sendCaptureScreenShortcut)) {
        console.warn(`Failed to register global shortcut: ${CAPTURE_SCREEN_SHORTCUT}`);
    }
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('will-quit', () => {
    electron_1.globalShortcut.unregisterAll();
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
