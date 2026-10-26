import { useEffect, useState } from 'react'
import type { Candidate, CandidateMutation, DetectionState, Snapshot, SourceSpan } from '../cockpit/types'

type Props = {
  candidates: Candidate[]; detection: DetectionState; available: boolean; owner: boolean
  onDetection: (enabled: boolean, retry?: boolean) => void
  result: {commandId:string;accepted:boolean}|null
  onAction: (action: CandidateMutation) => string | undefined
  onSelect: (candidate: Candidate) => void; onView: (snapshot: Snapshot) => void
  onEditing: (ids: string[]) => void
}
const identity = (candidate: Candidate) => ({candidateId:candidate.candidateId,expectedRevision:candidate.candidateRevision})
function unionSpans(candidates: Candidate[]): SourceSpan[] {
  const spans = new Map<string,SourceSpan>()
  for (const candidate of candidates) for(const span of candidate.sourceSpans) spans.set(JSON.stringify(span),span)
  return [...spans.values()]
}
export default function QuestionInbox(props: Props) {
  const [submitted,setSubmitted]=useState<string|undefined>()
  useEffect(()=>{if(props.result&&props.result.commandId===submitted){if(props.result.accepted)setEditor(null);setSubmitted(undefined)}},[props.result,submitted])
  const [selected,setSelected]=useState<string[]>([])
  const [editor,setEditor]=useState<{action:'edit'|'split'|'merge';parents:Candidate[];words:string[]}|null>(null)
  const {detection:d}=props
  const editorKey=editor?.parents.map(p=>p.snapshot?.snapshotId).join('|') || ''
  useEffect(()=>{props.onEditing(editorKey?editorKey.split('|'):[]);return()=>props.onEditing([])},[editorKey,props.onEditing])
  const active=props.candidates.filter(c=>!['dismissed','superseded'].includes(c.state))
  const merge=props.candidates.filter(c=>selected.includes(c.candidateId)&&!['dismissed','superseded'].includes(c.state))
  const mutate=(action:'dismiss'|'undo',c:Candidate)=>props.onAction({type:'candidate_action',action,parents:[identity(c)],drafts:[]})
  return <section className="question-inbox" aria-label="Question proposals">
    <div className="detection-controls">
      <label><input type="checkbox" checked={d.enabled} disabled={!props.available||!props.owner} onChange={e=>props.onDetection(e.target.checked)}/> Suggest questions</label>
      <span role="status">{!props.available?'Question detection requires protocol v5.':!props.owner?'Read-only question inbox':d.inFlight?'Looking for possible questions…':d.enabled?d.outcome==='no_candidates'?'No questions found in the latest text.':d.outcome==='no_source'?'Waiting for finalized speech.':d.outcome==='failed'?'Detection failed.':'Question suggestions enabled.':'Question detection disabled.'}</span>
      {d.lastError?<p className="cockpit-error">{d.lastError}</p>:null}
      {d.enabled&&d.outcome==='failed'?<button disabled={!props.owner||d.inFlight} onClick={()=>props.onDetection(true,true)}>Retry detection</button>:null}
      {d.truncated?<p>Only the latest 12,000 characters of this 90-second window were considered.</p>:null}
      <p>Suggestions can misunderstand speech. Check the exact source or set your own question.</p>
      {d.model?<small>Detector: {d.model.model} · reasoning {d.model.reasoning?.applied?d.model.reasoning.effort:'not applied'}</small>:null}
    </div>
    {!active.length?<p className="empty-panel">No active proposals. Answer recent speech or use Make question.</p>:null}
    {props.candidates.map(c=><article className={`question-card state-${c.state}`} key={c.candidateId} data-candidate-id={c.candidateId}>
      <div><strong>{c.autoStatus==='pending'?'queued':c.state.replace(/_/g,' ')} · revision {c.candidateRevision}</strong><span>{c.origin==='human'?'Human wording':'Model interpretation'}</span></div>
      <p>{c.wording}</p>{c.autoStatus&&c.autoStatus!=='pending'?<small>AUTO: {c.autoStatus}</small>:null}{c.reviewReasons?.length?<small>Review flags: {c.reviewReasons.join(', ')}</small>:null}{c.reason?<p className="review-reason">Review: {c.reason}</p>:null}
      <details><summary>Exact source excerpt</summary><blockquote>{c.snapshot?.text}</blockquote><small>Source provenance checked; interpretation remains unreviewed.</small></details>
      {c.supersedes.length?<details><summary>Revision history</summary><small>Revises {c.supersedes.join(', ')}</small></details>:null}
      {c.sourceAnswerId?<small>Corrects an earlier answer · original retained</small>:null}
      <div className="question-actions"><button disabled={!c.snapshot} onClick={()=>c.snapshot&&props.onView(c.snapshot)}>View raw</button>
        {!['dismissed','superseded'].includes(c.state)?<>
          <button disabled={!props.owner} onClick={()=>props.onSelect(c)}>Use question</button>
          <button disabled={!props.owner} onClick={()=>setEditor({action:'edit',parents:[c],words:[c.wording]})}>Edit question</button>
          <button disabled={!props.owner} onClick={()=>setEditor({action:'split',parents:[c],words:[c.wording,'']})}>Split question</button>
          <button disabled={!props.owner} onClick={()=>mutate('dismiss',c)}>Dismiss question</button>
          <label><input type="checkbox" aria-label={`Merge ${c.wording}`} checked={selected.includes(c.candidateId)} disabled={!props.owner} onChange={e=>setSelected(ids=>e.target.checked?[...ids,c.candidateId]:ids.filter(id=>id!==c.candidateId))}/> Merge</label>
        </>:c.state==='dismissed'?<button disabled={!props.owner} onClick={()=>mutate('undo',c)}>Undo dismissal</button>:null}
      </div>
    </article>)}
    {merge.length>=2?<button disabled={!props.owner||merge.length>8} onClick={()=>setEditor({action:'merge',parents:merge,words:[merge.map(c=>c.wording).join(' ')]})}>Merge selected questions</button>:null}
    {editor?<section className="question-editor" aria-label="Edit question proposals">
      <strong>{editor.action} · source evidence retained</strong>
      {editor.words.map((word,index)=><label key={index}>Question {index+1}<textarea aria-label={`Question wording ${index+1}`} value={word} maxLength={2000} onChange={e=>setEditor(current=>current?{...current,words:current.words.map((w,i)=>i===index?e.target.value:w)}:current)}/></label>)}
      {editor.action==='split'&&editor.words.length<8?<button onClick={()=>setEditor({...editor,words:[...editor.words,'']})}>Add split question</button>:null}
      {props.candidates.some(c=>editor.parents.some(p=>p.candidateId===c.candidateId&&p.candidateRevision!==c.candidateRevision))?<p role="status">This question changed. Your wording is retained; cancel and reopen to use the latest revision.</p>:null}
      <button disabled={!props.owner||Boolean(submitted)||editor.words.some(w=>!w.trim())} onClick={()=>setSubmitted(props.onAction({type:'candidate_action',action:editor.action,parents:editor.parents.map(identity),drafts:editor.words.map(wording=>({wording,sourceSpans:unionSpans(editor.parents)}))}))}>Save question changes</button>
      <button onClick={()=>{setEditor(null);setSubmitted(undefined)}}>Close question editor</button>
    </section>:null}
  </section>
}
