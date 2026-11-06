import React, { memo, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { RequestRecord } from '../cockpit/reducer'

export type AnswerCardProps = {
  record: RequestRecord; busy?: boolean; disabled?: boolean
  onCopy: (record: RequestRecord) => void; onKeep: (record: RequestRecord) => void
  onRemove: (record: RequestRecord) => void; onCancel: (record: RequestRecord) => void; onRerun: (record: RequestRecord) => void
  onWrongQuestion?: (record: RequestRecord) => void
  onFirstVisible?: (requestId: string, instant: number) => void
  onInspect?: (answerId: string, active: boolean) => void
  onViewRaw?: (record: RequestRecord) => void
}
const plugins = [remarkGfm]
const markdownComponents = {
  a: ({href, children}: {href?: string; children?: React.ReactNode}) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({alt}: {alt?: string}) => <span className="answer-image-label">[Image: {alt || 'image reference'}]</span>
}
function AnswerCard({record, busy=false, disabled=false, onCopy,onKeep,onRemove,onCancel,onRerun,onFirstVisible,onInspect,onViewRaw,onWrongQuestion}:AnswerCardProps) {
  const article=useRef<HTMLElement>(null), detailsOpen=useRef(false)
  const frozen=record.frozenInputs,timing=record.backendTiming
  useEffect(()=>{
    if(!record.text||record.firstVisibleMs!==null||!onFirstVisible)return
    let frame:number|null=null,done=false
    const check=()=>{
      if(done||!article.current||article.current.closest('[hidden]'))return
      const rect=article.current.getBoundingClientRect(),root=article.current.closest('.answer-scroll')?.getBoundingClientRect()
      if(rect.width<=0||rect.bottom<=0||rect.top>=window.innerHeight||(root&&(rect.bottom<=root.top||rect.top>=root.bottom)))return
      done=true;onFirstVisible(record.requestId,performance.now())
    }
    frame=requestAnimationFrame(check)
    const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(()=>{frame=requestAnimationFrame(check)},{root:article.current?.closest('.answer-scroll')||null})
    if(article.current)observer?.observe(article.current)
    document.addEventListener('scroll',check,true)
    return()=>{if(frame!==null)cancelAnimationFrame(frame);observer?.disconnect();document.removeEventListener('scroll',check,true)}
  },[record.text.length,record.firstVisibleMs,record.requestId,onFirstVisible])
  const usage=record.metadata?.usage as {inputTokens?:number|null;outputTokens?:number|null;totalTokens?:number|null}|null|undefined
  disabled = disabled || Boolean(record.metadata?.historical)
  const target=frozen?.manualTarget
  const held=record.metadata?.publicationStatus==='deferred'
  const generation=String(record.metadata?.generationStatus||record.status)
  return <article ref={article} className="answer-card" data-answer-id={record.answerId} tabIndex={0} onFocus={()=>onInspect?.(record.answerId,true)} onBlur={(e)=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null)&&!detailsOpen.current)onInspect?.(record.answerId,false)}} onMouseUp={()=>{const selection=window.getSelection();if(selection&&!selection.isCollapsed&&article.current?.contains(selection.anchorNode))onInspect?.(record.answerId,true)}}>
    <div className="answer-card-badges"><span className="unreviewed-badge">{record.metadata?.origin==='auto'?'Unreviewed AUTO draft':'Unreviewed draft'}</span><span className={`answer-status status-${record.status}`}>{record.acceptanceUnknown?'Status unknown':held?generation==='running'?'Streaming · publication held':'Generation finished · publication held':record.status}</span></div>
    {record.text?<div className="answer-body answer-lead"><ReactMarkdown remarkPlugins={plugins} components={markdownComponents}>{record.text}</ReactMarkdown></div>:<p className="answer-lead">{record.status==='empty'?'No answer text returned.':record.terminal?'No answer text was received.':'Waiting for the first answer text…'}</p>}
    {record.metadata?.historical ? <p className="answer-error">Historical connection · generation inputs are no longer available here.</p> : null}
    {record.metadata?.correctedBy?<p className="review-reason">Interpretation superseded by a corrected question. Original answer retained.</p>:null}
    {record.metadata?.correctsAnswerId?<p>Corrected draft · original answer retained</p>:null}
    {record.error?<p className="answer-error" role="status">{record.error.message}</p>:null}
    <details onToggle={(e)=>{detailsOpen.current=e.currentTarget.open;onInspect?.(record.answerId,e.currentTarget.open)}}><summary>Request details</summary>
      {record.metadata?.correctsAnswerId?<p>Original answer: {String(record.metadata.correctsAnswerId)}</p>:null}
      {record.metadata?.origin==='auto'?<p>Automatic draft · settings revision {String(record.metadata.configRevision??'unavailable')}</p>:null}
      <p>{frozen?.instruction||'Effective instruction not reported.'}</p>
      <p>{target?`${target.wordingOrigin==='detector'?'Model interpretation selected by user':'Human wording'}: ${target.wording}`:'Intent inferred from frozen context; separate inference metadata not reported.'}</p>
      <div className="answer-evidence">
        <span>Source: frozen transcript · {record.snapshotId||'not reported'}</span>
        <span>Model: {record.modelSettings?.model||frozen?.model?.model||record.model||'not reported'}</span>
        <span>Reasoning: {record.modelSettings?.reasoning?.applied?record.modelSettings.reasoning.effort:'not applied / not reported'}</span>
        <span>Screenshot: {record.screenshotUsed?'included in generation':frozen?.screenshot?.reason||(frozen?.screenshot?.included?'included by request':'not included')}</span>
        <span>Token usage: {usage&&Object.values(usage).some((value)=>value!=null)?`input ${usage.inputTokens??'unavailable'} · output ${usage.outputTokens??'unavailable'} · total ${usage.totalTokens??'unavailable'}`:'not reported by this response'}</span>
        <span>Retrieval: {record.retrieval?.outcome||'pending'}</span>
        {(record.retrieval?.chunks||[]).map((chunk)=><details key={chunk.chunkId}><summary>{chunk.title} · {chunk.chunkId}</summary><p>{chunk.filePath}</p><blockquote>{chunk.excerpt}</blockquote></details>)}
        {frozen?.humanNotes?.length?<details><summary>Included human notes · not verified evidence</summary>{frozen.humanNotes.map((note)=><blockquote key={note.noteId}>{note.text}</blockquote>)}</details>:null}
        {timing?.rag?<span>Backend retrieval: {timing.rag.durationMs.toFixed(1)} ms</span>:null}
        {timing?.generation?<span>Backend generation: {timing.generation.durationMs.toFixed(1)} ms</span>:null}
        {timing?.generation?.firstDeltaMs!=null?<span>First answer delta: {timing.generation.firstDeltaMs.toFixed(1)} ms after acceptance</span>:null}
        {timing?.completedMs!=null?<span>Backend terminal: {timing.completedMs.toFixed(1)} ms after acceptance</span>:null}
        {record.clientTiming?.pressedMs!=null&&record.clientTiming.terminalReceivedMs!=null?<span>Client press to terminal: {(record.clientTiming.terminalReceivedMs-record.clientTiming.pressedMs).toFixed(1)} ms</span>:null}
      </div>
    </details>
    {record.firstVisibleMs!==null?<small>First displayed by this client{record.clientTiming?.pressedMs!=null?` · ${Math.max(0,record.firstVisibleMs-record.clientTiming.pressedMs).toFixed(0)} ms after press`:''}</small>:null}
    <div className="answer-card-actions"><button onClick={()=>onCopy(record)}>Copy</button><button disabled={busy||disabled} onClick={()=>onKeep(record)}>{record.placement==='kept'?'Move to working':'Keep'}</button>
      {!record.terminal?<button disabled={disabled} onClick={()=>onCancel(record)}>Stop</button>:null}
      <button disabled={disabled||!record.terminal||!record.snapshotId||record.snapshotReleased} onClick={()=>onRerun(record)}>Run again</button>
      <button onClick={()=>onViewRaw?.(record)}>View raw</button><button disabled={disabled||!record.snapshotId||record.snapshotReleased||Boolean(record.metadata?.correctedBy)} onClick={()=>onWrongQuestion?.(record)}>Wrong question</button><button disabled={busy||disabled||!record.terminal} onClick={()=>onRemove(record)}>Remove</button>
    </div>
  </article>
}
export default memo(AnswerCard)
