import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACK_TIMEOUT_MS, WSClient } from '../../ws'

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  sent: Array<Record<string, any>> = []
  onopen: ((event?: unknown) => void) | null = null
  onclose: ((event?: unknown) => void) | null = null
  onerror: ((event?: unknown) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({})
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.({})
  }

  receive(payload: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  lastSent(type: string): Record<string, any> | undefined {
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      if (this.sent[i].type === type) return this.sent[i]
    }
    return undefined
  }

  sentOfType(type: string): Array<Record<string, any>> {
    return this.sent.filter((message) => message.type === type)
  }
}

function buildHandlers() {
  return {
    onStatus: vi.fn(),
    onLive: vi.fn(),
    onSegment: vi.fn(),
    onAudioLevel: vi.fn(),
    onAudioSources: vi.fn(),
    onModelsList: vi.fn(),
    onModelsDetails: vi.fn(),
    onQueryState: vi.fn(),
    onQueryChunk: vi.fn(),
    onQueryResponse: vi.fn(),
    onRagDocuments: vi.fn(),
    onRagIngestResult: vi.fn(),
    onBenchmarkProgress: vi.fn(),
    onBenchmarkLog: vi.fn(),
    onBenchmarkComplete: vi.fn(),
    onError: vi.fn(),
    onHelloAck: vi.fn(),
    onCommandAck: vi.fn(),
    onCommandStatus: vi.fn(),
    onAnswerFinished: vi.fn(),
    onAnswerAccepted: vi.fn(),
    onAnswerState: vi.fn(),
    onAnswerTiming: vi.fn(),
    onCommandUnknown: vi.fn(),
    onReadyChange: vi.fn()
  }
}

function helloAck(overrides: Record<string, unknown> = {}) {
  return {
    type: 'hello_ack',
    protocolVersion: 2,
    backendInstanceId: 'backend-1',
    connectionId: 'conn-A',
    sessionEpoch: 3,
    serverTime: 1,
    capabilities: ['assist', 'snapshots'],
    ...overrides
  }
}

describe('WSClient send outcomes (M03-T04/T07)', () => {
  let handlers: ReturnType<typeof buildHandlers>
  let client: WSClient

  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.useFakeTimers()
    handlers = buildHandlers()
    client = new WSClient('ws://test', handlers)
  })

  afterEach(() => {
    client.dispose()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('rejects a send while offline and never queues it for replay', () => {
    const result = client.send({ type: 'run_query', requestId: 'r-1' })

    expect(result).toEqual({ ok: false, code: 'offline', message: expect.any(String) })
    expect(FakeWebSocket.instances).toHaveLength(0)

    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()

    expect(socket.sentOfType('run_query')).toHaveLength(0)
  })

  it('negotiates the newest protocol version on open and refuses commands until hello_ack', () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()

    const hello = socket.lastSent('hello')
    expect(hello).toBeTruthy()
    expect(hello?.protocolVersion).toBe(6)
    expect(hello?.supportedProtocolVersions).toEqual([6, 5, 4, 3, 2])
    expect(client.ready).toBe(false)

    const beforeReady = client.send({ type: 'claim_control' })
    expect(beforeReady).toEqual({ ok: false, code: 'not_ready', message: expect.any(String) })
    expect(socket.sentOfType('claim_control')).toHaveLength(0)

    socket.receive(helloAck())

    expect(client.ready).toBe(true)
    expect(client.backendInstanceId).toBe('backend-1')
    expect(client.connectionId).toBe('conn-A')
    expect(client.sessionEpoch).toBe(3)
    expect(client.capabilities).toEqual(['assist', 'snapshots'])
    expect(handlers.onReadyChange).toHaveBeenLastCalledWith({ ready: true, capabilities: ['assist', 'snapshots'] })

    const afterReady = client.send({ type: 'claim_control' })
    expect(afterReady.ok).toBe(true)
    const claim = socket.lastSent('claim_control')
    expect(claim?.backendInstanceId).toBe('backend-1')
    expect(claim?.sessionEpoch).toBe(3)
    expect(claim?.commandId).toEqual(expect.any(String))
  })

  it('resolves a sent command when its acknowledgement arrives', async () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.receive(helloAck())

    const result = client.send({ type: 'claim_control', commandId: 'cmd-1' })
    expect(result).toEqual({ ok: true, commandId: 'cmd-1' })
    const ackPromise = client.waitForAck('cmd-1')

    socket.receive({
      type: 'command_ack',
      protocolVersion: 2,
      backendInstanceId: 'backend-1',
      connectionId: 'conn-A',
      sessionEpoch: 3,
      commandId: 'cmd-1',
      accepted: true,
      requestId: null,
      answerId: null
    })

    await expect(ackPromise).resolves.toEqual({ ok: true, commandId: 'cmd-1' })
    expect(handlers.onCommandUnknown).not.toHaveBeenCalled()
  })

  it('treats a lost acknowledgement as unknown and reconciles without resending', async () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.receive(helloAck())

    client.send({ type: 'run_context_query', commandId: 'cmd-lost' })
    const ackPromise = client.waitForAck('cmd-lost')

    vi.advanceTimersByTime(ACK_TIMEOUT_MS + 10)

    const result = await ackPromise
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('not_ready')
    expect(handlers.onCommandUnknown).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: 'cmd-lost', reason: 'ack_timeout' })
    )
    // Reconciliation, not a repeat of the paid command.
    expect(socket.sentOfType('run_context_query')).toHaveLength(1)
    const status = socket.lastSent('get_command_status')
    expect(status?.queryCommandId).toBe('cmd-lost')
  })

  it('settles the status request separately from the queried command and stops polling', async () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.receive(helloAck())
    client.send({type:'run_context_query',commandId:'lost-original'})
    vi.advanceTimersByTime(ACK_TIMEOUT_MS + 1)
    const status = socket.lastSent('get_command_status')!
    const statusAck = client.waitForAck(status.commandId)
    socket.receive({...helloAck(),type:'command_status',commandId:'lost-original',status:'accepted'})
    socket.receive({...helloAck(),type:'command_ack',commandId:status.commandId,accepted:true})
    await expect(statusAck).resolves.toEqual({ok:true,commandId:status.commandId})
    vi.advanceTimersByTime(ACK_TIMEOUT_MS * 4)
    expect(socket.sentOfType('get_command_status')).toHaveLength(1)
    expect(socket.sentOfType('run_context_query')).toHaveLength(1)
    expect(handlers.onCommandUnknown).toHaveBeenCalledTimes(1)
  })

  it('never reconciles a timed-out reconciliation request recursively', async () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.receive(helloAck())
    client.send({type:'claim_control',commandId:'lost-original'})
    vi.advanceTimersByTime(ACK_TIMEOUT_MS + 1)
    const status = socket.lastSent('get_command_status')!
    const statusAck = client.waitForAck(status.commandId)
    // Legacy servers answer the queried identity without acknowledging the read.
    socket.receive({...helloAck(),type:'command_status',commandId:'lost-original',status:'accepted'})
    vi.advanceTimersByTime(ACK_TIMEOUT_MS * 4)
    await expect(statusAck).resolves.toMatchObject({ok:false,code:'not_ready'})
    expect(socket.sentOfType('get_command_status')).toHaveLength(1)
  })

  it('marks pending commands unknown and does not replay them after a lost connection', async () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.receive(helloAck())
    const ackPromise = (() => {
      client.send({ type: 'run_context_query', commandId: 'cmd-x' })
      return client.waitForAck('cmd-x')
    })()

    socket.close()

    const result = await ackPromise
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('offline')
    expect(handlers.onCommandUnknown).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: 'cmd-x', reason: 'connection_lost' })
    )
    expect(client.ready).toBe(false)
    expect(handlers.onReadyChange).toHaveBeenCalledWith({ ready: false, capabilities: [] })

    vi.advanceTimersByTime(5000)
    const reconnectSocket = FakeWebSocket.instances[1]
    expect(reconnectSocket).toBeTruthy()
    reconnectSocket.open()
    reconnectSocket.receive(helloAck())

    expect(reconnectSocket.sentOfType('run_context_query')).toHaveLength(0)
  })

  it('dispose closes the socket, clears the reconnect timer, and rejects pending commands', async () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.receive(helloAck())
    client.send({ type: 'run_context_query', commandId: 'cmd-dispose' })
    const ackPromise = client.waitForAck('cmd-dispose')

    client.dispose()

    const result = await ackPromise
    expect(result.ok).toBe(false)
    vi.advanceTimersByTime(10000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED)
  })

  it('adopts the negotiated version and uses it for later commands', () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()

    socket.receive(helloAck({ protocolVersion: 3, capabilities: ['assist', 'snapshots', 'timing', 'model_readiness'] }))
    expect(client.protocolVersion).toBe(3)
    expect(client.capabilities).toContain('timing')

    client.send({ type: 'create_snapshot', kind: 'recent_window', anchorSegmentKey: 'epoch-1#1' })
    expect(socket.lastSent('create_snapshot')?.protocolVersion).toBe(3)
  })

  it('reconciles v4 accepted, terminal and retained-state results without replaying generation', () => {
    client.connect();const socket=FakeWebSocket.instances[0];socket.open();socket.receive(helloAck({protocolVersion:4}))
    client.send({type:'rerun_answer',commandId:'rerun',sourceAnswerId:'original',clientPressedAtMs:1})
    expect(socket.lastSent('rerun_answer')?.protocolVersion).toBe(4)
    vi.advanceTimersByTime(ACK_TIMEOUT_MS)
    expect(socket.lastSent('get_command_status')?.queryCommandId).toBe('rerun')
    const scope={protocolVersion:4,backendInstanceId:'backend-1',connectionId:'conn-A',sessionEpoch:3}
    socket.receive({type:'command_status',...scope,commandId:'rerun',status:'accepted',result:[
      {type:'answer_accepted',...scope,requestId:'new',answerId:'answer',commandId:'rerun',snapshotId:'source'},
      {type:'answer_finished',...scope,requestId:'new',answerId:'answer',snapshotId:'source',status:'completed',text:'Captured result',eventSeq:1},
      {type:'answer_state',...scope,requestId:'new',answerId:'answer',stateSeq:1,placement:'working',removed:false,snapshotAvailable:true,reason:'reconciliation'}
    ]})
    expect(handlers.onAnswerAccepted).toHaveBeenCalledTimes(1)
    expect(handlers.onAnswerFinished).toHaveBeenCalledTimes(1)
    expect(handlers.onAnswerState).toHaveBeenCalledTimes(1)
    expect(socket.sentOfType('rerun_answer')).toHaveLength(1)
  })

  it('keeps the v2 envelope when a v2 backend answers the negotiation', () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()

    socket.receive(helloAck({ protocolVersion: 2 }))
    expect(client.protocolVersion).toBe(2)

    client.send({ type: 'claim_control' })
    expect(socket.lastSent('claim_control')?.protocolVersion).toBe(2)
  })

  it('dispatches scoped answer_timing events to the v3 handler', () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.receive(helloAck({ protocolVersion: 3 }))

    socket.receive({
      type: 'answer_timing',
      protocolVersion: 3,
      backendInstanceId: 'backend-1',
      connectionId: 'conn-A',
      sessionEpoch: 3,
      requestId: 'req-1',
      answerId: 'ans-1',
      snapshotId: 'snap-1',
      candidateRevision: null,
      timingSeq: 1,
      timing: {
        backend: {
          clock: 'server_monotonic',
          acceptedMs: 0,
          rag: null,
          generation: null,
          completedMs: null,
          unavailable: ['rag', 'generation', 'completed']
        },
        client: null
      }
    })

    expect(handlers.onAnswerTiming).toHaveBeenCalledTimes(1)
    expect(handlers.onAnswerTiming.mock.calls[0][0].timingSeq).toBe(1)
  })

  it('keeps legacy sends working before v2 negotiation', () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()

    const result = client.send({ type: 'get_audio_sources' })

    expect(result).toEqual({ ok: true })
    expect(socket.sentOfType('get_audio_sources')).toHaveLength(1)
  })

  it('adopts a newer session epoch from v2 events and ignores older ones', () => {
    client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.open()
    socket.receive(helloAck({ sessionEpoch: 5 }))
    expect(client.sessionEpoch).toBe(5)

    socket.receive({
      type: 'control_state',
      protocolVersion: 2,
      backendInstanceId: 'backend-1',
      connectionId: 'conn-A',
      sessionEpoch: 9,
      isOwner: true,
      ownerConnectionId: 'conn-A',
      readOnly: false
    })
    expect(client.sessionEpoch).toBe(9)

    socket.receive({
      type: 'control_state',
      protocolVersion: 2,
      backendInstanceId: 'backend-1',
      connectionId: 'conn-A',
      sessionEpoch: 4,
      isOwner: true,
      ownerConnectionId: 'conn-A',
      readOnly: false
    })
    expect(client.sessionEpoch).toBe(9)

    client.send({ type: 'claim_control' })
    expect(socket.lastSent('claim_control')?.sessionEpoch).toBe(9)
  })
})
