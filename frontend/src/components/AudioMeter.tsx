import React, {useEffect, useState, useSyncExternalStore} from 'react'
import {MeterStore, type StreamKind} from '../audio/meter_store'

type Props = {store: MeterStore; kind: StreamKind; source: string; compact?: boolean}
export default function AudioMeter({store,kind,source,compact=false}: Props) {
  useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [,tick] = useState(0)
  useEffect(()=>{const timer=setInterval(()=>tick((n)=>n+1),100);return ()=>clearInterval(timer)},[])
  const {state,sample,message} = store.read(kind,source)
  const level = state === 'active' || state === 'quiet' || state === 'clipping' ? sample?.level ?? 0 : 0
  const name = kind === 'mic' ? 'Microphone' : 'System audio'
  return <div className={`audio-meter ${compact?'compact-meter':''} signal-${state}`} aria-label={`${name} signal`}>
    <div className="audio-meter-label"><strong>{name}</strong><span title={source}>{source || 'No device'}</span></div>
    <div role="meter" aria-label={`${name} level`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level*100)} aria-valuetext={state} className="audio-meter-track"><span style={{width:`${level*100}%`}}/></div>
    <small title={message}>{state === 'quiet' ? 'Quiet · signal level only' : state}{message ? ` · ${message}` : ''}</small>
    {!compact && sample ? <small>RMS {sample.rms.toFixed(4)} · peak {sample.peak?.toFixed(4) ?? 'unavailable'}</small> : null}
  </div>
}
