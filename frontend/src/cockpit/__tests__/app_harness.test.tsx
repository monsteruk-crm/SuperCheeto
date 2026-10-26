import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The shared registry lets this test reach the fake transport that App built.
const registry = vi.hoisted(() => ({ transports: [] as any[] }))

vi.mock('../../ws', async () => {
  const { FakeWebSocketTransport } = await import('./helpers/fakeTransport')
  return {
    WSClient: class extends FakeWebSocketTransport {
      constructor(url: string, handlers: any) {
        super(url, handlers)
        registry.transports.push(this)
      }
    }
  }
})

import App from '../../App'

const UI_PREFERENCES_KEY = 'ui-preferences.v1'

describe('existing selection/transcript action through the harness', () => {
  it('appends a finalized transcript row and clears it through the real App seam', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    const transport = registry.transports[0]
    expect(transport).toBeTruthy()

    // Connection bootstrap still asks the backend for shared state.
    act(() => transport.emit('hello_ack', { protocolVersion: 3, backendInstanceId: 'backend-test', connectionId: 'connection-test', sessionEpoch: 1, capabilities: ['assist', 'snapshots', 'timing', 'model_readiness'] }))
    act(() => transport.emit('control_state', { backendInstanceId: 'backend-test', connectionId: 'connection-test', sessionEpoch: 1, isOwner: true }))
    await waitFor(() => {
      expect(transport.sentCount('get_audio_sources')).toBeGreaterThan(0)
    })
    expect(transport.sentCount('get_models')).toBeGreaterThan(0)
    expect(transport.sentCount('get_model_details')).toBeGreaterThan(0)
    expect(transport.sentCount('rag_list')).toBeGreaterThan(0)

    act(() => {
      transport.emit('transcript_segment', {
        segment: {
          id: 1,
          t0: 0,
          t1: 1.5,
          text: 'we should ship the release on friday',
          is_final: true,
          source_kind: 'system',
          source_name: 'Test Monitor'
        }
      })
    })

    expect((await screen.findAllByText('we should ship the release on friday')).length).toBeGreaterThan(0)
    expect(container.querySelector('.raw-segment')).not.toBeNull()

    // Clear raw transcript through the cockpit action.
    await user.click(screen.getByRole('button', { name: 'Clear transcript' }))

    await waitFor(() => {
      expect(screen.queryByText('we should ship the release on friday')).not.toBeInTheDocument()
    })
    expect(transport.lastSent('clear_transcript')).toBeTruthy()
  })
})

describe('a lost connection leaves a visible unknown state (M03 gate)', () => {
  it('clears the running indicator and reports unknown acceptance on disconnect', async () => {
    const user = userEvent.setup()
    render(<App />)
    const transport = registry.transports[registry.transports.length - 1]

    act(() => {
      transport.emit('transcript_segment', {
        segment: {
          id: 7,
          t0: 0,
          t1: 1.5,
          text: 'should we roll back first',
          is_final: true,
          source_kind: 'system',
          source_name: 'Test Monitor'
        }
      })
    })
    // Select the row so a query can be started from the existing UI.
    const rows = await screen.findAllByText('should we roll back first')
    const row = rows[0]
    act(() => {
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(row)
      selection?.removeAllRanges()
      selection?.addRange(range)
    })

    act(() => {
      transport.emit('query_state', { running: true, requestId: 'req-1' })
    })

    act(() => {
      transport.emit('status', { state: 'disconnected' })
    })

    await waitFor(() => {
      expect(screen.getAllByText(/Connection lost: the answer status is unknown/i).length).toBeGreaterThan(0)
    })
    expect(transport.lastSent('run_query')).toBeUndefined()
  })
})

describe('manual cockpit answer records (M05)', () => {
  it('pauses transcript following and counts incoming finalized segments', async () => {
    const user = userEvent.setup()
    render(<App />)
    const transport = registry.transports[registry.transports.length - 1]
    act(() => {
      transport.emit('hello_ack', { protocolVersion: 3, backendInstanceId: 'backend-follow', connectionId: 'owner-follow', sessionEpoch: 8, capabilities: ['assist', 'snapshots', 'timing', 'model_readiness'] })
      transport.emit('control_state', { protocolVersion: 3, backendInstanceId: 'backend-follow', connectionId: 'owner-follow', sessionEpoch: 8, isOwner: true })
      transport.emit('transcript_segment', { segment: { id: 20, segmentKey: 'audio-follow#20', audioEpoch: 'audio-follow', revision: 1, t0: 1, t1: 2, text: 'First segment', is_final: true } })
    })
    await user.click(screen.getByRole('button', { name: 'Pause following' }))
    act(() => transport.emit('transcript_segment', { segment: { id: 21, segmentKey: 'audio-follow#21', audioEpoch: 'audio-follow', revision: 2, t0: 2, t1: 3, text: 'Second segment', is_final: true } }))
    expect(await screen.findByRole('button', { name: 'Resume live · 1 new' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Resume live · 1 new' }))
    expect(screen.getByRole('button', { name: 'Pause following' })).toBeInTheDocument()
  })

  it('persists notes only after acknowledgement and includes only explicitly selected notes', async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    render(<App />)
    const transport = registry.transports[registry.transports.length - 1]
    act(() => {
      transport.emit('hello_ack', { protocolVersion: 3, backendInstanceId: 'backend-notes', connectionId: 'owner-notes', sessionEpoch: 7, capabilities: ['assist', 'snapshots', 'timing', 'model_readiness'] })
      transport.emit('control_state', { protocolVersion: 3, backendInstanceId: 'backend-notes', connectionId: 'owner-notes', sessionEpoch: 7, isOwner: true })
      transport.emit('transcript_segment', { segment: { id: 11, segmentKey: 'audio-11#11', audioEpoch: 'audio-11', revision: 1, t0: 1, t1: 2, text: 'what is our rollback order', is_final: true } })
    })
    await user.type(screen.getByRole('textbox', { name: 'New human context note' }), 'Notify the release owner first.')
    await user.click(screen.getByRole('checkbox', { name: 'Include in future answers' }))
    await user.click(screen.getByRole('button', { name: 'Add note' }))
    const noteCommand = transport.lastSent('context_note_action')
    expect(noteCommand?.action).toBe('create')
    const noteId = noteCommand?.noteId as string
    act(() => transport.emit('command_ack', { commandId: noteCommand?.commandId, accepted: true }))
    expect(JSON.parse(window.localStorage.getItem('cockpit-human-notes.v1') || '[]')).toEqual([
      expect.objectContaining({ noteId, text: 'Notify the release owner first.', includeInFutureContext: true })
    ])
    const noteEditor = screen.getByRole('textbox', { name: 'New human context note' })
    await user.type(noteEditor, 'Keep this draft if rejected.')
    await user.click(screen.getByRole('button', { name: 'Add note' }))
    const rejectedCreate = transport.lastSent('context_note_action')
    act(() => transport.emit('command_ack', { commandId: rejectedCreate?.commandId, accepted: false, message: 'Note limit reached.' }))
    expect(await screen.findByRole('textbox', { name: 'New human context note' })).toHaveValue('Keep this draft if rejected.')
    await user.click(screen.getByRole('button', { name: 'Answer recent speech' }))
    expect(transport.lastSent('run_context_query')?.humanNoteIds).toEqual([noteId])
  })

  it('reruns by server-owned answer identity after the current screenshot changes', async () => {
    const user=userEvent.setup()
    const captureScreen=vi.fn().mockResolvedValueOnce('data:image/png;base64,b3JpZ2luYWw=').mockResolvedValueOnce('data:image/png;base64,bmV3LWltYWdl')
    Object.defineProperty(window,'electronAPI',{value:{captureScreen},configurable:true})
    const {unmount}=render(<App />), transport=registry.transports[registry.transports.length-1]
    const scope={protocolVersion:4,backendInstanceId:'backend-rerun',connectionId:'owner-rerun',sessionEpoch:6}
    act(()=>{
      transport.emit('hello_ack',{...scope,capabilities:['assist','snapshots','timing','model_readiness','answer_rerun']})
      transport.emit('control_state',{...scope,isOwner:true})
      transport.emit('transcript_segment',{segment:{id:10,segmentKey:'audio-10#10',audioEpoch:'audio-10',revision:1,t0:1,t1:2,text:'what should we do next',is_final:true}})
    })
    await user.click(screen.getByRole('button',{name:'Capture screen'}))
    await user.click(screen.getByRole('button',{name:'Answer recent speech'}))
    const original=transport.lastSent('run_context_query')
    expect(original?.screenshotDataUrl).toBe('data:image/png;base64,b3JpZ2luYWw=')
    act(()=>{
      transport.emit('answer_accepted',{...scope,requestId:'req-rerun',answerId:'ans-rerun',commandId:original?.commandId,snapshotId:'snap-rerun',frozenInputs:{instruction:'Answer clearly.',mode:'Preset',presetId:'answer_question',model:null,screenshot:{requested:true,included:true,reason:null},humanNoteIds:[]}})
      transport.emit('answer_finished',{...scope,requestId:'req-rerun',answerId:'ans-rerun',snapshotId:'snap-rerun',eventSeq:1,status:'completed',text:'Original answer',retrieval:{outcome:'no_documents',chunks:[]},metadata:{}})
    })
    await user.click(screen.getByRole('button',{name:'Capture screen'}))
    await user.click(screen.getByRole('button',{name:'Run again'}))
    expect(transport.lastSent('rerun_answer')?.sourceAnswerId).toBe('ans-rerun')
    expect(transport.lastSent('rerun_answer')?.screenshotDataUrl).toBeUndefined()
    expect(captureScreen).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('freezes the exact selected transcript offsets', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const transport = registry.transports[registry.transports.length - 1]
    act(() => {
      transport.emit('hello_ack', { protocolVersion: 3, backendInstanceId: 'backend-selection', connectionId: 'owner-selection', sessionEpoch: 2, capabilities: ['assist', 'snapshots', 'timing', 'model_readiness'] })
      transport.emit('control_state', { protocolVersion: 3, backendInstanceId: 'backend-selection', connectionId: 'owner-selection', sessionEpoch: 2, isOwner: true })
      transport.emit('transcript_segment', { segment: { id: 9, segmentKey: 'audio-9#9', audioEpoch: 'audio-9', revision: 1, t0: 1, t1: 2, text: 'please 😀 check the release notes', is_final: true } })
    })
    const row = container.querySelector('.raw-segment') as HTMLElement
    const text = row.firstChild as Text
    const range = document.createRange()
    range.setStart(text, 10)
    range.setEnd(text, 15)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    fireEvent.mouseUp(row)
    await user.click(container.querySelector('.cockpit-action-bar .primary') as HTMLElement)
    const command = transport.lastSent('create_snapshot')
    expect(command?.kind).toBe('selection')
    expect(command?.sourceSpans).toEqual([expect.objectContaining({ segmentKey: 'audio-9#9', start: 9, end: 14 })])
  })

  it('freezes a recent snapshot then shows streaming text in a stable draft card', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const transport = registry.transports[registry.transports.length - 1]
    act(() => {
      transport.emit('hello_ack', { protocolVersion: 3, backendInstanceId: 'backend-cockpit', connectionId: 'owner-cockpit', sessionEpoch: 4, capabilities: ['assist', 'snapshots', 'timing', 'model_readiness'] })
      transport.emit('control_state', { protocolVersion: 3, backendInstanceId: 'backend-cockpit', connectionId: 'owner-cockpit', sessionEpoch: 4, isOwner: true })
      transport.emit('transcript_segment', { segment: { id: 8, segmentKey: 'audio-8#8', audioEpoch: 'audio-8', revision: 2, t0: 3, t1: 4, text: 'what is our deployment rollback plan', is_final: true } })
    })
    await user.click(screen.getByRole('button', { name: 'Answer recent speech' }))
    const contextCommand = transport.lastSent('run_context_query')
    expect(contextCommand?.anchorSegmentKey).toBe('audio-8#8')
    expect(contextCommand?.windowSeconds).toBe(20)
    expect(transport.lastSent('create_snapshot')).toBeUndefined()
    act(() => transport.emit('answer_accepted', { protocolVersion: 3, backendInstanceId: 'backend-cockpit', connectionId: 'owner-cockpit', sessionEpoch: 4, requestId: 'req-cockpit', answerId: 'ans-cockpit', commandId: 'cmd-run', snapshotId: 'snap-cockpit', frozenInputs: { instruction: 'Answer clearly.', mode: 'Preset', presetId: 'answer_question', model: null, screenshot: { requested: false, included: false, reason: null }, humanNoteIds: [], includeScreenshot: false } }))
    act(() => transport.emit('answer_chunk', { protocolVersion: 3, backendInstanceId: 'backend-cockpit', connectionId: 'owner-cockpit', sessionEpoch: 4, requestId: 'req-cockpit', answerId: 'ans-cockpit', eventSeq: 1, delta: '**Use** the rollback playbook.\n\n<script>window.untrusted = true</script>\n\n![remote](https://example.invalid/tracking.png)' }))
    await waitFor(() => expect(container.querySelector('.answer-body')?.textContent).toContain('Use the rollback playbook.'))
    expect(screen.getByText('Use', { selector: 'strong' })).toBeInTheDocument()
    expect(container.querySelector('.answer-body script')).toBeNull()
    expect(container.querySelector('.answer-body img')).toBeNull()
    expect(screen.getByText('Unreviewed draft')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    const keepCommand = transport.lastSent('answer_action')
    expect(keepCommand?.action).toBe('keep')
    expect(screen.getByRole('button', { name: 'Keep' })).toBeDisabled()
    act(() => transport.emit('command_ack', { commandId: keepCommand?.commandId, accepted: false, message: 'At most 50 answers can be kept.' }))
    expect(container.querySelector('.cockpit-action-bar .cockpit-error')).toHaveTextContent('At most 50 answers can be kept.')
    expect(container.querySelector('.kept-panel')?.textContent).not.toContain('Use the rollback playbook.')
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    const delayedKeepCommand = transport.lastSent('answer_action')
    act(() => transport.emit('command_status', { commandId: delayedKeepCommand?.commandId, status: 'accepted' }))
    await waitFor(() => expect(container.querySelector('.kept-panel')?.textContent).toContain('Use the rollback playbook.'))
  })
})

describe('existing Settings action through the harness', () => {
  it('persists the screenshot-inclusion preference when toggled from Settings', async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getAllByRole('button', { name: 'Settings' })[0])

    expect(await screen.findByRole('heading', { name: 'Query Settings' })).toBeInTheDocument()

    const toggle = screen.getByRole('checkbox', { name: /send captured screenshot with query/i })
    expect(toggle).not.toBeChecked()

    await user.click(toggle)

    await waitFor(() => {
      const stored = window.localStorage.getItem(UI_PREFERENCES_KEY)
      expect(stored).toBeTruthy()
      expect(JSON.parse(stored as string).includeScreenshotInQuery).toBe(true)
    })
  })
})
