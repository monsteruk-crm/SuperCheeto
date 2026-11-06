import React from 'react'
import {afterEach,expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {useAutoScroll} from '../use_auto_scroll'
import {requestList,initialCockpitState,cockpitReducer,type RequestRecord} from '../reducer'
const record=(answerId:string,text='text')=>({answerId,text,status:'completed'} as RequestRecord)
function Harness({records,visible=true}:{records:RequestRecord[];visible?:boolean}){
 const ref=useAutoScroll(records.map(r=>`${r.answerId}:${r.text}`).join('|'),visible)
 return <div data-testid="pane" ref={ref}>{records.map(item=><article key={item.answerId}>{item.text}</article>)}</div>
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
it('follows new cards and streamed text to the bottom even after scrolling up',()=>{
 let height=600
 vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockImplementation(()=>height)
 const {rerender}=render(<Harness records={[record('first')]}/>)
 const pane=screen.getByTestId('pane')
 expect(pane.scrollTop).toBe(600)
 pane.scrollTop=10;fireEvent.scroll(pane)
 height=900
 rerender(<Harness records={[record('first'),record('second')]}/>)
 expect(pane.scrollTop).toBe(900)
 height=1200
 rerender(<Harness records={[record('first'),record('second','streamed text')]}/>)
 expect(pane.scrollTop).toBe(1200)
})
it('catches up when a hidden page becomes visible',()=>{
 vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockReturnValue(800)
 const {rerender}=render(<Harness records={[record('first')]} visible={false}/>)
 const pane=screen.getByTestId('pane');expect(pane.scrollTop).toBe(0)
 rerender(<Harness records={[record('first')]} visible/>)
 expect(pane.scrollTop).toBe(800)
})

it('follows late content resizing and DOM growth, and disconnects observers',async()=>{
 let height=600,resize=()=>{}
 const disconnect=vi.fn()
 vi.stubGlobal('ResizeObserver',class {
  constructor(callback:()=>void){resize=callback}
  observe(){}
  disconnect=disconnect
 })
 vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockImplementation(()=>height)
 const {unmount}=render(<Harness records={[record('first')]}/>)
 const pane=screen.getByTestId('pane')
 height=850;act(()=>resize());expect(pane.scrollTop).toBe(850)
 height=1000;pane.appendChild(document.createElement('p'))
 await waitFor(()=>expect(pane.scrollTop).toBe(1000))
 disconnect.mockClear();unmount();expect(disconnect).toHaveBeenCalledOnce()
})

it('returns stable append order for old and new cards',()=>{
 const old={...record('old'),requestId:'old',removed:false},fresh={...record('new'),requestId:'new',removed:false}
 expect(requestList({...initialCockpitState,order:['old','new'],records:{old,new:fresh}}).map((item)=>item.answerId)).toEqual(['old','new'])
})

it('rejects foreign-owner content and keeps reconnect cards historical',()=>{
 let state=cockpitReducer(initialCockpitState,{type:'hello_ack',backendInstanceId:'backend',connectionId:'owner',sessionEpoch:1})
 state=cockpitReducer(state,{type:'answer_accepted',backendInstanceId:'backend',connectionId:'owner',sessionEpoch:1,requestId:'req',answerId:'answer',commandId:'cmd',snapshotId:'snapshot'})
 const foreign=cockpitReducer(state,{type:'answer_chunk',backendInstanceId:'backend',connectionId:'other',sessionEpoch:1,requestId:'req',answerId:'answer',eventSeq:1,delta:'forbidden'})
 expect(foreign).toBe(state)
 const reconnected=cockpitReducer(state,{type:'hello_ack',backendInstanceId:'backend',connectionId:'new-owner',sessionEpoch:2})
 expect(reconnected.records.req.metadata?.historical).toBe(true)
 expect(reconnected.records.req.snapshotReleased).toBe(true)
 expect(reconnected.records.req.terminal).toBe(true)
})
