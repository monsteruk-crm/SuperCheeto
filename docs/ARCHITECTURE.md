# Architecture

## High-level flow
- System audio output (monitor) or internal microphone input is captured locally on Ubuntu from Pulse/PipeWire sources.
- Backend (`backend/app`) ingests PCM audio, transcribes with faster-whisper, and emits transcript updates over WebSocket.
- Frontend (`frontend/`) receives live/final transcript events, renders selectable text, and sends prompt queries to backend.
- Backend can ingest local documents into a SQLite vector store and retrieve relevant chunks during queries.
- Backend sends prompt responses back to frontend for display.

## Components and responsibilities
- `backend/app/audio_capture.py`: monitor + microphone source discovery (Pulse `pactl` first, PipeWire `pw-dump` fallback) and PCM capture process management.
- `backend/app/stt.py`: speech-to-text processing and live/final transcript generation.
- `backend/app/transcript.py`: transcript segment storage and context window handling.
- `backend/app/main.py`: active audio mode/source orchestration, runtime source switching, and source-tagged WS broadcasts.
- `backend/app/ai_gateway_client.py`: prompt execution against Vercel AI Gateway (OpenAI-compatible REST API).
- `backend/app/rag_store.py`: local SQLite vector DB ingestion/search for `.txt`, `.md`, `.pdf`, `.docx`.
- `backend/app/benchmark_harness.py`: standardized benchmark instruction and per-test payload formatting.
- `backend/app/model_pricing.py`: model token pricing catalog + environment override for benchmark cost estimation.
- `backend/app/ws_server.py`: WebSocket message routing and connection lifecycle.
- `frontend/src/`: transcript UI, prompt controls, output pane, and WS client behavior.
- `frontend/src/components/SettingsPage.tsx`: benchmark test CRUD, image reference registry, and verbose benchmark log rendering.
- `scripts/dev.sh`: local orchestration for backend/frontend process lifecycle.

## Runtime assumptions
- Ubuntu/Linux environment with PulseAudio or PipeWire (Pulse shim) for monitor capture; `pactl` is preferred but source discovery also works with PipeWire-native `pw-dump`.
- Local Python 3.11+ environment for backend dependencies.
- Node.js/npm environment for Electron + Vite frontend.
- `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN`) set in environment or `backend/.env.local`.
- Cloud AI calls (language, embeddings, model discovery) go through Vercel AI Gateway at `https://ai-gateway.vercel.sh/v1`.
- Audio capture and STT remain entirely local; no audio is sent to any cloud service.
- RAG embeddings use Gateway embeddings API (`openai/text-embedding-3-small`); vectors persist locally at `RAG_DB_PATH`.
- When switching between monitor/mic while transcribing, backend restarts only capture/transcription loops and reuses the loaded STT model to minimize switch delay.
