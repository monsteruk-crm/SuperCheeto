import { parseAnswerStateEvent, parseCandidateStateEvent, parseDetectionStateEvent, parseAutoStateEvent } from './cockpit/protocol'
import type {
  AnswerAcceptedEvent,
  AnswerChunkEvent,
  AnswerFinishedEvent,
  AnswerTimingEvent,
  Capability,
  CommandAckEvent,
  CommandStatusEvent,
  ControlStateEvent,
  ErrorCode,
  HelloAck,
  ProtocolVersion,
  RequestErrorEvent,
  SnapshotCreatedEvent
} from './cockpit/types'

export type WSHandlers = {
  onStatus: (payload: { state: string; details?: string | Record<string, unknown> }) => void
  onLive: (payload: { text: string; t: number; streamKind?: 'system' | 'mic'; sourceName?: string | null }) => void
  onSegment: (payload: { segment: any }) => void
  onAudioLevel: (payload: {
    rms: number
    peak?: number
    level: number
    t: number
    streamKind?: 'system' | 'mic'
    sourceName?: string | null
  }) => void
  onAudioSources: (payload: {
    sources: string[]
    defaultSource?: string
    selectedSource?: string
    monitorSources?: string[]
    defaultMonitorSource?: string
    selectedMonitorSource?: string
    micSources?: string[]
    defaultMicSource?: string
    selectedMicSource?: string
    selectedMode?: 'system' | 'mic'
  }) => void
  onModelsList: (payload: { models: string[]; selectedModel?: string }) => void
  onModelsDetails: (payload: { models: Array<{ id: string; object: string; created: number | null; owned_by: string }> }) => void
  onQueryState: (payload: { running: boolean; requestId?: string; cancelled?: boolean }) => void
  onQueryChunk: (payload: { requestId?: string; delta?: string }) => void
  onQueryResponse: (payload: {
    requestId?: string
    text: string
    latencyMs?: number
    model?: string
    screenshotUsed?: boolean
    ragChunksUsed?: number
    ragSources?: string[]
  }) => void
  onRagDocuments: (payload: { documents: Array<{ docId: string; filePath: string; title: string; chunkCount: number; updatedAt: number }> }) => void
  onRagIngestResult: (payload: {
    ingested: number
    updated: number
    skipped: number
    failed: number
    errors?: string[]
  }) => void
  onBenchmarkProgress: (payload: {
    benchmarkId?: string
    completed: number
    total: number
    testId?: string
    model?: string
    run?: number
    successes?: number
    failures?: number
  }) => void
  onBenchmarkLog: (payload: {
    benchmarkId?: string
    testId?: string
    model?: string
    run?: number
    success?: boolean
    jsonValid?: boolean
    timeToFirstTokenMs?: number | null
    ttcMs?: number | null
    latencyMs?: number | null
    inputTokens?: number | null
    outputTokens?: number | null
    totalTokens?: number | null
    costUsd?: number | null
    qualityScore?: number
    qualityPassed?: boolean
    qualityChecks?: Array<{ name: string; passed: boolean; details: string }>
    imageCapabilityClaim?: string | null
    imageWorked?: boolean | null
    responsePreview?: string
    error?: string | null
    imageRef?: string | null
  }) => void
  onBenchmarkComplete: (payload: {
    benchmarkId?: string
    createdAt?: number
    instruction?: string
    tests?: any[]
    results: any[]
    attempts?: any[]
  }) => void
  onError: (payload: { message: string; code?: string }) => void

  // ---- Protocol v2 (M03). Optional so the existing App wiring stays valid. ----
  onCandidateState?: (payload: import('./cockpit/types').CandidateStateEvent) => void
  onDetectorState?: (payload: import('./cockpit/types').DetectionState & {stateSeq: number}) => void
  onAssistanceState?: (payload: import('./cockpit/types').AutoStateEvent) => void
  onHelloAck?: (payload: HelloAck) => void
  onTranscriptCleared?: () => void
  onControlState?: (payload: ControlStateEvent) => void
  onAnswerState?: (payload: import('./cockpit/types').AnswerStateEvent) => void
  onCommandAck?: (payload: CommandAckEvent) => void
  onCommandStatus?: (payload: CommandStatusEvent) => void
  onSnapshotCreated?: (payload: SnapshotCreatedEvent) => void
  onAnswerAccepted?: (payload: AnswerAcceptedEvent) => void
  onAnswerChunk?: (payload: AnswerChunkEvent) => void
  /** Scoped v3 timing update. Never revives a terminal record. */
  onAnswerTiming?: (payload: AnswerTimingEvent) => void
  onAnswerFinished?: (payload: AnswerFinishedEvent) => void
  onRequestError?: (payload: RequestErrorEvent) => void
  /** A command's acceptance is unknown (lost ack or lost connection). */
  onCommandUnknown?: (payload: { commandId: string; reason: string; message: string }) => void
  onReadyChange?: (payload: { ready: boolean; capabilities: Capability[] }) => void
}

/** Typed send outcome. A rejected send is never queued for a later replay. */
export type SendResult =
  | { ok: true; commandId?: string }
  | { ok: false; code: ErrorCode; message: string }

export const ACK_TIMEOUT_MS = 5000

/** Newest wire version this client speaks; the backend negotiates the result. */
export const CLIENT_PROTOCOL_VERSION: ProtocolVersion = 6

/** Versions this client can advertise during `hello` negotiation. */
export const CLIENT_SUPPORTED_VERSIONS: number[] = [6, 5, 4, 3, 2]

const V2_COMMAND_TYPES = new Set([
  'hello',
  'claim_control',
  'get_command_status',
  'create_snapshot',
  'run_context_query',
  'run_snapshot_query',
  'cancel_answer',
  'candidate_action',
  'answer_action',
  'context_note_action',
  'set_detection',
  'set_auto',
  'configure_auto',
  'interaction_state',
  'rerun_answer',
  'snapshot_action'
])

type PendingCommand = {
  promise: Promise<SendResult>
  resolve: (result: SendResult) => void
  timer: ReturnType<typeof setTimeout>
}

function newCommandId(): string {
  const maybeCrypto = globalThis.crypto as Crypto | undefined
  if (maybeCrypto?.randomUUID) {
    return maybeCrypto.randomUUID()
  }
  return `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export class WSClient {
  private socket: WebSocket | null = null
  private retry = 0
  private readonly url: string
  private readonly handlers: WSHandlers
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private readonly pending = new Map<string, PendingCommand>()
  private readonly settled = new Map<string, SendResult>()

  /** True only after `hello_ack`; v2/v3 commands are refused before that. */
  ready = false
  backendInstanceId: string | null = null
  connectionId: string | null = null
  sessionEpoch = 0
  capabilities: Capability[] = []
  /** Negotiated wire version. Starts at the client's preference, adopts `hello_ack`. */
  protocolVersion: ProtocolVersion = CLIENT_PROTOCOL_VERSION

  constructor(url: string, handlers: WSHandlers) {
    this.url = url
    this.handlers = handlers
  }

  connect() {
    this.disposed = false
    this.clearReconnectTimer()
    this.socket = new WebSocket(this.url)
    this.socket.onopen = () => {
      this.retry = 0
      this.handlers.onStatus({ state: 'connected' })
      // Negotiate v2. A legacy backend ignores the unknown command.
      this.negotiate()
    }
    this.socket.onclose = () => {
      this.handleConnectionLost()
      this.scheduleReconnect()
    }
    this.socket.onerror = () => {
      this.handlers.onError({ message: 'WebSocket error', code: 'offline' })
    }
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.dispatch(data)
      } catch {
        this.handlers.onError({ message: 'Malformed message from backend.' })
      }
    }
  }

  /** Close the socket and timers. Never replays queued commands. */
  dispose() {
    this.disposed = true
    this.clearReconnectTimer()
    this.rejectPending('offline', 'Connection closed.')
    this.ready = false
    if (this.socket) {
      this.socket.onclose = null
      this.socket.onmessage = null
      this.socket.onopen = null
      this.socket.onerror = null
      try {
        this.socket.close()
      } catch {
        // Already closed.
      }
      this.socket = null
    }
  }

  send(message: Record<string, unknown>): SendResult {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return { ok: false, code: 'offline', message: 'Not connected to the backend.' }
    }
    const isV2 = Number(message.protocolVersion) >= 2 || V2_COMMAND_TYPES.has(String(message.type))
    if (!isV2) {
      try {
        this.socket.send(JSON.stringify(message))
        return { ok: true }
      } catch {
        return { ok: false, code: 'offline', message: 'The socket rejected the message.' }
      }
    }
    if (message.type !== 'hello' && !this.ready) {
      return {
        ok: false,
        code: 'not_ready',
        message: 'The backend has not completed protocol negotiation yet.'
      }
    }
    const commandId = String(message.commandId || newCommandId())
    const envelope = {
      protocolVersion: this.protocolVersion,
      backendInstanceId: this.backendInstanceId,
      sessionEpoch: this.sessionEpoch,
      ...message,
      commandId
    }
    try {
      this.socket.send(JSON.stringify(envelope))
    } catch {
      return { ok: false, code: 'offline', message: 'The socket rejected the message.' }
    }
    if (message.type !== 'hello') {
      // `hello` needs no ack deadline: a legacy backend simply ignores it.
      this.trackAck(commandId)
    }
    return { ok: true, commandId }
  }

  /**
   * Await the acknowledgement for a sent v2 command.
   *
   * On timeout the result is a rejection-with-`not_ready`: acceptance is
   * unknown, the command is not resent, and the caller must reconcile by
   * `commandId` via `get_command_status`.
   */
  waitForAck(commandId: string): Promise<SendResult> {
    const pending = this.pending.get(commandId)
    if (pending) return pending.promise
    const settled = this.settled.get(commandId)
    if (settled) return Promise.resolve(settled)
    return Promise.resolve({ ok: true, commandId })
  }

  private negotiate() {
    this.send({
      type: 'hello',
      protocolVersion: CLIENT_PROTOCOL_VERSION,
      supportedProtocolVersions: CLIENT_SUPPORTED_VERSIONS,
      backendInstanceId: this.backendInstanceId,
      sessionEpoch: this.sessionEpoch,
      commandId: newCommandId(),
      client: { appId: 'audio-transcriber-ui', clientVersion: '0.2.0' }
    })
  }

  private trackAck(commandId: string) {
    let resolveFn: (result: SendResult) => void = () => undefined
    const promise = new Promise<SendResult>((resolve) => {
      resolveFn = resolve
    })
    const timer = setTimeout(() => {
      this.settle(commandId, {
        ok: false,
        code: 'not_ready',
        message: 'No acknowledgement within five seconds; acceptance is unknown.'
      })
      this.handlers.onCommandUnknown?.({
        commandId,
        reason: 'ack_timeout',
        message: 'No acknowledgement within five seconds; acceptance is unknown.'
      })
      // Reconcile without repeating the command.
      this.requestCommandStatus(commandId)
    }, ACK_TIMEOUT_MS)
    this.pending.set(commandId, { promise, resolve: resolveFn, timer })
  }

  private settle(commandId: string, result: SendResult) {
    const pending = this.pending.get(commandId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(commandId)
    this.rememberSettled(commandId, result)
    pending.resolve(result)
  }

  private rememberSettled(commandId: string, result: SendResult) {
    if (!commandId) return
    this.settled.set(commandId, result)
    if (this.settled.size > 50) {
      const oldest = this.settled.keys().next().value
      if (oldest !== undefined) this.settled.delete(oldest)
    }
  }

  private requestCommandStatus(queryCommandId: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.ready) {
      return
    }
    this.send({
      type: 'get_command_status',
      commandId: newCommandId(),
      queryCommandId
    } as Record<string, unknown>)
  }

  private rejectPending(code: ErrorCode, message: string) {
    for (const [commandId, pending] of this.pending.entries()) {
      clearTimeout(pending.timer)
      this.pending.delete(commandId)
      const result: SendResult = { ok: false, code, message }
      this.rememberSettled(commandId, result)
      pending.resolve(result)
      this.handlers.onCommandUnknown?.({ commandId, reason: 'connection_lost', message })
    }
  }

  private handleConnectionLost() {
    const wasReady = this.ready
    this.ready = false
    if (wasReady) {
      this.handlers.onReadyChange?.({ ready: false, capabilities: [] })
    }
    this.rejectPending('offline', 'The connection was lost; acceptance is unknown.')
    this.handlers.onStatus({ state: 'disconnected' })
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private scheduleReconnect() {
    if (this.disposed) return
    this.retry += 1
    const delay = Math.min(5000, 500 + this.retry * 500)
    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.disposed) this.connect()
    }, delay)
  }

  private adoptIdentity(data: Record<string, any>) {
    if (typeof data.backendInstanceId === 'string' && data.backendInstanceId) {
      this.backendInstanceId = data.backendInstanceId
    }
    if (typeof data.connectionId === 'string' && data.connectionId) {
      this.connectionId = data.connectionId
    }
    if (typeof data.sessionEpoch === 'number' && Number.isFinite(data.sessionEpoch)) {
      if (data.sessionEpoch > this.sessionEpoch) {
        this.sessionEpoch = data.sessionEpoch
      }
    }
  }

  private dispatch(data: any) {
    const type = String(data.type || '')
    if (Number(data.protocolVersion) >= 2) {
      if (type === 'hello_ack') {
        this.backendInstanceId = data.backendInstanceId; this.connectionId = data.connectionId; this.sessionEpoch = Number(data.sessionEpoch) || 0
      } else if (['answer_accepted','answer_chunk','answer_timing','answer_finished','answer_state','snapshot_created','candidate_state','detector_state','assistance_state'].includes(type)) {
        if (data.backendInstanceId !== this.backendInstanceId || data.connectionId !== this.connectionId || data.sessionEpoch !== this.sessionEpoch) return
      }
      this.adoptIdentity(data)
    }
    switch (type) {
      case 'status':
        this.handlers.onStatus(data)
        break
      case 'transcript_live':
        this.handlers.onLive(data)
        break
      case 'transcript_segment':
        this.handlers.onSegment(data)
        break
      case 'audio_level':
        this.handlers.onAudioLevel(data)
        break
      case 'audio_sources':
        this.handlers.onAudioSources(data)
        break
      case 'models_list':
        this.handlers.onModelsList(data)
        break
      case 'models_details':
        this.handlers.onModelsDetails(data)
        break
      case 'query_state':
        this.handlers.onQueryState(data)
        break
      case 'query_chunk':
        this.handlers.onQueryChunk(data)
        break
      case 'query_response':
        this.handlers.onQueryResponse(data)
        break
      case 'rag_documents':
        this.handlers.onRagDocuments(data)
        break
      case 'rag_ingest_result':
        this.handlers.onRagIngestResult(data)
        break
      case 'benchmark_progress':
        this.handlers.onBenchmarkProgress(data)
        break
      case 'benchmark_log':
        this.handlers.onBenchmarkLog(data)
        break
      case 'benchmark_complete':
        this.handlers.onBenchmarkComplete(data)
        break
      case 'error':
        this.handlers.onError(data)
        break
      case 'hello_ack':
        this.ready = true
        if (Number(data.protocolVersion) === 2 || Number(data.protocolVersion) === 3 || Number(data.protocolVersion) === 4 || Number(data.protocolVersion) === 5 || Number(data.protocolVersion) === 6) {
          this.protocolVersion = Number(data.protocolVersion) as ProtocolVersion
        }
        this.capabilities = Array.isArray(data.capabilities) ? (data.capabilities as Capability[]) : []
        this.settle(String(data.commandId || ''), { ok: true, commandId: data.commandId })
        this.handlers.onReadyChange?.({ ready: true, capabilities: this.capabilities })
        this.handlers.onHelloAck?.(data as HelloAck)
        break
      case 'control_state':
        this.handlers.onControlState?.(data as ControlStateEvent)
        break
      case 'command_ack': {
        const accepted = Boolean(data.accepted)
        this.settle(
          String(data.commandId || ''),
          accepted
            ? { ok: true, commandId: data.commandId }
            : {
                ok: false,
                code: (data.code as ErrorCode) || 'invalid_payload',
                message: String(data.message || 'The backend rejected the command.')
              }
        )
        this.handlers.onCommandAck?.(data as CommandAckEvent)
        break
      }
      case 'command_status':
        for (const event of (Array.isArray(data.result) ? data.result : [])) {
          if (event && ['answer_accepted', 'snapshot_created', 'answer_state', 'answer_finished', 'candidate_state', 'detector_state', 'assistance_state'].includes(event.type)) this.dispatch(event)
        }
        if (data.status === 'accepted') {
          this.settle(String(data.commandId || ''), { ok: true, commandId: data.commandId })
        }
        this.handlers.onCommandStatus?.(data as CommandStatusEvent)
        break
      case 'assistance_state': {
        const parsed=parseAutoStateEvent(data)
        if(parsed.ok)this.handlers.onAssistanceState?.(parsed.value)
        break
      }
      case 'candidate_state': {
        const parsed = parseCandidateStateEvent(data)
        if (parsed.ok) this.handlers.onCandidateState?.(parsed.value)
        break
      }
      case 'detector_state': {
        const parsed=parseDetectionStateEvent(data)
        if(parsed.ok)this.handlers.onDetectorState?.(parsed.value)
        break
      }
      case 'snapshot_created':
        this.handlers.onSnapshotCreated?.(data as SnapshotCreatedEvent)
        break
      case 'answer_accepted':
        this.handlers.onAnswerAccepted?.(data as AnswerAcceptedEvent)
        break
      case 'answer_state': {
        const parsed = parseAnswerStateEvent(data, {protocolVersion:this.protocolVersion} as import('./cockpit/protocol').ContractContext)
        if (parsed.ok) this.handlers.onAnswerState?.(parsed.value)
        break
      }
      case 'answer_chunk':
        this.handlers.onAnswerChunk?.(data as AnswerChunkEvent)
        break
      case 'answer_timing':
        this.handlers.onAnswerTiming?.(data as AnswerTimingEvent)
        break
      case 'answer_finished':
        this.handlers.onAnswerFinished?.(data as AnswerFinishedEvent)
        break
      case 'request_error':
        this.handlers.onRequestError?.(data as RequestErrorEvent)
        break
      default:
        break
    }
  }
}
