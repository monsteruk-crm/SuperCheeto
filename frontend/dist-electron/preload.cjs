"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getNativeState: () => electron_1.ipcRenderer.invoke('get-native-state'),
    setWindowState: (change) => electron_1.ipcRenderer.invoke('set-window-state', change),
    onNativeState: (callback) => {
        const listener = (_event, state) => callback(state);
        electron_1.ipcRenderer.on('native-state', listener);
        return () => { electron_1.ipcRenderer.removeListener('native-state', listener); };
    },
    onAnswerShortcut: (callback) => {
        const listener = () => callback();
        electron_1.ipcRenderer.on('answer-hotkey', listener);
        return () => { electron_1.ipcRenderer.removeListener('answer-hotkey', listener); };
    },
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
