import { describe, expect, it } from 'vitest'

import {
  cockpitReducer,
  hasPendingRequests,
  initialCockpitState,
  pressToVisibleMs,
  requestList,
  type CockpitEvent,
  type CockpitState
} from '../reducer'

const BASE = {
  backendInstanceId: 'backend-1',
  connectionId: 'conn-A',
  sessionEpoch: 3
}

function accepted(overrides: Partial<Record<string, unknown>> = {}): CockpitEvent {
  return {
    type: 'answer_accepted',
    ...BASE,
    requestId: 'req-1',
    answerId: 'ans-1',
    commandId: 'cmd-1',
    snapshotId: 'snap-1',
    ...overrides
  } as CockpitEvent
}

function chunk(overrides: Partial<Record<string, unknown>> = {}): CockpitEvent {
  return {
    type: 'answer_chunk',
    ...BASE,
    requestId: 'req-1',
    answerId: 'ans-1',
    eventSeq: 1,
    delta: 'hello ',
    ...overrides
  } as CockpitEvent
}

function finished(overrides: Partial<Record<string, unknown>> = {}): CockpitEvent {
  return {
    type: 'answer_finished',
    protocolVersion: 2,
    ...BASE,
    requestId: 'req-1',
    answerId: 'ans-1',
    snapshotId: 'snap-1',
    candidateRevision: null,
    status: 'completed',
    text: 'hello world',
    eventSeq: 2,
    latencyMs: 10,
    model: 'test/model',
    screenshotUsed: false,
    retrieval: { outcome: 'no_matches', chunks: [] },
    metadata: {},
    ...overrides
  } as CockpitEvent
}

function reduce(events: CockpitEvent[], start: CockpitState = initialCockpitState): CockpitState {
  return events.reduce(cockpitReducer, start)
}

const MODEL_SETTINGS = {
  role: 'answer' as const,
  model: 'google/gemini-3.8-flash',
  requestedModel: 'google/gemini-3.8-flash',
  selectionSource: 'client' as const,
  substitutedFrom: null,
  notice: null,
  reasoning: { effort: 'low', applied: true, supportedEfforts: ['low', 'high'], source: 'client' as const },
  capabilities: {
    textInput: true,
    textOutput: true,
    imageInput: true,
    structuredOutput: true,
    reasoningEfforts: ['low', 'high'],
    certainty: 'catalog' as const
  }
}

const BACKEND_TIMING = {
  clock: 'server_monotonic' as const,
  acceptedMs: 0,
  rag: null,
  generation: null,
  completedMs: null,
  unavailable: ['rag', 'generation', 'completed']
}

function timing(overrides: Partial<Record<string, unknown>> = {}): CockpitEvent {
  return {
    type: 'answer_timing',
    ...BASE,
    requestId: 'req-1',
    answerId: 'ans-1',
    timingSeq: 1,
    timing: { backend: { ...BACKEND_TIMING, completedMs: 45.5 }, client: null },
    ...overrides
  } as CockpitEvent
}

describe('cockpit reducer (M03-T05)', () => {
  it('retains the request record until a definitive terminal event arrives', () => {
    const state = reduce([accepted(), chunk()])

    const record = state.records['req-1']
    expect(record).toBeDefined()
    expect(record.terminal).toBe(false)
    expect(record.status).toBe('running')
    expect(record.placement).toBe('working')
    expect(record.removed).toBe(false)
    expect(record.text).toBe('hello ')
    expect(hasPendingRequests(state)).toBe(true)
    expect(requestList(state)).toHaveLength(1)

    const afterChunksOnly = reduce([accepted(), chunk(), chunk({ eventSeq: 2, delta: 'world' })])
    expect(afterChunksOnly.records['req-1'].text).toBe('hello world')
    expect(afterChunksOnly.records['req-1'].terminal).toBe(false)

    const done = cockpitReducer(afterChunksOnly, finished({ text: 'hello world', eventSeq: 3 }))
    expect(done.records['req-1'].terminal).toBe(true)
    expect(done.records['req-1'].status).toBe('completed')
    expect(hasPendingRequests(done)).toBe(false)
    // The record is retained after completion, not discarded.
    expect(done.records['req-1']).toBeDefined()
  })

  it('ignores duplicate and out-of-order event sequences', () => {
    const state = reduce([
      accepted(),
      chunk({ eventSeq: 1, delta: 'a' }),
      chunk({ eventSeq: 2, delta: 'b' }),
      chunk({ eventSeq: 2, delta: 'duplicate' }),
      chunk({ eventSeq: 1, delta: 'late' })
    ])

    expect(state.records['req-1'].text).toBe('ab')
    expect(state.records['req-1'].eventSeq).toBe(2)
  })

  it('ignores events for a different answer identity', () => {
    const state = reduce([accepted(), chunk({ answerId: 'ans-other' }), finished({ answerId: 'ans-other' })])

    expect(state.records['req-1'].text).toBe('')
    expect(state.records['req-1'].terminal).toBe(false)
  })

  it('ignores events for an unknown request id', () => {
    const state = reduce([accepted(), chunk({ requestId: 'req-unknown' })])

    expect(Object.keys(state.records)).toEqual(['req-1'])
    expect(state.order).toEqual(['req-1'])
  })

  it('ignores a stale session epoch and supersedes unfinished records on a newer epoch', () => {
    const running = reduce([accepted()])

    const stale = cockpitReducer(running, chunk({ sessionEpoch: 2, delta: 'stale ' }))
    expect(stale.records['req-1'].text).toBe('')
    expect(stale.records['req-1'].terminal).toBe(false)

    const newer = cockpitReducer(running, {
      type: 'control_state',
      backendInstanceId: 'backend-1',
      connectionId: 'conn-A',
      sessionEpoch: 4
    })
    expect(newer.sessionEpoch).toBe(4)
    expect(newer.records['req-1'].terminal).toBe(true)
    expect(newer.records['req-1'].status).toBe('superseded')
    expect(hasPendingRequests(newer)).toBe(false)
  })

  it('ignores events from a different backend instance', () => {
    const running = reduce([accepted()])

    const stale = cockpitReducer(running, chunk({ backendInstanceId: 'backend-0', delta: 'old ' }))

    expect(stale.records['req-1'].text).toBe('')
  })

  it('does not let a late event rewrite a cancelled request', () => {
    const cancelled = reduce([
      accepted(),
      finished({ status: 'cancelled', text: 'partial answer', eventSeq: 2 })
    ])
    expect(cancelled.records['req-1'].status).toBe('cancelled')

    const lateChunk = cockpitReducer(cancelled, chunk({ eventSeq: 99, delta: 'late text' }))
    const lateFinish = cockpitReducer(lateChunk, finished({ status: 'completed', text: 'rewritten' }))

    expect(lateChunk.records['req-1'].text).toBe('partial answer')
    expect(lateFinish.records['req-1'].status).toBe('cancelled')
    expect(lateFinish.records['req-1'].text).toBe('partial answer')
  })

  it('takes the final text as authoritative even when chunks were missed', () => {
    const state = reduce([accepted(), finished({ text: 'complete final text', eventSeq: 5 })])

    expect(state.records['req-1'].text).toBe('complete final text')
    expect(state.records['req-1'].eventSeq).toBe(5)
  })

  it('turns a rejected offline send into a visible terminal state with no spinner', () => {
    const state = reduce([
      accepted(),
      {
        type: 'local_send_rejected',
        commandId: 'cmd-1',
        requestId: 'req-1',
        code: 'offline',
        message: 'Not connected to the backend.'
      }
    ])

    expect(state.records['req-1'].terminal).toBe(true)
    expect(state.records['req-1'].status).toBe('failed')
    expect(state.records['req-1'].error?.code).toBe('offline')
    expect(hasPendingRequests(state)).toBe(false)
  })

  it('marks an unknown acceptance without treating it as success or failure', () => {
    const state = reduce([
      accepted(),
      {
        type: 'local_command_unknown',
        commandId: 'cmd-1',
        requestId: 'req-1',
        reason: 'ack_timeout',
        message: 'No acknowledgement within five seconds; acceptance is unknown.'
      }
    ])

    expect(state.records['req-1'].acceptanceUnknown).toBe(true)
    expect(state.records['req-1'].terminal).toBe(false)
    expect(state.records['req-1'].error?.code).toBe('not_ready')
  })

  it('records request errors without discarding the record', () => {
    const state = reduce([
      accepted(),
      {
        type: 'request_error',
        protocolVersion: 2,
        ...BASE,
        requestId: 'req-1',
        answerId: 'ans-1',
        code: 'dependency',
        message: 'AI Gateway request failed'
      },
      finished({ status: 'failed', text: 'partial', eventSeq: 3 })
    ])

    expect(state.records['req-1'].error?.code).toBe('dependency')
    expect(state.records['req-1'].status).toBe('failed')
    expect(state.records['req-1'].text).toBe('partial')
  })

  it('marks every unfinished request terminal when the connection is lost', () => {
    const state = reduce([accepted(), accepted({ requestId: 'req-2', answerId: 'ans-2', commandId: 'cmd-2' })])

    const lost = cockpitReducer(state, { type: 'connection_lost' })

    expect(hasPendingRequests(lost)).toBe(false)
    expect(lost.records['req-1'].acceptanceUnknown).toBe(true)
    expect(lost.records['req-2'].status).toBe('failed')
    expect(lost.records['req-1'].error?.code).toBe('offline')
  })

  it('initialises identity from hello_ack and keeps stable append order (M05)', () => {
    const state = reduce([
      { type: 'hello_ack', ...BASE },
      accepted(),
      accepted({ requestId: 'req-2', answerId: 'ans-2', commandId: 'cmd-2' })
    ])

    expect(state.backendInstanceId).toBe('backend-1')
    expect(state.sessionEpoch).toBe(3)
    expect(requestList(state).map((record) => record.requestId)).toEqual(['req-1', 'req-2'])
  })
})

describe('answer placement and view state (M05)', () => {
  it('moves one immutable record between columns and hides removed records without changing text', () => {
    const running = reduce([accepted(), chunk()])
    const kept = cockpitReducer(running, { type: 'answer_placement', requestId: 'req-1', answerId: 'ans-1', placement: 'kept' })
    expect(kept.records['req-1'].text).toBe('hello ')
    expect(requestList(kept)[0].placement).toBe('kept')
    const removed = cockpitReducer(kept, { type: 'answer_removed', requestId: 'req-1', answerId: 'ans-1' })
    expect(requestList(removed)).toHaveLength(0)
    expect(removed.records['req-1'].text).toBe('hello ')
  })
})

describe('cockpit reducer v3 metadata (M3bis-T05)', () => {
  it('keeps the frozen model settings and client press instant from acceptance', () => {
    const state = reduce([
      accepted({
        frozenInputs: {
          instruction: 'Answer clearly.',
          mode: 'Preset',
          presetId: 'answer_question',
          humanNoteIds: [],
          includeScreenshot: false,
          model: MODEL_SETTINGS,
          screenshot: { requested: false, included: false, reason: null }
        },
        timing: {
          backend: BACKEND_TIMING,
          client: { clock: 'client_monotonic', pressedMs: 1000, firstVisibleMs: null, terminalReceivedMs: null }
        }
      })
    ])

    const record = state.records['req-1']
    expect(record.modelSettings?.model).toBe('google/gemini-3.8-flash')
    expect(record.frozenInputs?.model?.reasoning?.applied).toBe(true)
    expect(record.clientTiming?.pressedMs).toBe(1000)
    expect(record.backendTiming?.acceptedMs).toBe(0)
  })

  it('applies only newer timing sequences and never displaces content', () => {
    const state = reduce([
      accepted(),
      chunk({ eventSeq: 1, delta: 'hello ' }),
      timing({ timingSeq: 2 }),
      timing({ timingSeq: 2 }),
      timing({ timingSeq: 1, timing: { backend: { ...BACKEND_TIMING, completedMs: 1 }, client: null } })
    ])

    expect(state.records['req-1'].timingSeq).toBe(2)
    expect(state.records['req-1'].backendTiming?.completedMs).toBe(45.5)
    expect(state.records['req-1'].eventSeq).toBe(1)
    expect(state.records['req-1'].text).toBe('hello ')
  })

  it('does not let a timing update revive a cancelled record', () => {
    const state = reduce([
      accepted(),
      finished({ status: 'cancelled', text: '' }),
      timing({ timingSeq: 5 })
    ])

    const record = state.records['req-1']
    expect(record.status).toBe('cancelled')
    expect(record.terminal).toBe(true)
    expect(record.backendTiming).toBeNull()
    expect(record.timingSeq).toBe(0)
  })

  it('ignores timing for an unknown request or a different answer', () => {
    const state = reduce([
      accepted(),
      timing({ requestId: 'req-unknown' }),
      timing({ answerId: 'ans-other' })
    ])

    expect(state.records['req-unknown']).toBeUndefined()
    expect(state.records['req-1'].timingSeq).toBe(0)
  })

  it('records the first visible checkpoint once and derives press-to-visible', () => {
    const state = reduce([
      accepted({
        timing: {
          backend: BACKEND_TIMING,
          client: { clock: 'client_monotonic', pressedMs: 1000, firstVisibleMs: null, terminalReceivedMs: null }
        }
      }),
      { type: 'local_first_visible', requestId: 'req-1', firstVisibleMs: 1180 },
      { type: 'local_first_visible', requestId: 'req-1', firstVisibleMs: 9999 }
    ])

    const record = state.records['req-1']
    expect(record.firstVisibleMs).toBe(1180)
    expect(record.clientTiming?.firstVisibleMs).toBe(1180)
    expect(pressToVisibleMs(record)).toBe(180)
  })

  it('reports an unavailable press-to-visible instead of zero', () => {
    const state = reduce([accepted()])
    expect(pressToVisibleMs(state.records['req-1'])).toBeNull()
  })

  it('keeps backend and client clocks in separate fields', () => {
    const state = reduce([
      accepted({
        timing: {
          backend: { ...BACKEND_TIMING, acceptedMs: 0 },
          client: { clock: 'client_monotonic', pressedMs: 500000, firstVisibleMs: null, terminalReceivedMs: null }
        }
      }),
      finished({ timing: { backend: { ...BACKEND_TIMING, completedMs: 1210.9 }, client: null } })
    ])

    const record = state.records['req-1']
    expect(record.backendTiming?.completedMs).toBe(1210.9)
    expect(record.clientTiming?.pressedMs).toBe(500000)
    // No derived value mixes the two domains.
    expect(pressToVisibleMs(record)).toBeNull()
  })
})
