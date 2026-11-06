import React, { useEffect, useRef, useState } from 'react'
import type { NativeState, ShortcutAction } from '../../electron/native-contract.cts'

export function shortcutBlocked() {
  return Boolean(document.querySelector('[role="dialog"]') || document.activeElement?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))
}

// The registered native handler owns the key when registration succeeded.
// DOM delivery is used only when no global handler owns that accelerator.
export function useActionShortcut(action: ShortcutAction, run: () => void, enabled: boolean, registered: boolean) {
  const current = useRef({run, enabled, registered})
  current.current = {run, enabled, registered}
  useEffect(() => {
    let last = -Infinity
    const invoke = () => {
      const now = performance.now()
      if (!current.current.enabled || shortcutBlocked() || now-last < 300) return
      last = now
      current.current.run()
    }
    const bridge = window.electronAPI
    const unsubscribe = action === 'answer' ? bridge?.onAnswerShortcut?.(invoke) : bridge?.onCaptureScreenShortcut?.(invoke)
    const key = (event: KeyboardEvent) => {
      const matches = action === 'answer' ? event.key === 'Enter' : event.code === 'KeyC' || event.key.toLowerCase() === 'c'
      const local = event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey
      const global = (event.ctrlKey || event.metaKey) && event.altKey && !event.shiftKey
      if (!matches || (!local && !global)) return
      if (!current.current.enabled || shortcutBlocked()) return
      event.preventDefault()
      if (!event.repeat && (local || !current.current.registered)) invoke()
    }
    window.addEventListener('keydown', key)
    return () => {unsubscribe?.();window.removeEventListener('keydown', key)}
  }, [action])
}

export function useNativeWindow() {
  const [state, setState] = useState<NativeState | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    let alive = true, received = false
    const unsubscribe = window.electronAPI?.onNativeState?.(value => {received=true;if(alive)setState(value)})
    window.electronAPI?.getNativeState?.().then(value => {if(alive&&!received)setState(value)}).catch(err => {if(alive)setError(String(err))})
    return () => {alive=false;unsubscribe?.()}
  }, [])
  const change = async (value: {pinned?: boolean; focus?: boolean}) => {
    if (pending) return
    if (!window.electronAPI?.setWindowState) {
      // Browser preview supports the layout; native pinning remains unavailable.
      if (value.focus !== undefined) setState(current => ({pinned:false, shortcuts:{answer:false,capture:false}, transparency:{supported:false,reason:'Native window controls require Electron.'}, ...current, focus:value.focus!}))
      return
    }
    setPending(true);setError('')
    try {setState(await window.electronAPI.setWindowState(value))} catch(err) {setError(String(err))} finally {setPending(false)}
  }
  return {state, pending, error, change}
}
export function NativeControls({native}: {native: ReturnType<typeof useNativeWindow>}) {
  const {state, pending, error, change} = native
  return <div className="native-controls">
    <button aria-pressed={state?.pinned || false} disabled={pending || !window.electronAPI?.setWindowState} onClick={()=>void change({pinned:!state?.pinned})}>Pin window</button>
    <button aria-pressed={state?.focus || false} disabled={pending} onClick={()=>void change({focus:!state?.focus})}>{state?.focus?'Return to Desk':'Focus answers'}</button>
    <details><summary>Window / shortcuts{state && (!state.shortcuts.answer || !state.shortcuts.capture)?' · global shortcut unavailable':''}</summary><div role="status">
      <p>Answer: Ctrl/Command+Alt+Enter · {state?.shortcuts.answer?'global registered':'focused keyboard and button available'}</p>
      <p>Focused fallbacks: Alt+Shift+Enter answers · Alt+Shift+C captures.</p>
      <p>Capture: Ctrl/Command+Alt+C · {state?.shortcuts.capture?'global registered':'focused keyboard and button available'}</p>
      <p>{state?.transparency.reason || 'Opaque window. Native status unavailable outside Electron.'}</p>
    </div></details>
    {error?<span role="alert">{error}</span>:null}
  </div>
}
