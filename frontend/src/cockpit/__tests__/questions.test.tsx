import {beforeEach,describe,expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const registry=vi.hoisted(()=>({transports:[] as any[]}))
vi.mock('../../ws',async()=>{const {FakeWebSocketTransport}=await import('./helpers/fakeTransport');return {WSClient:class extends FakeWebSocketTransport{constructor(url:string,handlers:any){super(url,handlers);registry.transports.push(this)}}}})
import App from '../../App'
const scope={protocolVersion:5,backendInstanceId:'backend-five',connectionId:'owner-five',sessionEpoch:1}
const span={segmentKey:'epoch#1',audioEpoch:'epoch',revision:1,start:0,end:25,t0:1,t1:2,sourceKind:'system',sourceName:'Synthetic'}
const snapshot={snapshotId:'frozen-1',kind:'selection',text:'explain the rollback plan',charCount:25,truncated:false,sourceSpans:[span],anchorSegmentKey:'epoch#1',createdAt:1,tentative:false}
const candidate=(extra:Record<string,unknown>={})=>({candidateId:'c1',candidateRevision:1,state:'proposed',wording:'Should we roll back?',reason:null,origin:'detector',sourceSpans:[span],supersedes:[],snapshot,sourceAnswerId:null,...extra})
function desk(){const result=render(<App/>);const transport=registry.transports.at(-1);act(()=>{transport.emit('hello_ack',{...scope,capabilities:['assist','snapshots','candidates','manual_targets']});transport.emit('control_state',{...scope,isOwner:true});transport.emit('transcript_segment',{segment:{id:1,segmentKey:span.segmentKey,audioEpoch:'epoch',revision:1,t0:1,t1:2,text:snapshot.text,is_final:true}})});return {...result,transport}}
function state(transport:any,candidates:any[],seq=1,extra={}){act(()=>transport.emit('candidate_state',{...scope,stateSeq:seq,candidates,revisionCount:candidates.length,...extra}))}
function detection(transport:any,extra={}){act(()=>transport.emit('detector_state',{...scope,stateSeq:1,enabled:true,inFlight:false,dirty:false,lastError:null,outcome:'no_candidates',truncated:false,lastRevision:1,model:null,...extra}))}
beforeEach(()=>{window.localStorage.clear();Object.defineProperty(window,'electronAPI',{value:undefined,configurable:true})})

describe('M07 question/correction workflows',()=>{
 it('distinguishes failure/empty/disabled and keeps manual answering available without partial-driven commands',async()=>{
  const user=userEvent.setup(),{transport}=desk();detection(transport)
  expect(screen.getByText('No questions found in the latest text.')).toBeInTheDocument()
  detection(transport,{stateSeq:2,outcome:'failed',lastError:'Model unavailable'})
  await user.click(screen.getByRole('button',{name:'Retry detection'}));expect(transport.lastSent('set_detection')).toMatchObject({enabled:true,retry:true})
  await user.click(screen.getByRole('checkbox',{name:'Suggest questions'}));expect(transport.lastSent('set_detection')).toMatchObject({enabled:false})
  const count=transport.sent.length
  act(()=>{transport.emit('transcript_live',{text:'partial',t:2});for(let i=0;i<30;i++)transport.emit('audio_level',{rms:.1,peak:.2,level:.5,t:i})})
  expect(transport.sent.length).toBe(count)
  await user.click(screen.getByRole('button',{name:'Answer recent speech'}));expect(transport.lastSent('run_context_query')).toBeTruthy()
 })
 it('shows source/review provenance, selects a proposal, views raw and submits exact revision',async()=>{
  const user=userEvent.setup(),{container,transport}=desk();state(transport,[candidate({state:'needs_review',reason:'Unclear referent'})])
  expect(screen.getByText('Review: Unclear referent')).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'Use question'}))
  expect(screen.getByRole('textbox',{name:'Question to answer'})).toHaveValue('Should we roll back?')
  expect(screen.getByText('Model interpretation · frozen source retained')).toBeInTheDocument()
  await user.click(within(screen.getByRole('region',{name:'Manual target editor'})).getByRole('button',{name:'View raw'}))
  expect(container.querySelector('.raw-segment.raw-highlight')).toBeTruthy()
  await user.click(screen.getByRole('button',{name:'Draft answer'}))
  expect(transport.lastSent('run_snapshot_query')).toMatchObject({candidateId:'c1',candidateRevision:1,snapshotId:'frozen-1',manualTarget:{wording:'Should we roll back?'}})
 })
 it('preserves edited wording during late candidate revisions and sends expected revision',async()=>{
  const user=userEvent.setup(),{transport}=desk();state(transport,[candidate()])
  await user.click(screen.getByRole('button',{name:'Edit question'}));fireEvent.change(screen.getByRole('textbox',{name:'Question wording 1'}),{target:{value:'My wording'}})
  state(transport,[candidate({candidateRevision:2,wording:'Late model wording'})],2)
  expect(screen.getByRole('textbox',{name:'Question wording 1'})).toHaveValue('My wording')
  await user.click(screen.getByRole('button',{name:'Save question changes'}))
  expect(transport.lastSent('candidate_action')).toMatchObject({action:'edit',parents:[{candidateId:'c1',expectedRevision:1}],drafts:[{wording:'My wording'}]})
  act(()=>transport.emit('command_ack',{...scope,commandId:transport.lastSent('candidate_action').commandId,accepted:false,message:'Question changed.'}))
  expect(screen.getByRole('textbox',{name:'Question wording 1'})).toHaveValue('My wording')
 })
 it('closes an editor only after a matching authoritative save result',async()=>{
  const user=userEvent.setup(),{transport}=desk();state(transport,[candidate()])
  await user.click(screen.getByRole('button',{name:'Edit question'}));fireEvent.change(screen.getByRole('textbox',{name:'Question wording 1'}),{target:{value:'Saved human wording'}})
  await user.click(screen.getByRole('button',{name:'Save question changes'}));const sent=transport.lastSent('candidate_action')
  act(()=>transport.emit('command_ack',{...scope,commandId:sent.commandId,accepted:true}))
  expect(screen.getByRole('textbox',{name:'Question wording 1'})).toHaveValue('Saved human wording')
  state(transport,[candidate({candidateRevision:2,origin:'human',wording:'Saved human wording'})],2,{commandId:sent.commandId,changedCandidateIds:['c1']})
  expect(screen.queryByRole('textbox',{name:'Question wording 1'})).not.toBeInTheDocument()
 })
 it('supports split, merge, dismissal and undo without generating answers',async()=>{
  const user=userEvent.setup(),{transport}=desk();state(transport,[candidate(),candidate({candidateId:'c2',wording:'How long?'})])
  await user.click(screen.getAllByRole('button',{name:'Split question'})[0]);fireEvent.change(screen.getByRole('textbox',{name:'Question wording 2'}),{target:{value:'What are the risks?'}})
  await user.click(screen.getByRole('button',{name:'Save question changes'}));expect(transport.lastSent('candidate_action').drafts).toHaveLength(2)
  await user.click(screen.getByRole('button',{name:'Close question editor'}))
  await user.click(screen.getByRole('checkbox',{name:'Merge Should we roll back?'}));await user.click(screen.getByRole('checkbox',{name:'Merge How long?'}))
  await user.click(screen.getByRole('button',{name:'Merge selected questions'}));await user.click(screen.getByRole('button',{name:'Save question changes'}))
  expect(transport.lastSent('candidate_action')).toMatchObject({action:'merge',parents:[{candidateId:'c1',expectedRevision:1},{candidateId:'c2',expectedRevision:1}]})
  await user.click(screen.getByRole('button',{name:'Close question editor'}));await user.click(screen.getAllByRole('button',{name:'Dismiss question'})[0])
  expect(transport.lastSent('candidate_action').action).toBe('dismiss')
  state(transport,[candidate({state:'dismissed',candidateRevision:2})],2)
  await user.click(screen.getByRole('button',{name:'Undo dismissal'}));expect(transport.lastSent('candidate_action')).toMatchObject({action:'undo',parents:[{candidateId:'c1',expectedRevision:2}]})
  expect(transport.sentCount('run_snapshot_query')).toBe(0)
 })
 it('creates a question from missed raw context and selects it only after authoritative acceptance',async()=>{
  const user=userEvent.setup(),{transport}=desk();await user.click(screen.getByRole('button',{name:'Make question'}))
  const create=transport.lastSent('create_snapshot');act(()=>transport.emit('snapshot_created',{...scope,commandId:create.commandId,snapshot}))
  fireEvent.change(screen.getByRole('textbox',{name:'Question to answer'}),{target:{value:'Human request'}})
  await user.click(screen.getByRole('button',{name:'Save question to inbox'}));const save=transport.lastSent('candidate_action')
  expect(save).toMatchObject({action:'create',parents:[],drafts:[{wording:'Human request',sourceSpans:[span]}]})
  state(transport,[candidate({origin:'human',state:'user_set',wording:'Human request'})],1,{commandId:save.commandId,changedCandidateIds:['c1']})
  expect(screen.getByRole('textbox',{name:'Question to answer'})).toHaveValue('Human request')
  await user.click(screen.getByRole('button',{name:'Draft answer'}));expect(transport.lastSent('run_snapshot_query').candidateId).toBe('c1')
 })
 it('corrects an unflagged wrong answer while retaining it and creates a source-linked new draft',async()=>{
  const user=userEvent.setup(),{transport}=desk()
  act(()=>{transport.emit('snapshot_created',{...scope,commandId:'old',snapshot});transport.emit('answer_accepted',{...scope,commandId:'old',requestId:'r1',answerId:'a1',snapshotId:snapshot.snapshotId,frozenInputs:{instruction:'Answer',manualTarget:null}});transport.emit('answer_finished',{...scope,requestId:'r1',answerId:'a1',snapshotId:snapshot.snapshotId,eventSeq:1,status:'completed',text:'Unflagged wrong answer',metadata:{}})})
  await user.click(screen.getByRole('button',{name:'Wrong question'}));fireEvent.change(screen.getByRole('textbox',{name:'Question to answer'}),{target:{value:'Correct intent'}})
  await user.click(screen.getByRole('button',{name:'Correct and draft answer'}));const command=transport.lastSent('candidate_action')
  expect(command).toMatchObject({action:'correct',sourceAnswerId:'a1',parents:[],drafts:[{wording:'Correct intent',sourceSpans:[span]}]})
  state(transport,[candidate({origin:'human',wording:'Correct intent',sourceAnswerId:'a1'})],1,{commandId:command.commandId,changedCandidateIds:['c1']})
  const run=transport.lastSent('run_snapshot_query');expect(run).toMatchObject({snapshotId:snapshot.snapshotId,candidateId:'c1',manualTarget:{wording:'Correct intent'}})
  expect(screen.getByText('Unflagged wrong answer')).toBeInTheDocument()
  act(()=>transport.emit('answer_state',{...scope,requestId:'r1',answerId:'a1',stateSeq:1,placement:'working',removed:false,snapshotAvailable:true,reason:'wrong_question',correctedBy:'c1'}))
  expect(screen.getByText(/Interpretation superseded/)).toBeInTheDocument()
  act(()=>transport.emit('answer_accepted',{...scope,commandId:run.commandId,requestId:'r2',answerId:'a2',snapshotId:snapshot.snapshotId,correctsAnswerId:'a1',candidateId:'c1',candidateRevision:1,frozenInputs:{instruction:'Answer',manualTarget:run.manualTarget}}))
  expect(screen.queryByRole('textbox',{name:'Question to answer'})).not.toBeInTheDocument()
  expect(screen.getByText(/Corrected draft · original answer retained/)).toBeInTheDocument()
 })
 it('rejects stale scoped inbox state and preserves human editor text',async()=>{
  const user=userEvent.setup(),{transport}=desk();state(transport,[candidate()]);await user.click(screen.getByRole('button',{name:'Use question'}))
  fireEvent.change(screen.getByRole('textbox',{name:'Question to answer'}),{target:{value:'Newer human edit'}})
  state(transport,[candidate({wording:'Stale'})],2,{sessionEpoch:0})
  state(transport,[candidate({wording:'Reordered'})],1)
  expect(screen.getByRole('textbox',{name:'Question to answer'})).toHaveValue('Newer human edit')
  expect(screen.queryByText('Stale')).not.toBeInTheDocument();expect(screen.queryByText('Reordered')).not.toBeInTheDocument()
 })
})
