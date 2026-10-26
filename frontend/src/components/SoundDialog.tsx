import React, {useEffect, useRef} from 'react'
import {MeterStore, type StreamKind} from '../audio/meter_store'
import AudioMeter from './AudioMeter'

type Props = {
  sourceSelection?: Range | null
  store: MeterStore; mode: StreamKind; systemSources: string[]; micSources: string[]; systemSource: string; micSource: string
  running: boolean; enabled: boolean; refreshPending: boolean; notice: string
  onMode: (mode: StreamKind) => void; onSystemSource: (name: string) => void; onMicSource: (name: string) => void
  onRefresh: () => void; onStart: () => void; onStop: () => void; onClose: () => void
}
export default function SoundDialog(props: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(()=>{
    const previous = document.activeElement as HTMLElement | null
    const selection=window.getSelection()
    const range=props.sourceSelection || (selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null)
    const sourceNode=range?.commonAncestorContainer
    const rawRange=sourceNode && (sourceNode instanceof Element ? sourceNode : sourceNode.parentElement)?.closest('.raw-scroll') ? range : null
    const siblings = Array.from(dialog.current?.parentElement?.parentElement?.children || []).filter((node)=>node!==dialog.current?.parentElement)
    const previousInert = siblings.map((node)=>node.hasAttribute('inert'))
    siblings.forEach((node)=>node.setAttribute('inert',''))
    close.current?.focus()
    const key = (event: KeyboardEvent) => {
      if(event.key === 'Escape') {event.preventDefault();event.stopImmediatePropagation();props.onClose();return}
      if(event.key === 'Tab') {
        const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"]') || [])
        const first=nodes[0],last=nodes[nodes.length-1]
        if(event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {event.preventDefault();last?.focus()}
        else if(!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus()}
      }
      // Native Electron action callbacks are guarded separately in App.
      if(event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.altKey) {event.preventDefault();event.stopImmediatePropagation()}
    }
    document.addEventListener('keydown',key,true)
    return ()=>{document.removeEventListener('keydown',key,true);siblings.forEach((node,i)=>{if(!previousInert[i])node.removeAttribute('inert')});previous?.focus();if(rawRange?.startContainer.isConnected && rawRange.endContainer.isConnected){const selected=window.getSelection();selected?.removeAllRanges();selected?.addRange(rawRange)}}
  },[props.onClose])
  return <div className="sound-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)props.onClose()}}>
    <div className="sound-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="sound-title">
      <header><h2 id="sound-title">Sound preferences</h2><button ref={close} onClick={props.onClose} aria-label="Close Sound">Close</button></header>
      <p>Input levels are monitored while transcription is stopped. Signal level does not detect speech.</p>
      <label>Active input<select aria-label="Active input" value={props.mode} disabled={!props.enabled} onChange={(event)=>props.onMode(event.target.value as StreamKind)}><option value="system">System audio</option><option value="mic">Microphone</option></select></label>
      <div className="sound-inputs">
        <section><label>System source<select aria-label="System audio source" value={props.systemSource} disabled={!props.enabled||!props.systemSources.length} onChange={(event)=>props.onSystemSource(event.target.value)}>{!props.systemSources.length?<option value="">No system sources</option>:props.systemSources.map((source)=><option key={source}>{source}</option>)}</select></label><AudioMeter store={props.store} kind="system" source={props.systemSource}/></section>
        <section><label>Microphone source<select aria-label="Microphone audio source" value={props.micSource} disabled={!props.enabled||!props.micSources.length} onChange={(event)=>props.onMicSource(event.target.value)}>{!props.micSources.length?<option value="">No microphone sources</option>:props.micSources.map((source)=><option key={source}>{source}</option>)}</select></label><AudioMeter store={props.store} kind="mic" source={props.micSource}/></section>
      </div>
      {props.notice?<p role="status">{props.notice}</p>:null}
      <div className="sound-actions"><button disabled={!props.enabled||props.refreshPending} onClick={props.onRefresh}>{props.refreshPending?'Refreshing sources…':'Refresh sources'}</button><button disabled={!props.enabled} onClick={()=>props.onMode(props.mode==='mic'?'system':'mic')}>Switch to {props.mode==='mic'?'system audio':'microphone'}</button><button disabled={!props.enabled||(!props.running&&!(props.mode==='mic'?props.micSource:props.systemSource))} onClick={props.running?props.onStop:props.onStart}>{props.running?'Stop transcription':'Start transcription'}</button><button onClick={props.onClose}>Done</button></div>
    </div>
  </div>
}
