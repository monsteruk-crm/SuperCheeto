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
