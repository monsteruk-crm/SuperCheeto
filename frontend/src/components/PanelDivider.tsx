import React, { useEffect, useRef } from 'react'
import { resizePair } from '../cockpit/layout'
export default function PanelDivider({ index, label, layout, compact, available, onChange }: {index: number; label: string; layout: number[]; compact: boolean; available: number; onChange: (layout: number[]) => void}) {
  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRef.current?.(), [])
  if (compact && index === 1) return null
  return <div className="cockpit-divider" role="separator" aria-label={label} aria-orientation="vertical" aria-valuenow={Math.round(layout[index])} aria-valuemin={0} aria-valuemax={100} tabIndex={0}
    onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onChange(resizePair(layout, index, (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 40 : 10), available, compact)) } }}
    onPointerDown={(event) => {
      if (event.button !== 0) return
      event.preventDefault(); stopRef.current?.()
      event.currentTarget.focus()
      const start = event.clientX, weights = [...layout]
      const move = (e: PointerEvent) => onChange(resizePair(weights, index, e.clientX - start, available, compact))
      const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); stopRef.current = null }
      stopRef.current = stop
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop, {once: true}); window.addEventListener('pointercancel', stop, {once: true})
    }} />
}
