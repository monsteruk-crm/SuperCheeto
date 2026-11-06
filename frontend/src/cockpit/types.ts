// Protocol v2/v3 types (M01-T04, amended by M3bis-T04).
//
// Mirrors `backend/app/cockpit_models.py` (snake_case internally). Field names
// here are the documented camelCase wire format. Protocol v3 adds the role /
// capability metadata (model readiness) and the C08 timing contract; the v2
// contract is unchanged and a v2 payload still parses exactly as before.
//
// See ADR 0012, ADR 0014 and docs/API.md.

export type ProtocolVersion = 1 | 2 | 3 | 4 | 5 | 6

export type SourceKind = 'system' | 'mic'

export type SnapshotKind = 'recent_window' | 'selection' | 'pinned_moment'

export type AnswerStatus = 'completed' | 'cancelled' | 'failed' | 'empty' | 'superseded'

export type RetrievalOutcome = 'used' | 'no_documents' | 'no_matches' | 'failed'

export type CandidateState =
  | 'proposed'
  | 'incomplete'
  | 'needs_review'
  | 'user_set'
  | 'queued'
  | 'answered'
  | 'dismissed'
  | 'superseded'

export type CandidateAction = 'create' | 'edit' | 'split' | 'merge' | 'dismiss' | 'undo' | 'correct'

export type AnswerAction = 'keep' | 'unkeep' | 'remove'

export type ContextNoteAction = 'create' | 'edit' | 'remove'

export type CommandStatus = 'accepted' | 'rejected' | 'unknown'

export type PauseReason =
  | 'not_armed'
  | 'no_capability'
  | 'no_owner'
  | 'no_source_epoch'
  | 'hold'
  | 'capacity'
  | 'owner_lost'

export type ErrorCode =
  | 'offline'
  | 'not_ready'
  | 'incompatible_version'
  | 'not_owner'
  | 'stale_epoch'
  | 'stale_revision'
  | 'invalid_span'
  | 'capacity'
  | 'dependency'
  | 'empty'
  | 'invalid_payload'
  | 'unsupported_capability'
  | 'unavailable_model'

export type ProfileMode = 'Preset' | 'Custom'

export type Capability =
  | 'assist'
  | 'snapshots'
  | 'candidates'
  | 'answer_records'
  | 'full_auto'
  | 'model_readiness'
  | 'timing'
  | 'manual_targets'
  | 'answer_rerun'
  | 'answer_state'

// ---- Model readiness (M3bis-T02) ------------------------------------------------

export type ModelRole = 'answer' | 'detector'

export type ModelSelectionSource = 'client' | 'environment' | 'default' | 'deprecated_alias'

/** `imageInput`/`structuredOutput` are positively-known facts; unknown models report false. */
export type CapabilityCertainty = 'verified' | 'catalog' | 'unknown'

export type ModelCapabilities = {
  textInput: boolean
  textOutput: boolean
  imageInput: boolean
  structuredOutput: boolean
  reasoningEfforts: string[]
  certainty: CapabilityCertainty
}

export type ReasoningSetting = {
  effort: string
  /** True only when this build actually sends the provider parameter. */
  applied: boolean
  supportedEfforts: string[]
  source: 'role_default' | 'client'
}

export type ModelSettings = {
  role: ModelRole
  model: string
  requestedModel: string | null
  selectionSource: ModelSelectionSource
  substitutedFrom: string | null
  notice: string | null
  reasoning: ReasoningSetting | null
  capabilities: ModelCapabilities
}

export type ScreenshotAttachment = {
  requested: boolean
  included: boolean
  reason: string | null
}

export type FrozenInputs = {
  manualTarget?: ManualTarget | null
  humanNotes?: Array<{noteId: string; text: string; contentHash: string}>
  instruction: string
  humanNoteIds: string[]
  includeScreenshot: boolean
  /** v3 only. */
  mode?: ProfileMode
  presetId?: string | null
  model?: ModelSettings
  screenshot?: ScreenshotAttachment
}

// ---- Timing (M3bis-T03, C08) ----------------------------------------------------

/** Clock domain. Values from two domains are never combined arithmetically. */
export type TimingClock = 'server_monotonic' | 'client_monotonic'

export type RagTiming = {
  startMs: number
  endMs: number
  durationMs: number
  outcome: RetrievalOutcome
}

export type GenerationTiming = {
  startMs: number
  /** First nonempty answer delta; null when none arrived. */
  firstDeltaMs: number | null
  endMs: number
  durationMs: number
}

/** Milliseconds from request acceptance on the backend monotonic clock. */
export type BackendTiming = {
  clock: 'server_monotonic'
  acceptedMs: number
  rag: RagTiming | null
  generation: GenerationTiming | null
  completedMs: number | null
  /** Names of measurements this backend did not produce. Never faked as zero. */
  unavailable: string[]
}

/** Client monotonic values. The backend echoes them but never computes with them. */
export type ClientTiming = {
  clock: 'client_monotonic'
  pressedMs: number | null
  firstVisibleMs: number | null
  terminalReceivedMs: number | null
}

export type AnswerTiming = {
  backend: BackendTiming
  client: ClientTiming | null
}

/** Half-open `[start, end)` range measured in Unicode code points. */
export type SourceSpan = {
  segmentKey: string
  start: number
  end: number
  t0: number
  t1: number
  sourceKind: SourceKind
  sourceName: string | null
  audioEpoch: string
  revision: number
}

export type Snapshot = {
  snapshotId: string
  kind: SnapshotKind
  text: string
  charCount: number
  truncated: boolean
  sourceSpans: SourceSpan[]
  anchorSegmentKey: string | null
  createdAt: number
  /** Includes explicitly requested partial text; manual use only, never AUTO. */
  tentative: boolean
}

export type Target = {
  targetId: string
  wording: string
  sourceSnapshotId: string | null
  sourceSpans: SourceSpan[]
  mode: ProfileMode
  createdBy: string
  createdAt: number
  supersededBy: string | null
}

export type Candidate = {
  candidateId: string
  candidateRevision: number
  state: CandidateState
  wording: string
  reason: string | null
  origin: string
  sourceSpans: SourceSpan[]
  supersedes: string[]
  snapshot?: Snapshot
  sourceAnswerId?: string | null
  reviewReasons?: ReviewReason[] | null
  autoStatus?: 'pending' | 'active' | 'deferred' | 'attempted' | null
}

export type RetrievedChunk = {
  docId: string
  filePath: string
  chunkIndex: number
  chunkId: string
  title: string
  excerpt: string
}

export type RetrievalResult = {
  outcome: RetrievalOutcome
  chunks: RetrievedChunk[]
}

export type Answer = {
  requestId: string
  answerId: string
  snapshotId: string | null
  candidateRevision: number | null
  status: AnswerStatus
  text: string
  eventSeq: number
  latencyMs: number | null
  model: string | null
  screenshotUsed: boolean
  retrieval: RetrievalResult | null
  metadata: Record<string, unknown>
  /** v3 only. */
  modelSettings?: ModelSettings | null
  /** v3 only. */
  timing?: AnswerTiming | null
}

export type ControlState = {
  isOwner: boolean
  ownerConnectionId: string | null
  readOnly: boolean
  sessionEpoch: number
}

export type HelloAck = {
  type: 'hello_ack'
  protocolVersion: 2 | 3 | 4
  backendInstanceId: string
  connectionId: string
  sessionEpoch: number
  capabilities: Capability[]
  supportedProtocolVersions?: number[]
  serverTime: number
}

// ---- Client -> server commands -------------------------------------------------

export type CommandEnvelope = {
  protocolVersion: 2 | 3 | 4
  backendInstanceId: string
  sessionEpoch: number
  commandId: string
}

export type HelloCommand = CommandEnvelope & {
  type: 'hello'
  /** Newest version this client can speak; the server picks the negotiated one. */
  protocolVersion: 2 | 3 | 4
  supportedProtocolVersions?: number[]
  client: { appId: string; clientVersion: string }
}

export type ClaimControlCommand = CommandEnvelope & { type: 'claim_control' }

export type GetCommandStatusCommand = CommandEnvelope & {
  type: 'get_command_status'
  queryCommandId: string
}

export type CreateSnapshotCommand = CommandEnvelope & {
  type: 'create_snapshot'
  kind: SnapshotKind
  /** Required for `recent_window`/`pinned_moment`; ignored for `selection`. */
  anchorSegmentKey: string
  windowSeconds: 20 | 45 | 90
  includePartial: boolean
  /** Required when `kind` is `selection`: exact `[start, end)` spans. */
  sourceSpans?: SourceSpan[]
}

export type RunContextQueryCommand = CommandEnvelope & {
  type: 'run_context_query'
  anchorSegmentKey: string
  windowSeconds: 20 | 45 | 90
  targetId: string | null
  mode: ProfileMode
  presetId: string | null
  customInstruction: string | null
  model: string
  /** v3 only: validated against the model's known efforts, never applied silently. */
  reasoningEffort?: 'low' | 'medium' | 'high' | null
  /** v3 only: client monotonic press instant, echoed for display correlation. */
  clientPressedAtMs?: number | null
  includeScreenshot: boolean
  screenshotDataUrl: string | null
  humanNoteIds: string[]
}

export type RunSnapshotQueryCommand = CommandEnvelope & {
  type: 'run_snapshot_query'
  snapshotId: string
  manualTarget?: ManualTarget | null
  targetId: string | null
  mode: ProfileMode
  presetId: string | null
  customInstruction: string | null
  model: string
  reasoningEffort?: 'low' | 'medium' | 'high' | null
  clientPressedAtMs?: number | null
  includeScreenshot: boolean
  screenshotDataUrl: string | null
  humanNoteIds: string[]
}

export type CancelAnswerCommand = CommandEnvelope & {
  type: 'cancel_answer'
  requestId: string
  answerId: string
}

export type CandidateActionCommand = CommandEnvelope & {
  type: 'candidate_action'
  action: CandidateAction
  candidateId: string
  expectedRevision: number
  wording: string
  sourceSpans: SourceSpan[]
}

export type CandidateMutation = {
  type: 'candidate_action'
  action: CandidateAction
  parents: Array<{candidateId: string; expectedRevision: number}>
  drafts: Array<{wording: string; sourceSpans: SourceSpan[]}>
  sourceAnswerId?: string
}
export type CandidateStateEvent = EventEnvelope & {type: 'candidate_state'; commandId?: string | null; stateSeq: number; candidates: Candidate[]; revisionCount: number}
export type DetectionState = {enabled: boolean; inFlight: boolean; dirty: boolean; lastError: string | null; outcome: string; truncated: boolean; lastRevision: number | null; model: ModelSettings | null}

export type AnswerActionCommand = CommandEnvelope & {
  type: 'answer_action'
  answerId: string
  action: AnswerAction
}

export type ContextNoteActionCommand = CommandEnvelope & {
  type: 'context_note_action'
  action: ContextNoteAction
  noteId: string | null
  text: string
  includeInFutureContext: boolean
}

export type SetDetectionCommand = CommandEnvelope & {
  type: 'set_detection'
  retry?: boolean
  enabled: boolean
}

export type ReviewReason = 'incomplete' | 'ambiguous' | 'conflicting' | 'negated' | 'unsupported'
export type HoldReason = 'raw_selection' | 'target' | 'question_editor' | 'profile_editor' | 'note_editor' | 'settings' | 'configuration_pending'
export type AutoSettings = {mode: ProfileMode; presetId: string | null; customInstruction: string | null; model: string | null; reasoningEffort: string | null; humanNoteIds: string[]; includeScreenshot: boolean; screenshotDataUrl: string | null}
export type AutoState = {
  autoArmed: boolean; pauseReason: string; lastError: string | null; listening: boolean; detectionEnabled: boolean
  holdReasons: HoldReason[]; configRevision: number; configurationReady: boolean; generationBusy: boolean
  activeAnswerId: string | null; pendingCandidate: {candidateId:string;candidateRevision:number}|null; deferredAnswerId: string | null
}
export type AutoStateEvent = EventEnvelope & AutoState & {type:'assistance_state';stateSeq:number;commandId?:string|null}
export type ConfigureAutoCommand = CommandEnvelope & {type:'configure_auto';expectedConfigRevision:number;settings:AutoSettings}

export type SetAutoCommand = CommandEnvelope & {
  type: 'set_auto'
  expectedConfigRevision?: number
  armed: boolean
  mode: 'full_auto'
}

export type InteractionStateCommand = CommandEnvelope & {
  type: 'interaction_state'
  selectedSnapshotIds: string[]
  openEditors: string[]
  inspectedAnswerIds: string[]
  publicationHold: boolean
  holdReasons?: HoldReason[]
}

export type V2ClientCommand =
  | HelloCommand
  | ClaimControlCommand
  | (CommandEnvelope & {type: 'rerun_answer'; sourceAnswerId: string; clientPressedAtMs: number})
  | (CommandEnvelope & {type: 'snapshot_action'; snapshotId: string; action: 'release'})
  | GetCommandStatusCommand
  | CreateSnapshotCommand
  | RunContextQueryCommand
  | RunSnapshotQueryCommand
  | CancelAnswerCommand
  | (CommandEnvelope & CandidateMutation)
  | CandidateActionCommand
  | AnswerActionCommand
  | ContextNoteActionCommand
  | SetDetectionCommand
  | SetAutoCommand
  | ConfigureAutoCommand
  | InteractionStateCommand

// ---- Server -> client events --------------------------------------------------

export type EventEnvelope = {
  protocolVersion: 2 | 3 | 4
  backendInstanceId: string
  connectionId: string
  sessionEpoch: number
}

export type ControlStateEvent = EventEnvelope & {
  type: 'control_state'
  isOwner: boolean
  ownerConnectionId: string | null
  readOnly: boolean
}

export type CommandAckEvent = EventEnvelope & {
  type: 'command_ack'
  commandId: string
  accepted: boolean
  requestId: string | null
  answerId: string | null
  code?: ErrorCode | null
  message?: string | null
}

export type CommandStatusEvent = EventEnvelope & {
  result?: Array<Record<string, unknown>>
  type: 'command_status'
  commandId: string
  status: CommandStatus
  requestId: string | null
  answerId: string | null
}

export type SnapshotCreatedEvent = EventEnvelope & {
  type: 'snapshot_created'
  commandId: string
  snapshot: Snapshot
}

export type CandidateUpdateEvent = EventEnvelope & {
  type: 'candidate_update'
  candidate: Candidate
}

export type DetectorStateEvent = EventEnvelope & {
  type: 'detector_state'
  enabled: boolean
  inFlight: boolean
  lastError: string | null
  dirty: boolean
}

export type AssistanceStateEvent = EventEnvelope & {
  type: 'assistance_state'
  autoArmed: boolean
  pauseReason: PauseReason
  activeAnswerId: string | null
  pendingCandidateId: string | null
  generationBusy: boolean
}

export type AnswerAcceptedEvent = EventEnvelope & {
  origin?: 'manual' | 'auto'; configRevision?: number|null; generationStatus?:string; publicationStatus?:string
  type: 'answer_accepted'
  commandId: string
  requestId: string
  answerId: string
  snapshotId: string
  candidateRevision: number | null
  mode: ProfileMode
  model: string
  frozenInputs: FrozenInputs
  /** v3 only. */
  timing?: AnswerTiming
}

export type AnswerChunkEvent = EventEnvelope & {
  type: 'answer_chunk'
  requestId: string
  answerId: string
  snapshotId: string
  candidateRevision: number | null
  eventSeq: number
  delta: string
}

export type AnswerFinishedEvent = EventEnvelope & {
  type: 'answer_finished'
  requestId: string
  answerId: string
  snapshotId: string
  candidateRevision: number | null
  status: AnswerStatus
  text: string
  eventSeq: number
  latencyMs: number | null
  model: string | null
  screenshotUsed: boolean
  retrieval: RetrievalResult
  metadata: Record<string, unknown>
  /** v3 only. */
  modelSettings?: ModelSettings | null
  /** v3 only. */
  timing?: AnswerTiming | null
}

/**
 * Scoped timing update (v3 only). `timingSeq` is independent of `eventSeq` so a
 * timing update never displaces or duplicates answer content. A timing event
 * cannot revive a terminal record.
 */
export type AnswerTimingEvent = EventEnvelope & {
  type: 'answer_timing'
  requestId: string
  answerId: string
  snapshotId: string
  candidateRevision: number | null
  timingSeq: number
  timing: AnswerTiming
}

export type RequestErrorEvent = EventEnvelope & {
  type: 'request_error'
  requestId: string
  answerId: string | null
  code: ErrorCode
  message: string
}

export type V2ServerEvent =
  | HelloAck
  | ControlStateEvent
  | CommandAckEvent
  | CommandStatusEvent
  | SnapshotCreatedEvent
  | CandidateUpdateEvent
  | DetectorStateEvent
  | AssistanceStateEvent
  | AnswerAcceptedEvent
  | AnswerChunkEvent
  | AnswerTimingEvent
  | AnswerFinishedEvent
  | RequestErrorEvent

export type ManualTarget = { targetId: string; sourceSnapshotId: string; wording: string; wordingOrigin?: string }
export type AnswerStateEvent = EventEnvelope & {
  origin?: 'manual' | 'auto'; generationStatus?: string; publicationStatus?: string; configRevision?:number|null
  correctedBy?: string | null
  type: 'answer_state'; commandId?: string | null; requestId: string; answerId: string;
  stateSeq: number; placement: 'working' | 'kept'; removed: boolean; snapshotAvailable: boolean; reason: string
}
