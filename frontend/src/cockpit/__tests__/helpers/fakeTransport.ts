// Test-only fake WebSocket transport.
//
// The real `WSClient` opens a socket in `connect()` and silently drops sends
// while offline. This fake records every outgoing message and lets a test push
// server->client events through the handlers that App registered, so the App
// seam can be exercised without a live backend.
export type FakeMessageHandler = (payload: Record<string, unknown>) => void

// Maps server message `type` values to the `WSHandlers` method names used by the
// real client, so tests can emit backend traffic without a live socket.
const HANDLER_BY_TYPE: Record<string, string> = {
  assistance_state: 'onAssistanceState',
  candidate_state: 'onCandidateState',
  detector_state: 'onDetectorState',
  status: 'onStatus',
  transcript_live: 'onLive',
  transcript_segment: 'onSegment',
  audio_level: 'onAudioLevel',
  audio_sources: 'onAudioSources',
  models_list: 'onModelsList',
  models_details: 'onModelsDetails',
  query_state: 'onQueryState',
  query_chunk: 'onQueryChunk',
  query_response: 'onQueryResponse',
  rag_documents: 'onRagDocuments',
  rag_ingest_result: 'onRagIngestResult',
  benchmark_progress: 'onBenchmarkProgress',
  benchmark_log: 'onBenchmarkLog',
  benchmark_complete: 'onBenchmarkComplete',
  error: 'onError',
  hello_ack: 'onHelloAck',
  control_state: 'onControlState',
  command_ack: 'onCommandAck',
  command_status: 'onCommandStatus',
  command_unknown: 'onCommandUnknown',
  answer_state: 'onAnswerState',
  snapshot_created: 'onSnapshotCreated',
  answer_accepted: 'onAnswerAccepted',
  answer_chunk: 'onAnswerChunk',
  answer_timing: 'onAnswerTiming',
  answer_finished: 'onAnswerFinished',
  request_error: 'onRequestError'
}

export class FakeWebSocketTransport {
  readonly handlers: Record<string, FakeMessageHandler> = {}
  readonly sent: Array<Record<string, unknown>> = []
  connectCount = 0

  constructor(_url?: string, handlers?: Record<string, FakeMessageHandler>) {
    if (handlers) {
      Object.assign(this.handlers, handlers)
    }
  }

  connect(): void {
    this.connectCount += 1
    // Mirror the real client's `onopen`, which reports the connected state.
    this.emit('status', { state: 'connected' })
  }

  send(message: Record<string, unknown>): { ok: true; commandId: string } {
    this.sent.push({ ...message })
    return { ok: true, commandId: String(message.commandId || `fake-command-${this.sent.length}`) }
  }

  dispose(): void {}

  emit(type: string, payload: Record<string, unknown> = {}): void {
    const handlerName = HANDLER_BY_TYPE[type]
    const handler = handlerName ? this.handlers[handlerName] : undefined
    if (handler) {
      handler({ ...payload })
    }
  }

  clearSent(): void {
    this.sent.length = 0
  }

  lastSent(type: string): Record<string, unknown> | undefined {
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      if (this.sent[i].type === type) {
        return this.sent[i]
      }
    }
    return undefined
  }

  sentCount(type: string): number {
    return this.sent.filter((message) => message.type === type).length
  }
}
