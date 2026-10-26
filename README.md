# Live Transcript Desk (MVP)

Desktop app MVP that captures system audio locally, transcribes near-real-time with faster-whisper, and provides a four-panel manual helper desk for answering frozen transcript context. Streamed answer Markdown is rendered in the desk; audio capture and transcription remain local.

## Architecture
- **Backend (Python)**: captures system monitor audio or microphone input via Pulse/PipeWire, streams to faster-whisper, serves a WebSocket API, and calls Vercel AI Gateway for cloud AI.
- **Frontend (Electron + React)**: renders transcript, supports selection, and displays model responses.
- **Transport**: WebSocket on `ws://127.0.0.1:8765`.

## Repository Layout
```
backend/   # Python services
frontend/  # Electron + React UI
docs/      # Prompts and design briefs/
```

## Quick Start
### Launch both services (recommended)
```bash
./scripts/dev.sh start
```

This starts both services and prints a recent backend log excerpt in the terminal so AI request failures are easier to diagnose immediately.
The desktop UI also shows the latest backend error in the prompt area.
If the AI Gateway cannot reach the Responses endpoint, the backend retries the same query through Chat Completions (within Gateway).
Deprecated `*-chat-latest` selections are automatically remapped to supported base models before the request is sent.
Responses API queries now send the required `stream: true` flag for streamed runs, so the UI receives partial tokens and final answer text instead of the `(No response text returned.)` placeholder.

Stop both:
```bash
./scripts/dev.sh stop
```

Other helpers:
```bash
./scripts/dev.sh status
./scripts/dev.sh logs
./scripts/dev.sh restart
```

Use `./scripts/dev.sh logs` for the full backend/frontend log tail if the startup excerpt is not enough.

### Launch production profile (no Vite/watch)
```bash
./scripts/prod.sh start
```

Stop/restart/status/logs:
```bash
./scripts/prod.sh stop
./scripts/prod.sh restart
./scripts/prod.sh status
./scripts/prod.sh logs
```

Production notes:
- Uses backend Python service + built Electron app (`dist` + `dist-electron`).
- Frontend assets are built automatically only if missing; force rebuild with:
  ```bash
  PROD_FRONTEND_REBUILD=1 ./scripts/prod.sh start
  ```

Notes:
- `./scripts/dev.sh stop` also cleans up lingering backend listeners on `127.0.0.1:${BACKEND_WS_PORT:-8765}` when no PID file is present.
- `./scripts/dev.sh stop` also cleans up lingering frontend dev processes for this repo (Vite/Electron toolchain) when no PID file is present.
- To run backend on a non-default WebSocket port with the launcher, set `BACKEND_WS_PORT` and `WS_PORT` together, for example:
  ```bash
  BACKEND_WS_PORT=8766 WS_PORT=8766 ./scripts/dev.sh start
  ```

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

Set `AI_GATEWAY_API_KEY` in `backend/.env.local` or the environment. Use `backend/.env.example` as a template.

Backend tests:
```bash
cd backend
source .venv/bin/activate
python -m unittest discover -s tests
```

### Webcam eye-tracking prototype (mock)
```bash
cd backend
source .venv/bin/activate
python -m app.eye_tracking_prototype
```

Notes:
- Press `q` to close the webcam window.
- The prototype emits coarse gaze classes (`left/right/up/down/center` plus diagonal variants) from iris landmarks.
- If your webcam is not detected, try `python -m app.eye_tracking_prototype --camera-index 1`.

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend tests (deterministic, mocked — no live backend, audio, or paid calls):
```bash
cd frontend
npm run test          # Vitest + jsdom + React Testing Library (run once)
npm run test:watch    # watch mode
```

- Harness-only helpers/fixtures live under `frontend/src/cockpit/__tests__/` (fake clock, fake WebSocket transport, mocked Gateway/detector, messy-speech fixtures). They are test-only and are never imported by application code.
- Backend tests remain Python `unittest` (see "Backend tests" above).

## Audio Setup (Ubuntu)
- Requires PulseAudio or PipeWire (with Pulse shim).
- Install the audio stack and routing tools with:
  ```bash
  sudo apt install -y pipewire pipewire-bin pipewire-pulse wireplumber pulseaudio-utils pavucontrol
  ```
- Package mapping:
  - `pipewire-bin` provides `pw-cat` and `pw-dump`
  - `wireplumber` provides `wpctl`
  - `pulseaudio-utils` provides `pactl`
  - `pipewire-pulse` provides the Pulse shim used by `pactl`-style discovery on PipeWire
- The backend resolves default monitor/mic sources using `pactl info` when available, and falls back to PipeWire-native `pw-dump` metadata on minimal installs that do not ship `pulseaudio-utils`.
- If input routing is wrong, install and open `pavucontrol` (`sudo apt install -y pavucontrol`), then in the **Recording** tab set the backend (`python`) input to a `Monitor of ...` source.
- If no monitor/mic sources are found, select one manually in the UI or send it over WebSocket.
- Microphone transcription now defaults to English language hint (`STT_MIC_LANGUAGE=en`) to reduce accent-related auto-detection flips. If you primarily speak another language, set `STT_MIC_LANGUAGE` in `backend/.env` (for example `it`).
- Optional language overrides:
  - `STT_MIC_LANGUAGE` (default `en`)
  - `STT_SYSTEM_LANGUAGE` (default auto-detect)
  - `STT_LANGUAGE` (global fallback if per-mode values are unset)
- Silence/hallucination guard tuning:
  - `STT_MIN_DECODE_RMS` (default `0.0010`) skips STT decode on near-silent windows.
  - `STT_NO_VAD_FALLBACK_MIN_RMS` (default `0.0025`) only allows no-VAD fallback when signal energy is high enough.

## WebSocket Messages
Backend → Frontend:
- `transcript_live`: `{ text, t, streamKind?, sourceName? }`
- `transcript_segment`: `{ segment }`
- `audio_level`: `{ rms, level, t, streamKind?, sourceName? }`
- `audio_sources`: `{ monitorSources?, micSources?, selectedMode?, ... }`
- `status`: `{ state, details }`
- `query_state`: `{ running, requestId?, cancelled? }`
- `query_chunk`: `{ requestId?, delta }` (streamed partial response text)
- `query_response`: `{ requestId, text, latencyMs?, model?, screenshotUsed?, ragChunksUsed?, ragSources? }`
- `rag_documents`: `{ documents: [{ docId, filePath, title, chunkCount, updatedAt }] }`
- `rag_ingest_result`: `{ ingested, updated, skipped, failed, errors? }`
- `error`: `{ message }`

Frontend → Backend:
- `set_audio_source`: `{ sourceName }`
- `set_mic_source`: `{ sourceName }`
- `set_audio_mode`: `{ mode: "system"|"mic" }`
- `start_transcription`
- `stop_transcription`
- `run_query`: `{ requestId, presetId|null, customInstruction|null, selectedText, selectionTimeRange|null }`
- `cancel_query`: `{ requestId? }`
- `rag_ingest`: `{ paths: string[] }` (absolute file/folder paths for `.txt/.md/.pdf/.docx`)
- `rag_list`
- `rag_clear`

## Live Helper manual answering
The Desk has four panels: raw transcript, a fallible questions inbox with detection disable/retry, working answers, and kept/previous answers. Choose 20/45/90 seconds and **Answer recent speech**, or select raw words and **Draft answer from selection**. **Make question** opens an editable human target; Reset restores its frozen source and Clear releases it. View raw highlights original source without hiding surrounding speech. **Pin this moment** preserves source without any generation call.

Guide explicitly selects Preset or Custom, model and refresh. Saved custom text survives switching modes/reloads but is ignored in Preset mode; empty Custom cannot run. Human notes are separate editable context and are included only when selected. In Electron, capture shows a preview, enables inclusion and supports removal; ordinary browsers honestly disable native capture.

Cards stream safe Markdown/GFM into HTML with code/lists/tables; raw HTML is disabled, remote images are not fetched and HTTP(S) links open outside Electron. Copy, Keep, Remove and Stop act on identified cards. Run again creates a new answer from server-frozen source, wording, instruction, notes, model/reasoning, screenshot and retrieved evidence, even after later changes. Keep makes no generation call. Details distinguish actual evidence/usage and backend versus client timings; absent facts remain unavailable. Reconnected historical cards are read-only; no paid command is replayed automatically.

All panels scroll independently; pointer/keyboard separators persist in `cockpit-layout.v1`. Transcript + expands raw space and Reset layout restores defaults. Smaller windows use two-by-two panels. Inspecting older answers preserves the reading anchor while new drafts append. See [completion evidence](docs/notes/2026-10-25-m04-m05-acceptance.md). Sound/Settings parity and question proposals/correction are complete for synthetic M06/M07 scope; FULL AUTO scheduling is complete for synthetic M08 scope; native/integrated acceptance remain M09/M10.

## Vercel AI Gateway
- Set `AI_GATEWAY_API_KEY` before running (or `VERCEL_OIDC_TOKEN` for Vercel deployments).
- Default answer model: `google/gemini-3.8-flash` with low reasoning (override with `VERCEL_MODEL` or the existing model selector). Saved model choices and existing environment overrides are preserved; a fresh default does not replace them.
- Realtime answers use transcript **text**, not a cloud voice session: local capture/STT → frozen text/context → Gateway Responses with `stream: true` → incremental answer text. Keep keys on the Python backend. See [ADR 0013](docs/adr/0013-stream-transcript-text-answers.md) for model discovery, the same-model Chat Completions 404 fallback, and remaining latency/quality evaluation.
- Failed/incomplete/malformed or interrupted streams now fail visibly and retain delivered partial text; cancellation closes the upstream stream. Empty model output remains empty. Chat streaming requests usage, and time-to-first-text excludes reasoning/empty deltas. No live model latency or accuracy claim follows from the synthetic tests.
- Base URL: `https://ai-gateway.vercel.sh/v1` (override with `AI_GATEWAY_BASE_URL`).
- Old bare model IDs (e.g. `gpt-5.1`) are auto-prefixed to `openai/gpt-5.1`.
- RAG uses Gateway embeddings (`RAG_EMBEDDING_MODEL=openai/text-embedding-3-small`) and stores vectors locally in SQLite (`RAG_DB_PATH`).
- Audio capture and STT remain entirely local; no audio is sent to any cloud service.

## RAG document ingestion
- Open **Settings** and use **Local RAG Documents**.
- Paste one or more absolute paths (comma-separated), then click `Ingest`.
- Ingested chunks are stored in local SQLite and retrieved automatically during `run_query`.

## Benchmarking (Settings page)
- Manage tests with simple CRUD in Settings (create, edit, delete).
- Benchmark test definitions are persisted in local storage and survive app restart.
- Each test uses a dedicated 5-row prompt textarea.
- Upload benchmark images with a reference id (for example `IMAGE_1`) and attach that ref to tests.
- A single benchmark run executes all combinations of `tests x selected models x repeats`.
- Benchmark history is retained in the app (local browser storage) so new runs do not overwrite prior results.
- Settings shows a "Latest Result Per Model" summary using the newest available benchmark data for each model.
- Runner telemetry includes:
  - Time-to-first-token and time-to-complete (TTC)
  - Input/output token usage
  - Estimated cost (when pricing is known)
  - Image capability success on image tests
  - Quality score and pass/fail checks
  - Speed-first aggregate score (0-100)
- Response pane includes an editable pre-send selected-text textarea (collapses/expands via env-configurable rows).
- Optional pricing override env var:
  - `AI_GATEWAY_MODEL_PRICING_JSON='{"openai/gpt-5.6-sol":{"input":5.0,"output":30.0}}'` (USD per 1M tokens)

## First Run Checklist
1) Start backend/frontend and confirm the System/Mic meters move with input (meters are active even before pressing Start).
2) If RMS stays near zero, open `pavucontrol` and route the backend recording stream to the intended monitor or microphone source.
3) Launch the frontend and wait for the status pill to show `ready` or `transcribing`.
4) Select text in the transcript pane, then run a preset prompt.
docs/ingestion/alfonso_cv.md

## Sound and Settings (M06)

Open **Sound** in the Desk header for active input, system/microphone devices, quick switch, refresh and transcription Start/Stop. Opening or closing it changes no capture setting or answer. Escape/Done/Close/outside dismissal returns focus to Sound and preserves the raw selection, editor and reading position. The dialog owns keyboard focus while open; background capture/request shortcuts are blocked.

The selected input and its meter remain in the header while Sound is closed. Levels continue when transcription stops. Quiet means RMS below 0.001 and peak below 0.005, not “no voice”; peak at least 0.98 holds a clipping warning for 500ms. Samples become stale after two seconds without matching-source telemetry; disconnect and unavailable devices are distinct. Freshness uses client receive time, not subtraction of backend timestamps.

Device choices reflect backend acknowledgements/fallbacks. Saved choices restore once per connection; refresh does not repeatedly force them back. An inactive device change updates that preference/monitor only. A deliberate active mode/device change invalidates old source work, preserves previous cards and restarts transcription if running. Unchanged selections do not restart. Monitoring releases devices on backend shutdown.

The original separate Settings screen retains query preferences, RAG documents, model catalog, benchmark tests/images, results/logs/history and stored data. Desk and Settings stay mounted so navigation preserves unsaved edits. Existing preference/storage keys are unchanged. RAG Clear applies to the configured index; acceptance used a temporary index and never cleared user documents. See [M06 evidence](docs/notes/2026-10-26-m06-acceptance.md). Actual hardware/STT/native checks remain M09/M10; no user audio test is needed for this milestone.

### Question proposals and correction (M07)

Possible questions now suggests fallible interpretations of finalized local transcript text after control negotiation. Use **Suggest questions** to disable detection, or **Retry detection** after a failure. Review source excerpts and **View raw**, select a question, or use **Make question** and **Save question to inbox** when a request was missed. Questions support edit/split/merge/dismiss/undo. **Wrong question** retains the original answer/source and lets you **Correct and draft answer**. Human context notes remain optional, explicitly included claims.

Detection uses Vercel AI Gateway with `DETECTOR_MODEL` (default `google/gemini-3.5-flash-lite`) and `DETECTOR_DEBOUNCE` (default 1 second, clamped 0.8–1.2). Partials/meters never trigger it; direct answers work independently. Detection history is limited to 200 immutable revisions per source session, with visible capacity rejection. No new persistent transcript database or armed AUTO preference is added. Real audio/model quality acceptance remains M09/M10.

Cloud answers, detector, embeddings, catalog and benchmarks all use the shared Gateway HTTP client. `AI_GATEWAY_BASE_URL`, when set, must be `https://ai-gateway.vercel.sh/v1` (an optional trailing slash is accepted). Direct-provider endpoints are rejected before authentication. Restart the backend after configuration changes. See [API v5](docs/API.md#protocol-v5-question-proposals-and-correction) and [M07 evidence](docs/notes/2026-10-26-m07-acceptance.md).

### FULL AUTO (M08)
Start transcription, leave Suggest questions enabled, choose your Guide/profile/model and wait for settings acknowledgement. Select **FULL AUTO** explicitly for this session. Only newly detected eligible questions generate drafts; existing inbox entries and human wording require a manual request. Every AUTO draft is unreviewed and source-linked.

One answer runs at a time, with only the newest pending question queued. Selecting text, setting a target or editing Guide/questions/notes/Settings holds AUTO targeting and publication while capture continues. Completed held output waits until release and source revalidation. Sound alone does not hold AUTO. **Answer now** takes manual priority and retains the interrupted draft. **Wrong question** creates a linked corrected draft.

**Pause AUTO** clears pending execution and lets the current answer finish. **Stop AUTO answer** retains partial output and pauses AUTO. Stopping listening, changing the active source, clearing transcript or losing control disarms AUTO. Reconnect/restart stays in Assist; armed state is never saved. Configuration/model/capacity failures are visible and never trigger automatic paid retries. See [M08 evidence](docs/notes/2026-10-26-m08-acceptance.md) and [protocol v6](docs/API.md#protocol-v6-owned-full-auto). Actual audio/model/native acceptance remains M09/M10.

### Review lifecycle and local data safeguards
Stopping listening, restarting capture or clearing transcript definitively supersedes active manual/AUTO generation before the session changes. Draft cards retain partial text and frozen source. A failed socket send releases control so a replacement window can claim it. Reconciliation uses separately acknowledged reads and stops after a read timeout. Repeated speech is deduplicated only when its audio overlaps.

The RAG index under `backend/data/` (including SQLite WAL/SHM sidecars) is local runtime data and excluded from Git. Fresh checkouts create the index on first use; existing local indexes remain in place. Do not add runtime databases or document indexes to commits. See [PR #1 remediation](docs/notes/2026-10-26-pr1-review-remediation.md).
