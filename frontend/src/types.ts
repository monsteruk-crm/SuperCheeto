export type AudioStreamKind = 'system' | 'mic'

export type TranscriptSegment = {
  id: number
  t0: number
  t1: number
  text: string
  is_final: boolean
  source_kind?: AudioStreamKind
  source_name?: string | null
}

export type Preset = {
  id: string
  label: string
  instruction: string
}

export type GatewayModelInfo = {
  id: string
  object: string
  created: number | null
  owned_by: string
}

export type BenchmarkResult = {
  testId: string
  model: string
  runs: number
  failures: number
  jsonValidRuns: number
  avgFirstTokenMs: number | null
  avgTtcMs: number | null
  minTtcMs: number | null
  maxTtcMs: number | null
  avgLatencyMs: number | null
  minLatencyMs: number | null
  maxLatencyMs: number | null
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number | null
  costKnownRuns: number
  avgQualityScore: number | null
  qualityPassRuns: number
  imageRuns: number
  imageWorkedRuns: number
  aggregateScore: number
}

export type BenchmarkCaseInput = {
  testId: string
  userPrompt: string
  imageRef?: string | null
  imageDataUrl?: string | null
}

export type BenchmarkCaseInfo = {
  testId: string
  userPrompt: string
  imageRef?: string | null
  hasImage: boolean
}

export type BenchmarkAttempt = {
  testId: string
  model: string
  run: number
  success: boolean
  jsonValid: boolean
  timeToFirstTokenMs: number | null
  ttcMs: number | null
  latencyMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  costUsd: number | null
  qualityScore: number
  qualityPassed: boolean
  qualityChecks: Array<{ name: string; passed: boolean; details: string }>
  imageCapabilityClaim: string | null
  imageWorked: boolean | null
  responsePreview: string
  error: string | null
  imageRef?: string | null
}

export type BenchmarkRun = {
  benchmarkId: string
  createdAt: number
  instruction: string
  tests: BenchmarkCaseInfo[]
  results: BenchmarkResult[]
  attempts: BenchmarkAttempt[]
}

export type BenchmarkLiveLog = BenchmarkAttempt & {
  benchmarkId: string
}

export type BenchmarkProgress = {
  completed: number
  total: number
  testId?: string
  model?: string
  run?: number
  successes?: number
  failures?: number
}

export type BenchmarkImageAsset = {
  refId: string
  dataUrl: string
  filename: string
  createdAt: number
}

export type QueryRequest = {
  requestId: string
  presetId: string | null
  customInstruction: string | null
  selectedText: string
  selectionTimeRange: { start: number; end: number } | null
  model?: string | null
  includeScreenshot?: boolean
  screenshotDataUrl?: string | null
}

export type SelectionRange = { start: number; end: number } | null

export type RagDocument = {
  docId: string
  filePath: string
  title: string
  chunkCount: number
  updatedAt: number
}
