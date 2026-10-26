"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    ping: () => 'pong',
    captureScreen: () => electron_1.ipcRenderer.invoke('capture-screen'),
    onCaptureScreenShortcut: (callback) => {
        const listener = () => callback();
        electron_1.ipcRenderer.on('capture-screen-hotkey', listener);
        return () => {
            electron_1.ipcRenderer.removeListener('capture-screen-hotkey', listener);
        };
    }
});
