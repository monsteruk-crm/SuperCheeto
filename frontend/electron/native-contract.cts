export type ShortcutAction = 'answer' | 'capture'
export type NativeState = {
  pinned: boolean
  focus: boolean
  shortcuts: Record<ShortcutAction, boolean>
  transparency: { supported: false; reason: string }
}
export type NativeBridge = {
  getNativeState: () => Promise<NativeState>
  setWindowState: (change: { pinned?: boolean; focus?: boolean }) => Promise<NativeState>
  onNativeState: (callback: (state: NativeState) => void) => () => void
  onAnswerShortcut: (callback: () => void) => () => void
}
export function validateWindowChange(value: unknown): { pinned?: boolean; focus?: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid window state')
  const entries = Object.entries(value)
  if (!entries.length || entries.some(([key, item]) => !['pinned', 'focus'].includes(key) || typeof item !== 'boolean')) throw new Error('Invalid window state')
  return value
}

export function validateNativeSender(event: {sender: unknown; senderFrame: unknown}, win: {webContents: {mainFrame: unknown}} | null) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Untrusted IPC sender')
}

// Source order is not display identity, especially with multiple monitors/portals.
export function selectPrimaryScreen<T extends {display_id: string}>(sources: T[], primaryId: string, portalSelection = false): T {
  const source = sources.find(item => item.display_id === primaryId)
  if (source) return source
  // Electron31's PipeWire delegated chooser returns one user-approved source,
  // possibly without a display ID. This is consent selection, not array order.
  if (portalSelection && sources.length === 1 && sources[0].display_id === '') return sources[0]
  throw new Error('The approved primary display is unavailable for capture. Choose only your main screen in the system sharing dialog.')
}
