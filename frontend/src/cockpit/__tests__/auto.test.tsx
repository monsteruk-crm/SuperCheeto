import {beforeEach,describe,expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const registry=vi.hoisted(()=>({transports:[] as any[]}))
vi.mock('../../ws',async()=>{const {FakeWebSocketTransport}=await import('./helpers/fakeTransport');return {WSClient:class extends FakeWebSocketTransport{constructor(url:string,handlers:any){super(url,handlers);registry.transports.push(this)}}}})
import App from '../../App'
const scope={protocolVersion:6,backendInstanceId:'backend-auto',connectionId:'owner-auto',sessionEpoch:1}
const span={segmentKey:'epoch#1',audioEpoch:'epoch',revision:1,start:0,end:25,t0:1,t1:2,sourceKind:'system',sourceName:'Synthetic'}
const snapshot={snapshotId:'frozen-auto',kind:'selection',text:'explain the rollback plan',charCount:25,truncated:false,sourceSpans:[span],anchorSegmentKey:'epoch#1',createdAt:1,tentative:false}
let sequence=0
function state(transport:any,extra:Record<string,unknown>={}){act(()=>transport.emit('assistance_state',{...scope,stateSeq:++sequence,commandId:null,autoArmed:false,pauseReason:'not_armed',lastError:null,listening:true,detectionEnabled:true,holdReasons:[],configRevision:0,configurationReady:false,generationBusy:false,activeAnswerId:null,pendingCandidate:null,deferredAnswerId:null,...extra}))}
async function ackSettings(transport:any,revision=1){
 await waitFor(()=>expect(transport.lastSent('configure_auto')).toBeTruthy())
 const command=transport.lastSent('configure_auto')
 state(transport,{commandId:command.commandId,configRevision:revision,configurationReady:true})
 await waitFor(()=>expect(screen.getByRole('button',{name:'FULL AUTO'})).toBeEnabled())
 return command
}
function desk(){const result=render(<App/>);const transport=registry.transports.at(-1);act(()=>{transport.emit('hello_ack',{...scope,capabilities:['assist','snapshots','candidates','full_auto','manual_targets']});transport.emit('control_state',{...scope,isOwner:true});transport.emit('transcript_segment',{segment:{id:1,segmentKey:span.segmentKey,audioEpoch:'epoch',revision:1,t0:1,t1:2,text:snapshot.text,is_final:true}})});state(transport);return {...result,transport}}
function autoAnswer(transport:any){act(()=>{transport.emit('snapshot_created',{...scope,commandId:'automatic-command',snapshot});transport.emit('answer_accepted',{...scope,commandId:'automatic-command',requestId:'auto-r1',answerId:'auto-a1',snapshotId:snapshot.snapshotId,origin:'auto',configRevision:1,generationStatus:'running',publicationStatus:'live',frozenInputs:{instruction:'Answer',manualTarget:{targetId:'auto-target',sourceSnapshotId:snapshot.snapshotId,wording:'Should we roll back?',wordingOrigin:'detector'}}});transport.emit('answer_chunk',{...scope,requestId:'auto-r1',answerId:'auto-a1',eventSeq:1,delta:'Original partial answer'})})}
beforeEach(()=>{sequence=0;window.localStorage.clear();Object.defineProperty(window,'electronAPI',{value:undefined,configurable:true})})

describe('M08 owned AUTO controls and holds',()=>{
 it('holds before settings submission, waits for authoritative configuration, and arms only explicitly',async()=>{
  const user=userEvent.setup(),{transport}=desk()
  await waitFor(()=>expect(transport.lastSent('configure_auto')).toBeTruthy())
  const configure=transport.lastSent('configure_auto');const index=transport.sent.indexOf(configure)
  expect(transport.sent.slice(0,index).some((m:any)=>m.type==='interaction_state'&&m.holdReasons?.includes('configuration_pending'))).toBe(true)
  expect(screen.getByRole('button',{name:'FULL AUTO'})).toBeDisabled()
  act(()=>transport.emit('command_ack',{...scope,commandId:configure.commandId,accepted:true}))
  expect(screen.getByRole('button',{name:'FULL AUTO'})).toBeDisabled()
  await ackSettings(transport)
  expect(transport.sentCount('set_auto')).toBe(0)
  await user.click(screen.getByRole('button',{name:'FULL AUTO'}))
  expect(transport.lastSent('set_auto')).toMatchObject({armed:true,expectedConfigRevision:1,mode:'full_auto'})
  state(transport,{autoArmed:true,configRevision:1,configurationReady:true,pauseReason:'ready'})
  expect(screen.getByRole('button',{name:'FULL AUTO'})).toHaveAttribute('aria-pressed','true')
  await user.click(screen.getByRole('button',{name:'Pause AUTO'}));expect(transport.lastSent('set_auto').armed).toBe(false)
 })
 it('does not persist/re-arm AUTO after reconnect and rejects stale scheduler state',async()=>{
  const user=userEvent.setup(),{transport}=desk();await ackSettings(transport)
  await user.click(screen.getByRole('button',{name:'FULL AUTO'}));state(transport,{autoArmed:true,configRevision:1,configurationReady:true})
  const keys=Object.keys(window.localStorage);expect(keys.every(k=>!k.includes('auto-armed'))).toBe(true)
  const count=transport.sentCount('set_auto')
  act(()=>transport.emit('status',{state:'disconnected'}))
  act(()=>{transport.emit('hello_ack',{...scope,connectionId:'new-owner',sessionEpoch:2,capabilities:['assist','snapshots','candidates','full_auto']});transport.emit('control_state',{...scope,connectionId:'new-owner',sessionEpoch:2,isOwner:true})})
  state(transport,{autoArmed:true,stateSeq:999})
  expect(screen.getByRole('button',{name:'Assist'})).toHaveAttribute('aria-pressed','true')
  expect(transport.sentCount('set_auto')).toBe(count)
  state(transport,{connectionId:'new-owner',sessionEpoch:2,stateSeq:1,listening:true})
  await user.click(screen.getByRole('button',{name:'Sound'}))
  expect(screen.getByRole('button',{name:'Stop transcription'})).toBeEnabled()
  expect(screen.queryByRole('button',{name:'Start transcription'})).not.toBeInTheDocument()
 })
 it('reports raw selection and target holds; Sound alone creates no hold',async()=>{
  const user=userEvent.setup(),{container,transport}=desk();await ackSettings(transport)
  await user.click(screen.getByRole('button',{name:'Sound'}));expect(transport.lastSent('interaction_state').holdReasons).toEqual([])
  await user.keyboard('{Escape}')
  const row=container.querySelector('.raw-segment')!
  act(()=>{const selection=window.getSelection()!;const range=document.createRange();range.selectNodeContents(row);selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'))})
  await waitFor(()=>expect(transport.lastSent('interaction_state').holdReasons).toContain('raw_selection'))
  await user.click(screen.getByRole('button',{name:'Make question'}));const command=transport.lastSent('create_snapshot')
  act(()=>transport.emit('snapshot_created',{...scope,commandId:command.commandId,snapshot}))
  await waitFor(()=>expect(transport.lastSent('interaction_state').holdReasons).toContain('target'))
 })
 it('holds Settings and profile/note editors without pausing capture or starting an answer',async()=>{
  const user=userEvent.setup(),{transport}=desk();await ackSettings(transport)
  await user.click(screen.getByText('Guide / profile'))
  await waitFor(()=>expect(transport.lastSent('interaction_state').holdReasons).toContain('profile_editor'))
  await user.click(screen.getByText('Guide / profile'))
  await user.click(screen.getByText('Human context notes · 0/50'));await user.type(screen.getByRole('textbox',{name:'New human context note'}),'A human claim')
  expect(transport.lastSent('interaction_state').holdReasons).toContain('note_editor')
  await user.click(screen.getAllByRole('button',{name:'Settings'})[0])
  expect(transport.lastSent('interaction_state').holdReasons).toContain('settings')
  expect(transport.sentCount('stop_transcription')).toBe(0);expect(transport.sentCount('run_snapshot_query')).toBe(0)
 })
 it('retains rejected settings and requires an explicit configuration retry',async()=>{
  const user=userEvent.setup(),{transport}=desk();await waitFor(()=>expect(transport.lastSent('configure_auto')).toBeTruthy())
  const command=transport.lastSent('configure_auto')
  act(()=>transport.emit('command_ack',{...scope,commandId:command.commandId,accepted:false,message:'Unsupported model.'}))
  state(transport,{configRevision:0,configurationReady:false})
  expect(screen.getByRole('button',{name:'FULL AUTO'})).toBeDisabled();expect(transport.sentCount('configure_auto')).toBe(1)
  await user.click(screen.getByRole('button',{name:'Retry AUTO settings'}));await waitFor(()=>expect(transport.sentCount('configure_auto')).toBe(2))
 })
 it('shows deferred execution separately, retains partial text and offers manual takeover',async()=>{
  const user=userEvent.setup(),{container,transport}=desk();await ackSettings(transport);autoAnswer(transport)
  await waitFor(()=>expect(screen.getByText('Original partial answer')).toBeInTheDocument())
  const card=container.querySelector('[data-answer-id="auto-a1"]')
  act(()=>transport.emit('answer_state',{...scope,requestId:'auto-r1',answerId:'auto-a1',stateSeq:1,placement:'working',removed:false,snapshotAvailable:true,reason:'publication_deferred',origin:'auto',generationStatus:'completed',publicationStatus:'deferred',configRevision:1}))
  state(transport,{autoArmed:true,configRevision:1,configurationReady:true,holdReasons:['target'],pauseReason:'hold',generationBusy:false,deferredAnswerId:'auto-a1'})
  expect(screen.getByText('Unreviewed AUTO draft')).toBeInTheDocument()
  expect(card?.querySelector('.answer-status')).toHaveTextContent('Generation finished · publication held')
  expect(container.querySelector('[data-answer-id="auto-a1"]')).toBe(card)
  await user.click(screen.getByRole('button',{name:'Answer now'}));expect(transport.lastSent('run_context_query')).toBeTruthy()
  expect(transport.lastSent('cancel_answer')).toBeUndefined()
 })
 it('lets an unflagged wrong AUTO draft use the existing correction flow',async()=>{
  const user=userEvent.setup(),{transport}=desk();await ackSettings(transport);autoAnswer(transport)
  await user.click(screen.getByRole('button',{name:'Wrong question'}))
  fireEvent.change(screen.getByRole('textbox',{name:'Question to answer'}),{target:{value:'The intended question'}})
  await user.click(screen.getByRole('button',{name:'Correct and draft answer'}))
  expect(transport.lastSent('candidate_action')).toMatchObject({action:'correct',sourceAnswerId:'auto-a1',drafts:[{wording:'The intended question'}]})
  expect(screen.getByText('Unreviewed AUTO draft')).toBeInTheDocument()
 })
 it('disables arming when listening/detection/ownership are missing',async()=>{
  const {transport}=desk();await ackSettings(transport)
  state(transport,{configRevision:1,configurationReady:true,listening:false})
  expect(screen.getByRole('button',{name:'FULL AUTO'})).toBeDisabled()
  state(transport,{configRevision:1,configurationReady:true,detectionEnabled:false})
  expect(screen.getByRole('button',{name:'FULL AUTO'})).toBeDisabled()
  act(()=>transport.emit('control_state',{...scope,isOwner:false}))
  expect(screen.getByRole('button',{name:'FULL AUTO'})).toBeDisabled()
 })
})
