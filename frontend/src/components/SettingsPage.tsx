import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  BenchmarkCaseInput,
  BenchmarkImageAsset,
  BenchmarkLiveLog,
  BenchmarkProgress,
  BenchmarkRun,
  GatewayModelInfo,
  RagDocument
} from '../types'

type Props = {
  models: string[]
  modelDetails: GatewayModelInfo[]
  includeScreenshotInQuery: boolean
  onToggleIncludeScreenshot: (next: boolean) => void
  onRefreshModelDetails: () => void
  onRunBenchmark: (payload: { models: string[]; instruction: string; tests: BenchmarkCaseInput[]; repeats: number }) => void
  benchmarkRunning: boolean
  benchmarkProgress: BenchmarkProgress | null
  benchmarkLiveLogs: BenchmarkLiveLog[]
  benchmarkHistory: BenchmarkRun[]
  benchmarkImages: BenchmarkImageAsset[]
  onUpsertBenchmarkImage: (image: BenchmarkImageAsset) => void
  onDeleteBenchmarkImage: (refId: string) => void
  onClearBenchmarkHistory: () => void
  ragDocuments: RagDocument[]
  ragNotice: string
  onRagIngest: (paths: string[]) => void
  onRagRefresh: () => void
  onRagClear: () => void
}

const DEFAULT_BENCHMARK_INSTRUCTION = `You are BenchmarkBot. Your job is to complete the given test as accurately as possible while following the required output format.

Your harness supplies TEST_ID, IMAGE_1 (optional), and the test's USER_PROMPT.

Hard rules

If the test includes image(s), you MUST use them. If you cannot see/process images, you MUST say so explicitly.

Do not browse the web. Do not ask follow-up questions unless the test explicitly allows it.

Be concise but complete. Prefer bullet points where useful.

Output format (MUST be valid JSON)
Return a single JSON object with these keys:

test_id (string): copy exactly from input
image_used (boolean): true if you used image content, false otherwise
image_capability_claim (string): one of "worked" | "not_supported" | "uncertain"
answer (string): your final answer to the task
confidence (number 0-1): calibrated confidence
self_check (array of strings): short checklist of what you verified
failure_modes (array of strings): if anything went wrong, describe it

Calibration

If you are guessing, say so in failure_modes and lower confidence.

If image content is required but you can't access it, set:

image_used=false
image_capability_claim="not_supported"
confidence<=0.2

Now run the test below.`

const formatDate = (timestamp: number | null) => {
  if (!timestamp) return '-'
  const date = new Date(timestamp * 1000)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toISOString().slice(0, 10)
}

const formatMs = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return `${Math.round(value)} ms`
}

const formatTokens = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return value.toLocaleString()
}

const formatUsd = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

const formatScore = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return `${Math.round(value * 100)}%`
}

const formatAggregateScore = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return `${value.toFixed(1)}`
}

const truncatePreview = (value: string, maxChars: number = 100) => {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}...`
}

type LatestModelResult = {
  model: string
  hasData: boolean
  createdAt: number | null
  benchmarkId: string | null
  testCount: number
  runs: number
  failures: number
  jsonValidRuns: number
  avgFirstTokenMs: number | null
  avgTtcMs: number | null
  minTtcMs: number | null
  maxTtcMs: number | null
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number | null
  costKnownRuns: number
  avgQualityScore: number | null
  qualityPassRuns: number
  imageRuns: number
  imageWorkedRuns: number
  avgAggregateScore: number | null
}

type EditableBenchmarkTest = {
  rowId: number
  testId: string
  imageRef: string
  userPrompt: string
}

const BENCHMARK_TESTS_STORAGE_KEY = 'benchmark-tests.v1'
const DEFAULT_BENCHMARK_TESTS: EditableBenchmarkTest[] = [
  {
    rowId: 1,
    testId: 'test_001',
    imageRef: '',
    userPrompt: 'Summarize the key claim in one sentence.'
  },
  {
    rowId: 2,
    testId: 'test_002',
    imageRef: '',
    userPrompt: 'Extract up to 3 action items and include owners if present.'
  }
]

const normalizeStoredTests = (value: unknown): EditableBenchmarkTest[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const normalized: EditableBenchmarkTest[] = []
  let nextRowId = 1
  for (const row of value) {
    if (!row || typeof row !== 'object') {
      continue
    }
    const entry = row as Partial<EditableBenchmarkTest>
    const testId = typeof entry.testId === 'string' ? entry.testId.trim() : ''
    const userPrompt = typeof entry.userPrompt === 'string' ? entry.userPrompt : ''
    if (!testId || !userPrompt.trim()) {
      continue
    }
    const imageRef = typeof entry.imageRef === 'string' ? entry.imageRef.trim() : ''
    normalized.push({
      rowId: nextRowId,
      testId,
      imageRef,
      userPrompt
    })
    nextRowId += 1
  }

  return normalized
}

const loadStoredTests = (): EditableBenchmarkTest[] => {
  if (typeof window === 'undefined') return DEFAULT_BENCHMARK_TESTS
  try {
    const raw = window.localStorage.getItem(BENCHMARK_TESTS_STORAGE_KEY)
    if (!raw) return DEFAULT_BENCHMARK_TESTS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_BENCHMARK_TESTS
    return normalizeStoredTests(parsed)
  } catch {
    return DEFAULT_BENCHMARK_TESTS
  }
}

const SettingsPage: React.FC<Props> = ({
  models,
  modelDetails,
  includeScreenshotInQuery,
  onToggleIncludeScreenshot,
  onRefreshModelDetails,
  onRunBenchmark,
  benchmarkRunning,
  benchmarkProgress,
  benchmarkLiveLogs,
  benchmarkHistory,
  benchmarkImages,
  onUpsertBenchmarkImage,
  onDeleteBenchmarkImage,
  onClearBenchmarkHistory,
  ragDocuments,
  ragNotice,
  onRagIngest,
  onRagRefresh,
  onRagClear
}) => {
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [repeats, setRepeats] = useState(2)
  const [instruction, setInstruction] = useState(DEFAULT_BENCHMARK_INSTRUCTION)
  const [imageRefInput, setImageRefInput] = useState('IMAGE_1')
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [imageError, setImageError] = useState('')
  const [imageNotice, setImageNotice] = useState('')
  const [previewImage, setPreviewImage] = useState<BenchmarkImageAsset | null>(null)
  const imageFileInputRef = useRef<HTMLInputElement | null>(null)
  const [tests, setTests] = useState<EditableBenchmarkTest[]>(() => loadStoredTests())
  const [selectedTestRowId, setSelectedTestRowId] = useState<number | null>(null)
  const [draftTestId, setDraftTestId] = useState('test_003')
  const [draftImageRef, setDraftImageRef] = useState('')
  const [draftUserPrompt, setDraftUserPrompt] = useState('')
  const [testError, setTestError] = useState('')
  const [ragPathInput, setRagPathInput] = useState('')

  const availableModels = useMemo(() => {
    if (modelDetails.length > 0) {
      return modelDetails.map((item) => item.id)
    }
    return models
  }, [modelDetails, models])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(BENCHMARK_TESTS_STORAGE_KEY, JSON.stringify(tests))
  }, [tests])

  const toggleModel = (model: string) => {
    setSelectedModels((prev) => (prev.includes(model) ? prev.filter((id) => id !== model) : [...prev, model]))
  }

  const knownImageRefs = useMemo(
    () => new Set(benchmarkImages.map((image) => image.refId)),
    [benchmarkImages]
  )

  const testsWithMissingImageRef = useMemo(
    () => tests.filter((test) => test.imageRef.trim() && !knownImageRefs.has(test.imageRef.trim())),
    [knownImageRefs, tests]
  )

  const uploadBenchmarkImage = async () => {
    const refId = imageRefInput.trim()
    const file = selectedImageFile || imageFileInputRef.current?.files?.[0] || null
    if (!refId) {
      setImageError('Image ref id is required.')
      setImageNotice('')
      return
    }
    if (!file) {
      setImageError('Select an image file first.')
      setImageNotice('')
      return
    }
    if (!file.type.startsWith('image/')) {
      setImageError('Only image files are supported.')
      setImageNotice('')
      return
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Failed reading image file.'))
        reader.readAsDataURL(file)
      })
      if (!dataUrl.startsWith('data:image/')) {
        setImageError('Image conversion failed.')
        setImageNotice('')
        return
      }
      onUpsertBenchmarkImage({
        refId,
        dataUrl,
        filename: file.name,
        createdAt: Math.floor(Date.now() / 1000)
      })
      setImageError('')
      setImageNotice(`Saved image ref ${refId}.`)
      setSelectedImageFile(null)
      if (imageFileInputRef.current) {
        imageFileInputRef.current.value = ''
      }
    } catch (error) {
      setImageError(String(error))
      setImageNotice('')
    }
  }

  const resetTestDraft = () => {
    setSelectedTestRowId(null)
    setDraftTestId(`test_${String(tests.length + 1).padStart(3, '0')}`)
    setDraftImageRef('')
    setDraftUserPrompt('')
    setTestError('')
  }

  const validateTestDraft = (rowIdToUpdate: number | null): string | null => {
    const testId = draftTestId.trim()
    const imageRef = draftImageRef.trim()
    const userPrompt = draftUserPrompt.trim()
    if (!testId) {
      return 'Test id is required.'
    }
    if (!userPrompt) {
      return 'Test prompt is required.'
    }
    if (imageRef && !knownImageRefs.has(imageRef)) {
      return `Unknown image ref: ${imageRef}`
    }
    const duplicate = tests.find((item) => item.testId === testId && item.rowId !== rowIdToUpdate)
    if (duplicate) {
      return `Duplicate test id: ${testId}`
    }
    return null
  }

  const createTest = () => {
    const validationError = validateTestDraft(null)
    if (validationError) {
      setTestError(validationError)
      return
    }
    const nextRowId = tests.reduce((max, item) => Math.max(max, item.rowId), 0) + 1
    setTests((prev) => [
      ...prev,
      {
        rowId: nextRowId,
        testId: draftTestId.trim(),
        imageRef: draftImageRef.trim(),
        userPrompt: draftUserPrompt.trim()
      }
    ])
    setTestError('')
    setSelectedTestRowId(nextRowId)
  }

  const updateSelectedTest = () => {
    if (selectedTestRowId === null) {
      setTestError('Select a test row first.')
      return
    }
    const validationError = validateTestDraft(selectedTestRowId)
    if (validationError) {
      setTestError(validationError)
      return
    }
    setTests((prev) =>
      prev.map((item) =>
        item.rowId === selectedTestRowId
          ? {
              ...item,
              testId: draftTestId.trim(),
              imageRef: draftImageRef.trim(),
              userPrompt: draftUserPrompt.trim()
            }
          : item
      )
    )
    setTestError('')
  }

  const deleteSelectedTest = () => {
    if (selectedTestRowId === null) {
      setTestError('Select a test row to delete.')
      return
    }
    setTests((prev) => prev.filter((item) => item.rowId !== selectedTestRowId))
    resetTestDraft()
  }

  const selectTest = (row: EditableBenchmarkTest) => {
    setSelectedTestRowId(row.rowId)
    setDraftTestId(row.testId)
    setDraftImageRef(row.imageRef)
    setDraftUserPrompt(row.userPrompt)
    setTestError('')
  }

  const benchmarkCases: BenchmarkCaseInput[] = useMemo(
    () =>
      tests.map((test) => ({
        testId: test.testId.trim(),
        userPrompt: test.userPrompt.trim(),
        imageRef: test.imageRef.trim() || null
      })),
    [tests]
  )

  const latestPerModel = useMemo<LatestModelResult[]>(() => {
    const discoveredModels = new Set<string>()
    for (const run of benchmarkHistory) {
      for (const row of run.results) {
        discoveredModels.add(row.model)
      }
    }

    const modelOrder = availableModels.length > 0
      ? availableModels
      : Array.from(discoveredModels).sort((a, b) => a.localeCompare(b))

    const rows: LatestModelResult[] = modelOrder.map((model) => ({
      model,
      hasData: false,
      createdAt: null,
      benchmarkId: null,
      testCount: 0,
      runs: 0,
      failures: 0,
      jsonValidRuns: 0,
      avgFirstTokenMs: null,
      avgTtcMs: null,
      minTtcMs: null,
      maxTtcMs: null,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: null,
      costKnownRuns: 0,
      avgQualityScore: null,
      qualityPassRuns: 0,
      imageRuns: 0,
      imageWorkedRuns: 0,
      avgAggregateScore: null
    }))

    for (let i = 0; i < rows.length; i += 1) {
      const model = rows[i].model
      for (const run of benchmarkHistory) {
        const matchingRows = run.results.filter((item) => item.model === model)
        if (matchingRows.length === 0) continue

        const runs = matchingRows.reduce((sum, item) => sum + (item.runs ?? 0), 0)
        const failures = matchingRows.reduce((sum, item) => sum + (item.failures ?? 0), 0)
        const jsonValidRuns = matchingRows.reduce((sum, item) => sum + (item.jsonValidRuns ?? 0), 0)
        const totalInputTokens = matchingRows.reduce((sum, item) => sum + (item.totalInputTokens ?? 0), 0)
        const totalOutputTokens = matchingRows.reduce((sum, item) => sum + (item.totalOutputTokens ?? 0), 0)
        const costKnownRuns = matchingRows.reduce((sum, item) => sum + (item.costKnownRuns ?? 0), 0)
        const totalCostUsd = matchingRows.reduce((sum, item) => sum + (item.totalCostUsd ?? 0), 0)
        const qualityPassRuns = matchingRows.reduce((sum, item) => sum + (item.qualityPassRuns ?? 0), 0)
        const imageRuns = matchingRows.reduce((sum, item) => sum + (item.imageRuns ?? 0), 0)
        const imageWorkedRuns = matchingRows.reduce((sum, item) => sum + (item.imageWorkedRuns ?? 0), 0)
        const weightedFirstTokenSum = matchingRows.reduce(
          (sum, item) => sum + ((item.avgFirstTokenMs ?? 0) * (item.runs ?? 0)),
          0
        )
        const weightedTtcSum = matchingRows.reduce(
          (sum, item) => sum + (((item.avgTtcMs ?? item.avgLatencyMs) ?? 0) * (item.runs ?? 0)),
          0
        )
        const weightedQualitySum = matchingRows.reduce(
          (sum, item) => sum + ((item.avgQualityScore ?? 0) * (item.runs ?? 0)),
          0
        )
        const weightedAggregateSum = matchingRows.reduce(
          (sum, item) => sum + ((item.aggregateScore ?? 0) * (item.runs ?? 0)),
          0
        )
        const ttcMin = matchingRows
          .map((item) => item.minTtcMs ?? item.minLatencyMs)
          .filter((item): item is number => item !== null)
        const ttcMax = matchingRows
          .map((item) => item.maxTtcMs ?? item.maxLatencyMs)
          .filter((item): item is number => item !== null)

        rows[i] = {
          model,
          hasData: true,
          createdAt: run.createdAt,
          benchmarkId: run.benchmarkId,
          testCount: matchingRows.length,
          runs,
          failures,
          jsonValidRuns,
          avgFirstTokenMs: runs > 0 ? weightedFirstTokenSum / runs : null,
          avgTtcMs: runs > 0 ? weightedTtcSum / runs : null,
          minTtcMs: ttcMin.length > 0 ? Math.min(...ttcMin) : null,
          maxTtcMs: ttcMax.length > 0 ? Math.max(...ttcMax) : null,
          totalInputTokens,
          totalOutputTokens,
          totalCostUsd: costKnownRuns > 0 ? totalCostUsd : null,
          costKnownRuns,
          avgQualityScore: runs > 0 ? weightedQualitySum / runs : null,
          qualityPassRuns,
          imageRuns,
          imageWorkedRuns,
          avgAggregateScore: runs > 0 ? weightedAggregateSum / runs : null
        }
        break
      }
    }

    return rows.filter((row) => row.hasData)
  }, [availableModels, benchmarkHistory])

  return (
    <section className="settings-page">
      <div className="settings-grid">
        <section className="pane">
          <header>
            <div>
              <h2>Query Settings</h2>
              <p>Controls for query behavior and benchmark setup.</p>
            </div>
          </header>
          <div className="settings-body">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={includeScreenshotInQuery}
                onChange={(event) => onToggleIncludeScreenshot(event.target.checked)}
              />
              <span>Send captured screenshot with query when available</span>
            </label>
            <p className="muted">When disabled, screenshot stays local and is never sent to AI Gateway or its selected model provider.</p>
            <hr />
            <h3>Local RAG Documents</h3>
            <p className="muted">
              Ingest one or more absolute paths (files or folders). Supported: `.txt`, `.md`, `.pdf`, `.docx`.
            </p>
            <div className="input-wrap">
              <label>Paths (comma-separated)</label>
              <textarea
                rows={3}
                value={ragPathInput}
                onChange={(event) => setRagPathInput(event.target.value)}
                placeholder="/home/you/Documents/CV.pdf, /home/you/Documents/notes/"
              />
            </div>
            <div className="benchmark-test-actions">
              <button
                className="ghost"
                onClick={() => {
                  const paths = ragPathInput
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean)
                  onRagIngest(paths)
                }}
              >
                Ingest
              </button>
              <button className="ghost" onClick={onRagRefresh}>Refresh list</button>
              <button className="ghost danger" onClick={onRagClear}>Clear RAG DB</button>
            </div>
            {ragNotice ? <p className="muted">{ragNotice}</p> : null}
            {ragDocuments.length > 0 ? (
              <table className="settings-table compact">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Chunks</th>
                    <th>Updated</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {ragDocuments.map((doc) => (
                    <tr key={doc.docId}>
                      <td>{doc.title}</td>
                      <td>{doc.chunkCount}</td>
                      <td>{new Date(doc.updatedAt * 1000).toLocaleString()}</td>
                      <td title={doc.filePath}>{truncatePreview(doc.filePath, 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No RAG documents indexed yet.</p>
            )}
          </div>
        </section>

        <section className="pane">
          <header>
            <div>
              <h2>Model Catalog</h2>
              <p>Metadata returned by AI Gateway models endpoint.</p>
            </div>
            <button className="ghost" onClick={onRefreshModelDetails}>Refresh model info</button>
          </header>
          <div className="settings-body table-wrap">
            {modelDetails.length === 0 ? (
              <p className="muted">No model metadata loaded yet.</p>
            ) : (
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Owner</th>
                    <th>Created</th>
                    <th>Object</th>
                  </tr>
                </thead>
                <tbody>
                  {modelDetails.map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.owned_by || '-'}</td>
                      <td>{formatDate(item.created)}</td>
                      <td>{item.object}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="pane">
          <header>
            <div>
              <h2>Benchmark</h2>
              <p>Run repeated benchmark tests across selected models.</p>
            </div>
          </header>
          <div className="settings-body">
            <div className="input-wrap">
              <label>Harness Instruction</label>
              <textarea
                rows={14}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
              />
            </div>
            <section className="benchmark-images">
              <h3>Benchmark Images</h3>
              <p className="muted">Upload once, then assign image refs to tests (for example: IMAGE_1).</p>
              <div className="benchmark-image-upload">
                <div className="input-wrap small-input">
                  <label>Image Ref Id</label>
                  <input value={imageRefInput} onChange={(event) => setImageRefInput(event.target.value)} />
                </div>
                <div className="input-wrap">
                  <label>Image File</label>
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(event) => setSelectedImageFile(event.target.files?.[0] || null)}
                  />
                </div>
                <button className="ghost" onClick={uploadBenchmarkImage}>Upload/Replace</button>
              </div>
              {imageError ? <p className="muted">{imageError}</p> : null}
              {imageNotice ? <p className="muted">{imageNotice}</p> : null}
              {benchmarkImages.length > 0 ? (
                <table className="settings-table compact">
                  <thead>
                    <tr>
                      <th>Ref</th>
                      <th>Filename</th>
                      <th>Preview</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarkImages.map((image) => (
                      <tr key={image.refId}>
                        <td>{image.refId}</td>
                        <td>{image.filename}</td>
                        <td>
                          <button className="ghost image-preview-trigger" onClick={() => setPreviewImage(image)}>
                            <img className="benchmark-image-thumb" src={image.dataUrl} alt={image.refId} />
                          </button>
                        </td>
                        <td>
                          <button className="ghost danger" onClick={() => onDeleteBenchmarkImage(image.refId)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No benchmark images uploaded yet.</p>
              )}
            </section>
            <section className="benchmark-tests">
              <div className="benchmark-history-header">
                <h3>Tests</h3>
                <button className="ghost" onClick={resetTestDraft}>New test</button>
              </div>
              <p className="muted">
                Create/update tests here. Prompt uses a dedicated 5-row textarea.
              </p>
              <div className="benchmark-test-form">
                <div className="input-wrap small-input">
                  <label>Test Id</label>
                  <input value={draftTestId} onChange={(event) => setDraftTestId(event.target.value)} />
                </div>
                <div className="input-wrap small-input">
                  <label>Image Ref (optional)</label>
                  <input
                    value={draftImageRef}
                    onChange={(event) => setDraftImageRef(event.target.value)}
                    placeholder="-"
                  />
                </div>
                <div className="input-wrap">
                  <label>Test Prompt</label>
                  <textarea
                    rows={5}
                    value={draftUserPrompt}
                    onChange={(event) => setDraftUserPrompt(event.target.value)}
                  />
                </div>
                <div className="benchmark-test-actions">
                  <button className="ghost" onClick={createTest}>Create</button>
                  <button className="ghost" onClick={updateSelectedTest}>Update selected</button>
                  <button className="ghost danger" onClick={deleteSelectedTest}>Delete selected</button>
                </div>
              </div>
              {testError ? <p className="muted">{testError}</p> : null}
              {testsWithMissingImageRef.length > 0 ? (
                <p className="muted">
                  Missing image refs in tests:{' '}
                  {testsWithMissingImageRef.map((test) => `${test.testId}:${test.imageRef}`).join(', ')}
                </p>
              ) : null}
              {tests.length > 0 ? (
                <table className="settings-table compact">
                  <thead>
                    <tr>
                      <th>Test Id</th>
                      <th>Image Ref</th>
                      <th>Prompt</th>
                      <th>Select</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tests.map((test) => (
                      <tr key={test.rowId}>
                        <td>{test.testId}</td>
                        <td>{test.imageRef || '-'}</td>
                        <td>{test.userPrompt}</td>
                        <td>
                          <button className="ghost" onClick={() => selectTest(test)}>
                            {selectedTestRowId === test.rowId ? 'Selected' : 'Edit'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No tests configured yet.</p>
              )}
            </section>
            <div className="input-wrap small-input">
              <label>Repeats per model (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={repeats}
                onChange={(event) => setRepeats(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
              />
            </div>
            <div className="model-checklist">
              {availableModels.map((model) => (
                <label key={model}>
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(model)}
                    onChange={() => toggleModel(model)}
                  />
                  <span>{model}</span>
                </label>
              ))}
            </div>
            <button
              className="primary"
              onClick={() => onRunBenchmark({ models: selectedModels, instruction, tests: benchmarkCases, repeats })}
              disabled={
                benchmarkRunning ||
                selectedModels.length === 0 ||
                !instruction.trim() ||
                benchmarkCases.length === 0 ||
                testsWithMissingImageRef.length > 0
              }
            >
              {benchmarkRunning ? 'Running benchmark...' : 'Run benchmark'}
            </button>
            {benchmarkProgress ? (
              <p className="muted">
                Progress: {benchmarkProgress.completed}/{benchmarkProgress.total}
                {benchmarkProgress.testId ? ` | test: ${benchmarkProgress.testId}` : ''}
                {benchmarkProgress.model ? ` | model: ${benchmarkProgress.model}` : ''}
                {benchmarkProgress.run ? ` | run: ${benchmarkProgress.run}` : ''}
                {typeof benchmarkProgress.successes === 'number' ? ` | ok: ${benchmarkProgress.successes}` : ''}
                {typeof benchmarkProgress.failures === 'number' ? ` | failed: ${benchmarkProgress.failures}` : ''}
              </p>
            ) : null}
            <h3>Live Runner Log</h3>
            {benchmarkLiveLogs.length > 0 ? (
              <table className="settings-table compact">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Test</th>
                    <th>Model</th>
                    <th>Image Ref</th>
                    <th>Status</th>
                    <th>JSON</th>
                    <th>TTFT</th>
                    <th>TTC</th>
                    <th>Input Tok</th>
                    <th>Output Tok</th>
                    <th>Cost</th>
                    <th>Quality</th>
                    <th>Image Claim</th>
                    <th>Error</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {benchmarkLiveLogs.map((log, index) => (
                    <tr key={`${log.benchmarkId}:${log.testId}:${log.model}:${log.run}:${index}`}>
                      <td>{log.run}</td>
                      <td>{log.testId}</td>
                      <td>{log.model}</td>
                      <td>{log.imageRef || '-'}</td>
                      <td>{log.success ? 'ok' : 'failed'}</td>
                      <td>{log.jsonValid ? 'yes' : 'no'}</td>
                      <td>{formatMs(log.timeToFirstTokenMs)}</td>
                      <td>{formatMs(log.ttcMs ?? log.latencyMs)}</td>
                      <td>{formatTokens(log.inputTokens)}</td>
                      <td>{formatTokens(log.outputTokens)}</td>
                      <td>{formatUsd(log.costUsd)}</td>
                      <td>{formatScore(log.qualityScore)}</td>
                      <td>{log.imageCapabilityClaim || '-'}</td>
                      <td>{log.error || '-'}</td>
                      <td title={log.responsePreview || '-'}>
                        {log.responsePreview ? truncatePreview(log.responsePreview, 100) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No live benchmark logs yet.</p>
            )}
            <h3>Latest Result Per Model</h3>
            {latestPerModel.length > 0 ? (
              <table className="settings-table compact">
                <thead>
                  <tr>
                    <th title="Model identifier used for benchmark runs.">Model</th>
                    <th title="Timestamp of the most recent benchmark run where this model had results.">Last Run</th>
                    <th title="Benchmark run id that produced the row shown here.">Benchmark</th>
                    <th title="Number of test cases included for this model in that latest benchmark run.">Tests</th>
                    <th title="Successful model responses counted in the latest run summary.">Runs</th>
                    <th title="Failed model requests (network/API/processing errors) in the latest run summary.">Failures</th>
                    <th title="Count of successful runs where response JSON was valid and matched expected object shape.">JSON Valid</th>
                    <th title="Average Time To First Token across the latest run summary. Lower is faster to first output.">TTFT</th>
                    <th title="Average time-to-complete (request start to final response) across latest run summary. Lower is better.">Avg TTC</th>
                    <th title="Fastest time-to-complete observed in latest run summary.">Min TTC</th>
                    <th title="Slowest time-to-complete observed in latest run summary.">Max TTC</th>
                    <th title="Total input tokens consumed by this model in latest run summary.">Input Tok</th>
                    <th title="Total output tokens generated by this model in latest run summary.">Output Tok</th>
                    <th title="Estimated USD cost from token usage using configured model pricing (if known).">Cost</th>
                    <th title="Average rubric quality score across latest run summary.">Quality</th>
                    <th title="Speed-first aggregate score (0-100). Formula weighs TTC/TTFT most heavily, then reliability and quality.">Agg Score</th>
                    <th title="Quality pass count over total successful runs for latest run summary.">Quality Pass</th>
                    <th title="For image tests: how many runs reported image capability worked over total image runs.">Image Worked</th>
                  </tr>
                </thead>
                <tbody>
                  {latestPerModel.map((row) => (
                    <tr key={`latest:${row.model}`}>
                      <td title={`Model: ${row.model}`}>{row.model}</td>
                      <td title={`Last Run: ${row.createdAt ? new Date(row.createdAt * 1000).toLocaleString() : '-'}`}>
                        {row.createdAt ? new Date(row.createdAt * 1000).toLocaleString() : '-'}
                      </td>
                      <td title={`Benchmark: ${row.benchmarkId || '-'}`}>{row.benchmarkId || '-'}</td>
                      <td title={`Tests: ${row.hasData ? row.testCount : '-'}`}>{row.hasData ? row.testCount : '-'}</td>
                      <td title={`Runs: ${row.hasData ? row.runs : '-'}`}>{row.hasData ? row.runs : '-'}</td>
                      <td title={`Failures: ${row.hasData ? row.failures : '-'}`}>{row.hasData ? row.failures : '-'}</td>
                      <td title={`JSON Valid: ${row.hasData ? row.jsonValidRuns : '-'}`}>
                        {row.hasData ? row.jsonValidRuns : '-'}
                      </td>
                      <td title={`TTFT: ${formatMs(row.avgFirstTokenMs)}`}>{formatMs(row.avgFirstTokenMs)}</td>
                      <td title={`Avg TTC: ${formatMs(row.avgTtcMs)}`}>{formatMs(row.avgTtcMs)}</td>
                      <td title={`Min TTC: ${formatMs(row.minTtcMs)}`}>{formatMs(row.minTtcMs)}</td>
                      <td title={`Max TTC: ${formatMs(row.maxTtcMs)}`}>{formatMs(row.maxTtcMs)}</td>
                      <td title={`Input Tok: ${row.hasData ? formatTokens(row.totalInputTokens) : '-'}`}>
                        {row.hasData ? formatTokens(row.totalInputTokens) : '-'}
                      </td>
                      <td title={`Output Tok: ${row.hasData ? formatTokens(row.totalOutputTokens) : '-'}`}>
                        {row.hasData ? formatTokens(row.totalOutputTokens) : '-'}
                      </td>
                      <td title={`Cost: ${formatUsd(row.totalCostUsd)}`}>{formatUsd(row.totalCostUsd)}</td>
                      <td title={`Quality: ${formatScore(row.avgQualityScore)}`}>{formatScore(row.avgQualityScore)}</td>
                      <td title={`Agg Score: ${formatAggregateScore(row.avgAggregateScore)}`}>
                        {formatAggregateScore(row.avgAggregateScore)}
                      </td>
                      <td title={`Quality Pass: ${row.hasData ? `${row.qualityPassRuns}/${row.runs || 0}` : '-'}`}>
                        {row.hasData ? `${row.qualityPassRuns}/${row.runs || 0}` : '-'}
                      </td>
                      <td title={`Image Worked: ${row.imageRuns > 0 ? `${row.imageWorkedRuns}/${row.imageRuns}` : '-'}`}>
                        {row.imageRuns > 0 ? `${row.imageWorkedRuns}/${row.imageRuns}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No benchmark results yet.</p>
            )}
            <div className="benchmark-history-header">
              <h3>Benchmark History</h3>
              <button className="ghost" onClick={onClearBenchmarkHistory} disabled={benchmarkHistory.length === 0}>
                Clear history
              </button>
            </div>
            {benchmarkHistory.length > 0 ? (
              <div className="benchmark-history">
                {benchmarkHistory.map((run) => {
                  const succeeded = run.attempts.filter((item) => item.success).length
                  return (
                    <section key={run.benchmarkId} className="benchmark-run">
                      <p className="muted benchmark-run-meta">
                        {new Date(run.createdAt * 1000).toLocaleString()} | {run.benchmarkId} | tests: {run.tests.length}
                        {' | '}attempts: {run.attempts.length} | succeeded: {succeeded}
                      </p>
                      <table className="settings-table compact">
                        <thead>
                          <tr>
                            <th>Test</th>
                            <th>Model</th>
                            <th>Runs</th>
                            <th>Failures</th>
                            <th>JSON Valid</th>
                            <th>TTFT</th>
                            <th>Avg TTC</th>
                            <th>Min TTC</th>
                            <th>Max TTC</th>
                            <th>Input Tok</th>
                            <th>Output Tok</th>
                            <th>Cost</th>
                            <th>Quality</th>
                            <th>Agg Score</th>
                            <th>Quality Pass</th>
                            <th>Image Worked</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.results.map((row) => (
                            <tr key={`${run.benchmarkId}:${row.testId}:${row.model}`}>
                              <td>{row.testId}</td>
                              <td>{row.model}</td>
                              <td>{row.runs}</td>
                              <td>{row.failures}</td>
                              <td>{row.jsonValidRuns}</td>
                              <td>{formatMs(row.avgFirstTokenMs)}</td>
                              <td>{formatMs(row.avgTtcMs ?? row.avgLatencyMs)}</td>
                              <td>{formatMs(row.minTtcMs ?? row.minLatencyMs)}</td>
                              <td>{formatMs(row.maxTtcMs ?? row.maxLatencyMs)}</td>
                              <td>{formatTokens(row.totalInputTokens)}</td>
                              <td>{formatTokens(row.totalOutputTokens)}</td>
                              <td>{formatUsd(row.totalCostUsd)}</td>
                              <td>{formatScore(row.avgQualityScore)}</td>
                              <td>{formatAggregateScore(row.aggregateScore)}</td>
                              <td>{`${row.qualityPassRuns ?? 0}/${row.runs ?? 0}`}</td>
                              <td>{(row.imageRuns ?? 0) > 0 ? `${row.imageWorkedRuns ?? 0}/${row.imageRuns}` : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  )
                })}
              </div>
            ) : (
              <p className="muted">No benchmark runs yet.</p>
            )}
          </div>
        </section>
      </div>
      {previewImage ? (
        <div className="image-modal-backdrop" onClick={() => setPreviewImage(null)}>
          <div className="image-modal-card" onClick={(event) => event.stopPropagation()}>
            <header className="image-modal-header">
              <h3>{previewImage.refId}</h3>
              <button className="ghost" onClick={() => setPreviewImage(null)}>Close</button>
            </header>
            <img className="image-modal-preview" src={previewImage.dataUrl} alt={previewImage.refId} />
            <p className="muted">{previewImage.filename}</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default SettingsPage
