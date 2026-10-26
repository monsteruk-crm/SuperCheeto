# Backend

Python asyncio service for local system-audio capture, near-real-time transcription, and Vercel AI Gateway queries.

## Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run
```bash
cd backend
python -m app.main
```

The backend logs query lifecycle events and failures through the standard Python logger, which the launcher captures into `.run/backend.log`.
If the Gateway Responses API returns `404`, the backend falls back to Chat Completions on the same Gateway host.
Deprecated ChatGPT snapshot aliases such as `gpt-5.2-chat-latest` are normalized to Gateway slugs such as `openai/gpt-5.6-sol`.
Streamed Responses API calls explicitly set `stream: true`; without that flag the API returns a plain JSON body and the SSE parser sees no output events.

## Test
```bash
cd backend
python -m unittest discover -s tests
```

## Webcam eye-tracking prototype (mock)
```bash
cd backend
python -m app.eye_tracking_prototype
```

Options:
- `--camera-index` (default `0`)
- `--width` / `--height` capture resolution
- `--no-mirror` to disable mirror preview

The prototype shows a live webcam overlay with coarse gaze direction labels (`left/right/up/down/center`, including diagonals).

## Configuration
- `AI_GATEWAY_API_KEY` must be set in the environment or `backend/.env.local` (falls back to `VERCEL_OIDC_TOKEN`).
- Optional overrides in `.env`:
  - `WS_HOST`, `WS_PORT`
  - `AUDIO_SOURCE` (exact Pulse/PipeWire monitor source name to force system-audio capture)
  - `AUDIO_MIC_SOURCE` (exact Pulse/PipeWire source name to force microphone capture)
  - `AUDIO_MODE` (`system` or `mic`, default `system`)
  - `STT_MODEL` (e.g. `base`, `small`)
  - `STT_DEVICE` (`cpu` default, or `cuda` when the CUDA runtime is installed), `STT_COMPUTE_TYPE` (`int8` for CPU, `float16` for CUDA)
  - `STT_VAD_FILTER` (`false` default; set `true` to suppress non-speech background)
  - Speech transcription is forced to English (`en`) for both microphone and system audio; Whisper auto-detection is disabled.
  - `STT_MIN_DECODE_RMS` (default `0.0010`; skips decoding on near-silent windows to reduce hallucinations)
  - `STT_NO_VAD_FALLBACK_MIN_RMS` (default `0.0025`; blocks no-VAD fallback on very low-energy windows)
  - `RAG_DB_PATH` (SQLite path for local vector DB, default `backend/data/rag.sqlite`)
  - `RAG_EMBEDDING_MODEL` (default `openai/text-embedding-3-small`)
  - `RAG_TOP_K` (number of retrieved chunks injected into each query context)
- `RAG_CHUNK_SIZE_CHARS`, `RAG_CHUNK_OVERLAP_CHARS` (ingest chunking strategy)
- Query execution prefers the Gateway Responses API, then falls back to Chat Completions on the same Gateway host if the Responses endpoint returns `404 Not Found`.
- Deprecated `*-chat-latest` aliases are remapped to Gateway slugs (e.g. `openai/gpt-5.6-sol`) before query execution so stale UI selections do not keep hitting removed model ids.
- Model discovery filters to `type == "language"` rows, excluding embedding/image/video models from the selector.
- Streamed Responses API requests set `stream: true` so the backend receives `response.output_text.delta` events and final completion state.

## Manual cockpit answers
- Protocol v4 (with v2/v3 compatibility) manual answers freeze transcript/screenshot/model/reasoning/note inputs at acceptance, then stream nonempty answer deltas through the owned request channel. The controller uses `backend/app/answer_service.py`; it does not create a cloud audio session.
- Retrieval outcomes distinguish `used`, `no_documents`, `no_matches`, and `failed`. Retrieved chunks retain their document ID/path/title/chunk index and excerpt for card evidence. Prompt context labels document excerpts as untrusted reference data, and citations to chunk IDs outside the retrieved set fail the answer request.
- The four-panel frontend renders streamed Markdown/GFM as HTML elements with raw HTML disabled. First answer delta is backend acceptance-relative; first visible display is a separate client measurement.
- Focused offline checks: `.venv/bin/python -m unittest tests.test_answer_service tests.test_cockpit_transport tests.test_gateway_streaming`; full backend suite: `.venv/bin/python -m unittest discover -s tests`.

- v4 reruns reference a retained server answer; copied notes/content hashes, image bytes, retrieval evidence, instruction, source/human wording and model/reasoning are reused without fresh search. Kept/inspected/selected records are protected from bounded history eviction. Draft snapshot leases are transferred/released explicitly; command-status results recover lost handoffs without generation replay.
- Empty RAG indexes return `no_documents` before embedding/search. Actual token usage is reported when supplied by Gateway; unavailable values stay null. Explicit reasoning reaches Responses and Chat payloads.
- Final M04/M05 backend suite: 160 tests PASS. See [completion evidence](../docs/notes/2026-10-25-m04-m05-acceptance.md).

## Audio Notes (Ubuntu)
- Requires PulseAudio or PipeWire with Pulse shim.
- Install the audio stack and CLI tools with:
  ```bash
  sudo apt install -y pipewire pipewire-bin pipewire-pulse wireplumber pulseaudio-utils pavucontrol
  ```
- Package mapping:
  - `pipewire-bin` provides `pw-cat` and `pw-dump`
  - `wireplumber` provides `wpctl`
  - `pulseaudio-utils` provides `pactl`
  - `pipewire-pulse` provides the Pulse shim used by `pactl`-style discovery on PipeWire
- Source discovery prefers `pactl` when available, but falls back to PipeWire-native `pw-dump` metadata on minimal installs that do not include `pulseaudio-utils`.
- If routing is incorrect, install and run `pavucontrol` (`sudo apt install -y pavucontrol`) and switch the backend recording stream to a `Monitor of ...` source in the **Recording** tab.
- Startup source selection priority:
  1. `set_audio_mode` + `set_audio_source` / `set_mic_source` WebSocket messages from UI/client
  2. `AUDIO_SOURCE` / `AUDIO_MIC_SOURCE` in environment
  3. Active browser/media sink input monitor (for system mode)
  4. Default sink monitor and default source from `pactl info`, or PipeWire-native fallback discovery when `pactl` is unavailable
- If no monitor/mic sources are found, select one manually in the UI or pass it via WebSocket. On a fresh PipeWire install, source enumeration should still work without `pactl` as long as `pw-dump` is available and the audio server is running.

## Local RAG ingestion
- In Settings, use **Local RAG Documents** to ingest file/folder paths.
- Supported formats: `.txt`, `.md`, `.pdf`, `.docx`.
- RAG control messages:
  - `rag_ingest`: `{ paths: string[] }`
  - `rag_list`: `{}`
  - `rag_clear`: `{}`
- Backend emits:
  - `rag_documents`: indexed document list with chunk counts and timestamps.
  - `rag_ingest_result`: ingestion counters + error list.

## M06 audio monitoring semantics
- Both configured inputs are monitored independently of transcription, including before Start/after Stop. Shutdown closes monitor processes; EOF/start/stream failures report unavailable rather than fresh zero samples.
- Source discovery resolves and broadcasts actual fallback choices before capture restart. Active mode/device changes cancel source-bound work against the old epoch and invalidate/restart while retaining cards; inactive preference and identical selections do not restart active transcription. Failed discovery does not commit a requested mode. Capture mutations respect the controller lease.
- Existing status envelopes report `audio_meter_unavailable` with source details and `audio_sources_error` on refresh failure. No new wire version, persistence key or database schema.
- M06 backend suite: `.venv/bin/python -m unittest discover -s tests` — 175 PASS. Synthetic capture/benchmark clients and temporary RAG SQLite; real hardware/STT remain later acceptance. See [evidence](../docs/notes/2026-10-26-m06-acceptance.md).

## M07 question service

`question_detector.py` schedules bounded finalized-text structured output; `question_service.py` owns immutable candidates, expected revisions, retained source leases and correction. Detection is independent of AnswerService. `DETECTOR_MODEL` defaults to `google/gemini-3.5-flash-lite`; `DETECTOR_DEBOUNCE` defaults to 1 second (0.8–1.2). Full wire/bounds/failure semantics: [API v5](../docs/API.md#protocol-v5-question-proposals-and-correction). Focused synthetic checks: `.venv/bin/python -m unittest discover -s tests -p test_questions.py` from `backend/`.

The shared Gateway client enforces `https://ai-gateway.vercel.sh/v1`; alternate `AI_GATEWAY_BASE_URL` origins/paths are rejected before client construction. It handles answers, detector JSON, catalog, embeddings and benchmark calls without a direct-provider fallback or OpenAI SDK. Provider model IDs/API compatibility remain valid through Gateway. Private local configuration now has no obsolete OpenAI variable names (operator removed them).

Gateway/answer/detector/embedding configuration is read when `Settings` is constructed, after AppController loads local dotenv files. Explicit local model/debounce/timeout choices are honored; a direct-provider URL loaded from `.env.local` is rejected by the same client guard.

## M08 owned AUTO
`assistance.AutoScheduler` owns pure slot/attempt/config state; `auto_service.AutoService` serializes scheduling with the existing command lock and reuses AnswerService. One active answer, one newest eligible pending detector candidate and one deferred result. Protocol v6 advertises `full_auto`; v2–v5 retain manual compatibility. Arm requires current ownership, listening, detection, a source epoch and accepted revisioned settings. No persisted AUTO or inbox replay.

Structured detector `reviewReasons` explicitly gates eligibility. Generation/publication outcomes remain independent; holds buffer only AUTO publication on the bounded request, then revalidate source/interpretation before release. Manual sends and lifecycle/candidate changes cancel or supersede matching work while retaining displayed partials and provenance. Failure/capacity pauses without automatic paid retry. No capture, STT, Gateway route or SQLite schema change. [ADR 0019](../docs/adr/0019-owned-full-auto-scheduling.md), [v6 API](../docs/API.md#protocol-v6-owned-full-auto), [M08 evidence](../docs/notes/2026-10-26-m08-acceptance.md). Full suite: 226 PASS; injected models, event gates/fake clocks, real two-client WebSockets and temporary SQLite only.
