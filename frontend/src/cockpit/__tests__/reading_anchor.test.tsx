import React from 'react'
import {afterEach,expect,it,vi} from 'vitest'
import {fireEvent,render,screen} from '@testing-library/react'
import {useReadingAnchor} from '../use_reading_anchor'
import {requestList,initialCockpitState,cockpitReducer,type RequestRecord} from '../reducer'
let firstHeight=300
const record=(answerId:string,text='text')=>({answerId,text,status:'completed'} as RequestRecord)
function Harness({records}:{records:RequestRecord[]}){const anchor=useReadingAnchor(records);return <><div data-testid="pane" ref={anchor.ref} onScroll={anchor.capture}>{records.map((item)=><article key={item.answerId} data-answer-id={item.answerId}>{item.text}</article>)}</div>{anchor.newCount?<button onClick={anchor.showLatest}>{anchor.newCount} new drafts</button>:null}</>}
afterEach(()=>vi.restoreAllMocks())
it('keeps the same reading card at the same offset as an earlier streamed card grows and new drafts arrive',()=>{
 firstHeight=300
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
  const pane=this.dataset.testid==='pane'?this:document.querySelector<HTMLElement>('[data-testid="pane"]')
  const scroll=pane?.scrollTop||0
  const top=this.dataset.testid==='pane'?100:this.dataset.answerId==='first'?100-scroll:100+firstHeight-scroll
  const height=this.dataset.testid==='pane'?300:this.dataset.answerId==='first'?firstHeight:300
  return {x:0,y:top,top,left:0,right:400,bottom:top+height,width:400,height,toJSON(){return {}}} as DOMRect
 })
 const {rerender}=render(<Harness records={[record('first'),record('reading')]}/>)
 const pane=screen.getByTestId('pane');pane.scrollTop=350;fireEvent.scroll(pane)
 firstHeight=500
 rerender(<Harness records={[record('first','a longer streamed answer'),record('reading'),record('new')]}/>)
 expect(pane.scrollTop).toBe(550)
 expect((pane.querySelector('[data-answer-id="reading"]') as HTMLElement).getBoundingClientRect().top).toBe(50)
 expect(screen.getByRole('button',{name:'1 new drafts'})).toBeInTheDocument()
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
