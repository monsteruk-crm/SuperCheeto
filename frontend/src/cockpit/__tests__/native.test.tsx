import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {WindowState} from '../../../electron/window-state.cts'
import {selectPrimaryScreen, validateNativeSender, validateWindowChange, type NativeState} from '../../../electron/native-contract.cts'
const registry=vi.hoisted(()=>({transports:[] as any[]}))
vi.mock('../../ws',async()=>{const {FakeWebSocketTransport}=await import('./helpers/fakeTransport');return {WSClient:class extends FakeWebSocketTransport{constructor(url:string,handlers:any){super(url,handlers);registry.transports.push(this)}}}})
import App from '../../App'
const scope={protocolVersion:4,backendInstanceId:'b',connectionId:'c',sessionEpoch:1}
const state:NativeState={focus:false,pinned:false,shortcuts:{answer:true,capture:true},transparency:{supported:false,reason:'Opaque baseline'}}
function desk(){const result=render(<App/>),transport=registry.transports.at(-1);act(()=>{transport.emit('hello_ack',{...scope,capabilities:['assist','snapshots']});transport.emit('control_state',{...scope,isOwner:true});transport.emit('transcript_segment',{segment:{id:1,segmentKey:'e#1',audioEpoch:'e',revision:1,t0:1,t1:2,text:'What is seven plus five?',is_final:true}})});return {...result,transport}}
beforeEach(()=>{window.localStorage.clear();Object.defineProperty(window,'electronAPI',{value:undefined,configurable:true})})
afterEach(()=>vi.useRealTimers())

describe('M09 native controls',()=>{
 it('selects the primary screen by identity even when it is second, and never substitutes another screen',()=>{
  const secondary={display_id:'2'},primary={display_id:'1'}
  expect(selectPrimaryScreen([secondary,primary],'1')).toBe(primary)
  expect(selectPrimaryScreen([{display_id:''}],'1',true)).toEqual({display_id:''})
  expect(()=>selectPrimaryScreen([{display_id:''},{display_id:''}],'1',true)).toThrow()
  expect(()=>selectPrimaryScreen([secondary],'1',true)).toThrow()
  for(const sources of [[],[secondary],[{display_id:''}]])expect(()=>selectPrimaryScreen(sources,'1')).toThrow('primary display is unavailable')
 })
 it('rejects foreign windows and subframes before privileged IPC',()=>{
  const mainFrame={},win={webContents:{mainFrame}}
  expect(()=>validateNativeSender({sender:win.webContents,senderFrame:mainFrame},win)).not.toThrow()
  for(const event of [{sender:{},senderFrame:mainFrame},{sender:win.webContents,senderFrame:{}},{sender:win.webContents,senderFrame:null}])expect(()=>validateNativeSender(event,win)).toThrow('Untrusted IPC sender')
  expect(()=>validateNativeSender({sender:win.webContents,senderFrame:mainFrame},null)).toThrow()
 })
 it('rejects malformed IPC changes including unknown keys and non-booleans',()=>{
  for(const value of [null,[],{},true,{pinned:'true'},{focus:1},{opacity:.5},{pinned:true,extra:true}])expect(()=>validateWindowChange(value)).toThrow()
  expect(validateWindowChange({pinned:false,focus:true})).toEqual({pinned:false,focus:true})
 })
 it('restores geometry/maximization, clamps disconnected displays and reports actual pin state',()=>{
  let bounds={x:1400,y:30,width:1280,height:800},maximized=true,pinned=false
  const win={getBounds:()=>({...bounds}),setBounds:vi.fn(next=>{bounds=next}),isMaximized:()=>maximized,unmaximize:()=>{maximized=false},maximize:()=>{maximized=true},isFullScreen:()=>false,isAlwaysOnTop:()=>pinned,setAlwaysOnTop:(value:boolean)=>{pinned=value}}
  let area={x:1280,y:0,width:1920,height:1080}
  const model=new WindowState(win,()=>area)
  model.apply({focus:true,pinned:true});expect(bounds.width).toBe(900);expect(maximized).toBe(false)
  expect(model.read(state.shortcuts)).toEqual(expect.objectContaining({focus:true,pinned:true}))
  model.apply({focus:true});expect(win.setBounds).toHaveBeenCalledTimes(1)
  area={x:0,y:0,width:1024,height:768};model.apply({focus:false})
  expect(bounds).toEqual({x:0,y:0,width:1024,height:768});expect(maximized).toBe(true)
  model.apply({pinned:false});expect(model.read(state.shortcuts).pinned).toBe(false)
 })
 it('refuses Focus changes in full screen without changing state',()=>{
  const model=new WindowState({isFullScreen:()=>true} as any,()=>({x:0,y:0,width:1000,height:800}))
  expect(()=>model.apply({focus:true})).toThrow('Leave full screen')
 })
 it('shares the primary answer path, suppresses DOM duplicates/repeats and removes native listeners',async()=>{
  let answer=()=>{};const cleanup=vi.fn()
  Object.defineProperty(window,'electronAPI',{value:{getNativeState:async()=>state,onAnswerShortcut:(fn:()=>void)=>{answer=fn;return cleanup}},configurable:true})
  const {transport,unmount}=desk();await screen.findByText(/Answer:.*global registered/)
  fireEvent.keyDown(window,{key:'Enter',ctrlKey:true,altKey:true});expect(transport.sentCount('run_context_query')).toBe(0)
  act(()=>{answer();answer()});expect(transport.sentCount('run_context_query')).toBe(1)
  expect(transport.lastSent('run_context_query')).toEqual(expect.objectContaining({anchorSegmentKey:'e#1',windowSeconds:20}))
  unmount();expect(cleanup).toHaveBeenCalledOnce()
 })
 it('supports registration-refusal keyboard fallback and blocks Settings, dialogs and contenteditable',async()=>{
  const user=userEvent.setup(),{transport}=desk()
  await user.click(screen.getByText('Guide / profile'))
  const editor=screen.getByRole('textbox',{name:'Effective custom instruction'});editor.focus()
  fireEvent.keyDown(editor,{key:'Enter',ctrlKey:true,altKey:true});expect(transport.sentCount('run_context_query')).toBe(0)
  editor.blur();await user.click(screen.getAllByRole('button',{name:'Settings'})[0])
  fireEvent.keyDown(window,{key:'Enter',ctrlKey:true,altKey:true});expect(transport.sentCount('run_context_query')).toBe(0)
  await user.click(screen.getByRole('button',{name:'Desk'}));await user.click(screen.getByRole('button',{name:'Sound'}))
  fireEvent.keyDown(window,{key:'Enter',ctrlKey:true,altKey:true});expect(transport.sentCount('run_context_query')).toBe(0)
  await user.keyboard('{Escape}')
  const rich=document.createElement('div');rich.contentEditable='true';rich.setAttribute('contenteditable','true');rich.tabIndex=0;document.body.append(rich);rich.focus()
  fireEvent.keyDown(rich,{key:'Enter',ctrlKey:true,altKey:true});expect(transport.sentCount('run_context_query')).toBe(0);rich.remove()
  fireEvent.keyDown(window,{key:'Enter',ctrlKey:true,altKey:true,repeat:true});expect(transport.sentCount('run_context_query')).toBe(0)
  fireEvent.keyDown(window,{key:'Enter',ctrlKey:true,altKey:true});expect(transport.sentCount('run_context_query')).toBe(1)
 })
 it('provides an alternate focused key even when another app owns the global accelerator',()=>{
  const {transport}=desk()
  fireEvent.keyDown(window,{key:'Enter',altKey:true,shiftKey:true})
  expect(transport.sentCount('run_context_query')).toBe(1)
 })
 it('keeps only one pending screenshot request while the OS chooser waits',async()=>{
  let finish!:(value:string|null)=>void
  const captureScreen=vi.fn(()=>new Promise<string|null>(resolve=>{finish=resolve}))
  Object.defineProperty(window,'electronAPI',{value:{captureScreen},configurable:true})
  const user=userEvent.setup();desk();await user.click(screen.getByRole('button',{name:'Capture screen'}))
  expect(screen.getByRole('button',{name:'Waiting for screen permission…'})).toBeDisabled()
  fireEvent.keyDown(window,{key:'c',code:'KeyC',ctrlKey:true,altKey:true});expect(captureScreen).toHaveBeenCalledOnce()
  await act(async()=>finish(null));expect(screen.getByRole('button',{name:'Capture screen'})).toBeEnabled()
 })
 it('preserves panel DOM, source and layout across Focus, and surfaces pin failures',async()=>{
  let current={...state},listener=(_value:NativeState)=>{}
  const change=vi.fn(async(value:{focus?:boolean;pinned?:boolean})=>{if(value.pinned)throw new Error('Pin refused');current={...current,...value};listener(current);return current})
  Object.defineProperty(window,'electronAPI',{value:{getNativeState:async()=>current,setWindowState:change,onNativeState:(fn:typeof listener)=>{listener=fn;return()=>{}}},configurable:true})
  const user=userEvent.setup(),{container}=desk();await waitFor(()=>expect(screen.getByRole('button',{name:'Pin window'})).toBeEnabled())
  const raw=container.querySelector('.raw-panel'),answers=container.querySelector('.answers-panel')
  const before=window.localStorage.getItem('cockpit-layout.v1')
  await user.click(screen.getByRole('button',{name:'Focus answers'}))
  expect(container.querySelector('main')).toHaveClass('focus-mode');expect(container.querySelector('.raw-panel')).toBe(raw);expect(container.querySelector('.answers-panel')).toBe(answers)
  expect(container.querySelector('.cockpit-audio-header')).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'Return to Desk'}));expect(container.querySelector('.raw-panel')).toBe(raw);expect(window.localStorage.getItem('cockpit-layout.v1')).toBe(before)
  await user.click(screen.getByRole('button',{name:'Pin window'}));expect(await screen.findByRole('alert')).toHaveTextContent('Pin refused');expect(screen.getByRole('button',{name:'Pin window'})).toHaveAttribute('aria-pressed','false')
 })
})
