import type { NativeBridge } from '../electron/native-contract.cts'
export {}

declare global {
  interface Window {
    electronAPI?: Partial<NativeBridge> & {
      ping: () => string
      captureScreen: () => Promise<string | null>
      onCaptureScreenShortcut: (callback: () => void) => () => void
    }
  }
}
