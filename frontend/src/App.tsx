import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PromptBar from './components/PromptBar'
import TranscriptPane from './components/TranscriptPane'
import OutputPane from './components/OutputPane'
import SettingsPage from './components/SettingsPage'
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

type UIPreferences = {
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

const App: React.FC = () => {
  const [storedUiPreferences] = useState<UIPreferences>(() => loadUiPreferences())
  const hasStoredAudioMode = storedUiPreferences.audioMode === 'mic' || storedUiPreferences.audioMode === 'system'
  const [activePage, setActivePage] = useState<'desk' | 'settings'>('desk')
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [liveText, setLiveText] = useState('')
  const [liveRows, setLiveRows] = useState<LiveRow[]>([])
  const [selectedText, setSelectedText] = useState('')
  const [selectedTextDraft, setSelectedTextDraft] = useState('')
  const [selectionRange, setSelectionRange] = useState<SelectionRange>(null)
  const [output, setOutput] = useState('')
  const [isQuerying, setIsQuerying] = useState(false)
  const [status, setStatus] = useState('Connecting…')
  const [backendError, setBackendError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [audioMode, setAudioMode] = useState<AudioStreamKind>(storedUiPreferences.audioMode || 'system')
  const [systemAudioLevel, setSystemAudioLevel] = useState(0)
  const [systemAudioRms, setSystemAudioRms] = useState(0)
  const [systemAudioSources, setSystemAudioSources] = useState<string[]>([])
  const [selectedSystemAudioSource, setSelectedSystemAudioSource] = useState(storedUiPreferences.selectedSystemAudioSource || '')
  const [micAudioLevel, setMicAudioLevel] = useState(0)
  const [micAudioRms, setMicAudioRms] = useState(0)
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
  const [selectedPresetId, setSelectedPresetId] = useState(storedUiPreferences.selectedPresetId || PRESETS[0].id)
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

  const client = useMemo(() => {
    return new WSClient('ws://127.0.0.1:8765', {
      onStatus: (payload) => {
        if (payload.details) {
          setStatus(`${payload.state}: ${payload.details}`)
        } else {
          setStatus(payload.state)
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
      onAudioLevel: (payload) => {
        const streamKind: AudioStreamKind = payload.streamKind === 'mic' ? 'mic' : 'system'
        if (streamKind === 'mic') {
          setMicAudioLevel(payload.level)
          setMicAudioRms(payload.rms)
          return
        }
        setSystemAudioLevel(payload.level)
        setSystemAudioRms(payload.rms)
      },
      onAudioSources: (payload) => {
        const monitorSources = payload.monitorSources || payload.sources || []
        const micSources = payload.micSources || []
        setSystemAudioSources(monitorSources)
        setMicAudioSources(micSources)
        setAudioMode((prev) => {
          if (!hasStoredAudioMode && payload.selectedMode) {
            return payload.selectedMode === 'mic' ? 'mic' : 'system'
          }
          const next = prev === 'mic' || prev === 'system' ? prev : 'system'
          if (payload.selectedMode && payload.selectedMode !== next) {
            client.send({ type: 'set_audio_mode', mode: next })
          }
          return next
        })
        setSelectedSystemAudioSource((prev) => {
          const next = resolvePreferredOption(
            prev,
            monitorSources,
            payload.selectedMonitorSource,
            payload.selectedSource,
            payload.defaultMonitorSource,
            payload.defaultSource
          )
          const selectedByBackend = payload.selectedMonitorSource || payload.selectedSource || ''
          if (next && selectedByBackend !== next) {
            client.send({ type: 'set_audio_source', sourceName: next })
          }
          return next
        })
        setSelectedMicAudioSource((prev) => {
          const next = resolvePreferredOption(prev, micSources, payload.selectedMicSource, payload.defaultMicSource)
          if (next && payload.selectedMicSource !== next) {
            client.send({ type: 'set_mic_source', sourceName: next })
          }
          return next
        })
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
  }, [client])

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
        selectedSystemAudioSource,
        selectedMicAudioSource,
        customInstruction,
        selectedModel,
        selectedPresetId,
        includeScreenshotInQuery
      } satisfies UIPreferences)
    )
  }, [
    audioMode,
    selectedSystemAudioSource,
    selectedMicAudioSource,
    customInstruction,
    selectedModel,
    selectedPresetId,
    includeScreenshotInQuery
  ])

  const canRun = selectedTextDraft.trim().length > 0

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

  const runPreset = () => {
    const trimmedSelection = selectedText.trim()
    const trimmedDraft = selectedTextDraft.trim()
    executeQuery({
      presetId: selectedPresetId,
      customInstruction: null,
      selectedText: selectedTextDraft,
      selectionTimeRange: trimmedDraft && trimmedDraft === trimmedSelection ? selectionRange : null,
      model: selectedModel || null,
      includeScreenshot: includeScreenshotInQuery,
      screenshotDataUrl: includeScreenshotInQuery ? screenshotDataUrl : null
    })
  }

  const runAnswer = () => {
    const trimmedSelection = selectedText.trim()
    const trimmedDraft = selectedTextDraft.trim()
    const trimmedInstruction = customInstruction.trim()
    executeQuery({
      presetId: trimmedInstruction ? null : ANSWER_PRESET_ID,
      customInstruction: trimmedInstruction || null,
      selectedText: selectedTextDraft,
      selectionTimeRange: trimmedDraft && trimmedDraft === trimmedSelection ? selectionRange : null,
      model: selectedModel || null,
      includeScreenshot: includeScreenshotInQuery,
      screenshotDataUrl: includeScreenshotInQuery ? screenshotDataUrl : null
    })
  }

  const runCustom = () => {
    const trimmedSelection = selectedText.trim()
    const trimmedDraft = selectedTextDraft.trim()
    executeQuery({
      presetId: null,
      customInstruction: customInstruction.trim(),
      selectedText: selectedTextDraft,
      selectionTimeRange: trimmedDraft && trimmedDraft === trimmedSelection ? selectionRange : null,
      model: selectedModel || null,
      includeScreenshot: includeScreenshotInQuery,
      screenshotDataUrl: includeScreenshotInQuery ? screenshotDataUrl : null
    })
  }

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
    setSystemAudioLevel(0)
    setSystemAudioRms(0)
    setMicAudioLevel(0)
    setMicAudioRms(0)
  }

  const clearTranscript = () => {
    setSegments([])
    setLiveText('')
    setLiveRows([])
    setSelectedText('')
    setSelectedTextDraft('')
    selectedTextDraftEditedRef.current = false
    lastSelectionKeyRef.current = ''
    setSelectionRange(null)
    client.send({ type: 'clear_transcript' })
  }

  const refreshAudioSources = () => {
    client.send({ type: 'get_audio_sources' })
  }

  const changeSystemAudioSource = (sourceName: string) => {
    setSelectedSystemAudioSource(sourceName)
    client.send({ type: 'set_audio_source', sourceName })
  }

  const changeMicAudioSource = (sourceName: string) => {
    setSelectedMicAudioSource(sourceName)
    client.send({ type: 'set_mic_source', sourceName })
  }

  const changeAudioMode = (mode: AudioStreamKind) => {
    setAudioMode(mode)
    setSystemAudioLevel(0)
    setSystemAudioRms(0)
    setMicAudioLevel(0)
    setMicAudioRms(0)
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

      {activePage === 'desk' ? (
        <>
          <PromptBar
            presets={PRESETS}
            selectedPresetId={selectedPresetId}
            onPresetChange={setSelectedPresetId}
            customInstruction={customInstruction}
            onCustomInstructionChange={setCustomInstruction}
            models={models}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            onCaptureScreen={captureScreen}
            onRunPreset={runPreset}
            onRunCustom={runCustom}
            canRun={canRun}
            isQuerying={isQuerying}
            status={status}
            backendError={backendError}
            isRunning={isRunning}
            audioMode={audioMode}
            onAudioModeChange={changeAudioMode}
            systemAudioLevel={systemAudioLevel}
            systemAudioRms={systemAudioRms}
            systemAudioSources={systemAudioSources}
            selectedSystemAudioSource={selectedSystemAudioSource}
            onSystemAudioSourceChange={changeSystemAudioSource}
            micAudioLevel={micAudioLevel}
            micAudioRms={micAudioRms}
            micAudioSources={micAudioSources}
            selectedMicAudioSource={selectedMicAudioSource}
            onMicAudioSourceChange={changeMicAudioSource}
            onRefreshAudioSources={refreshAudioSources}
            onStart={startTranscription}
            onStop={stopTranscription}
            onToggleAudioMode={toggleAudioMode}
          />

          <div className="content">
            <OutputPane
              output={output}
              isQuerying={isQuerying}
              canStopQuery={Boolean(activeQueryRequestId)}
              canRunAgain={Boolean(lastQueryPayload)}
              onStopQuery={stopQuery}
              onRunAgain={runLastQueryAgain}
              screenshotDataUrl={screenshotDataUrl}
              onClearScreenshot={() => {
                setScreenshotDataUrl(null)
                setIncludeScreenshotInQuery(false)
              }}
              latencyMs={lastQueryLatencyMs}
              model={lastResponseModel}
              screenshotUsed={lastScreenshotUsed}
              selectedTextDraft={selectedTextDraft}
              onSelectedTextDraftChange={(value) => {
                setSelectedTextDraft(value)
                selectedTextDraftEditedRef.current = true
              }}
              onAnswer={runAnswer}
              canAnswer={canRun}
              onResetSelectedTextDraft={() => {
                setSelectedTextDraft(selectedText)
                selectedTextDraftEditedRef.current = false
              }}
              canResetSelectedTextDraft={canResetSelectedTextDraft}
              collapsedRows={selectedTextRowsCollapsed}
              focusedRows={selectedTextRowsFocused}
            />
            <TranscriptPane
              segments={segments}
              liveText={liveText}
              liveRows={liveRows}
              maxRows={maxRows}
              onSelectionChange={(text, range) => {
                const nextSelectionKey = selectionKeyFor(text, range)
                const selectionChanged = nextSelectionKey !== lastSelectionKeyRef.current
                setSelectedText(text)
                if (!selectedTextDraftEditedRef.current || selectionChanged) {
                  setSelectedTextDraft(text)
                  selectedTextDraftEditedRef.current = false
                }
                lastSelectionKeyRef.current = nextSelectionKey
                setSelectionRange(range)
              }}
              onClear={clearTranscript}
            />
          </div>

          <section className="selection">
            <div>
              <h3>Selected text</h3>
              <p className={selectedText ? 'selected' : 'muted'}>
                {selectedText || 'Select any portion of the transcript to enable prompts.'}
              </p>
            </div>
          </section>
        </>
      ) : (
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
      )}
    </div>
  )
}

export default App
