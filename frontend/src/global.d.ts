export {}

declare global {
  interface Window {
    electronAPI?: {
      ping: () => string
      captureScreen: () => Promise<string | null>
      onCaptureScreenShortcut: (callback: () => void) => () => void
    }
  }
}
