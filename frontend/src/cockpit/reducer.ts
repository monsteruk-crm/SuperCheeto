// Cockpit request-record reducer (M03-T05, amended by M3bis-T05).
//
// Keeps one record per answer attempt until a definitive status is known, and
// ignores traffic that must not mutate a newer session:
//
// - stale `sessionEpoch` (older than the adopted epoch),
// - events from a different backend instance,
// - unknown request/answer identities,
// - duplicate or out-of-order `eventSeq`,
// - late events for a request that is already terminal (cancelled or failed),
// - timing updates that would revive a terminal record or arrive out of order.
//
// Timing is kept in two separate clock domains: `backendTiming` is what the
// server measured from acceptance, `clientTiming` is what this client measured.
// Nothing here subtracts one from the other; `pressToVisibleMs` is derived only
// from two client values.
//
// The reducer is pure. Transport concerns (sockets, timers) live in `ws.ts`;
// component state lives in the components that consume this module.

import type {
  AnswerFinishedEvent,
  AnswerStateEvent,
  AnswerStatus,
  AnswerTiming,
  BackendTiming,
  ClientTiming,
  ErrorCode,
  FrozenInputs,
  ModelSettings,
  RetrievalResult,
  RequestErrorEvent
} from './types'

export type RequestStatus = 'running' | AnswerStatus

export type RequestRecord = {
  requestId: string
  answerId: string
  commandId: string | null
  connectionId: string | null
  sessionEpoch: number
  snapshotId: string | null
  status: RequestStatus
  text: string
  eventSeq: number
  terminal: boolean
  /** Set when acceptance itself is unknown (lost ack or lost connection). */
  acceptanceUnknown: boolean
  unknownReason: string | null
  error: { code: ErrorCode; message: string } | null
  /** Frozen inputs as accepted by the backend (v3 includes model provenance). */
  frozenInputs: FrozenInputs | null
  modelSettings: ModelSettings | null
  /** Server measurements, relative to request acceptance. */
  backendTiming: BackendTiming | null
  /** Client measurements; a later local checkpoint may fill them in. */
  clientTiming: ClientTiming | null
  timingSeq: number
  /** First visible display checkpoint (M05 supplies it; never from socket receipt). */
  firstVisibleMs: number | null
  placement: 'working' | 'kept'
  removed: boolean
  snapshotReleased: boolean
  retrieval: RetrievalResult | null
  metadata?: Record<string, unknown>
  stateSeq?: number
  model: string | null
  screenshotUsed: boolean
}

export type CockpitState = {
  backendInstanceId: string | null
  connectionId: string | null
  sessionEpoch: number | null
  /** Insertion order of request IDs, oldest first. */
  order: string[]
  records: Record<string, RequestRecord>
}

export const initialCockpitState: CockpitState = {
  backendInstanceId: null,
  connectionId: null,
  sessionEpoch: null,
  order: [],
  records: {}
}

export type CockpitEvent =
  | AnswerStateEvent
  | {
      type: 'hello_ack'
      backendInstanceId: string
      connectionId: string
      sessionEpoch: number
    }
  | {
      type: 'control_state'
      backendInstanceId: string
      connectionId: string
      sessionEpoch: number
    }
  | {
      type: 'answer_accepted'
      backendInstanceId: string
      connectionId: string
      sessionEpoch: number
      requestId: string
      answerId: string
      commandId: string
      snapshotId: string
      origin?: 'manual'|'auto'
      configRevision?:number|null
      generationStatus?:string
      publicationStatus?:string
      candidateId?: string | null
      candidateRevision?: number | null
      correctsAnswerId?: string | null
      frozenInputs?: FrozenInputs | null
      timing?: AnswerTiming | null
    }
  | {
      type: 'answer_chunk'
      backendInstanceId: string
      connectionId: string
      sessionEpoch: number
      requestId: string
      answerId: string
      eventSeq: number
      delta: string
    }
  | {
      type: 'answer_timing'
      backendInstanceId: string
      connectionId: string
      sessionEpoch: number
      requestId: string
      answerId: string
      timingSeq: number
      timing: AnswerTiming
    }
  | (AnswerFinishedEvent & { backendInstanceId: string; connectionId: string })
  | (RequestErrorEvent & { backendInstanceId: string; connectionId: string })
  | { type: 'transcript_cleared' }
  | { type: 'answer_placement'; requestId: string; answerId: string; placement: 'working' | 'kept' }
  | { type: 'answer_removed'; requestId: string; answerId: string }
  | { type: 'answer_snapshot_released'; requestId: string; answerId: string }
  | {
      type: 'local_first_visible'
      requestId: string
      /** Client monotonic instant the rendered card first showed text. */
      firstVisibleMs: number
    }
  | {
      type: 'local_send_rejected'
      commandId: string | null
      requestId?: string | null
      code: ErrorCode
      message: string
    }
  | {
      type: 'local_command_unknown'
      commandId: string
      requestId?: string | null
      reason: string
      message: string
    }
  | { type: 'connection_lost'; message?: string }

/** Adopt a newer identifier/epoch, or report that the event is stale. */
function adoptIdentity(
  state: CockpitState,
  event: { backendInstanceId?: string; connectionId?: string; sessionEpoch?: number }
): { state: CockpitState; stale: boolean } {
  if (
    state.backendInstanceId &&
    event.backendInstanceId &&
    event.backendInstanceId !== state.backendInstanceId
  ) {
    return { state, stale: true }
  }
  if (state.connectionId && event.connectionId && state.connectionId !== event.connectionId) return {state, stale:true}
  const nextEpoch = typeof event.sessionEpoch === 'number' ? event.sessionEpoch : state.sessionEpoch
  if (
    state.sessionEpoch !== null &&
    typeof nextEpoch === 'number' &&
    nextEpoch < state.sessionEpoch
  ) {
    return { state, stale: true }
  }
  return {
    stale: false,
    state: {
      ...state,
      backendInstanceId: event.backendInstanceId || state.backendInstanceId,
      connectionId: event.connectionId || state.connectionId,
      sessionEpoch: nextEpoch ?? state.sessionEpoch
    }
  }
}

/** Mark every unfinished record from an older epoch as superseded. */
function supersedeOlderEpochs(state: CockpitState, epoch: number): CockpitState {
  let changed = false
  const records: Record<string, RequestRecord> = { ...state.records }
  for (const [requestId, record] of Object.entries(state.records)) {
    if (!record.terminal && record.sessionEpoch < epoch) {
      records[requestId] = {
        ...record,
        status: 'superseded',
        terminal: true,
        error: record.error ?? {
          code: 'stale_epoch',
          message: 'The source session changed before this answer finished.'
        }
      }
      changed = true
    }
  }
  return changed ? { ...state, records } : state
}

function updateRecord(
  state: CockpitState,
  requestId: string,
  update: (record: RequestRecord) => RequestRecord
): CockpitState {
  const record = state.records[requestId]
  if (!record) return state
  return { ...state, records: { ...state.records, [requestId]: update(record) } }
}

export function cockpitReducer(state: CockpitState, event: CockpitEvent): CockpitState {
  switch (event.type) {
    case 'hello_ack': {
      if ((state.backendInstanceId && state.backendInstanceId !== event.backendInstanceId) || (state.connectionId && state.connectionId !== event.connectionId)) {
        const records = Object.fromEntries(Object.entries(state.records).map(([id, record]) => [id, { ...record, terminal: true, status: record.terminal ? record.status : 'failed' as const, snapshotReleased: true, metadata: {...record.metadata,historical:true} }]))
        return { ...state, records, backendInstanceId: event.backendInstanceId, connectionId: event.connectionId, sessionEpoch: event.sessionEpoch }
      }
      const { state: adopted, stale } = adoptIdentity(state, event)
      return stale ? state : supersedeOlderEpochs(adopted, event.sessionEpoch)
    }
    case 'control_state': {
      const { state: adopted, stale } = adoptIdentity(state, event)
      if (stale) return state
      const epoch = typeof event.sessionEpoch === 'number' ? event.sessionEpoch : null
      return epoch === null ? adopted : supersedeOlderEpochs(adopted, epoch)
    }

    case 'answer_accepted': {
      const { state: adopted, stale } = adoptIdentity(state, event)
      if (stale) return state
      const record: RequestRecord = {
        requestId: event.requestId,
        answerId: event.answerId,
        commandId: event.commandId || null,
        connectionId: event.connectionId || null,
        sessionEpoch: event.sessionEpoch,
        snapshotId: event.snapshotId,
        status: 'running',
        text: '',
        eventSeq: 0,
        terminal: false,
        acceptanceUnknown: false,
        unknownReason: null,
        error: null,
        frozenInputs: event.frozenInputs ?? null,
        modelSettings: event.frozenInputs?.model ?? null,
        backendTiming: event.timing?.backend ?? null,
        clientTiming: event.timing?.client ?? null,
        timingSeq: 0,
        firstVisibleMs: null,
        placement: 'working',
        removed: false,
        snapshotReleased: false,
        retrieval: null,
        model: null,
        screenshotUsed: false,
        metadata: {origin:event.origin||'manual',configRevision:event.configRevision,generationStatus:event.generationStatus,publicationStatus:event.publicationStatus,candidateId:event.candidateId,candidateRevision:event.candidateRevision,correctsAnswerId:event.correctsAnswerId}
      }
      if (adopted.records[event.requestId]) {
        return adopted
      }
      return {
        ...adopted,
        order: [...adopted.order, event.requestId],
        records: { ...adopted.records, [event.requestId]: record }
      }
    }

    case 'answer_timing': {
      const { state: adopted, stale } = adoptIdentity(state, event)
      if (stale) return state
      const record = adopted.records[event.requestId]
      if (!record) return state
      // A timing update never revives a terminal record or reorders content.
      if (record.terminal) return state
      if (record.answerId !== event.answerId || record.connectionId !== event.connectionId || record.sessionEpoch !== event.sessionEpoch) return state
      if (event.timingSeq <= record.timingSeq) return state
      return updateRecord(adopted, event.requestId, (current) => ({
        ...current,
        timingSeq: event.timingSeq,
        backendTiming: event.timing.backend,
        clientTiming: event.timing.client ?? current.clientTiming
      }))
    }

    case 'answer_chunk': {
      const { state: adopted, stale } = adoptIdentity(state, event)
      if (stale) return state
      const record = adopted.records[event.requestId]
      if (!record) return state
      if (record.terminal) return state
      if (record.answerId !== event.answerId || record.connectionId !== event.connectionId || record.sessionEpoch !== event.sessionEpoch) return state
      if (typeof event.eventSeq === 'number' && event.eventSeq <= record.eventSeq) return state
      return updateRecord(adopted, event.requestId, (current) => ({
        ...current,
        text: current.text + event.delta,
        eventSeq: event.eventSeq,
        acceptanceUnknown: false,
        unknownReason: null
      }))
    }

    case 'answer_finished': {
      const { state: adopted, stale } = adoptIdentity(state, event)
      if (stale) return state
      const record = adopted.records[event.requestId]
      if (!record) return state
      if (record.answerId !== event.answerId || record.connectionId !== event.connectionId || record.sessionEpoch !== event.sessionEpoch) return state
      // A terminal record is authoritative: late events cannot rewrite it.
      if (record.terminal) return state
      const terminalPerf = performance.now()
      return updateRecord(adopted, event.requestId, (current) => ({
        ...current,
        status: event.status,
        metadata: {...current.metadata,...event.metadata},
        terminal: true,
        // `answer_finished.text` is authoritative even if chunks were missed.
        text: event.text,
        eventSeq: Math.max(current.eventSeq, event.eventSeq),
        acceptanceUnknown: false,
        unknownReason: null,
        modelSettings: event.modelSettings ?? current.modelSettings,
        retrieval: event.retrieval ?? current.retrieval,
        model: event.model ?? current.model,
        screenshotUsed: Boolean(event.screenshotUsed),
        backendTiming: event.timing?.backend ?? current.backendTiming,
        clientTiming: event.timing?.client ? { ...event.timing.client, terminalReceivedMs: terminalPerf } : current.clientTiming
      }))
    }

    case 'local_first_visible': {
      const record = state.records[event.requestId]
      if (!record) return state
      if (record.firstVisibleMs !== null) return state
      return updateRecord(state, event.requestId, (current) => ({
        ...current,
        firstVisibleMs: event.firstVisibleMs,
        clientTiming: {
          clock: 'client_monotonic',
          pressedMs: current.clientTiming?.pressedMs ?? null,
          firstVisibleMs: event.firstVisibleMs,
          terminalReceivedMs: current.clientTiming?.terminalReceivedMs ?? null
        }
      }))
    }

    case 'transcript_cleared': return state

    case 'answer_state': {
      const { state: adopted, stale } = adoptIdentity(state, event)
      const record = adopted.records[event.requestId]
      if (stale || !record || record.answerId !== event.answerId || event.stateSeq <= (record.stateSeq || 0) || record.connectionId !== event.connectionId) return state
      return updateRecord(adopted, event.requestId, (current) => ({ ...current, metadata:{...current.metadata,...(event.origin?{origin:event.origin,generationStatus:event.generationStatus,publicationStatus:event.publicationStatus,configRevision:event.configRevision}:{}),...(event.correctedBy?{correctedBy:event.correctedBy}:{})}, placement: event.placement, removed: event.removed, snapshotReleased: !event.snapshotAvailable, stateSeq: event.stateSeq }))
    }

    case 'answer_placement': {
      const record = state.records[event.requestId]
      if (!record || record.answerId !== event.answerId) return state
      return updateRecord(state, event.requestId, (current) => ({
        ...current,
        placement: event.placement,
        snapshotReleased: event.placement === 'kept' ? current.snapshotReleased : false
      }))
    }

    case 'answer_removed': {
      const record = state.records[event.requestId]
      if (!record || record.answerId !== event.answerId) return state
      return updateRecord(state, event.requestId, (current) => ({ ...current, removed: true }))
    }

    case 'answer_snapshot_released': {
      const record = state.records[event.requestId]
      if (!record || record.answerId !== event.answerId) return state
      return updateRecord(state, event.requestId, (current) => ({ ...current, snapshotReleased: true }))
    }


    case 'request_error': {
      const { state: adopted, stale } = adoptIdentity(state, event)
      if (stale) return state
      if (!event.requestId) return adopted
      const record = adopted.records[event.requestId]
      if (!record || record.terminal) return state
      if (record.answerId && event.answerId && record.answerId !== event.answerId) return state
      return updateRecord(adopted, event.requestId, (current) => ({
        ...current,
        error: { code: event.code, message: event.message }
      }))
    }

    case 'local_send_rejected': {
      if (!event.requestId) return state
      const record = state.records[event.requestId]
      if (!record) return state
      if (record.terminal) return state
      // The command never reached the backend: a visible terminal state, no spinner.
      return updateRecord(state, event.requestId, (current) => ({
        ...current,
        status: 'failed',
        terminal: true,
        acceptanceUnknown: false,
        error: { code: event.code, message: event.message }
      }))
    }

    case 'local_command_unknown': {
      if (!event.requestId) return state
      const record = state.records[event.requestId]
      if (!record) return state
      if (record.terminal) return state
      return updateRecord(state, event.requestId, (current) => ({
        ...current,
        acceptanceUnknown: true,
        unknownReason: event.reason,
        error: { code: 'not_ready', message: event.message }
      }))
    }

    case 'connection_lost': {
      const message =
        event.message || 'The connection was lost; the answer status is unknown.'
      let changed = false
      const records: Record<string, RequestRecord> = { ...state.records }
      for (const [requestId, record] of Object.entries(state.records)) {
        if (record.terminal) continue
        records[requestId] = {
          ...record,
          status: 'failed',
          terminal: true,
          acceptanceUnknown: true,
          unknownReason: 'connection_lost',
          error: { code: 'offline', message }
        }
        changed = true
      }
      return changed ? { ...state, records } : state
    }

    default:
      return state
  }
}

/** Records in insertion order, newest first. */
export function requestList(state: CockpitState): RequestRecord[] {
  return [...state.order]
    .map((requestId) => state.records[requestId])
    .filter((record): record is RequestRecord => Boolean(record) && !record.removed)
}

export function selectRecord(state: CockpitState, requestId: string | null): RequestRecord | null {
  if (!requestId) return null
  return state.records[requestId] ?? null
}

/** True while any record still expects a definitive event. */
export function hasPendingRequests(state: CockpitState): boolean {
  return Object.values(state.records).some((record) => !record.terminal)
}

/**
 * Press-to-first-visible duration, in milliseconds.
 *
 * Both values come from the client monotonic clock, so the subtraction is
 * valid. Returns null when either checkpoint is missing; a missing measurement
 * is never reported as zero and never derived from backend timestamps.
 */
export function pressToVisibleMs(record: RequestRecord): number | null {
  const pressed = record.clientTiming?.pressedMs ?? null
  const visible = record.firstVisibleMs ?? record.clientTiming?.firstVisibleMs ?? null
  if (pressed === null || visible === null) return null
  return visible - pressed
}
