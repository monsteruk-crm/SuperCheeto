import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { RequestRecord } from '../cockpit/reducer'
import type { Snapshot, SourceSpan } from '../cockpit/types'
import type { TargetDraft } from '../cockpit/target'
import type { Preset, TranscriptSegment } from '../types'
import { clampTracks, DEFAULT_LAYOUT, PANEL_MINIMUMS } from '../cockpit/layout'
import { useReadingAnchor } from '../cockpit/use_reading_anchor'
import AnswerCard from './AnswerCard'
import RawTranscript from './RawTranscript'
import PanelDivider from './PanelDivider'
import QuestionInbox from './QuestionInbox'
import AutoControls from './AutoControls'
import type { Candidate, CandidateMutation, DetectionState, AutoState, HoldReason } from '../cockpit/types'

type Note = { noteId: string; text: string; includeInFutureContext: boolean }
type Props = {
  autoState:AutoState; autoAvailable:boolean; autoSettingsReady:boolean; autoSettingsError:boolean
  onAutoMode:(armed:boolean)=>void; onRetryAutoSettings:()=>void
  questionResult: {commandId:string;accepted:boolean}|null
  candidates: Candidate[]; detection: DetectionState; detectionAvailable: boolean
  onDetection: (enabled: boolean, retry?: boolean) => void; onCandidateAction: (action: CandidateMutation) => string | undefined
  onUseCandidate: (candidate: Candidate) => void; onSaveQuestion: () => void; onWrongQuestion: (record: RequestRecord) => void
  headerAudio?: React.ReactNode
  segments: TranscriptSegment[]; liveText: string; selectedText: string; windowSeconds: 20 | 45 | 90
  setWindowSeconds: (value: 20 | 45 | 90) => void; onAnswer: () => void; onPinMoment: () => void
  screenshotDataUrl: string | null; includeScreenshot: boolean; canCaptureScreenshot: boolean
  onCaptureScreen: () => void; onClearScreenshot: () => void; onToggleScreenshot: (value: boolean) => void
  canAnswer: boolean; onClear: () => void; onSelectText: (text: string, spans: SourceSpan[]) => void
  records: RequestRecord[]; keptIds: string[]; keptCount: number; pendingAnswerIds: string[]
  humanNotes: Note[]; pendingNoteIds: string[]; onNoteSave: (action: 'create' | 'edit' | 'remove', note: Note) => void
  onCopy: (record: RequestRecord) => void; onKeep: (record: RequestRecord) => void; onRemove: (record: RequestRecord) => void
  onCancel: (record: RequestRecord) => void; onRerun: (record: RequestRecord) => void
  connected: boolean; isOwner: boolean; status: string; errorMessage: string | null; model: string
  onSettings: () => void; layout: number[]; onLayoutChange: (layout: number[]) => void
  draft: TargetDraft | null; onDraftChange: (text: string) => void; onMakeQuestion: () => void; onClearTarget: () => void
  pinnedMoments: Snapshot[]; onUseMoment: (snapshot: Snapshot) => void; onRemoveMoment: (snapshot: Snapshot) => void
  sourceSnapshots: Record<string, Snapshot>; onFirstVisible: (requestId: string, instant: number) => void
  onInteraction: (snapshotIds: string[], editorIds: string[], answerIds: string[], holdReasons?:HoldReason[]) => void
  profileMode: 'Preset' | 'Custom'; onProfileMode: (mode: 'Preset' | 'Custom') => void
  presets: Preset[]; selectedPresetId: string; onPreset: (id: string) => void
  customInstruction: string; onCustomInstruction: (text: string) => void
  models: string[]; onModel: (model: string) => void; onRefreshModels: () => void
  onRunPreset: () => void; onRunCustom: () => void
  pendingSource: boolean; unknownCommands: string[]; onCheckStatus: () => void; onDismissUnknown: () => void
}

function HumanNotes({ notes, pendingIds, owner, save, onEditing }: {notes: Note[]; pendingIds: string[]; owner: boolean; save: Props['onNoteSave'];onEditing:(editing:boolean)=>void}) {
  const [focused,setFocused]=useState(false)
  const [text, setText] = useState(''), [include, setInclude] = useState(false)
  const [editing, setEditing] = useState<string | null>(null), [edited, setEdited] = useState('')
  const noteHold=Boolean(focused||text.trim()||editing)
  useEffect(()=>{onEditing(noteHold);return()=>onEditing(false)},[noteHold,onEditing])
  const [createdId, setCreatedId] = useState<string | null>(null)
  const submitted = useRef<{id: string; text: string} | null>(null)
  const submittedEdit = useRef<{id: string; text: string} | null>(null)
  useEffect(() => {
    const current = submitted.current
    if (current && notes.some((note) => note.noteId === current.id)) {
      if (text === current.text) { setText(''); setInclude(false) }
      submitted.current = null; setCreatedId(null)
    }
    const edit = submittedEdit.current
    if (edit && notes.some((note) => note.noteId === edit.id && note.text === edit.text)) {
      if (edited === edit.text) { setEditing(null); setEdited('') }
      submittedEdit.current = null
    }
  }, [notes, text, edited])
  return <details className="human-notes" onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocused(false)}}><summary>Human context notes · {notes.length}/50</summary>
    <p>Notes are user-provided context, not verified evidence. Choose which notes future answers may include.</p>
    {notes.map((note) => <article className="human-note" key={note.noteId}>
      {editing === note.noteId ? <textarea aria-label="Edit human context note" value={edited} maxLength={4000} onChange={(e) => setEdited(e.target.value)} /> : <blockquote>{note.text}</blockquote>}
      <label><input type="checkbox" checked={note.includeInFutureContext} disabled={!owner || pendingIds.includes(note.noteId)} onChange={(e) => save('edit', {...note, includeInFutureContext: e.target.checked})} /> Include in future answers</label>
      {editing === note.noteId ? <><button disabled={!owner || !edited.trim() || pendingIds.includes(note.noteId)} onClick={() => { submittedEdit.current = {id: note.noteId, text: edited.trim()}; save('edit', {...note, text: edited.trim()}) }}>Save note</button><button onClick={() => setEditing(null)}>Cancel edit</button></> : <button disabled={!owner || pendingIds.includes(note.noteId)} onClick={() => {setEditing(note.noteId);setEdited(note.text)}}>Edit</button>}
      <button disabled={!owner || pendingIds.includes(note.noteId)} onClick={() => save('remove', note)}>Remove</button>
    </article>)}
    <label>New note<textarea aria-label="New human context note" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} /></label>
    <label><input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} /> Include in future answers</label>
    <button disabled={!owner || notes.length >= 50 || !text.trim() || Boolean(createdId && pendingIds.includes(createdId))} onClick={() => {const id=crypto.randomUUID(); submitted.current={id,text:text.trim()};setCreatedId(id);save('create',{noteId:id,text:text.trim(),includeInFutureContext:include})}}>Add note</button>
  </details>
}

function AnswerColumn({ records, label, props, onInspect, onView, onReading }: {records: RequestRecord[]; label: string; props: Props; onInspect: (id: string, active: boolean) => void; onView: (record: RequestRecord) => void; onReading: (id: string | null) => void}) {
  const anchor = useReadingAnchor(records)
  return <>
    {anchor.newCount ? <button className="new-drafts" onClick={anchor.showLatest}>Show {anchor.newCount} new drafts</button> : null}
    <div ref={anchor.ref} className="cockpit-scroll answer-scroll" role="region" aria-label={label} onScroll={() => {anchor.capture();const root=anchor.ref.current;const top=root?.getBoundingClientRect().top || 0;const first=[...(root?.querySelectorAll<HTMLElement>('[data-answer-id]') || [])].find((e)=>e.getBoundingClientRect().bottom>top);onReading(first?.dataset.answerId || null)}}>
      {records.length ? records.map((record) => <AnswerCard key={record.requestId} record={record} busy={props.pendingAnswerIds.includes(record.answerId)} disabled={!props.connected || !props.isOwner} onCopy={props.onCopy} onKeep={props.onKeep} onRemove={props.onRemove} onCancel={props.onCancel} onRerun={props.onRerun} onFirstVisible={props.onFirstVisible} onInspect={onInspect} onViewRaw={onView} onWrongQuestion={props.onWrongQuestion} />) : <p className="empty-panel">{label === 'Working answers' ? 'No answer drafts yet. Answer the latest speech or select transcript text.' : 'Kept answers stay here. Keeping does not mean verified.'}</p>}
    </div>
  </>
}

export default function CockpitDesk(props: Props) {
  const {segments, draft, layout}=props
  const grid=useRef<HTMLDivElement>(null)
  const [width,setWidth]=useState(typeof window==='undefined'?1440:window.innerWidth-32)
  const [viewportWidth,setViewportWidth]=useState(typeof window==='undefined'?1440:window.innerWidth)
  const [profileEditing,setProfileEditing]=useState(false)
  const [noteEditing,setNoteEditing]=useState(false)
  const [questionEditors,setQuestionEditors]=useState<string[]>([])
  const [viewSource,setViewSource]=useState<Snapshot|null>(null)
  const [inspected,setInspected]=useState<string[]>([]), [reading,setReading]=useState<Record<string,string|null>>({})
  const compact=viewportWidth<1260
  useEffect(()=>{const update=()=>{setViewportWidth(window.innerWidth);setWidth(grid.current?.clientWidth || window.innerWidth-32)};update();window.addEventListener('resize',update);const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);if(grid.current)observer?.observe(grid.current);return()=>{window.removeEventListener('resize',update);observer?.disconnect()}},[])
  const available=width-(compact?8:24)
  const columns=compact?undefined:clampTracks(layout,available,PANEL_MINIMUMS).map((n)=>`${n}px`).join(' ')
  const top=clampTracks(layout.slice(0,2),available,PANEL_MINIMUMS.slice(0,2)),bottom=clampTracks(layout.slice(2),available,PANEL_MINIMUMS.slice(2))
  const inspectionKey=[...new Set([...inspected,...Object.values(reading).filter((id):id is string=>Boolean(id))])].sort().join('|')
  const sourceId=draft?.snapshot.snapshotId || ''
  useEffect(()=>{props.onInteraction([...new Set([...(sourceId?[sourceId]:[]),...questionEditors])],[...(draft?[draft.targetId]:[]),...questionEditors.map(id=>`question:${id}`)],inspectionKey?inspectionKey.split('|'):[],[...(props.selectedText?['raw_selection' as HoldReason]:[]),...(draft?['target' as HoldReason]:[]),...(questionEditors.length?['question_editor' as HoldReason]:[]),...(profileEditing?['profile_editor' as HoldReason]:[]),...(noteEditing?['note_editor' as HoldReason]:[])])},[sourceId,draft?.targetId,inspectionKey,props.onInteraction,questionEditors,Boolean(props.selectedText),profileEditing,noteEditing])
  const onInspect=useCallback((id:string,active:boolean)=>setInspected((ids)=>active?(ids.includes(id)?ids:[...ids,id]):ids.filter((item)=>item!==id)),[])
  const working=props.records.filter((r)=>r.placement!=='kept'),kept=props.records.filter((r)=>r.placement==='kept')
  const active=props.records.find((r)=>!r.terminal)
  const viewAnswer=useCallback((record:RequestRecord)=>setViewSource(props.sourceSnapshots[record.snapshotId || ''] || null),[props.sourceSnapshots])
  const readWorking=useCallback((id:string|null)=>setReading((r)=>r.working===id?r:{...r,working:id}),[])
  const readKept=useCallback((id:string|null)=>setReading((r)=>r.kept===id?r:{...r,kept:id}),[])
  const divider=(index:number,label:string)=><PanelDivider index={index} label={label} layout={layout} compact={compact} available={available} onChange={props.onLayoutChange}/>
  return <main className="cockpit">
    <header className="cockpit-session-bar">
      <div><strong>Live Helper</strong><span>{props.connected?props.status:'Offline · no requests will replay'}</span><span>{props.isOwner?'Control enabled':'Read-only'}</span></div>
      <div className="cockpit-audio-header">{props.headerAudio}</div>
      <div><span>{props.profileMode === 'Custom' ? 'Custom instruction active' : props.presets.find((p)=>p.id===props.selectedPresetId)?.label}</span>
        <details className="guide" onToggle={e=>setProfileEditing(e.currentTarget.open)}><summary>Guide / profile</summary><div className="guide-body">
          <label>Mode<select aria-label="Profile mode" value={props.profileMode} onChange={(e)=>props.onProfileMode(e.target.value as 'Preset'|'Custom')}><option>Preset</option><option>Custom</option></select></label>
          <label>Preset<select aria-label="Guide preset" value={props.selectedPresetId} onChange={(e)=>props.onPreset(e.target.value)}>{props.presets.map((p)=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label>Custom instruction<textarea aria-label="Effective custom instruction" value={props.customInstruction} onChange={(e)=>props.onCustomInstruction(e.target.value)}/></label>
          <label>Model<select aria-label="Answer model" value={props.model} onChange={(e)=>props.onModel(e.target.value)}>{props.models.length?props.models.map((model)=><option key={model}>{model}</option>):<option value={props.model}>{props.model||'No models loaded'}</option>}</select></label>
          <button onClick={props.onRefreshModels}>Refresh models</button><button disabled={!props.canAnswer} onClick={props.onRunPreset}>Run preset</button><button disabled={!props.canAnswer||!props.customInstruction.trim()} onClick={props.onRunCustom}>Run custom</button>
        </div></details>
        <button onClick={()=>{const raw=Math.min(45,layout[0]+5),rest=(100-raw)/(100-layout[0]);props.onLayoutChange([raw,...layout.slice(1).map((n)=>n*rest)])}}>Transcript +</button>
        <button onClick={()=>props.onLayoutChange([...DEFAULT_LAYOUT])}>Reset layout</button><button onClick={props.onSettings}>Settings</button>
      </div>
    </header>
    <AutoControls state={props.autoState} available={props.autoAvailable} owner={props.isOwner} connected={props.connected} settingsReady={props.autoSettingsReady} settingsError={props.autoSettingsError} onMode={props.onAutoMode} onRetry={props.onRetryAutoSettings}/>
    <div ref={grid} className={`cockpit-grid ${compact?'compact':''}`} style={{gridTemplateColumns:columns,['--top-left' as string]:`${top[0]}px`,['--top-right' as string]:`${top[1]}px`,['--bottom-left' as string]:`${bottom[0]}px`,['--bottom-right' as string]:`${bottom[1]}px`} as React.CSSProperties}>
      <section className="cockpit-panel raw-panel"><header><h2>Raw transcript</h2><span>Original words · {segments.length} finalized segments</span></header><RawTranscript segments={segments} liveText={props.liveText} onSelect={props.onSelectText} viewSource={viewSource}/>{divider(0,'Resize raw transcript panel')}</section>
      <section className="cockpit-panel inbox-panel"><header><h2>Possible questions</h2><span>Fallible proposals · manual context remains available</span></header>
        <div className="cockpit-scroll inbox-scroll"><QuestionInbox candidates={props.candidates} detection={props.detection} available={props.detectionAvailable} owner={props.isOwner&&props.connected} onDetection={props.onDetection} onAction={props.onCandidateAction} result={props.questionResult} onSelect={props.onUseCandidate} onView={setViewSource} onEditing={setQuestionEditors}/>
          {props.selectedText && !draft?<div className="selection-actions"><blockquote>{props.selectedText}</blockquote><button disabled={!props.canAnswer||props.pendingSource} onClick={props.onAnswer}>Draft answer from selection</button><button disabled={!props.canAnswer||props.pendingSource} onClick={props.onMakeQuestion}>Make question</button><button onClick={props.onClearTarget}>Clear selection</button></div>:null}
          {draft?<section className="target-editor" aria-label="Manual target editor"><strong>{draft.correctsAnswerId?"Correct the question · original answer retained":draft.wordingOrigin==='detector'?"Model interpretation · frozen source retained":"Human wording · frozen source retained"}</strong><textarea aria-label="Question to answer" maxLength={24000} value={draft.wording} onChange={(e)=>props.onDraftChange(e.target.value)}/><div>{props.detectionAvailable?<button disabled={!props.canAnswer||!draft.wording.trim()||props.pendingSource} onClick={props.onSaveQuestion}>{draft.correctsAnswerId?"Correct and draft answer":"Save question to inbox"}</button>:null}<button disabled={!props.canAnswer||!draft.wording.trim()||Boolean(draft.correctsAnswerId)||Boolean(draft.candidateId&&draft.wording!==draft.savedWording)} onClick={props.onAnswer}>Draft answer</button><button onClick={()=>props.onDraftChange(draft.originalText)}>Reset to source</button><button onClick={()=>setViewSource(draft.snapshot)}>View raw</button><button onClick={props.onClearTarget}>Clear target</button></div><details><summary>Original source</summary><blockquote>{draft.originalText}</blockquote></details></section>:null}
          {!draft&&!props.selectedText?<button disabled={!props.canAnswer||props.pendingSource} onClick={props.onMakeQuestion}>Make question</button>:null}
          {props.pinnedMoments.length?<details className="pinned-moments"><summary>Pinned moments · {props.pinnedMoments.length}/50</summary>{props.pinnedMoments.map((snapshot)=><article key={snapshot.snapshotId}><blockquote>{snapshot.text}</blockquote><button onClick={()=>props.onUseMoment(snapshot)}>Use moment</button><button onClick={()=>setViewSource(snapshot)}>View raw</button><button onClick={()=>props.onRemoveMoment(snapshot)}>Remove moment</button></article>)}</details>:null}
          <HumanNotes notes={props.humanNotes} pendingIds={props.pendingNoteIds} owner={props.isOwner} save={props.onNoteSave} onEditing={setNoteEditing}/>
        </div>{divider(1,'Resize possible questions panel')}
      </section>
      <section className="cockpit-panel answers-panel"><header><h2>Working answers</h2><span>{working.length} drafts · maximum 50</span></header><AnswerColumn records={working} label="Working answers" props={props} onInspect={onInspect} onView={viewAnswer} onReading={readWorking}/>{divider(2,'Resize working answers panel')}</section>
      <section className="cockpit-panel kept-panel"><header><h2>Kept / previous</h2><span>{kept.length} kept · maximum 50</span></header><AnswerColumn records={kept} label="Kept answers" props={props} onInspect={onInspect} onView={viewAnswer} onReading={readKept}/></section>
    </div>
    <section className="cockpit-action-bar" aria-label="Answer controls">
      <button className="primary" disabled={!active&&(!props.canAnswer||props.pendingSource||(props.profileMode==='Custom'&&!props.customInstruction.trim())||Boolean(draft&&!draft.wording.trim()))} onClick={()=>active&&active.metadata?.origin!=='auto'?props.onCancel(active):props.onAnswer()}>{active?.metadata?.origin==='auto'?'Answer now':active?'Stop answer':draft?'Answer current target':props.selectedText?'Draft answer from selection':'Answer recent speech'}</button>
      {active?.metadata?.origin==='auto'?<button onClick={()=>props.onCancel(active)}>Stop AUTO answer</button>:null}
      <label>Recent context<select aria-label="Recent context window" value={props.windowSeconds} onChange={(e)=>props.setWindowSeconds(Number(e.target.value) as 20|45|90)}><option value={20}>20 seconds</option><option value={45}>45 seconds</option><option value={90}>90 seconds</option></select></label>
      <button disabled={!props.canAnswer||props.pendingSource} onClick={props.onPinMoment}>Pin this moment</button>
      <button disabled={!props.canCaptureScreenshot} onClick={props.onCaptureScreen}>Capture screen</button>
      <label><input type="checkbox" aria-label="Include screenshot" checked={props.includeScreenshot} disabled={!props.screenshotDataUrl} onChange={(e)=>props.onToggleScreenshot(e.target.checked)}/> Include screenshot</label>
      {props.screenshotDataUrl?<span className="screenshot-preview"><img src={props.screenshotDataUrl} alt="Captured screen preview"/><button onClick={props.onClearScreenshot}>Remove screenshot</button></span>:null}
      <button disabled={props.pendingSource} onClick={props.onClear}>Clear transcript</button>
      {props.errorMessage?<p className="cockpit-error" role="status">{props.errorMessage}</p>:null}
      {props.unknownCommands.length?<div><button onClick={props.onCheckStatus}>Check pending status</button><button onClick={props.onDismissUnknown}>Dismiss unknown operation</button></div>:null}
    </section>
  </main>
}
