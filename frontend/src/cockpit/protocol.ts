// Protocol v2/v3 contract parsers (M01-T06, amended by M3bis-T04).
//
// Pure validation that mirrors `backend/app/cockpit_protocol.py` and the shared
// fixtures under `contracts/v2/` and `contracts/v3/`. Both harnesses must agree
// on the outcome of every fixture. No socket, model, or store access.
//
// See ADR 0012, ADR 0014 and docs/API.md ("Protocol v2", "Protocol v3").
import type {
  Answer,
  AnswerTiming,
  BackendTiming,
  CapabilityCertainty,
  ClientTiming,
  ErrorCode,
  GenerationTiming,
  ModelCapabilities,
  ModelRole,
  ModelSelectionSource,
  ModelSettings,
  ProfileMode,
  RagTiming,
  ReasoningSetting,
  RetrievalOutcome,
  ScreenshotAttachment,
  SnapshotKind,
  SourceKind,
  SourceSpan,
  TimingClock
} from './types'

export const SUPPORTED_WIRE_VERSIONS = [2, 3, 4, 5, 6] as const
export const KNOWN_REASONING_EFFORTS = ['low', 'medium', 'high'] as const

export const V2_COMMAND_TYPES = [
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
  'rerun_answer',
  'snapshot_action',
  'interaction_state'
] as const

export type V2CommandType = (typeof V2_COMMAND_TYPES)[number]

const WINDOW_SECONDS = new Set([20, 45, 90])
const CANDIDATE_ACTIONS = new Set(['create', 'edit', 'split', 'merge', 'dismiss', 'undo', 'correct'])
const CONTEXT_NOTE_ACTIONS = new Set(['create', 'edit', 'remove'])
const ANSWER_STATUSES = new Set(['completed', 'cancelled', 'failed', 'empty', 'superseded'])
const RETRIEVAL_OUTCOMES = new Set(['used', 'no_documents', 'no_matches', 'failed'])
const PROFILE_MODES = new Set<ProfileMode>(['Preset', 'Custom'])
const SOURCE_KINDS = new Set<SourceKind>(['system', 'mic'])
const SNAPSHOT_KINDS = new Set<SnapshotKind>(['recent_window', 'selection', 'pinned_moment'])

export type ContractContext = {
  protocolVersion: number
  backendInstanceId: string
  sessionEpoch: number
  currentRevision: number
  knownSnapshotIds: string[]
  knownCandidateIds: string[]
}

export type ParseSuccess<T> = { ok: true; value: T }
export type ParseFailure = { ok: false; code: ErrorCode; message: string }
export type ParseResult<T> = ParseSuccess<T> | ParseFailure

export const contractContext = (raw: Partial<ContractContext>): ContractContext => ({
  protocolVersion: raw.protocolVersion ?? 2,
  backendInstanceId: raw.backendInstanceId ?? '',
  sessionEpoch: raw.sessionEpoch ?? 0,
  currentRevision: raw.currentRevision ?? 0,
  knownSnapshotIds: raw.knownSnapshotIds ?? [],
  knownCandidateIds: raw.knownCandidateIds ?? []
})

const fail = (code: ErrorCode, message: string): ParseFailure => ({ ok: false, code, message })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const requireStr = (
  data: Record<string, unknown>,
  key: string,
  allowNull = false
): { ok: true; value: string | null } | ParseFailure => {
  const value = data[key]
  if (value === null && allowNull) {
    return { ok: true, value: null }
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return fail('invalid_payload', `Missing or invalid identity field: ${key}`)
  }
  return { ok: true, value }
}

const requireInt = (data: Record<string, unknown>, key: string): { ok: true; value: number } | ParseFailure => {
  const value = data[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return fail('invalid_payload', `Missing or invalid integer field: ${key}`)
  }
  return { ok: true, value }
}

/** A nullable, finite, non-negative millisecond measurement. */
const optionalNumber = (
  data: Record<string, unknown>,
  key: string
): { ok: true; value: number | null } | ParseFailure => {
  const value = data[key]
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fail('invalid_payload', `${key} must be a finite non-negative number or null.`)
  }
  return { ok: true, value }
}

const requireNumber = (data: Record<string, unknown>, key: string): { ok: true; value: number } | ParseFailure => {
  const value = optionalNumber(data, key)
  if (!value.ok) return value
  if (value.value === null) return fail('invalid_payload', `${key} is required.`)
  return { ok: true, value: value.value }
}

const isTimingClock = (value: unknown): value is TimingClock =>
  value === 'server_monotonic' || value === 'client_monotonic'

export function parseModelSettings(raw: unknown): ParseResult<ModelSettings> {
  if (!isRecord(raw)) return fail('invalid_payload', 'modelSettings must be an object.')
  const role = raw.role
  if (role !== 'answer' && role !== 'detector') return fail('invalid_payload', `Unknown role: ${String(role)}`)
  const model = requireStr(raw, 'model')
  if (!model.ok) return model
  const requestedModel = requireStr(raw, 'requestedModel', true)
  if (!requestedModel.ok) return requestedModel
  const selectionSource = raw.selectionSource
  const sources: ModelSelectionSource[] = ['client', 'environment', 'default', 'deprecated_alias']
  if (typeof selectionSource !== 'string' || !sources.includes(selectionSource as ModelSelectionSource)) {
    return fail('invalid_payload', `Unknown selectionSource: ${String(selectionSource)}`)
  }
  if (!isRecord(raw.capabilities)) return fail('invalid_payload', 'modelSettings.capabilities must be an object.')
  const certainty = raw.capabilities.certainty
  const certainties: CapabilityCertainty[] = ['verified', 'catalog', 'unknown']
  if (typeof certainty !== 'string' || !certainties.includes(certainty as CapabilityCertainty)) {
    return fail('invalid_payload', `Unknown capability certainty: ${String(certainty)}`)
  }
  const capabilities: ModelCapabilities = {
    textInput: Boolean(raw.capabilities.textInput),
    textOutput: Boolean(raw.capabilities.textOutput),
    imageInput: Boolean(raw.capabilities.imageInput),
    structuredOutput: Boolean(raw.capabilities.structuredOutput),
    reasoningEfforts: Array.isArray(raw.capabilities.reasoningEfforts)
      ? raw.capabilities.reasoningEfforts.filter((item): item is string => typeof item === 'string')
      : [],
    certainty: certainty as CapabilityCertainty
  }
  let reasoning: ReasoningSetting | null = null
  if (raw.reasoning !== null && raw.reasoning !== undefined) {
    if (!isRecord(raw.reasoning)) return fail('invalid_payload', 'reasoning must be an object.')
    const effort = requireStr(raw.reasoning, 'effort')
    if (!effort.ok) return effort
    reasoning = {
      effort: effort.value as string,
      applied: Boolean(raw.reasoning.applied),
      supportedEfforts: Array.isArray(raw.reasoning.supportedEfforts)
        ? raw.reasoning.supportedEfforts.filter((item): item is string => typeof item === 'string')
        : [],
      source: raw.reasoning.source === 'client' ? 'client' : 'role_default'
    }
  }
  const substitutedFrom = requireStr(raw, 'substitutedFrom', true)
  if (!substitutedFrom.ok) return substitutedFrom
  const notice = requireStr(raw, 'notice', true)
  if (!notice.ok) return notice
  return {
    ok: true,
    value: {
      role: role as ModelRole,
      model: model.value as string,
      requestedModel: requestedModel.value,
      selectionSource: selectionSource as ModelSelectionSource,
      substitutedFrom: substitutedFrom.value,
      notice: notice.value,
      reasoning,
      capabilities
    }
  }
}

/** Milliseconds from request acceptance on the backend monotonic clock. */
export function parseBackendTiming(raw: unknown): ParseResult<BackendTiming> {
  if (!isRecord(raw)) return fail('invalid_payload', 'backend timing must be an object.')
  if (!isTimingClock(raw.clock)) return fail('invalid_payload', `Unknown timing clock: ${String(raw.clock)}`)
  if (raw.clock !== 'server_monotonic') {
    return fail('invalid_payload', 'backend timing must use the server_monotonic clock.')
  }
  const accepted = requireNumber(raw, 'acceptedMs')
  if (!accepted.ok) return accepted
  const completed = optionalNumber(raw, 'completedMs')
  if (!completed.ok) return completed
  if (completed.value !== null && completed.value < accepted.value) {
    return fail('invalid_payload', 'completedMs must be >= acceptedMs.')
  }

  let rag: RagTiming | null = null
  if (raw.rag !== null && raw.rag !== undefined) {
    if (!isRecord(raw.rag)) return fail('invalid_payload', 'rag timing must be an object.')
    const start = requireNumber(raw.rag, 'startMs')
    if (!start.ok) return start
    const end = requireNumber(raw.rag, 'endMs')
    if (!end.ok) return end
    if (end.value < start.value || start.value < accepted.value) {
      return fail('invalid_payload', 'rag timing must satisfy acceptedMs <= startMs <= endMs.')
    }
    const outcome = raw.rag.outcome
    if (typeof outcome !== 'string' || !RETRIEVAL_OUTCOMES.has(outcome)) {
      return fail('invalid_payload', `Unknown retrieval outcome: ${String(outcome)}`)
    }
    rag = {
      startMs: start.value,
      endMs: end.value,
      durationMs: end.value - start.value,
      outcome: outcome as RetrievalOutcome
    }
  }

  let generation: GenerationTiming | null = null
  if (raw.generation !== null && raw.generation !== undefined) {
    if (!isRecord(raw.generation)) return fail('invalid_payload', 'generation timing must be an object.')
    const start = requireNumber(raw.generation, 'startMs')
    if (!start.ok) return start
    const end = requireNumber(raw.generation, 'endMs')
    if (!end.ok) return end
    const first = optionalNumber(raw.generation, 'firstDeltaMs')
    if (!first.ok) return first
    if (start.value < accepted.value || end.value < start.value) {
      return fail('invalid_payload', 'generation timing must satisfy acceptedMs <= startMs <= endMs.')
    }
    if (first.value !== null && (first.value < start.value || first.value > end.value)) {
      return fail('invalid_payload', 'firstDeltaMs must fall inside the generation window.')
    }
    generation = {
      startMs: start.value,
      firstDeltaMs: first.value,
      endMs: end.value,
      durationMs: end.value - start.value
    }
  }

  const unavailableRaw = raw.unavailable ?? []
  if (!Array.isArray(unavailableRaw) || unavailableRaw.some((item) => typeof item !== 'string')) {
    return fail('invalid_payload', 'unavailable must be an array of measurement names.')
  }

  return {
    ok: true,
    value: {
      clock: 'server_monotonic',
      acceptedMs: accepted.value,
      rag,
      generation,
      completedMs: completed.value,
      unavailable: unavailableRaw as string[]
    }
  }
}

export function parseClientTiming(raw: unknown): ParseResult<ClientTiming> {
  if (!isRecord(raw)) return fail('invalid_payload', 'client timing must be an object.')
  if (raw.clock !== 'client_monotonic') {
    return fail('invalid_payload', 'client timing must use the client_monotonic clock.')
  }
  const pressed = optionalNumber(raw, 'pressedMs')
  if (!pressed.ok) return pressed
  const firstVisible = optionalNumber(raw, 'firstVisibleMs')
  if (!firstVisible.ok) return firstVisible
  const terminal = optionalNumber(raw, 'terminalReceivedMs')
  if (!terminal.ok) return terminal
  if (pressed.value !== null && firstVisible.value !== null && firstVisible.value < pressed.value) {
    return fail('invalid_payload', 'firstVisibleMs must be >= pressedMs on the same client clock.')
  }
  if (pressed.value !== null && terminal.value !== null && terminal.value < pressed.value) {
    return fail('invalid_payload', 'terminalReceivedMs must be >= pressedMs on the same client clock.')
  }
  return {
    ok: true,
    value: {
      clock: 'client_monotonic',
      pressedMs: pressed.value,
      firstVisibleMs: firstVisible.value,
      terminalReceivedMs: terminal.value
    }
  }
}

export function parseAnswerTiming(raw: unknown): ParseResult<AnswerTiming> {
  if (!isRecord(raw)) return fail('invalid_payload', 'timing must be an object.')
  const backend = parseBackendTiming(raw.backend)
  if (!backend.ok) return backend
  let client: ClientTiming | null = null
  if (raw.client !== null && raw.client !== undefined) {
    const parsed = parseClientTiming(raw.client)
    if (!parsed.ok) return parsed
    client = parsed.value
  }
  return { ok: true, value: { backend: backend.value, client } }
}

export function parseScreenshotAttachment(raw: unknown): ParseResult<ScreenshotAttachment> {
  if (!isRecord(raw)) return fail('invalid_payload', 'screenshot attachment must be an object.')
  const reason = requireStr(raw, 'reason', true)
  if (!reason.ok) return reason
  return {
    ok: true,
    value: {
      requested: Boolean(raw.requested),
      included: Boolean(raw.included),
      reason: reason.value
    }
  }
}

export function validateSourceSpan(raw: unknown): ParseResult<SourceSpan> {
  if (!isRecord(raw)) {
    return fail('invalid_span', 'Span must be an object.')
  }
  const start = raw.start
  const end = raw.end
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isInteger(start) || !Number.isInteger(end)) {
    return fail('invalid_span', 'Span offsets must be integers.')
  }
  if (start < 0 || end <= start) {
    return fail('invalid_span', 'Span offsets must satisfy 0 <= start < end.')
  }
  const segmentKey = requireStr(raw, 'segmentKey')
  if (!segmentKey.ok) return segmentKey
  const audioEpoch = requireStr(raw, 'audioEpoch')
  if (!audioEpoch.ok) return audioEpoch
  const revision = requireInt(raw, 'revision')
  if (!revision.ok) return revision
  if (typeof raw.sourceKind !== 'string' || !SOURCE_KINDS.has(raw.sourceKind as SourceKind)) {
    return fail('invalid_span', `Unknown sourceKind: ${String(raw.sourceKind)}`)
  }
  const sourceName = raw.sourceName
  if (sourceName !== null && sourceName !== undefined && typeof sourceName !== 'string') {
    return fail('invalid_span', 'sourceName must be a string or null.')
  }
  const t0 = raw.t0
  const t1 = raw.t1
  if (typeof t0 !== 'number' || typeof t1 !== 'number') {
    return fail('invalid_span', 'Span t0/t1 must be numbers.')
  }
  if (t1 < t0) {
    return fail('invalid_span', 'Span t1 must be >= t0.')
  }
  return {
    ok: true,
    value: {
      segmentKey: segmentKey.value as string,
      start,
      end,
      t0,
      t1,
      sourceKind: raw.sourceKind as SourceKind,
      sourceName: (sourceName as string | null) ?? null,
      audioEpoch: audioEpoch.value as string,
      revision: revision.value
    }
  }
}

/** Validates a client -> server v2 command. Returns the payload on success. */
export function parseCommand(payload: unknown, context: ContractContext): ParseResult<Record<string, unknown>> {
  if (!isRecord(payload)) {
    return fail('invalid_payload', 'Payload must be a JSON object.')
  }
  const msgType = payload.type
  if (typeof msgType !== 'string' || !V2_COMMAND_TYPES.includes(msgType as V2CommandType)) {
    return fail('invalid_payload', `Unknown command type: ${String(msgType)}`)
  }
  if (payload.protocolVersion !== context.protocolVersion) {
    return fail('incompatible_version', `Unsupported protocolVersion: ${String(payload.protocolVersion)}`)
  }

  const commandId = requireStr(payload, 'commandId')
  if (!commandId.ok) return commandId
  const sessionEpoch = requireInt(payload, 'sessionEpoch')
  if (!sessionEpoch.ok) return sessionEpoch

  if (msgType !== 'hello') {
    const backendInstanceId = requireStr(payload, 'backendInstanceId')
    if (!backendInstanceId.ok) return backendInstanceId
  }

  if (msgType === 'rerun_answer' || msgType === 'snapshot_action') {
    if (context.protocolVersion < 4) return fail('incompatible_version', 'This command requires protocol v4.')
    const id = requireStr(payload, msgType === 'rerun_answer' ? 'sourceAnswerId' : 'snapshotId')
    if (!id.ok) return id
    if (msgType === 'snapshot_action' && payload.action !== 'release') return fail('invalid_payload', 'Unknown snapshot action.')
  }
  if (payload.manualTarget != null) {
    if (context.protocolVersion < 4) return fail('incompatible_version', 'Manual targets require protocol v4.')
    const target = payload.manualTarget
    if (!isRecord(target)) return fail('invalid_payload', 'Manual target must be an object.')
    for (const key of ['targetId', 'sourceSnapshotId', 'wording']) { const value = requireStr(target, key); if (!value.ok) return value }
    if ((target.wording as string).length > 24000) return fail('invalid_payload', 'Manual target wording exceeds 24,000 characters.')
    if (target.sourceSnapshotId !== payload.snapshotId) return fail('invalid_span', 'Manual target source mismatch.')
  }

  if (msgType === 'hello' && context.protocolVersion >= 3) {
    const supported = payload.supportedProtocolVersions
    if (supported !== undefined && supported !== null) {
      if (!Array.isArray(supported) || supported.length === 0) {
        return fail('invalid_payload', 'supportedProtocolVersions must be a non-empty array.')
      }
      if (supported.some((item) => typeof item !== 'number' || !Number.isInteger(item))) {
        return fail('invalid_payload', 'supportedProtocolVersions must contain integers.')
      }
      if (!supported.some((item) => (SUPPORTED_WIRE_VERSIONS as readonly number[]).includes(item as number))) {
        return fail('incompatible_version', `No supported protocol version in ${JSON.stringify(supported)}.`)
      }
    }
  }

  if (context.protocolVersion >= 3) {
    const effort = payload.reasoningEffort
    if (effort !== undefined && effort !== null) {
      if (typeof effort !== 'string' || !(KNOWN_REASONING_EFFORTS as readonly string[]).includes(effort)) {
        return fail('invalid_payload', `Unknown reasoningEffort: ${String(effort)}`)
      }
    }
    const pressed = optionalNumber(payload, 'clientPressedAtMs')
    if (!pressed.ok) return pressed
  }

  if (msgType === 'run_context_query') {
    if (!WINDOW_SECONDS.has(payload.windowSeconds as number)) {
      return fail('invalid_payload', `Unsupported windowSeconds: ${String(payload.windowSeconds)}`)
    }
  }

  if (msgType === 'run_snapshot_query') {
    const snapshotId = requireStr(payload, 'snapshotId')
    if (!snapshotId.ok) return snapshotId
    if (context.knownSnapshotIds.length > 0 && !context.knownSnapshotIds.includes(snapshotId.value as string)) {
      return fail('invalid_span', `Unknown snapshotId: ${String(snapshotId.value)}`)
    }
  }

  if (msgType === 'run_context_query' || msgType === 'run_snapshot_query') {
    const mode = payload.mode
    if (typeof mode !== 'string' || !PROFILE_MODES.has(mode as ProfileMode)) {
      return fail('invalid_payload', `Unknown mode: ${String(mode)}`)
    }
    if (mode === 'Custom') {
      const instruction = payload.customInstruction
      if (typeof instruction !== 'string' || instruction.trim() === '') {
        return fail('invalid_payload', 'Custom mode requires a non-empty customInstruction.')
      }
    }
  }

  if (msgType === 'create_snapshot') {
    if (!SNAPSHOT_KINDS.has(payload.kind as SnapshotKind)) return fail('invalid_payload', 'Unknown snapshot kind.')
    if (payload.kind === 'selection') {
      if (!Array.isArray(payload.sourceSpans) || !payload.sourceSpans.length) return fail('invalid_payload', 'Selection needs source spans.')
      for (const span of payload.sourceSpans) {const parsed=validateSourceSpan(span); if(!parsed.ok)return parsed}
    } else { const anchor=requireStr(payload,'anchorSegmentKey');if(!anchor.ok)return anchor }
  }

  if (msgType === 'context_note_action') {
    if (typeof payload.action !== 'string' || !CONTEXT_NOTE_ACTIONS.has(payload.action)) {
      return fail('invalid_payload', `Unknown action: ${String(payload.action)}`)
    }
    const noteId = requireStr(payload, 'noteId')
    if (!noteId.ok) return noteId
    const text = requireStr(payload, 'text')
    if (!text.ok) return text
    if (typeof payload.includeInFutureContext !== 'boolean') {
      return fail('invalid_payload', 'includeInFutureContext must be a boolean.')
    }
  }

  if(msgType==='configure_auto'&&context.protocolVersion<6)return fail('incompatible_version','AUTO configuration requires v6.')
  if ((msgType==='set_auto'||msgType==='configure_auto')&&context.protocolVersion>=6) {
    const rev=requireInt(payload,'expectedConfigRevision');if(!rev.ok)return rev
    if(rev.value<0)return fail('invalid_payload','Invalid AUTO configuration revision.')
    if(msgType==='set_auto') {
      if(typeof payload.armed!=='boolean'||payload.mode!=='full_auto')return fail('invalid_payload','Invalid AUTO control.')
    } else {
      const settings=payload.settings
      if(!isRecord(settings)||Object.keys(settings).sort().join(',')!==['mode','presetId','customInstruction','model','reasoningEffort','humanNoteIds','includeScreenshot','screenshotDataUrl'].sort().join(',')||!['Preset','Custom'].includes(String(settings.mode))||typeof settings.includeScreenshot!=='boolean'||!Array.isArray(settings.humanNoteIds)||settings.humanNoteIds.length>50||settings.humanNoteIds.some(i=>typeof i!=='string'||!i))return fail('invalid_payload','Invalid AUTO settings.')
      for(const key of ['presetId','customInstruction','model','reasoningEffort','screenshotDataUrl'])if(settings[key]!=null&&typeof settings[key]!=='string')return fail('invalid_payload','Invalid AUTO setting fields.')
    }
    return {ok:true,value:payload}
  }
  if(msgType==='interaction_state'&&context.protocolVersion>=6){
    if(!Array.isArray(payload.holdReasons)||payload.holdReasons.length>7||payload.holdReasons.some(r=>typeof r!=='string'||!['raw_selection','target','question_editor','profile_editor','note_editor','settings','configuration_pending'].includes(String(r))))return fail('invalid_payload','Invalid AUTO hold reasons.')
    for(const key of ['selectedSnapshotIds','openEditors','inspectedAnswerIds'])if(!Array.isArray(payload[key])||(payload[key] as unknown[]).length>200||(payload[key] as unknown[]).some(i=>typeof i!=='string'))return fail('invalid_payload','Invalid interaction identities.')
    if(typeof payload.publicationHold!=='boolean')return fail('invalid_payload','Invalid publication hold.')
  }
  if (msgType === 'set_detection' && context.protocolVersion >= 5) {
    if (typeof payload.enabled !== 'boolean' || (payload.retry !== undefined && typeof payload.retry !== 'boolean')) return fail('invalid_payload', 'Detection needs boolean controls.')
  }
  if (msgType === 'candidate_action' && context.protocolVersion >= 5) return validateCandidateMutation(payload)

  if (msgType === 'candidate_action') {
    const action = payload.action
    if (typeof action !== 'string' || !CANDIDATE_ACTIONS.has(action)) {
      return fail('invalid_payload', `Unknown action: ${String(action)}`)
    }
    const candidateId = requireStr(payload, 'candidateId')
    if (!candidateId.ok) return candidateId
    const expectedRevision = requireInt(payload, 'expectedRevision')
    if (!expectedRevision.ok) return expectedRevision
    if (context.knownCandidateIds.length > 0 && !context.knownCandidateIds.includes(candidateId.value as string)) {
      return fail('invalid_span', `Unknown candidateId: ${String(candidateId.value)}`)
    }
    if (action !== 'create' && expectedRevision.value !== context.currentRevision) {
      return fail(
        'stale_revision',
        `expectedRevision ${expectedRevision.value} != current ${context.currentRevision}`
      )
    }
    const rawSpans = payload.sourceSpans
    if (!Array.isArray(rawSpans)) {
      return fail('invalid_payload', 'sourceSpans must be an array.')
    }
    for (const rawSpan of rawSpans) {
      const span = validateSourceSpan(rawSpan)
      if (!span.ok) return span
    }
  }

  return { ok: true, value: payload }
}

/** Validates a server -> client v2 answer_finished event. */
export function parseAnswerEvent(payload: unknown, context: ContractContext): ParseResult<Answer> {
  if (!isRecord(payload)) {
    return fail('invalid_payload', 'Payload must be a JSON object.')
  }
  if (payload.type !== 'answer_finished') {
    return fail('invalid_payload', 'parseAnswerEvent expects an answer_finished payload.')
  }
  if (payload.protocolVersion !== context.protocolVersion) {
    return fail('incompatible_version', 'Unsupported protocolVersion.')
  }
  const requestId = requireStr(payload, 'requestId')
  if (!requestId.ok) return requestId
  const answerId = requireStr(payload, 'answerId')
  if (!answerId.ok) return answerId
  const status = payload.status
  if (typeof status !== 'string' || !ANSWER_STATUSES.has(status)) {
    return fail('invalid_payload', `Unknown status: ${String(status)}`)
  }
  const eventSeq = requireInt(payload, 'eventSeq')
  if (!eventSeq.ok) return eventSeq
  if (typeof payload.text !== 'string') {
    return fail('invalid_payload', 'answer_finished.text must be a string.')
  }

  let retrieval: Answer['retrieval'] = null
  if (payload.retrieval !== null && payload.retrieval !== undefined) {
    if (!isRecord(payload.retrieval)) {
      return fail('invalid_payload', 'retrieval must be an object.')
    }
    const outcome = payload.retrieval.outcome
    if (typeof outcome !== 'string' || !RETRIEVAL_OUTCOMES.has(outcome)) {
      return fail('invalid_payload', `Unknown retrieval outcome: ${String(outcome)}`)
    }
    const rawChunks = payload.retrieval.chunks
    if (!Array.isArray(rawChunks)) {
      return fail('invalid_payload', 'retrieval.chunks must be an array.')
    }
    const chunks = rawChunks.map((rawChunk) => {
      if (!isRecord(rawChunk)) {
        return { docId: '', filePath: '', chunkIndex: 0, chunkId: '', title: '', excerpt: '' }
      }
      const docId = typeof rawChunk.docId === 'string' ? rawChunk.docId : ''
      const chunkIndex = typeof rawChunk.chunkIndex === 'number' ? rawChunk.chunkIndex : 0
      return {
        docId,
        filePath: typeof rawChunk.filePath === 'string' ? rawChunk.filePath : '',
        chunkIndex,
        chunkId: typeof rawChunk.chunkId === 'string' ? rawChunk.chunkId : `${docId}:${chunkIndex}`,
        title: typeof rawChunk.title === 'string' ? rawChunk.title : '',
        excerpt: typeof rawChunk.excerpt === 'string' ? rawChunk.excerpt : ''
      }
    })
    retrieval = { outcome: outcome as RetrievalOutcome, chunks }
  }

  let modelSettings: ModelSettings | null = null
  let timing: AnswerTiming | null = null
  if (context.protocolVersion >= 3) {
    if (payload.modelSettings !== null && payload.modelSettings !== undefined) {
      const parsed = parseModelSettings(payload.modelSettings)
      if (!parsed.ok) return parsed
      modelSettings = parsed.value
    }
    if (payload.timing !== null && payload.timing !== undefined) {
      const parsed = parseAnswerTiming(payload.timing)
      if (!parsed.ok) return parsed
      timing = parsed.value
    }
  }

  return {
    ok: true,
    value: {
      requestId: requestId.value as string,
      answerId: answerId.value as string,
      snapshotId: typeof payload.snapshotId === 'string' ? payload.snapshotId : null,
      candidateRevision: typeof payload.candidateRevision === 'number' ? payload.candidateRevision : null,
      status: status as Answer['status'],
      text: payload.text,
      eventSeq: eventSeq.value,
      latencyMs: typeof payload.latencyMs === 'number' ? payload.latencyMs : null,
      model: typeof payload.model === 'string' ? payload.model : null,
      screenshotUsed: Boolean(payload.screenshotUsed),
      retrieval,
      metadata: isRecord(payload.metadata) ? payload.metadata : {},
      modelSettings,
      timing
    }
  }
}

/** Validates a server -> client `answer_accepted` event (v3) and returns its frozen model. */
export function parseAnswerAcceptedEvent(
  payload: unknown,
  context: ContractContext
): ParseResult<ModelSettings> {
  if (!isRecord(payload)) return fail('invalid_payload', 'Payload must be a JSON object.')
  if (payload.type !== 'answer_accepted') {
    return fail('invalid_payload', 'parseAnswerAcceptedEvent expects an answer_accepted payload.')
  }
  if (payload.protocolVersion !== context.protocolVersion) {
    return fail('incompatible_version', 'Unsupported protocolVersion.')
  }
  if (context.protocolVersion < 3) {
    return fail('incompatible_version', 'answer_accepted carries frozen model settings only in protocol version 3.')
  }
  const requestId = requireStr(payload, 'requestId')
  if (!requestId.ok) return requestId
  const answerId = requireStr(payload, 'answerId')
  if (!answerId.ok) return answerId
  const snapshotId = requireStr(payload, 'snapshotId')
  if (!snapshotId.ok) return snapshotId
  if (!isRecord(payload.frozenInputs)) return fail('invalid_payload', 'frozenInputs must be an object.')
  const instruction = requireStr(payload.frozenInputs, 'instruction')
  if (!instruction.ok) return instruction
  const screenshot = parseScreenshotAttachment(payload.frozenInputs.screenshot)
  if (!screenshot.ok) return screenshot
  if (payload.timing !== null && payload.timing !== undefined) {
    const timing = parseAnswerTiming(payload.timing)
    if (!timing.ok) return timing
  }
  return parseModelSettings(payload.frozenInputs.model)
}

/** Validates a server -> client scoped `answer_timing` event (v3). */
export function parseAnswerTimingEvent(
  payload: unknown,
  context: ContractContext
): ParseResult<AnswerTiming> {
  if (!isRecord(payload)) return fail('invalid_payload', 'Payload must be a JSON object.')
  if (payload.type !== 'answer_timing') {
    return fail('invalid_payload', 'parseAnswerTimingEvent expects an answer_timing payload.')
  }
  if (payload.protocolVersion !== context.protocolVersion) {
    return fail('incompatible_version', 'Unsupported protocolVersion.')
  }
  if (context.protocolVersion < 3) {
    return fail('incompatible_version', 'answer_timing exists only in protocol version 3.')
  }
  const requestId = requireStr(payload, 'requestId')
  if (!requestId.ok) return requestId
  const answerId = requireStr(payload, 'answerId')
  if (!answerId.ok) return answerId
  const timingSeq = requireInt(payload, 'timingSeq')
  if (!timingSeq.ok) return timingSeq
  if (timingSeq.value < 1) return fail('invalid_payload', 'timingSeq must be >= 1.')
  return parseAnswerTiming(payload.timing)
}

export function parseAnswerStateEvent(payload: unknown, context: ContractContext): ParseResult<import('./types').AnswerStateEvent> {
  if (!isRecord(payload)) return fail('invalid_payload', 'Expected answer state object.')
  if (context.protocolVersion < 4 || payload.protocolVersion !== context.protocolVersion) return fail('incompatible_version', 'Answer state requires protocol v4.')
  if (payload.type !== 'answer_state') return fail('invalid_payload', 'Expected answer_state.')
  for (const key of ['backendInstanceId','connectionId','requestId','answerId','reason']) {const value=requireStr(payload,key);if(!value.ok)return value}
  const epoch=requireInt(payload,'sessionEpoch');if(!epoch.ok)return epoch
  const seq=requireInt(payload,'stateSeq');if(!seq.ok)return seq
  if ((seq.value as number)<1 || !['working','kept'].includes(payload.placement as string) || typeof payload.removed!=='boolean' || typeof payload.snapshotAvailable!=='boolean') return fail('invalid_payload', 'Invalid answer state fields.')
  return {ok:true,value:payload as unknown as import('./types').AnswerStateEvent}
}


export function validateCandidateMutation(payload: Record<string, unknown>): ParseResult<Record<string, unknown>> {
  const action = payload.action
  if (typeof action !== 'string' || !CANDIDATE_ACTIONS.has(action)) return fail('invalid_payload', 'Unknown candidate action.')
  const parents = payload.parents, drafts = payload.drafts
  if (!Array.isArray(parents) || !Array.isArray(drafts)) return fail('invalid_payload', 'Candidate actions need parents and drafts arrays.')
  const counts: Record<string, [number | null, number | null]> = {create:[0,1],edit:[1,1],split:[1,null],merge:[null,1],dismiss:[1,0],undo:[1,0],correct:[null,1]}
  const [p,d] = counts[action]
  if ((p !== null && parents.length !== p) || (d !== null && drafts.length !== d) || (action === 'split' && (drafts.length < 2 || drafts.length > 8)) || (action === 'merge' && (parents.length < 2 || parents.length > 8)) || (action === 'correct' && parents.length > 1)) return fail('invalid_payload', 'Wrong number of candidate parents/drafts.')
  const ids = new Set<string>()
  for (const parent of parents) {
    if (!isRecord(parent) || typeof parent.candidateId !== 'string' || !parent.candidateId.trim() || typeof parent.expectedRevision !== 'number' || !Number.isInteger(parent.expectedRevision) || parent.expectedRevision < 1 || ids.has(parent.candidateId)) return fail('invalid_payload', 'Candidate parents need distinct identities and positive revisions.')
    ids.add(parent.candidateId)
  }
  for (const draft of drafts) {
    if (!isRecord(draft) || typeof draft.wording !== 'string' || !draft.wording.trim() || draft.wording.length > 2000 || !Array.isArray(draft.sourceSpans) || draft.sourceSpans.length < 1 || draft.sourceSpans.length > 64) return fail('invalid_payload', 'Draft needs bounded wording and source spans.')
    for (const span of draft.sourceSpans) {const parsed=validateSourceSpan(span);if(!parsed.ok)return parsed}
  }
  if (action === 'correct' && (typeof payload.sourceAnswerId !== 'string' || !payload.sourceAnswerId.trim())) return fail('invalid_payload', 'Correction needs sourceAnswerId.')
  return {ok:true,value:payload}
}

export function parseCandidateStateEvent(data: unknown): ParseResult<import('./types').CandidateStateEvent> {
  if (!isRecord(data) || ![5,6].includes(Number(data.protocolVersion)) || data.type !== 'candidate_state' || !Number.isInteger(data.stateSeq) || Number(data.stateSeq) < 1 || !Number.isInteger(data.revisionCount) || Number(data.revisionCount) < 0 || Number(data.revisionCount) > 200 || !Array.isArray(data.candidates) || data.candidates.length > 200) return fail('invalid_payload','Invalid question state.')
  for (const key of ['backendInstanceId','connectionId']) {if(typeof data[key]!=='string'||!String(data[key]).trim())return fail('invalid_payload','Invalid question identity.')}
  if(!Number.isInteger(data.sessionEpoch))return fail('invalid_payload','Invalid question epoch.')
  const ids = new Set<string>()
  for (const c of data.candidates) {
    if (!isRecord(c) || typeof c.candidateId !== 'string' || ids.has(c.candidateId) || !Number.isInteger(c.candidateRevision) || Number(c.candidateRevision)<1 || typeof c.wording !== 'string' || !c.wording.trim() || c.wording.length>2000 || !['proposed','incomplete','needs_review','user_set','queued','answered','dismissed','superseded'].includes(String(c.state)) || !isRecord(c.snapshot) || typeof c.snapshot.snapshotId !== 'string' || typeof c.snapshot.text !== 'string' || !['human','detector'].includes(String(c.origin)) || !Array.isArray(c.sourceSpans) || c.sourceSpans.length<1 || c.sourceSpans.length>64 || JSON.stringify(c.snapshot.sourceSpans)!==JSON.stringify(c.sourceSpans) || !Array.isArray(c.supersedes)) return fail('invalid_payload','Invalid candidate.')
    ids.add(c.candidateId)
    if(data.protocolVersion===6){
      const review=c.reviewReasons
      if(review===undefined||(review!==null&&(!Array.isArray(review)||review.length>5||review.some(r=>typeof r!=='string'||!['incomplete','ambiguous','conflicting','negated','unsupported'].includes(r)))))return fail('invalid_payload','Invalid AUTO review flags.')
      if(![null,'pending','active','deferred','attempted'].includes(c.autoStatus as string|null))return fail('invalid_payload','Invalid candidate AUTO status.')
    }
    for(const span of c.sourceSpans){const parsed=validateSourceSpan(span);if(!parsed.ok)return parsed}
  }
  return {ok:true,value:data as unknown as import('./types').CandidateStateEvent}
}


export function parseDetectionStateEvent(data: unknown): ParseResult<import('./types').DetectionState & {stateSeq:number}> {
  if(!isRecord(data)||![5,6].includes(Number(data.protocolVersion))||data.type!=='detector_state'||!Number.isInteger(data.stateSeq)||Number(data.stateSeq)<1||['enabled','inFlight','dirty','truncated'].some(k=>typeof data[k]!=='boolean')||!['disabled','disconnected','no_source','running','proposals','no_candidates','failed','superseded'].includes(String(data.outcome))||(data.lastError!==null&&typeof data.lastError!=='string')||(data.lastRevision!==null&&(!Number.isInteger(data.lastRevision)||Number(data.lastRevision)<0)))return fail('invalid_payload','Invalid detector state.')
  for(const key of ['backendInstanceId','connectionId']){if(typeof data[key]!=='string'||!String(data[key]).trim())return fail('invalid_payload','Invalid detector identity.')}
  if(!Number.isInteger(data.sessionEpoch))return fail('invalid_payload','Invalid detector epoch.')
  if(data.model!==null){const model=parseModelSettings(data.model);if(!model.ok)return model}
  return {ok:true,value:data as unknown as import('./types').DetectionState & {stateSeq:number}}
}


export function parseAutoStateEvent(data:unknown):ParseResult<import('./types').AutoStateEvent>{
  if(!isRecord(data)||data.protocolVersion!==6||data.type!=='assistance_state')return fail('incompatible_version','AUTO state requires protocol v6.')
  for(const key of ['backendInstanceId','connectionId','pauseReason']){const parsed=requireStr(data,key);if(!parsed.ok)return parsed}
  if(!Number.isInteger(data.sessionEpoch)||!Number.isInteger(data.stateSeq)||Number(data.stateSeq)<1||!Number.isInteger(data.configRevision)||Number(data.configRevision)<0)return fail('invalid_payload','Invalid AUTO identity/sequence.')
  for(const key of ['autoArmed','listening','detectionEnabled','configurationReady','generationBusy'])if(typeof data[key]!=='boolean')return fail('invalid_payload','Invalid AUTO flags.')
  if(data.lastError!==null&&typeof data.lastError!=='string')return fail('invalid_payload','Invalid AUTO error.')
  for(const key of ['activeAnswerId','deferredAnswerId'])if(data[key]!==null&&(typeof data[key]!=='string'||!String(data[key]).trim()))return fail('invalid_payload','Invalid AUTO answer identity.')
  if(!Array.isArray(data.holdReasons)||data.holdReasons.length>7||data.holdReasons.some(r=>typeof r!=='string'||!['raw_selection','target','question_editor','profile_editor','note_editor','settings','configuration_pending'].includes(String(r))))return fail('invalid_payload','Invalid AUTO holds.')
  if(data.pendingCandidate!==null&&(!isRecord(data.pendingCandidate)||typeof data.pendingCandidate.candidateId!=='string'||!data.pendingCandidate.candidateId.trim()||!Number.isInteger(data.pendingCandidate.candidateRevision)||Number(data.pendingCandidate.candidateRevision)<1))return fail('invalid_payload','Invalid pending question.')
  return {ok:true,value:data as unknown as import('./types').AutoStateEvent}
}
