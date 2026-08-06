# Live Transcript Desk (MVP)

Desktop app MVP that captures system audio locally, transcribes near-real-time with faster-whisper, and lets you run preset/custom prompts against selected transcript text.

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

## Vercel AI Gateway
- Set `AI_GATEWAY_API_KEY` before running (or `VERCEL_OIDC_TOKEN` for Vercel deployments).
- Default model: `openai/gpt-5.6-sol` (override with `VERCEL_MODEL`).
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
