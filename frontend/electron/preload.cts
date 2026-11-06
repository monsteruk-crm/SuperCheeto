import { contextBridge, ipcRenderer } from 'electron'
import type { NativeState } from './native-contract.cjs'

contextBridge.exposeInMainWorld('electronAPI', {
  getNativeState: () => ipcRenderer.invoke('get-native-state') as Promise<NativeState>,
  setWindowState: (change: {pinned?: boolean; focus?: boolean}) => ipcRenderer.invoke('set-window-state', change) as Promise<NativeState>,
  onNativeState: (callback: (state: NativeState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: NativeState) => callback(state)
    ipcRenderer.on('native-state', listener)
    return () => { ipcRenderer.removeListener('native-state', listener) }
  },
  onAnswerShortcut: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('answer-hotkey', listener)
    return () => { ipcRenderer.removeListener('answer-hotkey', listener) }
  },
  ping: () => 'pong',
  captureScreen: () => ipcRenderer.invoke('capture-screen') as Promise<string | null>,
  onCaptureScreenShortcut: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('capture-screen-hotkey', listener)
    return () => {
      ipcRenderer.removeListener('capture-screen-hotkey', listener)
    }
  }
})
