# Status

## What works end-to-end
- Backend service runs via `python -m app.main` and serves WebSocket on `ws://127.0.0.1:8765`.
- Frontend Electron app connects to backend and supports transcript selection + prompt execution.
- Backend query failures are logged with stack traces, and `./scripts/dev.sh start` prints a recent backend log excerpt after startup.
- The prompt area now surfaces the latest backend error inline, so failures are visible without opening the terminal.
- Cloud AI calls (language, embeddings, model discovery) now route through Vercel AI Gateway (`https://ai-gateway.vercel.sh/v1`) with OpenAI-compatible REST API.
- Deprecated chat snapshot aliases such as `gpt-5.1-chat-latest` are remapped to Gateway slugs such as `openai/gpt-5.1`, and `gpt-5.2-chat-latest`/`gpt-5.3-chat-latest` map to `openai/gpt-5.6-sol`.
- Streamed query runs now set `stream: true` on Responses API payloads, restoring live token updates and final answer text for current models.
- STT now defaults to CPU-safe settings for local runs, so machines without CUDA libraries do not fail trying to load `libcublas`.
- The desk header is split into stacked vertical `Audio` and `AI` blocks, and the inline `Answer` action prefers the custom instruction when one is present.
- The desk layout now renders `Response` on the left and `Transcript` on the right.
- Frontend UI density is tightened globally: nonzero padding values are halved and the root font scale is reduced.
- Electron renderer now skips CSP in local Vite dev to avoid black-screen/preamble failures, while packaged loads keep the stricter production CSP (still no `unsafe-eval`).
- Production Electron renderer now loads built assets via relative paths (`./assets/...`) so `scripts/prod.sh start` does not hit a blank window from `file:///assets/...` lookups.
- Local audio capture + streaming transcription pipeline is wired through backend modules.
- Audio source discovery now falls back to PipeWire-native `pw-dump` metadata when `pactl` is missing, so minimal PipeWire installs can still enumerate monitor and mic sources.
- Legacy STT finalization compatibility helper `_new_final_text` is restored, so the finalization unit test continues to cover rolling-window suffix behavior.
- Transcript storage suppresses only near-immediate repeated final rows with at least three words, while preserving short repeated utterances.
- STT finalization now diffs rolling-window decoded text against recently committed words and emits only the new suffix, avoiding shifted-timestamp duplicates and missing finalized rows.
- Root launcher script `scripts/dev.sh` can start/stop/restart/status/logs for backend and frontend together, and now force-cleans lingering backend listeners and frontend dev processes when PID files are missing.
- Added `scripts/prod.sh` to run backend + production Electron frontend (no Vite/watch), with start/stop/restart/status/logs helpers.
- Benchmark runner now supports multi-test batches (`tests x models x repeats`) and keeps benchmark history in frontend local storage.
- Benchmark history now de-duplicates entries by `benchmarkId`, preventing duplicate run cards/react-key collisions when repeat `benchmark_complete` events arrive.
- Settings page now shows "Latest Result Per Model" from the newest run where each model appears.
- "Latest Result Per Model" now hides models without benchmark results (no empty placeholder rows).
- Settings benchmark flow now includes image upload/delete with reference ids (for example `IMAGE_1`), simple test CRUD, and live verbose runner logs.
- Benchmark test CRUD entries now persist in local storage and reload after app restart/settings remount.
- Benchmark telemetry now records TTFT, final latency, token usage, estimated cost, modality success, and rubric-based quality checks.
- Benchmark telemetry now records explicit TTC (`ttcMs`) and includes a speed-first aggregate score (0-100) in benchmark results.
- Aggregate score weighting is tuned further toward speed (82% speed / 13% reliability / 5% quality) for faster model ranking decisions.
- Response pane now includes an editable pre-send selected-text textarea that expands on focus (rows configurable via `frontend/.envb`).
- Response pane pre-send textarea now includes a reset button ("Reset to selection") and transcript selection text now strips time/LIVE labels.
- Prompt bar now supports dual input modes (system monitor vs microphone), separate source dropdowns, and separate audio meters.
- Desk preferences now persist across app restarts (input mode, selected sources, model, preset, custom instruction, and screenshot-toggle choice).
- Prompt bar now includes a quick `Switch to ...` button next to `Start/Stop` to toggle mic/system input while transcription remains active.
- Active input meter now shows a blinking red dot while transcription is running.
- Manual edits in "Selected text to send" are now protected from duplicate transcript selection events, preventing stale selection text from overwriting user-typed prompt context.
- Capturing a screenshot now auto-enables screenshot inclusion for queries so captured images are not silently excluded.
- Response pane now includes an `Answer` button beside `Reset to selection` so preset answer runs are available next to the editable selected-text box.
- Response output text size is reduced by 40% for denser answer display.
- Transcript events now carry source metadata and microphone transcript rows render in a distinct text color.
- Mic transcription now uses a configurable language hint (default `STT_MIC_LANGUAGE=en`) to avoid per-row language flips from accent-driven auto-detect.
- STT now suppresses near-silence decoding (RMS gate + safer no-VAD fallback threshold) to reduce hallucinated rows like repeated "You" at zero audio.
- `backend/.env.example` now includes STT language and silence-guard variables so tuning options are discoverable.
- Audio level bars now update at higher frequency and use combined RMS/peak scaling for faster response to transients.
- Audio meters are now always-on (even when transcription is stopped), enabling source troubleshooting before pressing Start.
- Benchmark image uploader now refreshes immediately after upload/replace and uses larger previews.
- Benchmark image previews are now clickable to open a full-size modal.
- Transcript pane now keeps LIVE at the bottom, appends new rows forward in time, and auto-scrolls to latest by default.
- Transcript pane renders final transcript rows plus a single current `LIVE` preview; older live partials are no longer rendered as transcript rows.
- Transcript selection handling now tracks selection inside the transcript container via `selectionchange`, with more stable time-range extraction.
- Transcript selection is now sticky (persists until explicitly cleared) and transcript row density is more compact (shorter line height/padding).
- Transcript selection text now preserves spacing between selected rows while flattening to a single line (no collapsed sentence boundaries or per-row line feeds).
- Transcript height now respects `VITE_MAX_ROWS` more directly (without oversized minimum), and transcript text now uses `Roboto Condensed` 600.
- `Latest Result Per Model` now provides hover tooltips for headers (extended field descriptions) and data cells (column/value context).
- `Live Runner Log` preview cells are truncated to 100 characters with full text on hover.
- Query responses now stream live into the Response pane (`query_chunk`) with immediate partial text rendering.
- Response pane now includes `Stop` (cancel in-flight query) and `Do it again` (rerun last query payload) controls.
- Settings page now includes local RAG document ingestion (file/folder paths) with indexed-document listing and clear action.
- Backend now persists RAG vectors/chunks in local SQLite (`backend/data/rag.sqlite`) and injects top-K retrieved chunks into query context.
- Backend now includes a webcam eye-tracking prototype script (`python -m app.eye_tracking_prototype`) that estimates coarse gaze direction from MediaPipe iris landmarks.

## In progress
- No active in-progress items tracked in repo docs.

## Next 3 priorities
1. Add backend tests for RAG ingestion/retrieval (chunking, hash-skip, cosine ranking).
2. Add backend tests for benchmark scoring math (usage/cost/quality/modality aggregates).
3. Add export/import JSON for benchmark history and image registry.

## Known issues / blockers
- First startup fails if dependencies are missing in `backend/.venv` or `frontend/node_modules`; launcher does not auto-install deps.
  - Paths: `scripts/dev.sh`, `backend/requirements.txt`, `frontend/package.json`.
- Query failures depend on `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN`) and network access, but backend logs now show request/context details and the launcher surfaces the latest backend output immediately after `start`.
  - Paths: `backend/app/main.py`, `scripts/dev.sh`.
- Backend errors are now also rendered in the UI prompt area.
  - Paths: `frontend/src/App.tsx`, `frontend/src/components/PromptBar.tsx`, `frontend/src/styles.css`.
- Responses API access can vary by project/key; the backend falls back to Chat Completions on `404` (within AI Gateway, not direct OpenAI).
  - Paths: `backend/app/ai_gateway_client.py`, `backend/README.md`.
- The `/v1/models` list can include non-language models (embedding/image/video); the backend filters to `type == "language"` before advertising models to the UI.
  - Paths: `backend/app/ai_gateway_client.py`, `backend/app/main.py`.
- If streamed Responses calls omit `stream: true`, the API returns non-SSE JSON and the parser falls through to `(No response text returned.)`; this is fixed.
  - Paths: `backend/app/ai_gateway_client.py`.
- Frontend cleanup fallback matches the standard repo dev stack binaries (`concurrently`, `vite`, `tsc`, `wait-on`, `electron`); non-standard/custom frontend launch commands may still need manual stop.
  - Paths: `scripts/dev.sh`, `frontend/package.json`.
- Audio routing can still require manual monitor selection in Ubuntu audio stack, but source discovery now works without `pactl` when `pw-dump` is available.
  - Paths: `backend/app/audio_capture.py`, `backend/README.md`.
- If your microphone speech language is not English, default `STT_MIC_LANGUAGE=en` can reduce accuracy until overridden.
  - Paths: `backend/app/settings.py`, `backend/README.md`.
- Persisted source names can become stale when audio devices change between launches; backend now auto-falls back to a valid available source at start.
  - Paths: `backend/app/main.py`, `backend/app/audio_capture.py`.
- Switching audio mode/source while already transcribing performs an automatic capture restart; this can reset in-flight live partial text.
  - Paths: `backend/app/main.py`, `backend/app/stt.py`.
- Benchmark history currently lives in browser local storage only; there is no backend persistence/export yet.
  - Paths: `frontend/src/App.tsx`, `frontend/src/components/SettingsPage.tsx`.
- Benchmark image assets are also local-storage-based and can grow large if many high-resolution images are uploaded.
  - Paths: `frontend/src/App.tsx`, `frontend/src/components/SettingsPage.tsx`.
- Model pricing defaults can drift as Gateway catalog pricing changes; keep `AI_GATEWAY_MODEL_PRICING_JSON` up to date.
  - Paths: `backend/app/model_pricing.py`, `README.md`.
- RAG embeddings currently rely on AI Gateway embeddings API; if API key/network is unavailable, ingestion/retrieval is unavailable.
  - Paths: `backend/app/rag_store.py`, `backend/app/ai_gateway_client.py`.
- If `backend/.env.local` forces `STT_DEVICE=cuda` with a GPU-only model profile on a machine without CUDA libraries, transcription will still fail until those env overrides are changed.
  - Paths: `backend/.env.local`, `backend/app/settings.py`.
- Eye-tracking prototype depends on local webcam access and GUI display (OpenCV window); headless sessions will not render preview.
  - Paths: `backend/app/eye_tracking_prototype.py`, `backend/requirements.txt`.

## Quick verify checklist
1. Run `./scripts/dev.sh start`.
2. Run `./scripts/dev.sh status` and confirm both services are running.
3. Open the Electron UI and confirm backend connection state updates.
4. Trigger a failing query and confirm the backend error appears in the prompt area.
5. Check the terminal for the recent backend log excerpt if you need the full server context; use `./scripts/dev.sh logs` for the full tail.
6. If the project has no Responses access, confirm the same query still succeeds through the Chat Completions fallback.
7. Select or persist a deprecated alias such as `gpt-5.1-chat-latest`, refresh models, and confirm the UI moves to the supported replacement model.
8. Run a normal query and confirm the Response pane streams partial tokens and ends with a real answer instead of `(No response text returned.)`.
9. In Settings, create multiple benchmark tests via CRUD, run a benchmark, and confirm history keeps prior runs.
10. In Settings, ingest a CV path in `Local RAG Documents`, run `Answer the question`, and verify response references retrieved document details.
11. Run `./scripts/dev.sh stop` and confirm both services stop cleanly.
12. Run `cd backend && python -m app.eye_tracking_prototype`, confirm webcam window opens and gaze label updates while moving eyes.
13. Run `cd frontend && npm run build` after UI styling changes.
14. Run `cd backend && python -m unittest discover -s tests` after backend transcript changes.
