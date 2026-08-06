# API

## Transport
- Protocol: WebSocket
- Endpoint: `ws://127.0.0.1:8765`
- Reconnect: frontend client retries connection; backend accepts reconnects and repeated start/stop cycles.

## Backend -> Frontend messages
- `transcript_live`
  - Payload: `{ "text": string, "t": number, "streamKind"?: "system"|"mic", "sourceName"?: string|null }`
- `transcript_segment`
  - Payload: `{ "segment": { "id": string|number, "t0": number, "t1": number, "text": string, "is_final": boolean, "source_kind"?: "system"|"mic", "source_name"?: string|null } }`
- `audio_level`
  - Payload: `{ "rms": number, "peak"?: number, "level": number, "t": number, "streamKind"?: "system"|"mic", "sourceName"?: string|null }`
- `audio_sources`
  - Payload:
    - `{ "sources": string[], "defaultSource"?: string, "selectedSource"?: string, "monitorSources"?: string[], "defaultMonitorSource"?: string, "selectedMonitorSource"?: string, "micSources"?: string[], "defaultMicSource"?: string, "selectedMicSource"?: string, "selectedMode"?: "system"|"mic" }`
- `status`
  - Payload: `{ "state": string, "details": object|string|null }`
- `query_state`
  - Payload: `{ "running": boolean, "requestId"?: string, "cancelled"?: boolean }`
- `query_chunk`
  - Payload: `{ "requestId"?: string, "delta": string }`
- `query_response`
  - Payload: `{ "requestId": string, "text": string, "latencyMs"?: number, "model"?: string, "screenshotUsed"?: boolean, "ragChunksUsed"?: number, "ragSources"?: string[] }`
- `rag_documents`
  - Payload: `{ "documents": Array<{ "docId": string, "filePath": string, "title": string, "chunkCount": number, "updatedAt": number }> }`
- `rag_ingest_result`
  - Payload: `{ "ingested": number, "updated": number, "skipped": number, "failed": number, "errors"?: string[] }`
- `error`
  - Payload: `{ "message": string }`

## Frontend -> Backend messages
- `set_audio_source`
  - Payload: `{ "sourceName": string }`
- `set_mic_source`
  - Payload: `{ "sourceName": string }`
- `set_audio_mode`
  - Payload: `{ "mode": "system"|"mic" }`
- `start_transcription`
  - Payload: none
- `stop_transcription`
  - Payload: none
- `run_query`
  - Payload:
    - `{ "requestId": string, "presetId": string|null, "customInstruction": string|null, "selectedText": string, "selectionTimeRange": { "start": number, "end": number }|null, "model"?: string|null, "includeScreenshot"?: boolean, "screenshotDataUrl"?: string|null }`
- `cancel_query`
  - Payload:
    - `{ "requestId"?: string }`
- `rag_ingest`
  - Payload:
    - `{ "paths": string[] }` (absolute file paths and/or directories)
- `rag_list`
  - Payload: none
- `rag_clear`
  - Payload: none
- `run_benchmark`
  - Payload:
    - `{ "benchmarkId": string, "models": string[], "instruction": string, "tests": Array<{ "testId": string, "userPrompt": string, "imageRef"?: string|null, "imageDataUrl"?: string|null }>, "repeats": number }`
  - Backward compatibility:
    - Legacy single-test payload with `selectedText` is still accepted.

## Benchmark backend -> frontend messages
- `benchmark_progress`
  - Payload:
    - `{ "benchmarkId": string, "completed": number, "total": number, "testId": string, "model": string, "run": number, "successes": number, "failures": number }`
- `benchmark_log`
  - Payload:
    - `{ "benchmarkId": string, "testId": string, "model": string, "run": number, "success": boolean, "jsonValid": boolean, "timeToFirstTokenMs": number|null, "ttcMs": number|null, "latencyMs": number|null, "inputTokens": number|null, "outputTokens": number|null, "totalTokens": number|null, "costUsd": number|null, "qualityScore": number, "qualityPassed": boolean, "qualityChecks": Array<{ "name": string, "passed": boolean, "details": string }>, "imageCapabilityClaim": string|null, "imageWorked": boolean|null, "responsePreview": string, "error": string|null, "imageRef": string|null }`
- `benchmark_complete`
  - Payload:
    - `{ "benchmarkId": string, "createdAt": number, "instruction": string, "tests": Array<{ "testId": string, "userPrompt": string, "imageRef": string|null, "hasImage": boolean }>, "results": Array<{ "testId": string, "model": string, "runs": number, "failures": number, "jsonValidRuns": number, "avgFirstTokenMs": number|null, "avgTtcMs": number|null, "minTtcMs": number|null, "maxTtcMs": number|null, "avgLatencyMs": number|null, "minLatencyMs": number|null, "maxLatencyMs": number|null, "totalInputTokens": number, "totalOutputTokens": number, "totalCostUsd": number|null, "costKnownRuns": number, "avgQualityScore": number|null, "qualityPassRuns": number, "imageRuns": number, "imageWorkedRuns": number, "aggregateScore": number }>, "attempts": Array<benchmark_log_payload_without_benchmarkId> }`

## Benchmark scoring notes
- Benchmarks are executed with OpenAI `Responses` API and can include both text and image input in one request.
- Cost is estimated when model pricing is known in backend pricing catalog or `OPENAI_MODEL_PRICING_JSON`.
- Quality score is rubric-based (required keys, answer presence, image claim check for image tests, and identifier check when requested).
- `ttcMs` (time to complete) is the full request duration from send to final response.
- Aggregate score is speed-first (0-100) and weights TTC/TTFT heavily, then reliability and quality:
  - 82% speed (`ttcMs`, `timeToFirstTokenMs`)
  - 13% reliability (success rate + JSON validity)
  - 5% quality/image behavior

## Query streaming notes
- Interactive `run_query` now uses Responses API streaming by default.
- Frontend receives incremental text via `query_chunk` and then a final `query_response`.
- `cancel_query` stops an in-flight query; frontend receives `query_state` with `running=false` and `cancelled=true`.
- When indexed documents exist, backend injects top-K retrieved chunks from local RAG store into query context before OpenAI call.

## RAG notes
- RAG vectors are persisted in local SQLite (`RAG_DB_PATH`), not browser storage.
- Default embedding model is `text-embedding-3-small` (`RAG_EMBEDDING_MODEL`).
- Supported ingestion file types: `.txt`, `.md`, `.pdf`, `.docx`.

## Audio mode notes
- Backend discovers and broadcasts monitor (system-output) sources and microphone sources separately.
- Source discovery prefers `pactl` when it is installed, and falls back to PipeWire-native `pw-dump` metadata when it is not.
- Switching source or mode while running triggers an automatic capture restart that reuses the already-loaded Whisper model.
- Backward compatibility is preserved for legacy clients that only consume `sources/defaultSource/selectedSource`.
- `audio_level` events are emitted by always-on meter loops, so meters can update even when transcription is not running.
- Audio meter responsiveness can be tuned with:
  - `AUDIO_LEVEL_INTERVAL` (default `0.04`)
  - `AUDIO_LEVEL_RMS_REF` (default `0.06`)
  - `AUDIO_LEVEL_PEAK_REF` (default `0.22`)

## Versioning notes
- No explicit protocol version field is currently enforced.
- Any schema or event-name change should add a protocol version and a new ADR.
