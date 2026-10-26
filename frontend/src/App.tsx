import type { Candidate, CandidateMutation, DetectionState, AutoState, AutoSettings, HoldReason } from './cockpit/types'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SoundDialog from './components/SoundDialog'
import AudioMeter from './components/AudioMeter'
import {MeterStore} from './audio/meter_store'
import TranscriptPane from './components/TranscriptPane'
import OutputPane from './components/OutputPane'
import SettingsPage from './components/SettingsPage'
import CockpitDesk from './components/CockpitDesk'
import { cockpitReducer, initialCockpitState, requestList, type RequestRecord } from './cockpit/reducer'
import type { SourceSpan, SnapshotCreatedEvent, Snapshot } from './cockpit/types'
import {
  AudioStreamKind,
  BenchmarkCaseInput,
  BenchmarkImageAsset,
  BenchmarkLiveLog,
  BenchmarkProgress,
  BenchmarkRun,
  GatewayModelInfo,
  Preset,
  RagDocument,
  SelectionRange,
  TranscriptSegment
} from './types'
import { WSClient } from './ws'
import { AnswerStreamBuffer } from './cockpit/stream_buffer'
import { readLayout } from './cockpit/layout'
import type { TargetDraft, SnapshotPurpose } from './cockpit/target'

const PRESETS: Preset[] = [
  {
    id: 'fact_check',
    label: 'Fact check (no browsing)',
    instruction: 'Identify claims that may be wrong; explain uncertainty; suggest what to verify.'
  },
  {
    id: 'answer_question',
    label: 'Answer the question',
    instruction: 'Answer clearly and concisely.'
  },
  {
    id: 'write_js',
    label: 'Write JavaScript code',
    instruction: 'Write JavaScript code to satisfy the request; include edge cases.'
  },
  {
    id: 'action_items',
    label: 'Extract action items',
    instruction: 'List action items with any owners/dates mentioned.'
  }
]

const ANSWER_PRESET_ID = 'answer_question'

const parseMaxRows = () => {
  const raw = Number(import.meta.env.VITE_MAX_ROWS)
  if (!Number.isFinite(raw) || raw <= 0) return 30
  return Math.floor(raw)
}

const parseSelectedTextRowsCollapsed = () => {
  const raw = Number(import.meta.env.VITE_SELECTED_TEXT_ROWS_COLLAPSED)
  if (!Number.isFinite(raw) || raw <= 0) return 2
  return Math.max(1, Math.min(20, Math.floor(raw)))
}

const parseSelectedTextRowsFocused = (collapsedRows: number) => {
  const raw = Number(import.meta.env.VITE_SELECTED_TEXT_ROWS_FOCUSED)
  if (!Number.isFinite(raw) || raw <= 0) return Math.max(10, collapsedRows)
  return Math.max(collapsedRows, Math.min(30, Math.floor(raw)))
}

const BENCHMARK_HISTORY_STORAGE_KEY = 'benchmark-history.v1'
const BENCHMARK_IMAGES_STORAGE_KEY = 'benchmark-images.v1'
const UI_PREFERENCES_STORAGE_KEY = 'ui-preferences.v1'
const MAX_BENCHMARK_HISTORY = 40
const MAX_BENCHMARK_LIVE_LOGS = 500
const HUMAN_NOTES_STORAGE_KEY = 'cockpit-human-notes.v1'

type HumanNote = { noteId: string; text: string; includeInFutureContext: boolean }

const loadHumanNotes = (): HumanNote[] => {
  try {
    const value = JSON.parse(window.localStorage.getItem(HUMAN_NOTES_STORAGE_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item, index): item is HumanNote => item && typeof item.noteId === 'string' && item.noteId.trim().length > 0 && typeof item.text === 'string' && item.text.trim().length > 0 && item.text.length <= 4000 && typeof item.includeInFutureContext === 'boolean' && value.findIndex((other) => other?.noteId === item.noteId) === index).slice(0, 50)
  } catch { return [] }
}

type UIPreferences = {
  profileMode?: 'Preset' | 'Custom'
  audioMode?: AudioStreamKind
  selectedSystemAudioSource?: string
  selectedMicAudioSource?: string
  customInstruction?: string
  selectedModel?: string
  selectedPresetId?: string
  includeScreenshotInQuery?: boolean
}

const speedScoreFromMs = (valueMs: number | null | undefined, pivotMs: number): number => {
  if (valueMs === null || valueMs === undefined || !Number.isFinite(valueMs) || valueMs <= 0) {
    return 0
  }
  return 1 / (1 + (valueMs / pivotMs))
}

const fallbackAggregateScore = (row: any): number => {
  const runs = Number.isFinite(row?.runs) ? Number(row.runs) : 0
  const failures = Number.isFinite(row?.failures) ? Number(row.failures) : 0
  const jsonValidRuns = Number.isFinite(row?.jsonValidRuns) ? Number(row.jsonValidRuns) : 0
  const imageRuns = Number.isFinite(row?.imageRuns) ? Number(row.imageRuns) : 0
  const imageWorkedRuns = Number.isFinite(row?.imageWorkedRuns) ? Number(row.imageWorkedRuns) : 0
  const avgTtcMs =
    (typeof row?.avgTtcMs === 'number' && Number.isFinite(row.avgTtcMs))
      ? row.avgTtcMs
      : (typeof row?.avgLatencyMs === 'number' && Number.isFinite(row.avgLatencyMs))
        ? row.avgLatencyMs
        : null
  const avgFirstTokenMs =
    (typeof row?.avgFirstTokenMs === 'number' && Number.isFinite(row.avgFirstTokenMs))
      ? row.avgFirstTokenMs
      : null
  const avgQualityScore =
    (typeof row?.avgQualityScore === 'number' && Number.isFinite(row.avgQualityScore))
      ? row.avgQualityScore
      : 0

  const totalAttempts = runs + failures
  const successRate = totalAttempts > 0 ? runs / totalAttempts : 0
  const jsonRate = runs > 0 ? jsonValidRuns / runs : 0
  const qualityRate = Math.max(0, Math.min(1, avgQualityScore))
  const imageRate = imageRuns > 0 ? imageWorkedRuns / imageRuns : 1

  const ttcScore = speedScoreFromMs(avgTtcMs, 900)
  const ttftScore = speedScoreFromMs(avgFirstTokenMs, 260)
  const speedScore = (0.84 * ttcScore) + (0.16 * ttftScore)
  const reliabilityScore = (0.72 * successRate) + (0.28 * jsonRate)
  const qualityScore = (0.75 * qualityRate) + (0.25 * imageRate)
  const raw = (0.82 * speedScore) + (0.13 * reliabilityScore) + (0.05 * qualityScore)
  const penalty = 0.20 + (0.80 * successRate)
  const finalScore = Math.max(0, Math.min(1, raw * penalty)) * 100
  return Number(finalScore.toFixed(2))
}

const normalizeBenchmarkHistory = (history: BenchmarkRun[]): BenchmarkRun[] => {
  const seenBenchmarkIds = new Set<string>()
  const normalized: BenchmarkRun[] = []

  for (const run of history) {
    if (!run || typeof run !== 'object') {
      continue
    }
    const benchmarkId = typeof run.benchmarkId === 'string' ? run.benchmarkId.trim() : ''
    if (benchmarkId && seenBenchmarkIds.has(benchmarkId)) {
      continue
    }
    if (benchmarkId) {
      seenBenchmarkIds.add(benchmarkId)
    }
    normalized.push(run)
  }

  return normalized.slice(0, MAX_BENCHMARK_HISTORY)
}

const loadBenchmarkHistory = (): BenchmarkRun[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(BENCHMARK_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return normalizeBenchmarkHistory(parsed as BenchmarkRun[])
  } catch {
    return []
  }
}

const loadBenchmarkImages = (): BenchmarkImageAsset[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(BENCHMARK_IMAGES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as BenchmarkImageAsset[]
  } catch {
    return []
  }
}

const loadUiPreferences = (): UIPreferences => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as UIPreferences
    if (!parsed || typeof parsed !== 'object') return {}
    const parsedPresetId = typeof parsed.selectedPresetId === 'string'
      ? parsed.selectedPresetId
      : undefined
    const presetExists = parsedPresetId
      ? PRESETS.some((preset) => preset.id === parsedPresetId)
      : false
    return {
      profileMode: parsed.profileMode === 'Preset' || parsed.profileMode === 'Custom' ? parsed.profileMode : undefined,
      audioMode: parsed.audioMode === 'mic' ? 'mic' : parsed.audioMode === 'system' ? 'system' : undefined,
      selectedSystemAudioSource:
        typeof parsed.selectedSystemAudioSource === 'string' ? parsed.selectedSystemAudioSource : undefined,
      selectedMicAudioSource:
        typeof parsed.selectedMicAudioSource === 'string' ? parsed.selectedMicAudioSource : undefined,
      customInstruction: typeof parsed.customInstruction === 'string' ? parsed.customInstruction : undefined,
      selectedModel: typeof parsed.selectedModel === 'string' ? parsed.selectedModel : undefined,
      selectedPresetId: presetExists ? parsedPresetId : undefined,
      includeScreenshotInQuery:
        typeof parsed.includeScreenshotInQuery === 'boolean' ? parsed.includeScreenshotInQuery : undefined,
    }
  } catch {
    return {}
  }
}

const resolvePreferredOption = (
  currentValue: string,
  options: string[],
  ...fallbacks: Array<string | null | undefined>
): string => {
  if (currentValue && options.includes(currentValue)) {
    return currentValue
  }
  for (const fallback of fallbacks) {
    if (fallback && options.includes(fallback)) {
      return fallback
    }
  }
  return options[0] || ''
}

type LiveRow = {
  id: number
  text: string
  t: number
  sourceKind: AudioStreamKind
  sourceName?: string | null
}

const normalizeTranscriptText = (text: string): string =>
  (text.toLowerCase().match(/[a-z0-9']+/g) || []).join(' ')

const wordCount = (normalizedText: string): number => (normalizedText ? normalizedText.split(' ').length : 0)

type QueryRunPayload = {
  presetId: string | null
  customInstruction: string | null
  selectedText: string
  selectionTimeRange: SelectionRange
  model: string | null
  includeScreenshot: boolean
  screenshotDataUrl: string | null
}

const EMPTY_AUTO:AutoState={autoArmed:false,pauseReason:'not_armed',lastError:null,listening:false,detectionEnabled:false,holdReasons:[],configRevision:0,configurationReady:false,generationBusy:false,activeAnswerId:null,pendingCandidate:null,deferredAnswerId:null}
const App: React.FC = () => {
  const [storedUiPreferences] = useState<UIPreferences>(() => loadUiPreferences())
  const hasStoredAudioMode = storedUiPreferences.audioMode === 'mic' || storedUiPreferences.audioMode === 'system'
  const [activePage, setActivePage] = useState<'desk' | 'settings'>('desk')
  const [cockpitState, dispatchCockpit] = React.useReducer(cockpitReducer, initialCockpitState)
  const [autoState,setAutoState]=useState<AutoState>(EMPTY_AUTO)
  const autoStateRef=useRef(autoState);autoStateRef.current=autoState
  const [autoAvailable,setAutoAvailable]=useState(false)
  const [autoReceived,setAutoReceived]=useState(false)
  const [autoSettingsReady,setAutoSettingsReady]=useState(false)
  const [autoSettingsError,setAutoSettingsError]=useState(false)
  const [autoRetry,setAutoRetry]=useState(0)
  const autoSeqRef=useRef(0)
  const autoPendingRef=useRef<{commandId:string;key:string}|null>(null)
  const autoAcceptedKeyRef=useRef('')
  const autoErrorKeyRef=useRef('')
  const desiredAutoKeyRef=useRef('')
  const baseInteractionRef=useRef({selectedSnapshotIds:[] as string[],openEditors:[] as string[],inspectedAnswerIds:[] as string[],holdReasons:[] as HoldReason[]})
  const extraAutoHoldsRef=useRef<HoldReason[]>([])
  const interactionSenderRef=useRef<()=>void>(()=>{})
  const lastInteractionRef=useRef('')
  const [questionResult,setQuestionResult]=useState<{commandId:string;accepted:boolean}|null>(null)
  const [candidates,setCandidates]=useState<Candidate[]>([])
  const candidatesRef=useRef<Candidate[]>([])
  const [detection,setDetection]=useState<DetectionState>({enabled:false,inFlight:false,dirty:false,lastError:null,outcome:'disabled',truncated:false,lastRevision:null,model:null})
  const questionSeqRef=useRef({candidates:0,detector:0})
  const questionScopeRef=useRef('')
  const [detectionAvailable,setDetectionAvailable]=useState(false)
  const pendingQuestionsRef=useRef<Record<string,{select:boolean;token:string;wording?:string;query?:Record<string,unknown>}>>({})
  const [recentWindowSeconds, setRecentWindowSeconds] = useState<20 | 45 | 90>(20)
  const [cockpitReady, setCockpitReady] = useState(false)
  const [cockpitOwner, setCockpitOwner] = useState(false)
  const [humanNotes, setHumanNotes] = useState<HumanNote[]>(() => loadHumanNotes())
  const [pendingAnswerIds, setPendingAnswerIds] = useState<string[]>([])
  const [layout, setLayout] = useState<number[]>(() => readLayout(window.localStorage.getItem('cockpit-layout.v1')))
  const [profileMode, setProfileMode] = useState<'Preset' | 'Custom'>(() => (storedUiPreferences.profileMode === 'Preset' || storedUiPreferences.profileMode === 'Custom') ? storedUiPreferences.profileMode : (storedUiPreferences.customInstruction?.trim() ? 'Custom' : 'Preset'))
  const [targetDraft, setTargetDraft] = useState<TargetDraft | null>(null)
  const targetDraftRef = useRef(targetDraft); targetDraftRef.current = targetDraft
  const [pinnedMoments, setPinnedMoments] = useState<Snapshot[]>([])
  const [sourceSnapshots, setSourceSnapshots] = useState<Record<string, Snapshot>>({})
  const pinnedMomentsRef = useRef(pinnedMoments); pinnedMomentsRef.current = pinnedMoments
  const pendingSnapshotActionsRef = useRef<Record<string, Snapshot>>({})
  const [pendingSource, setPendingSource] = useState(false)
  const [pendingNoteIds, setPendingNoteIds] = useState<string[]>([])
  const [unknownCommands, setUnknownCommands] = useState<string[]>([])
  const protocolVersionRef = useRef(0)
  const sourceTokenRef = useRef('')
  const handoffTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingConsumeRef = useRef<Record<string, string>>({})
  const pendingSnapshotsRef = useRef<Record<string, {purpose: SnapshotPurpose; query: Record<string, unknown>; token: string}>>({})
  const answerRecords = requestList(cockpitState)
  const recordsRef = useRef(answerRecords); recordsRef.current = answerRecords
  const keptAnswerIds = answerRecords.filter((record) => record.placement === 'kept').map((record) => record.answerId)
  const keptRecordCount = answerRecords.filter((record) => record.placement === 'kept' && !record.removed).length
  const humanNotesRef = useRef<HumanNote[]>(humanNotes)
  humanNotesRef.current = humanNotes
  const pendingNoteActionsRef = useRef<Record<string, { action: 'create' | 'edit' | 'remove'; note: HumanNote }>>({})
  const pendingAnswerActionsRef = useRef<Record<string, { action: 'keep' | 'unkeep' | 'remove'; record: RequestRecord }>>({})
  const noteSyncKeyRef = useRef('')
  const isControllerRef = useRef(false)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [liveText, setLiveText] = useState('')
  const [liveRows, setLiveRows] = useState<LiveRow[]>([])
  const [selectedText, setSelectedText] = useState('')
  const [selectedSourceSpans, setSelectedSourceSpans] = useState<SourceSpan[]>([])
  const [selectedTextDraft, setSelectedTextDraft] = useState('')
  const [selectionRange, setSelectionRange] = useState<SelectionRange>(null)
  const [output, setOutput] = useState('')
  const [isQuerying, setIsQuerying] = useState(false)
  const [status, setStatus] = useState('Connecting…')
  const [backendError, setBackendError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [audioMode, setAudioMode] = useState<AudioStreamKind>(storedUiPreferences.audioMode || 'system')
  const [meterStore] = useState(() => new MeterStore())
  const [soundOpen, setSoundOpen] = useState(false)
  const soundSelectionRef = useRef<Range | null>(null)
  const closeSound = useCallback(() => setSoundOpen(false), [])
  const [audioNotice, setAudioNotice] = useState('')
  const [refreshPending, setRefreshPending] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>()
  const restoredAudioConnection = useRef('')
  const audioPreferencesRef = useRef(storedUiPreferences)
  const [systemAudioSources, setSystemAudioSources] = useState<string[]>([])
  const [selectedSystemAudioSource, setSelectedSystemAudioSource] = useState(storedUiPreferences.selectedSystemAudioSource || '')
  const [micAudioSources, setMicAudioSources] = useState<string[]>([])
  const [selectedMicAudioSource, setSelectedMicAudioSource] = useState(storedUiPreferences.selectedMicAudioSource || '')
  const [customInstruction, setCustomInstruction] = useState(storedUiPreferences.customInstruction || '')
  const [models, setModels] = useState<string[]>([])
  const [modelDetails, setModelDetails] = useState<GatewayModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState(storedUiPreferences.selectedModel || '')
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [includeScreenshotInQuery, setIncludeScreenshotInQuery] = useState(storedUiPreferences.includeScreenshotInQuery || false)
  const [lastQueryLatencyMs, setLastQueryLatencyMs] = useState<number | null>(null)
  const [lastResponseModel, setLastResponseModel] = useState<string>('')
  const [lastScreenshotUsed, setLastScreenshotUsed] = useState(false)
  const [activeQueryRequestId, setActiveQueryRequestId] = useState<string | null>(null)
  const [lastQueryPayload, setLastQueryPayload] = useState<QueryRunPayload | null>(null)
  const [ragDocuments, setRagDocuments] = useState<RagDocument[]>([])
  const [ragNotice, setRagNotice] = useState('')
  const [benchmarkRunning, setBenchmarkRunning] = useState(false)
  const [benchmarkProgress, setBenchmarkProgress] = useState<BenchmarkProgress | null>(null)
  const [activeBenchmarkId, setActiveBenchmarkId] = useState<string | null>(null)
  const [benchmarkLiveLogs, setBenchmarkLiveLogs] = useState<BenchmarkLiveLog[]>([])
  const [benchmarkHistory, setBenchmarkHistory] = useState<BenchmarkRun[]>(() => loadBenchmarkHistory())
  const [benchmarkImages, setBenchmarkImages] = useState<BenchmarkImageAsset[]>(() => loadBenchmarkImages())
  const [selectedPresetId, setSelectedPresetId] = useState(storedUiPreferences.selectedPresetId || ANSWER_PRESET_ID)
  const activeBenchmarkIdRef = useRef<string | null>(null)
  const activeQueryRequestIdRef = useRef<string | null>(null)
  const selectedTextDraftEditedRef = useRef(false)
  const lastSelectionKeyRef = useRef('')
  const maxRows = parseMaxRows()
  const selectedTextRowsCollapsed = parseSelectedTextRowsCollapsed()
  const selectedTextRowsFocused = parseSelectedTextRowsFocused(selectedTextRowsCollapsed)
  const canResetSelectedTextDraft = selectedTextDraft !== selectedText

  const selectionKeyFor = (text: string, range: SelectionRange): string => {
    const start = range?.start ?? ''
    const end = range?.end ?? ''
    return `${start}|${end}|${text}`
  }

  const streamBuffer = useMemo(() => new AnswerStreamBuffer((events) => { events.forEach(({type: _type, ...event}) => dispatchCockpit({...event, type: 'answer_chunk'})) }), [])
  const resolveCommand = useCallback((commandId: string, status: 'accepted' | 'rejected' | 'unknown', message?: string | null) => {
    if (status === 'unknown') {
      setUnknownCommands((ids) => ids.includes(commandId) ? ids : [...ids, commandId])
      setBackendError(message || 'The command status is unknown. Check its status before retrying.')
      return
    }
    setUnknownCommands((ids) => ids.filter((id) => id !== commandId))
    const pendingSnapshot = pendingSnapshotActionsRef.current[commandId]
    if (pendingSnapshot) {
      delete pendingSnapshotActionsRef.current[commandId]
      if (status === 'accepted') {
        setPinnedMoments((moments) => moments.filter((snapshot) => snapshot.snapshotId !== pendingSnapshot.snapshotId))
        if (targetDraftRef.current?.snapshot.snapshotId === pendingSnapshot.snapshotId) setTargetDraft(null)
        setSourceSnapshots((current) => {const next={...current};delete next[pendingSnapshot.snapshotId];return next})
      }
    }
    if (status === 'rejected') {
      if(autoPendingRef.current?.commandId===commandId){autoErrorKeyRef.current=autoPendingRef.current.key;autoPendingRef.current=null;setAutoSettingsReady(false);setAutoSettingsError(true)}
      if(pendingQuestionsRef.current[commandId]) {delete pendingQuestionsRef.current[commandId];setQuestionResult({commandId,accepted:false});setPendingSource(false)}
      if (pendingSnapshotsRef.current[commandId] || Object.prototype.hasOwnProperty.call(pendingConsumeRef.current,commandId)) setPendingSource(false)
      delete pendingSnapshotsRef.current[commandId]
      delete pendingConsumeRef.current[commandId]
    }
    const pendingAnswer = pendingAnswerActionsRef.current[commandId]
    if (pendingAnswer) {
      delete pendingAnswerActionsRef.current[commandId]
      setPendingAnswerIds((current) => current.filter((answerId) => answerId !== pendingAnswer.record.answerId))
      if (status === 'accepted') {
        if (pendingAnswer.action === 'remove') dispatchCockpit({ type: 'answer_removed', requestId: pendingAnswer.record.requestId, answerId: pendingAnswer.record.answerId })
        else dispatchCockpit({ type: 'answer_placement', requestId: pendingAnswer.record.requestId, answerId: pendingAnswer.record.answerId, placement: pendingAnswer.action === 'keep' ? 'kept' : 'working' })
      }
    }
    const pendingNote = pendingNoteActionsRef.current[commandId]
    if (pendingNote) {
      delete pendingNoteActionsRef.current[commandId]
      setPendingNoteIds((ids) => ids.filter((id) => id !== pendingNote.note.noteId))
      if (status === 'accepted') {
        setHumanNotes((current) => {
          if (pendingNote.action === 'remove') return current.filter((item) => item.noteId !== pendingNote.note.noteId)
          return [...current.filter((item) => item.noteId !== pendingNote.note.noteId), pendingNote.note].slice(-50)
        })
      }
    }
    if (status === 'rejected') setBackendError(message || 'The backend rejected the command.')
  }, [])

  const client = useMemo(() => {
    return new WSClient('ws://127.0.0.1:8765', {
      onHelloAck: (payload) => {
        protocolVersionRef.current = payload.protocolVersion
        setAutoAvailable(payload.protocolVersion>=6&&payload.capabilities.includes('full_auto'))
        autoPendingRef.current=null;autoAcceptedKeyRef.current='';autoErrorKeyRef.current='';autoSeqRef.current=0
        lastInteractionRef.current='';setAutoReceived(false);setAutoSettingsReady(false);setAutoSettingsError(false)
        setAutoState(EMPTY_AUTO)
        setDetectionAvailable(payload.protocolVersion>=5&&payload.capabilities.includes('candidates'))
        candidatesRef.current=[];setCandidates([]);questionSeqRef.current={candidates:0,detector:0}
        questionScopeRef.current=`${payload.backendInstanceId}|${payload.connectionId}|${payload.sessionEpoch}`
        setCockpitReady(true)
        dispatchCockpit({ type: 'hello_ack', backendInstanceId: payload.backendInstanceId, connectionId: payload.connectionId, sessionEpoch: payload.sessionEpoch })
        client.send({ type: 'claim_control' })
      },
      onAssistanceState: (payload) => {
        if(`${payload.backendInstanceId}|${payload.connectionId}|${payload.sessionEpoch}`!==questionScopeRef.current||payload.stateSeq<=autoSeqRef.current)return
        autoSeqRef.current=payload.stateSeq;autoStateRef.current=payload;setAutoState(payload);setAutoReceived(true)
        setIsRunning(payload.listening)
        const pending=autoPendingRef.current
        if(pending&&payload.commandId===pending.commandId){
          autoAcceptedKeyRef.current=pending.key;autoPendingRef.current=null
          clearTimeout(handoffTimersRef.current[pending.commandId]);delete handoffTimersRef.current[pending.commandId]
          setAutoSettingsReady(pending.key===desiredAutoKeyRef.current);setAutoSettingsError(false)
          setBackendError(current=>current?.startsWith('sessionEpoch ')?null:current)
        }
      },
      onCandidateState: (payload) => {
        if (`${payload.backendInstanceId}|${payload.connectionId}|${payload.sessionEpoch}`!==questionScopeRef.current) return
        if(payload.stateSeq<=questionSeqRef.current.candidates)return
        questionSeqRef.current.candidates=payload.stateSeq
        const previousCandidates=candidatesRef.current
        candidatesRef.current=payload.candidates;setCandidates(payload.candidates)
        const snapshots=Object.fromEntries(payload.candidates.filter(c=>c.snapshot).map(c=>[c.snapshot!.snapshotId,c.snapshot!]))
        setSourceSnapshots(current=>{
          const next={...current,...snapshots}
          for(const old of previousCandidates){const id=old.snapshot?.snapshotId;if(id&&!snapshots[id]&&!recordsRef.current.some(r=>!r.removed&&r.snapshotId===id)&&!pinnedMomentsRef.current.some(p=>p.snapshotId===id)&&targetDraftRef.current?.snapshot.snapshotId!==id)delete next[id]}
          return next
        })
        const commandId=payload.commandId || ''
        const pending=pendingQuestionsRef.current[commandId]
        if(!pending)return
        delete pendingQuestionsRef.current[commandId]
        setQuestionResult({commandId,accepted:true})
        clearTimeout(handoffTimersRef.current[commandId]);delete handoffTimersRef.current[commandId]
        setPendingSource(false)
        const ids=(payload as typeof payload & {changedCandidateIds?:string[]}).changedCandidateIds || []
        const candidate=payload.candidates.find(c=>ids.includes(c.candidateId)&&!['superseded','dismissed'].includes(c.state))
        if(!pending.select||!candidate?.snapshot||candidate.wording!==pending.wording)return
        if(pending.token!==sourceTokenRef.current) return
        const old=targetDraftRef.current
        if(old&&!old.candidateId&&!old.correctsAnswerId&&!pinnedMomentsRef.current.some(p=>p.snapshotId===old.snapshot.snapshotId)) client.send({type:'snapshot_action',snapshotId:old.snapshot.snapshotId,action:'release'})
        const draft={targetId:crypto.randomUUID(),snapshot:candidate.snapshot,wording:candidate.wording,originalText:candidate.snapshot.text,candidateId:candidate.candidateId,candidateRevision:candidate.candidateRevision,savedWording:candidate.wording,wordingOrigin:candidate.origin}
        sourceTokenRef.current=`${draft.targetId}|${draft.wording}`
        setTargetDraft(draft)
        if(pending.query) {
          const next=crypto.randomUUID()
          pendingConsumeRef.current[next]=sourceTokenRef.current
          const result=client.send({...pending.query,type:'run_snapshot_query',commandId:next,snapshotId:candidate.snapshot.snapshotId,targetId:null,candidateId:candidate.candidateId,candidateRevision:candidate.candidateRevision,manualTarget:{targetId:draft.targetId,sourceSnapshotId:candidate.snapshot.snapshotId,wording:candidate.wording}})
          if(result.ok)setPendingSource(true);else {delete pendingConsumeRef.current[next];setBackendError(result.message)}
        }
      },
      onDetectorState: (payload) => {
        if(payload.stateSeq<=questionSeqRef.current.detector)return
        questionSeqRef.current.detector=payload.stateSeq;setDetection(payload)
      },
      onControlState: (payload) => {
        const scope=`${payload.backendInstanceId}|${payload.connectionId}|${payload.sessionEpoch}`
        if(scope!==questionScopeRef.current){autoSeqRef.current=0;autoPendingRef.current=null;autoAcceptedKeyRef.current='';autoErrorKeyRef.current='';lastInteractionRef.current='';setAutoReceived(false);setAutoSettingsReady(false);setAutoState(EMPTY_AUTO);questionScopeRef.current=scope;questionSeqRef.current={candidates:0,detector:0};candidatesRef.current=[];setCandidates([]);setDetection(d=>({...d,inFlight:false,dirty:false,lastError:null,outcome:'no_source'}));setTargetDraft(d=>d?.candidateId?null:d)}
        isControllerRef.current = payload.isOwner
        setCockpitOwner(payload.isOwner)
        dispatchCockpit({ type: 'control_state', backendInstanceId: payload.backendInstanceId, connectionId: payload.connectionId, sessionEpoch: payload.sessionEpoch })
        if (payload.isOwner) {
          if (restoredAudioConnection.current !== payload.connectionId) {
            restoredAudioConnection.current = payload.connectionId
            if (audioPreferencesRef.current.audioMode) client.send({type:'set_audio_mode',mode:audioPreferencesRef.current.audioMode})
            if (audioPreferencesRef.current.selectedSystemAudioSource) client.send({type:'set_audio_source',sourceName:audioPreferencesRef.current.selectedSystemAudioSource})
            if (audioPreferencesRef.current.selectedMicAudioSource) client.send({type:'set_mic_source',sourceName:audioPreferencesRef.current.selectedMicAudioSource})
            client.send({type:'get_audio_sources'})
          }
          const syncKey = `${payload.connectionId}:${payload.sessionEpoch}`
          if (noteSyncKeyRef.current !== syncKey) {
            noteSyncKeyRef.current = syncKey
            humanNotesRef.current.forEach((note) => client.send({ type: 'context_note_action', action: 'create', noteId: note.noteId, text: note.text, includeInFutureContext: note.includeInFutureContext }))
          }
        } else {
          noteSyncKeyRef.current = ''
        }
      },
      onTranscriptCleared: () => { setSegments([]); setLiveText(''); setLiveRows([]); setSelectedText(''); setSelectedTextDraft(''); setSelectedSourceSpans([]); dispatchCockpit({ type: 'transcript_cleared' }) },
      onSnapshotCreated: (payload) => {
        clearTimeout(handoffTimersRef.current[payload.commandId]); delete handoffTimersRef.current[payload.commandId]
        setSourceSnapshots((current) => ({...current, [payload.snapshot.snapshotId]: payload.snapshot}))
        const pending = pendingSnapshotsRef.current[payload.commandId]
        if (!pending) return
        delete pendingSnapshotsRef.current[payload.commandId]
        if (pending.purpose === 'pin') {
          setPinnedMoments((moments) => moments.some((snapshot) => snapshot.snapshotId === payload.snapshot.snapshotId) ? moments : [...moments, payload.snapshot])
          setPendingSource(false)
          return
        }
        if (pending.purpose === 'draft') {
          setTargetDraft({ targetId: crypto.randomUUID(), snapshot: payload.snapshot, wording: payload.snapshot.text, originalText: payload.snapshot.text })

          setPendingSource(false)
          return
        }
        const commandId = crypto.randomUUID()
        pendingConsumeRef.current[commandId] = pending.token
        const command = {...pending.query, type: 'run_snapshot_query', snapshotId: payload.snapshot.snapshotId, targetId: null, commandId}
        const result = client.send(command)
        if (!result.ok) {setBackendError(result.message);setPendingSource(false);delete pendingConsumeRef.current[commandId]}
      },
      onAnswerAccepted: (payload) => {
        clearTimeout(handoffTimersRef.current[payload.commandId]); delete handoffTimersRef.current[payload.commandId]
        if (Object.prototype.hasOwnProperty.call(pendingConsumeRef.current,payload.commandId)) setPendingSource(false)
        const token = pendingConsumeRef.current[payload.commandId]
        delete pendingConsumeRef.current[payload.commandId]
        if (token && token === sourceTokenRef.current) {
          const snapshotId = targetDraftRef.current?.snapshot.snapshotId
          if (snapshotId) setPinnedMoments((moments) => moments.filter((snapshot) => snapshot.snapshotId !== snapshotId))
          setTargetDraft(null);setSelectedSourceSpans([]);setSelectedText('');setSelectedTextDraft('')
        }
        const { type: _type, ...event } = payload
        dispatchCockpit({ ...event, type: 'answer_accepted' })
      },
      onAnswerChunk: (payload) => streamBuffer.push(payload),
      onAnswerState: (payload) => {
        dispatchCockpit({...payload,type:'answer_state'})
        if (payload.removed) {
          const snapshotId = recordsRef.current.find((record) => record.answerId === payload.answerId)?.snapshotId
          if (snapshotId && targetDraftRef.current?.snapshot.snapshotId !== snapshotId && !pinnedMomentsRef.current.some((snapshot) => snapshot.snapshotId === snapshotId) && !recordsRef.current.some((record) => record.answerId !== payload.answerId && !record.removed && record.snapshotId === snapshotId)) {
            setSourceSnapshots((current) => {const next={...current};delete next[snapshotId];return next})
          }
        }
        if (payload.reason === 'capacity_eviction' || payload.reason === 'history_eviction') setBackendError('The oldest unprotected completed working answer was evicted at capacity.')
      },
      onAnswerTiming: (payload) => { const { type: _type, ...event } = payload; dispatchCockpit({ ...event, type: 'answer_timing' }) },
      onAnswerFinished: (payload) => { streamBuffer.flush(); const { type: _type, ...event } = payload; dispatchCockpit({ ...event, type: 'answer_finished' }) },
      onRequestError: (payload) => {
        const existing=recordsRef.current.find((record)=>record.requestId===payload.requestId)
        if (existing?.terminal) return
        streamBuffer.flush()
        const { type: _type, ...event } = payload
        dispatchCockpit({ ...event, type: 'request_error' })
        if (payload.message) setBackendError(payload.message)
      },
      onCommandAck: (payload) => {
        resolveCommand(payload.commandId, payload.accepted ? 'accepted' : 'rejected', payload.message)
        if (payload.accepted && (pendingSnapshotsRef.current[payload.commandId] || Object.prototype.hasOwnProperty.call(pendingConsumeRef.current,payload.commandId) || pendingQuestionsRef.current[payload.commandId] || autoPendingRef.current?.commandId===payload.commandId)) {
          clearTimeout(handoffTimersRef.current[payload.commandId])
          handoffTimersRef.current[payload.commandId] = setTimeout(() => {delete handoffTimersRef.current[payload.commandId];client.send({type:'get_command_status',queryCommandId:payload.commandId})},1000)
        }
      },
      onCommandStatus: (payload) => resolveCommand(payload.commandId, payload.status),
      onCommandUnknown: (payload) => resolveCommand(payload.commandId, 'unknown', payload.message),
      onStatus: (payload) => {
        if (payload.state === 'audio_meter_unavailable') {
          const details = payload.details as unknown as {streamKind: 'system'|'mic';sourceName?: string|null;message: string}
          if (details?.streamKind) meterStore.fail(details.streamKind,details.message || 'Input monitor unavailable',details.sourceName)
          return
        }
        if (payload.state === 'audio_sources_error') {clearTimeout(refreshTimer.current);setRefreshPending(false);setAudioNotice(String(payload.details || 'Source refresh failed'));return}
        if (payload.state === 'connected') meterStore.setConnected(true)
        if (payload.state === 'disconnected') {setAutoAvailable(false);setAutoReceived(false);setAutoSettingsReady(false);autoPendingRef.current=null;autoAcceptedKeyRef.current='';setAutoState({...EMPTY_AUTO,pauseReason:'owner_lost'});setDetectionAvailable(false);setDetection(d=>({...d,inFlight:false,enabled:false,outcome:'disconnected'}));meterStore.setConnected(false);restoredAudioConnection.current='';clearTimeout(refreshTimer.current);setRefreshPending(false)}
        if (payload.details) {
          setStatus(`${payload.state}: ${payload.details}`)
        } else {
          setStatus(payload.state)
        }
        if (payload.state === 'disconnected') {
          Object.values(handoffTimersRef.current).forEach(clearTimeout); handoffTimersRef.current={}
          streamBuffer.flush(); setPendingSource(false); setPendingAnswerIds([]); setPendingNoteIds([])
          dispatchCockpit({ type: 'connection_lost', message: 'Connection lost; the answer status is unknown.' })
          isControllerRef.current = false
          setCockpitReady(false)
          setCockpitOwner(false)
          // A lost connection leaves a visible terminal/unknown state. The run
          // command is never replayed automatically.
          if (activeQueryRequestIdRef.current) {
            setIsQuerying(false)
            activeQueryRequestIdRef.current = null
            setActiveQueryRequestId(null)
            setBackendError(
              'Connection lost: the answer status is unknown. The request was not resent; check the backend before retrying.'
            )
          }
        }
        if (payload.state === 'connected' || payload.state === 'ready' || payload.state === 'transcribing' || payload.state === 'stopped') {
          setBackendError(null)
        }
        if (payload.state === 'transcribing') {
          setIsRunning(true)
        } else if (payload.state === 'stopped') {
          setIsRunning(false)
          setLiveText('')
          setLiveRows([])
        } else if (payload.state === 'ready' || payload.state === 'connected') {
          setIsRunning(false)
          setLiveText('')
          setLiveRows([])
        }
        if (payload.state === 'connected') {
          client.send({ type: 'get_audio_sources' })
          client.send({ type: 'get_models' })
          client.send({ type: 'get_model_details' })
          client.send({ type: 'rag_list' })
        }
      },
      onLive: (payload) => {
        setLiveText(payload.text)
        const text = (payload.text || '').trim()
        if (!text) {
          return
        }
        const sourceKind: AudioStreamKind = payload.streamKind === 'mic' ? 'mic' : 'system'
        setLiveRows((prev) => {
          const lastRow = prev[prev.length - 1]
          if (lastRow?.text === text && lastRow.sourceKind === sourceKind) {
            return prev
          }
          const next: LiveRow = { id: Date.now(), text, t: payload.t, sourceKind, sourceName: payload.sourceName || null }
          return [...prev, next].slice(-50)
        })
      },
      onSegment: (payload) => {
        setLiveText('')
        setLiveRows([])
        setSegments((prev) => {
          const incoming = payload.segment as TranscriptSegment
          const incomingText = normalizeTranscriptText(incoming.text || '')
          const incomingWordCount = wordCount(incomingText)
          if (incomingText && incomingWordCount >= 3) {
            const duplicate = [...prev].reverse().find((segment) => {
              if ((segment.source_kind || 'system') !== (incoming.source_kind || 'system')) {
                return false
              }
              if ((incoming.t0 - segment.t1) > 3) {
                return false
              }
              return normalizeTranscriptText(segment.text || '') === incomingText
            })
            if (duplicate) {
              return prev
            }
          }
          return [...prev, incoming]
        })
      },
      onAudioLevel: (payload) => meterStore.accept(payload),
      onAudioSources: (payload) => {
        clearTimeout(refreshTimer.current);setRefreshPending(false);setAudioNotice('')
        const system = payload.monitorSources || payload.sources || []
        const mic = payload.micSources || []
        setSystemAudioSources(system);setMicAudioSources(mic)
        setAudioMode(payload.selectedMode === 'mic' ? 'mic' : 'system')
        setSelectedSystemAudioSource(payload.selectedMonitorSource || payload.selectedSource || '')
        setSelectedMicAudioSource(payload.selectedMicSource || '')
        if(restoredAudioConnection.current) audioPreferencesRef.current={audioMode:payload.selectedMode === 'mic'?'mic':'system',selectedSystemAudioSource:payload.selectedMonitorSource || payload.selectedSource || '',selectedMicAudioSource:payload.selectedMicSource || ''}
      },
      onModelsList: (payload) => {
        const nextModels = payload.models || []
        setModels(nextModels)
        setSelectedModel((prev) => {
          if (prev && nextModels.includes(prev)) {
            return prev
          }
          if (payload.selectedModel && nextModels.includes(payload.selectedModel)) {
            return payload.selectedModel
          }
          if (nextModels.length > 0) {
            return nextModels[0]
          }
          return ''
        })
      },
      onModelsDetails: (payload) => {
        setModelDetails(payload.models || [])
      },
      onQueryState: (payload) => {
        const requestId = payload.requestId || activeQueryRequestIdRef.current
        if (payload.running) {
          setBackendError(null)
          setIsQuerying(true)
          if (requestId) {
            activeQueryRequestIdRef.current = requestId
            setActiveQueryRequestId(requestId)
          }
          return
        }
        if (requestId && activeQueryRequestIdRef.current && requestId !== activeQueryRequestIdRef.current) {
          return
        }
        setIsQuerying(false)
        activeQueryRequestIdRef.current = null
        setActiveQueryRequestId(null)
      },
      onQueryChunk: (payload) => {
        const requestId = payload.requestId || activeQueryRequestIdRef.current
        if (!requestId || requestId !== activeQueryRequestIdRef.current) {
          return
        }
        const delta = payload.delta || ''
        if (!delta) {
          return
        }
        setOutput((prev) => prev + delta)
      },
      onQueryResponse: (payload) => {
        const requestId = payload.requestId || activeQueryRequestIdRef.current
        if (requestId && activeQueryRequestIdRef.current && requestId !== activeQueryRequestIdRef.current) {
          return
        }
        setBackendError(null)
        setIsQuerying(false)
        activeQueryRequestIdRef.current = null
        setActiveQueryRequestId(null)
        setOutput(payload.text)
        setLastQueryLatencyMs(typeof payload.latencyMs === 'number' ? payload.latencyMs : null)
        setLastResponseModel(payload.model || '')
        setLastScreenshotUsed(Boolean(payload.screenshotUsed))
        const ragChunksUsed = typeof payload.ragChunksUsed === 'number' ? payload.ragChunksUsed : 0
        if (ragChunksUsed > 0) {
          setRagNotice(`Used ${ragChunksUsed} retrieved chunk(s) from local RAG documents for the last answer.`)
        }
      },
      onRagDocuments: (payload) => {
        setRagDocuments(Array.isArray(payload.documents) ? payload.documents : [])
      },
      onRagIngestResult: (payload) => {
        const errors = Array.isArray(payload.errors) ? payload.errors.filter(Boolean) : []
        const summary = `RAG ingest: +${payload.ingested} new, ${payload.updated} updated, ${payload.skipped} unchanged, ${payload.failed} failed.`
        const suffix = errors.length > 0 ? ` First error: ${errors[0]}` : ''
        setRagNotice(`${summary}${suffix}`)
      },
      onBenchmarkProgress: (payload) => {
        setBenchmarkRunning(true)
        setBenchmarkProgress({
          completed: payload.completed,
          total: payload.total,
          testId: payload.testId,
          model: payload.model,
          run: payload.run,
          successes: payload.successes,
          failures: payload.failures
        })
      },
      onBenchmarkLog: (payload) => {
        const currentBenchmarkId = activeBenchmarkIdRef.current
        const benchmarkId = payload.benchmarkId || currentBenchmarkId
        if (!benchmarkId || (currentBenchmarkId && benchmarkId !== currentBenchmarkId)) {
          return
        }
        const row: BenchmarkLiveLog = {
          benchmarkId,
          testId: payload.testId || '',
          model: payload.model || '',
          run: payload.run || 0,
          success: Boolean(payload.success),
          jsonValid: Boolean(payload.jsonValid),
          timeToFirstTokenMs: typeof payload.timeToFirstTokenMs === 'number' ? payload.timeToFirstTokenMs : null,
          ttcMs:
            typeof payload.ttcMs === 'number'
              ? payload.ttcMs
              : typeof payload.latencyMs === 'number'
                ? payload.latencyMs
                : null,
          latencyMs: typeof payload.latencyMs === 'number' ? payload.latencyMs : null,
          inputTokens: typeof payload.inputTokens === 'number' ? payload.inputTokens : null,
          outputTokens: typeof payload.outputTokens === 'number' ? payload.outputTokens : null,
          totalTokens: typeof payload.totalTokens === 'number' ? payload.totalTokens : null,
          costUsd: typeof payload.costUsd === 'number' ? payload.costUsd : null,
          qualityScore: typeof payload.qualityScore === 'number' ? payload.qualityScore : 0,
          qualityPassed: Boolean(payload.qualityPassed),
          qualityChecks: Array.isArray(payload.qualityChecks) ? payload.qualityChecks : [],
          imageCapabilityClaim: payload.imageCapabilityClaim || null,
          imageWorked: typeof payload.imageWorked === 'boolean' ? payload.imageWorked : null,
          responsePreview: payload.responsePreview || '',
          error: payload.error || null,
          imageRef: payload.imageRef || null
        }
        setBenchmarkLiveLogs((prev) => [row, ...prev].slice(0, MAX_BENCHMARK_LIVE_LOGS))
      },
      onBenchmarkComplete: (payload) => {
        setBenchmarkRunning(false)
        setBenchmarkProgress(null)
        setActiveBenchmarkId(null)
        activeBenchmarkIdRef.current = null
        const run: BenchmarkRun = {
          benchmarkId: payload.benchmarkId || crypto.randomUUID(),
          createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : Math.floor(Date.now() / 1000),
          instruction: payload.instruction || '',
          tests: Array.isArray(payload.tests) ? payload.tests : [],
          results: Array.isArray(payload.results)
            ? payload.results.map((row: any) => {
                const avgTtcMs = typeof row.avgTtcMs === 'number'
                  ? row.avgTtcMs
                  : typeof row.avgLatencyMs === 'number'
                    ? row.avgLatencyMs
                    : null
                const minTtcMs = typeof row.minTtcMs === 'number'
                  ? row.minTtcMs
                  : typeof row.minLatencyMs === 'number'
                    ? row.minLatencyMs
                    : null
                const maxTtcMs = typeof row.maxTtcMs === 'number'
                  ? row.maxTtcMs
                  : typeof row.maxLatencyMs === 'number'
                    ? row.maxLatencyMs
                    : null
                return {
                  ...row,
                  avgTtcMs,
                  minTtcMs,
                  maxTtcMs,
                  aggregateScore:
                    typeof row.aggregateScore === 'number' && Number.isFinite(row.aggregateScore)
                      ? row.aggregateScore
                      : fallbackAggregateScore(row)
                }
              })
            : [],
          attempts: Array.isArray(payload.attempts) ? payload.attempts : []
        }
        setBenchmarkHistory((prev) => normalizeBenchmarkHistory([run, ...prev]))
      },
      onError: (payload) => {
        setIsQuerying(false)
        activeQueryRequestIdRef.current = null
        setActiveQueryRequestId(null)
        setBenchmarkRunning(false)
        setBenchmarkProgress(null)
        setActiveBenchmarkId(null)
        activeBenchmarkIdRef.current = null
        setBackendError(payload.message)
        setStatus(`error: ${payload.message}`)
      }
    })
  }, [])

  useEffect(() => {
    client.connect()
    return () => {clearTimeout(refreshTimer.current); Object.values(handoffTimersRef.current).forEach(clearTimeout);streamBuffer.dispose(); client.dispose() }
  }, [client])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('cockpit-layout.v1', JSON.stringify(layout))
  }, [layout])

  useEffect(() => {
    window.localStorage.setItem(HUMAN_NOTES_STORAGE_KEY, JSON.stringify(humanNotes))
  }, [humanNotes])

  const onFirstVisible = useCallback((requestId: string, firstVisibleMs: number) => dispatchCockpit({type:'local_first_visible',requestId,firstVisibleMs}), [])
  const sendInteraction = useCallback(() => {
    if(!isControllerRef.current)return
    const base=baseInteractionRef.current
    const holdReasons=[...new Set([...base.holdReasons,...extraAutoHoldsRef.current])]
    const payload={type:'interaction_state',selectedSnapshotIds:base.selectedSnapshotIds,openEditors:base.openEditors,inspectedAnswerIds:base.inspectedAnswerIds,publicationHold:holdReasons.length>0||base.openEditors.length>0,...(protocolVersionRef.current>=6?{holdReasons}:{})}
    const key=`${questionScopeRef.current}|${JSON.stringify(payload)}`
    if(key===lastInteractionRef.current)return
    const result=client.send(payload)
    if(result.ok)lastInteractionRef.current=key
  },[client])
  interactionSenderRef.current=sendInteraction
  const onInteraction = useCallback((selectedSnapshotIds:string[],openEditors:string[],inspectedAnswerIds:string[],holdReasons:HoldReason[]=[]) => {
    baseInteractionRef.current={selectedSnapshotIds,openEditors,inspectedAnswerIds,holdReasons};sendInteraction()
  },[sendInteraction])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(BENCHMARK_HISTORY_STORAGE_KEY, JSON.stringify(benchmarkHistory))
  }, [benchmarkHistory])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(BENCHMARK_IMAGES_STORAGE_KEY, JSON.stringify(benchmarkImages))
  }, [benchmarkImages])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        audioMode,
        profileMode,
        selectedSystemAudioSource,
        selectedMicAudioSource,
        customInstruction,
        selectedModel,
        selectedPresetId,
        includeScreenshotInQuery
      } satisfies UIPreferences)
    )
  }, [
    profileMode,
    audioMode,
    selectedSystemAudioSource,
    selectedMicAudioSource,
    customInstruction,
    selectedModel,
    selectedPresetId,
    includeScreenshotInQuery
  ])

  const canRun = selectedTextDraft.trim().length > 0
  const lastFinalSegment = segments[segments.length - 1]
  const cockpitSourceText = selectedTextDraft.trim() || selectedText.trim() || segments.map((segment) => segment.text).join(' ').trim()

  const executeQuery = (query: QueryRunPayload) => {
    if (!query.selectedText.trim()) {
      return
    }
    const requestId = crypto.randomUUID()
    setLastQueryPayload(query)
    setIsQuerying(true)
    setOutput('')
    setLastQueryLatencyMs(null)
    setLastResponseModel(query.model || '')
    setLastScreenshotUsed(Boolean(query.includeScreenshot && query.screenshotDataUrl))
    setActiveQueryRequestId(requestId)
    activeQueryRequestIdRef.current = requestId
    client.send({
      type: 'run_query',
      requestId,
      presetId: query.presetId,
      customInstruction: query.customInstruction,
      selectedText: query.selectedText,
      selectionTimeRange: query.selectionTimeRange,
      model: query.model,
      includeScreenshot: query.includeScreenshot,
      screenshotDataUrl: query.screenshotDataUrl
    })
  }

  sourceTokenRef.current = targetDraft ? `${targetDraft.targetId}|${targetDraft.wording}` : `${selectedText}|${JSON.stringify(selectedSourceSpans)}`
  const queryInputs = (mode = profileMode): Record<string, unknown> => ({
    mode, presetId: mode === 'Preset' ? selectedPresetId || ANSWER_PRESET_ID : null,
    customInstruction: mode === 'Custom' ? customInstruction.trim() : null,
    model: selectedModel || 'google/gemini-3.8-flash', reasoningEffort: null,
    clientPressedAtMs: performance.now(), includeScreenshot: Boolean(includeScreenshotInQuery && screenshotDataUrl),
    screenshotDataUrl: includeScreenshotInQuery ? screenshotDataUrl : null,
    humanNoteIds: humanNotesRef.current.filter((note) => note.includeInFutureContext).map((note) => note.noteId)
  })
  const autoSettings:AutoSettings={mode:profileMode,presetId:profileMode==='Preset'?selectedPresetId||ANSWER_PRESET_ID:null,customInstruction:profileMode==='Custom'?customInstruction.trim():null,model:selectedModel||'google/gemini-3.8-flash',reasoningEffort:null,humanNoteIds:humanNotes.filter(n=>n.includeInFutureContext).map(n=>n.noteId),includeScreenshot:Boolean(includeScreenshotInQuery&&screenshotDataUrl),screenshotDataUrl:includeScreenshotInQuery?screenshotDataUrl:null}
  const autoSettingsKey=`${questionScopeRef.current}|${JSON.stringify(autoSettings)}`
  desiredAutoKeyRef.current=autoSettingsKey
  const settingsSynced=autoAcceptedKeyRef.current===autoSettingsKey&&autoSettingsReady
  extraAutoHoldsRef.current=[...(activePage==='settings'?['settings' as HoldReason]:[]),...(autoAvailable&&!settingsSynced?['configuration_pending' as HoldReason]:[]),...(pendingNoteIds.length?['note_editor' as HoldReason]:[])]
  const extraHoldKey=extraAutoHoldsRef.current.join('|')
  useEffect(()=>{sendInteraction()},[extraHoldKey,sendInteraction,cockpitOwner])
  useEffect(()=>{
    if(!autoAvailable||!autoReceived||!cockpitReady||!cockpitOwner||autoPendingRef.current||autoAcceptedKeyRef.current===autoSettingsKey||autoErrorKeyRef.current===autoSettingsKey)return
    setAutoSettingsReady(false);setAutoSettingsError(false)
    // The hold command precedes settings updates on this same socket.
    interactionSenderRef.current()
    const commandId=crypto.randomUUID();autoPendingRef.current={commandId,key:autoSettingsKey}
    const result=client.send({type:'configure_auto',commandId,expectedConfigRevision:autoStateRef.current.configRevision,settings:autoSettings})
    if(!result.ok){autoErrorKeyRef.current=autoSettingsKey;autoPendingRef.current=null;setAutoSettingsError(true);setBackendError(result.message)}
  },[autoAvailable,autoReceived,cockpitReady,cockpitOwner,autoSettingsKey,autoState.configRevision,autoRetry,client])
  const setAutoMode=(armed:boolean)=>{const result=client.send({type:'set_auto',mode:'full_auto',armed,expectedConfigRevision:autoStateRef.current.configRevision});if(!result.ok)setBackendError(result.message)}
  const retryAutoSettings=()=>{autoErrorKeyRef.current='';setAutoSettingsError(false);setAutoRetry(n=>n+1)}

  const createSource = (purpose: SnapshotPurpose, mode = profileMode) => {
    if (!cockpitReady || !cockpitOwner || !lastFinalSegment?.segmentKey || pendingSource) return
    if (purpose !== 'answer' && protocolVersionRef.current < 4) {setBackendError('Update the backend to protocol v4 for targets and pinned moments.');return}
    const commandId = crypto.randomUUID()
    const selection = purpose !== 'pin' && selectedSourceSpans.length > 0
    pendingSnapshotsRef.current[commandId] = {purpose, query: queryInputs(mode), token: sourceTokenRef.current}
    const result = client.send({type:'create_snapshot',commandId,kind:selection?'selection':purpose==='pin'?'pinned_moment':'recent_window',...(selection?{sourceSpans:selectedSourceSpans}:{anchorSegmentKey:lastFinalSegment.segmentKey,windowSeconds:recentWindowSeconds}),includePartial:false})
    if (!result.ok) {delete pendingSnapshotsRef.current[commandId];setBackendError(result.message)} else {setPendingSource(true);setBackendError(null)}
  }
  const runCockpitAnswer = (mode = profileMode) => {
    if (!cockpitReady || !cockpitOwner || pendingSource) return
    if (mode === 'Custom' && !customInstruction.trim()) {setBackendError('Custom mode needs an instruction.');return}
    if(targetDraft?.correctsAnswerId){saveQuestion();return}
    const query = queryInputs(mode)
    if (!targetDraft && selectedSourceSpans.length) {createSource('answer', mode);return}
    const commandId = crypto.randomUUID()
    const command = targetDraft ? {type:'run_snapshot_query',snapshotId:targetDraft.snapshot.snapshotId,targetId:null,candidateId:targetDraft.candidateId,candidateRevision:targetDraft.candidateRevision,manualTarget:{targetId:targetDraft.targetId,sourceSnapshotId:targetDraft.snapshot.snapshotId,wording:targetDraft.wording}} : {type:'run_context_query',anchorSegmentKey:lastFinalSegment?.segmentKey,windowSeconds:recentWindowSeconds,targetId:null}
    pendingConsumeRef.current[commandId] = sourceTokenRef.current
    const result = client.send({...query,...command,commandId})
    if (!result.ok) {delete pendingConsumeRef.current[commandId];setBackendError(result.message)} else {setPendingSource(true);setBackendError(null)}
  }
  const selectSource = useCallback((text: string, spans: SourceSpan[]) => {if(targetDraftRef.current)return;sourceTokenRef.current=`${text}|${JSON.stringify(spans)}`;setSelectedText(text);setSelectedTextDraft(text);setSelectedSourceSpans(spans)}, [])
  const copyAnswer = useCallback((record: RequestRecord) => {void navigator.clipboard?.writeText(record.text).catch(()=>setBackendError('Clipboard access is unavailable.'))}, [])
  const clearTarget = () => {
    const draft = targetDraftRef.current
    if (draft && !draft.candidateId && !draft.correctsAnswerId && !pinnedMoments.some((snapshot) => snapshot.snapshotId === draft.snapshot.snapshotId)) client.send({type:'snapshot_action',snapshotId:draft.snapshot.snapshotId,action:'release'})
    if (draft && !draft.candidateId && !draft.correctsAnswerId && !pinnedMoments.some((snapshot) => snapshot.snapshotId === draft.snapshot.snapshotId)) setSourceSnapshots((current)=>{const next={...current};delete next[draft.snapshot.snapshotId];return next})
    sourceTokenRef.current=''
    setTargetDraft(null);setSelectedText('');setSelectedTextDraft('');setSelectedSourceSpans([])
    window.getSelection()?.removeAllRanges()
  }
  const setAnswerPlacement = useCallback((record: RequestRecord) => {
    const placement = record.placement === 'kept' ? 'working' : 'kept'
    const action = placement === 'kept' ? 'keep' : 'unkeep'
    const commandId = crypto.randomUUID()
    const result = client.send({ type: 'answer_action', commandId, answerId: record.answerId, action })
    if (!result.ok) { setBackendError(result.message); return }
    pendingAnswerActionsRef.current[result.commandId || commandId] = { action, record }
    setPendingAnswerIds((current) => current.includes(record.answerId) ? current : [...current, record.answerId])
  }, [client])

  const saveHumanNote = useCallback((action: 'create' | 'edit' | 'remove', note: HumanNote) => {
    const commandId = crypto.randomUUID()
    const result = client.send({
      type: 'context_note_action', action, noteId: note.noteId, text: note.text,
      includeInFutureContext: note.includeInFutureContext, commandId
    })
    if (!result.ok) { setBackendError(result.message); return }
    pendingNoteActionsRef.current[result.commandId || commandId] = { action, note }
    setPendingNoteIds((ids) => [...new Set([...ids,note.noteId])])
  }, [client])

  const removeAnswer = useCallback((record: RequestRecord) => {
    const commandId = crypto.randomUUID()
    const result = client.send({ type: 'answer_action', commandId, answerId: record.answerId, action: 'remove' })
    if (!result.ok) { setBackendError(result.message); return }
    pendingAnswerActionsRef.current[result.commandId || commandId] = { action: 'remove', record }
    setPendingAnswerIds((current) => current.includes(record.answerId) ? current : [...current, record.answerId])
  }, [client])

  const cancelAnswer = useCallback((record: RequestRecord) => {
    if (!record.answerId) return
    client.send({ type: 'cancel_answer', requestId: record.requestId, answerId: record.answerId })
  }, [client])

  const rerunAnswer = useCallback((record: RequestRecord) => {
    if (protocolVersionRef.current < 4) {setBackendError('Update the backend to protocol v4 for exact frozen reruns.');return}
    const commandId=crypto.randomUUID()
    const result = client.send({type:'rerun_answer',commandId,sourceAnswerId:record.answerId,clientPressedAtMs:performance.now()})
    if (!result.ok) setBackendError(result.message)
    else {pendingConsumeRef.current[commandId]='';setPendingSource(true)}
  }, [client])

  const candidateAction = (action: CandidateMutation, select=false, query?:Record<string,unknown>) => {
    const commandId=crypto.randomUUID()
    pendingQuestionsRef.current[commandId]={select,query,wording:action.drafts[0]?.wording.trim(),token:sourceTokenRef.current}
    const result=client.send({...action,commandId})
    if(!result.ok){delete pendingQuestionsRef.current[commandId];setBackendError(result.message)}
    else {setBackendError(null);if(select)setPendingSource(true);return commandId}
    return undefined
  }
  const useCandidate = (candidate: Candidate) => {
    if(!candidate.snapshot)return
    const old=targetDraftRef.current
    if(old&&!old.candidateId&&!pinnedMomentsRef.current.some(p=>p.snapshotId===old.snapshot.snapshotId))client.send({type:'snapshot_action',snapshotId:old.snapshot.snapshotId,action:'release'})
    setTargetDraft({targetId:crypto.randomUUID(),snapshot:candidate.snapshot,wording:candidate.wording,originalText:candidate.snapshot.text,candidateId:candidate.candidateId,candidateRevision:candidate.candidateRevision,savedWording:candidate.wording,wordingOrigin:candidate.origin})
  }
  const wrongQuestion = (record: RequestRecord) => {
    if(!detectionAvailable){setBackendError('Question correction requires protocol v5.');return}
    const snapshot=sourceSnapshots[record.snapshotId || '']
    if(!snapshot){setBackendError('The original source snapshot is unavailable.');return}
    const candidate=candidatesRef.current.find(c=>c.candidateId===record.metadata?.candidateId&&!['dismissed','superseded'].includes(c.state)&&c.snapshot?.snapshotId===snapshot.snapshotId&&c.wording===record.frozenInputs?.manualTarget?.wording)
    setTargetDraft({targetId:crypto.randomUUID(),snapshot,wording:record.frozenInputs?.manualTarget?.wording||snapshot.text,originalText:snapshot.text,correctsAnswerId:record.answerId,candidateId:candidate?.candidateId,candidateRevision:candidate?.candidateRevision})
  }
  const saveQuestion = () => {
    const draft=targetDraftRef.current
    if(!draft)return
    const parents=draft.candidateId?[{candidateId:draft.candidateId,expectedRevision:draft.candidateRevision!}]:[]
    const action:CandidateMutation={type:'candidate_action',action:draft.correctsAnswerId?'correct':draft.candidateId?'edit':'create',parents,drafts:[{wording:draft.wording,sourceSpans:draft.snapshot.sourceSpans}],...(draft.correctsAnswerId?{sourceAnswerId:draft.correctsAnswerId}:{})}
    candidateAction(action,true,draft.correctsAnswerId?queryInputs():undefined)
  }

  const runPreset = () => { setProfileMode('Preset'); runCockpitAnswer('Preset') }


  const runAnswer = () => runCockpitAnswer(profileMode)

  const runCustom = () => { setProfileMode('Custom'); runCockpitAnswer('Custom') }


  const stopQuery = () => {
    if (!activeQueryRequestIdRef.current) {
      return
    }
    client.send({ type: 'cancel_query', requestId: activeQueryRequestIdRef.current })
  }

  const runLastQueryAgain = () => {
    if (!lastQueryPayload || isQuerying) {
      return
    }
    executeQuery(lastQueryPayload)
  }

  const startTranscription = () => {
    setLiveText('')
    setLiveRows([])
    client.send({ type: 'set_audio_mode', mode: audioMode })
    if (selectedSystemAudioSource) {
      client.send({ type: 'set_audio_source', sourceName: selectedSystemAudioSource })
    }
    if (selectedMicAudioSource) {
      client.send({ type: 'set_mic_source', sourceName: selectedMicAudioSource })
    }
    client.send({ type: 'start_transcription' })
  }

  const stopTranscription = () => {
    client.send({ type: 'stop_transcription' })
    setLiveText('')
    setLiveRows([])
  }

  const clearTranscript = () => {
    setSegments([])
    dispatchCockpit({ type: 'transcript_cleared' })
    pendingSnapshotsRef.current = {}
    setPendingSource(false)
    setLiveText('')
    setLiveRows([])
    setSelectedText('')
    setSelectedTextDraft('')
    setSelectedSourceSpans([])
    selectedTextDraftEditedRef.current = false
    lastSelectionKeyRef.current = ''
    setSelectionRange(null)
    client.send({ type: 'clear_transcript' })
  }

  const refreshAudioSources = () => {
    clearTimeout(refreshTimer.current);setRefreshPending(true);setAudioNotice('')
    const result=client.send({ type: 'get_audio_sources' })
    if (!result.ok) {setRefreshPending(false);setAudioNotice(result.message);return}
    refreshTimer.current=setTimeout(()=>{setRefreshPending(false);setAudioNotice('Source refresh timed out. Check connection and try again.')},5000)
  }

  const changeSystemAudioSource = (sourceName: string) => {
    if(sourceName === selectedSystemAudioSource)return
    client.send({ type: 'set_audio_source', sourceName })
  }

  const changeMicAudioSource = (sourceName: string) => {
    if(sourceName === selectedMicAudioSource)return
    client.send({ type: 'set_mic_source', sourceName })
  }

  const changeAudioMode = (mode: AudioStreamKind) => {
    if(mode === audioMode)return
    client.send({ type: 'set_audio_mode', mode })
  }

  const toggleAudioMode = () => {
    changeAudioMode(audioMode === 'mic' ? 'system' : 'mic')
  }

  const captureScreen = useCallback(async () => {
    try {
      const dataUrl = await window.electronAPI?.captureScreen?.()
      if (dataUrl) {
        setScreenshotDataUrl(dataUrl)
        setIncludeScreenshotInQuery(true)
      } else {
        setStatus('error: screen capture returned no image')
      }
    } catch (err) {
      setStatus(`error: failed to capture screen: ${String(err)}`)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onCaptureScreenShortcut?.(() => {
      if(document.querySelector('[role=dialog]') || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName || ''))return
      void captureScreen()
    })
    return unsubscribe
  }, [captureScreen])

  const runBenchmark = (payload: { models: string[]; instruction: string; tests: BenchmarkCaseInput[]; repeats: number }) => {
    const benchmarkId = crypto.randomUUID()
    const imageByRef = new Map(benchmarkImages.map((image) => [image.refId, image.dataUrl]))
    const tests = payload.tests.map((test) => ({
      testId: test.testId,
      userPrompt: test.userPrompt,
      imageRef: test.imageRef || null,
      imageDataUrl: test.imageRef ? imageByRef.get(test.imageRef) || null : null
    }))
    setBenchmarkRunning(true)
    setActiveBenchmarkId(benchmarkId)
    activeBenchmarkIdRef.current = benchmarkId
    setBenchmarkLiveLogs([])
    setBenchmarkProgress({ completed: 0, total: payload.models.length * payload.repeats * tests.length })
    client.send({
      type: 'run_benchmark',
      benchmarkId,
      models: payload.models,
      instruction: payload.instruction,
      tests,
      repeats: payload.repeats
    })
  }

  return (
    <div className="app">
      <section className="page-tabs">
        <button className={activePage === 'desk' ? 'primary' : 'ghost'} onClick={() => setActivePage('desk')}>Desk</button>
        <button className={activePage === 'settings' ? 'primary' : 'ghost'} onClick={() => setActivePage('settings')}>Settings</button>
      </section>

      <div className="desk-page" hidden={activePage !== 'desk'}>
          <CockpitDesk
            autoState={autoState} autoAvailable={autoAvailable} autoSettingsReady={settingsSynced} autoSettingsError={autoSettingsError} onAutoMode={setAutoMode} onRetryAutoSettings={retryAutoSettings}
            candidates={candidates} detection={detection} detectionAvailable={detectionAvailable} questionResult={questionResult}
            onDetection={(enabled,retry=false)=>{const result=client.send({type:'set_detection',enabled,retry});if(!result.ok)setBackendError(result.message)}}
            onCandidateAction={candidateAction} onUseCandidate={useCandidate} onSaveQuestion={saveQuestion} onWrongQuestion={wrongQuestion}
            headerAudio={<><AudioMeter store={meterStore} kind={audioMode} source={audioMode==='mic'?selectedMicAudioSource:selectedSystemAudioSource} compact/><span>{isRunning?'Transcribing':'Transcription stopped'}</span><button onMouseDown={(event)=>{const selection=window.getSelection();soundSelectionRef.current=selection?.rangeCount?selection.getRangeAt(0).cloneRange():null;event.preventDefault()}} onClick={(event)=>{if(event.detail===0){const selection=window.getSelection();soundSelectionRef.current=selection?.rangeCount?selection.getRangeAt(0).cloneRange():null}event.currentTarget.focus();setSoundOpen(true)}}>Sound</button></>}
            segments={segments} liveText={liveText} selectedText={selectedText}
            windowSeconds={recentWindowSeconds} setWindowSeconds={setRecentWindowSeconds}
            onAnswer={() => runCockpitAnswer()} onPinMoment={() => createSource('pin')}
            canAnswer={Boolean(targetDraft || lastFinalSegment?.segmentKey) && cockpitReady && cockpitOwner}
            screenshotDataUrl={screenshotDataUrl} includeScreenshot={includeScreenshotInQuery}
            canCaptureScreenshot={Boolean(window.electronAPI?.captureScreen)} onCaptureScreen={captureScreen}
            onClearScreenshot={() => {setScreenshotDataUrl(null);setIncludeScreenshotInQuery(false)}} onToggleScreenshot={setIncludeScreenshotInQuery}
            onClear={clearTranscript} onSelectText={selectSource}
            records={answerRecords} keptIds={keptAnswerIds} keptCount={keptRecordCount} pendingAnswerIds={pendingAnswerIds}
            humanNotes={humanNotes} pendingNoteIds={pendingNoteIds} onNoteSave={saveHumanNote}
            onCopy={copyAnswer}
            onKeep={setAnswerPlacement} onRemove={removeAnswer} onCancel={cancelAnswer} onRerun={rerunAnswer}
            connected={cockpitReady} isOwner={cockpitOwner} status={status} errorMessage={backendError} model={selectedModel}
            onSettings={()=>setActivePage('settings')} layout={layout} onLayoutChange={setLayout}
            draft={targetDraft} onDraftChange={(wording)=>{if(targetDraftRef.current)sourceTokenRef.current=`${targetDraftRef.current.targetId}|${wording}`;setTargetDraft((draft)=>draft?{...draft,wording}:draft)}} onMakeQuestion={()=>createSource('draft')} onClearTarget={clearTarget}
            pinnedMoments={pinnedMoments} onUseMoment={(snapshot)=>{if(targetDraftRef.current&&!pinnedMoments.some((pin)=>pin.snapshotId===targetDraftRef.current!.snapshot.snapshotId))client.send({type:'snapshot_action',snapshotId:targetDraftRef.current.snapshot.snapshotId,action:'release'});setTargetDraft({targetId:crypto.randomUUID(),snapshot,wording:snapshot.text,originalText:snapshot.text})}}
            onRemoveMoment={(snapshot)=>{const commandId=crypto.randomUUID();const result=client.send({type:'snapshot_action',commandId,snapshotId:snapshot.snapshotId,action:'release'});if(result.ok)pendingSnapshotActionsRef.current[commandId]=snapshot;else setBackendError(result.message)}}
            sourceSnapshots={sourceSnapshots} onFirstVisible={onFirstVisible} onInteraction={onInteraction}
            profileMode={profileMode} onProfileMode={setProfileMode} presets={PRESETS} selectedPresetId={selectedPresetId} onPreset={setSelectedPresetId}
            customInstruction={customInstruction} onCustomInstruction={setCustomInstruction} models={models} onModel={setSelectedModel}
            onRefreshModels={()=>{client.send({type:'get_models'});client.send({type:'get_model_details'})}} onRunPreset={runPreset} onRunCustom={runCustom}
            pendingSource={pendingSource} unknownCommands={unknownCommands}
            onCheckStatus={()=>unknownCommands.forEach((queryCommandId)=>client.send({type:'get_command_status',queryCommandId}))}
            onDismissUnknown={()=>{unknownCommands.forEach((id)=>{delete pendingNoteActionsRef.current[id];delete pendingAnswerActionsRef.current[id];delete pendingSnapshotsRef.current[id];delete pendingConsumeRef.current[id]});setUnknownCommands([]);setPendingAnswerIds([]);setPendingNoteIds([]);setPendingSource(false)}}
          />

        </div>
      <div hidden={activePage !== 'settings'}>
        {backendError?<p role="alert" className="backend-error-banner">{backendError}</p>:null}

        <SettingsPage
          models={models}
          modelDetails={modelDetails}
          includeScreenshotInQuery={includeScreenshotInQuery}
          onToggleIncludeScreenshot={setIncludeScreenshotInQuery}
          onRefreshModelDetails={() => client.send({ type: 'get_model_details' })}
          onRunBenchmark={runBenchmark}
          benchmarkRunning={benchmarkRunning}
          benchmarkProgress={benchmarkProgress}
          benchmarkLiveLogs={benchmarkLiveLogs}
          benchmarkHistory={benchmarkHistory}
          benchmarkImages={benchmarkImages}
          ragDocuments={ragDocuments}
          ragNotice={ragNotice}
          onRagIngest={(paths) => client.send({ type: 'rag_ingest', paths })}
          onRagRefresh={() => client.send({ type: 'rag_list' })}
          onRagClear={() => client.send({ type: 'rag_clear' })}
          onUpsertBenchmarkImage={(image) => {
            setBenchmarkImages((prev) => {
              const next = prev.filter((item) => item.refId !== image.refId)
              return [image, ...next].sort((a, b) => a.refId.localeCompare(b.refId))
            })
          }}
          onDeleteBenchmarkImage={(refId) =>
            setBenchmarkImages((prev) => prev.filter((item) => item.refId !== refId))
          }
          onClearBenchmarkHistory={() => setBenchmarkHistory([])}
        />
      </div>
      {soundOpen?<SoundDialog sourceSelection={soundSelectionRef.current} store={meterStore} mode={audioMode} systemSources={systemAudioSources} micSources={micAudioSources} systemSource={selectedSystemAudioSource} micSource={selectedMicAudioSource} running={isRunning} enabled={cockpitReady&&cockpitOwner} refreshPending={refreshPending} notice={audioNotice} onMode={changeAudioMode} onSystemSource={changeSystemAudioSource} onMicSource={changeMicAudioSource} onRefresh={refreshAudioSources} onStart={startTranscription} onStop={stopTranscription} onClose={closeSound}/>:null}
    </div>
  )
}

export default App
