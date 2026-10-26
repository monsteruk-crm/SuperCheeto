import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
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
