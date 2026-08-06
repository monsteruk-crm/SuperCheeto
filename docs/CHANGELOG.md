# Changelog

## 2026-08-04 (backend query logging + startup log excerpt)
- User-visible:
  - `./scripts/dev.sh start` now prints a recent backend log excerpt immediately after startup, so AI request failures are visible in the terminal flow.
  - Query failures now include backend-side log lines with request context and stack traces when exceptions occur.
  - The desktop UI now surfaces the latest backend error inline in the prompt area.
  - The backend now falls back to Chat Completions if the Responses API returns `404 Not Found`.
  - Deprecated model aliases such as `gpt-5.1-chat-latest` now auto-upgrade to supported API models instead of hard-failing with `model_not_found`.
  - Streamed queries now return actual answer text again instead of falling through to `(No response text returned.)`.
- Internal:
  - Added standard Python logging configuration in `backend/app/main.py`.
  - Logged query lifecycle events, validation rejections, RAG retrieval skips, and OpenAI request exceptions.
  - Added a `scripts/dev.sh` startup log tail for the backend.
  - Added an inline backend error banner to the Electron prompt bar.
  - Added a Chat Completions fallback path in `backend/app/openai_client.py`.
  - Added deprecated-model normalization/filtering in `backend/app/openai_client.py` and `backend/app/main.py`.
  - Fixed Responses streaming payload construction to include `stream: true` for SSE runs.
- How to test:
  - `./scripts/dev.sh start`
  - Trigger a failing query and confirm the backend log shows the request context and error details.
  - Run `./scripts/dev.sh logs` and confirm the recent backend output is present.
  - Trigger a failing query and confirm the backend error appears in the prompt area.
  - If the project has Responses access disabled, confirm the same query still returns through Chat Completions.
  - Select `gpt-5.1-chat-latest`, run a query, and confirm it succeeds through `gpt-5.1`.
  - Run a normal query and confirm partial tokens stream in and the final response text is non-empty.

## 2026-07-07 (STT compatibility helper + audio install docs)
- User-visible:
  - The backend test suite no longer trips over the missing rolling-window finalization helper.
  - Audio setup docs now spell out the Ubuntu packages required for source discovery and routing.
- Internal:
  - Restored `StreamingTranscriber._new_final_text()` and wired it into final-segment emission.
  - Added explicit package mapping for `pipewire-bin`, `wireplumber`, `pulseaudio-utils`, `pipewire-pulse`, and `pavucontrol` in the runbooks.
- How to test:
  - `cd backend && python -m unittest tests.test_stt_finalization`
  - Check the README audio setup section for the install command and package mapping.

## 2026-07-07 (PipeWire-native audio discovery fallback)
- User-visible:
  - Fresh PipeWire installs that do not include `pactl` can now still enumerate monitor and microphone sources.
  - Audio startup no longer hard-fails solely because `pulseaudio-utils` is missing.
- Internal:
  - `discover_audio_sources()` now prefers `pactl` but falls back to parsing `pw-dump` node metadata when needed.
  - Added backend unit tests for `pw-dump` parsing and the fallback discovery path.
- How to test:
  - `cd backend && python -m unittest tests.test_audio_capture`
  - On a PipeWire machine without `pactl`, start the backend and confirm the source dropdowns still populate.

## 2026-05-18 (frontend live transcript duplicate fix)
- User-visible:
  - Removed accumulated live partial rows from the transcript history; the pane now shows final rows plus one current `LIVE` preview.
  - Stopping or reconnecting clears stale live preview text.
- Internal:
  - Frontend keeps live partials out of the committed transcript row list.
  - Backend no longer starts audio meter capture loops before transcription is running.
- How to test:
  - `cd frontend && npm run build`
  - Open the app without pressing Start and confirm transcript text does not begin updating.
  - Run transcription and confirm older live partial guesses do not accumulate as transcript rows.

## 2026-05-18 (transcript duplicate suppression)
- User-visible:
  - Reworked final transcript emission to avoid both shifted-timestamp duplicates and missing finalized rows from rolling-window STT.
  - Suppressed near-immediate repeated final transcript rows while preserving short repeated utterances.
- Internal:
  - STT finalization now diffs each rolling decoded final window against recently committed words and emits only the new suffix.
  - `TranscriptStore.add_segment` now returns whether a segment was accepted and filters recent same-source duplicate text of at least three words before storage/broadcast.
  - Added focused backend unit tests for STT final-text diffing and transcript duplicate suppression.
- How to test:
  - `cd backend && python -m unittest discover -s tests`
  - `python -m compileall backend/app backend/tests`

## 2026-05-18 (denser frontend spacing)
- User-visible:
  - Reduced the overall interface footprint by halving nonzero CSS padding values and lowering the root font size.
- Internal:
  - Centralized the text scale change through the root `html` font size in `frontend/src/styles.css`.
- How to test:
  - `cd frontend && npm run build`
  - Open the Desk and Settings pages and confirm controls, tables, transcript rows, and response content render more compactly.

## 2026-03-10 (desk pane order: response left)
- User-visible:
  - Swapped the main desk panes so `Response` appears on the left and `Transcript` on the right.
- Internal:
  - Reordered the desk page pane rendering in the main app layout.
- How to test:
  - `cd frontend && npm run build`
  - Open the desk page and confirm `Response` is the left column on desktop widths.

## 2026-03-10 (answer-action custom-instruction + split top controls)
- User-visible:
  - The inline `Answer` button now uses the custom instruction when one is filled in; otherwise it falls back to `Answer the question`.
  - The top desk controls are now split into stacked vertical `Audio` and `AI` blocks.
  - Removed the extra `Audio`/`AI` helper copy above those controls, and placed `Input mode` beside the audio-mode switch.
- Internal:
  - Added a dedicated `runAnswer` flow in the renderer rather than routing the inline answer action through the generic preset handler.
  - Refactored prompt-bar layout/CSS into two grouped panels for clearer control separation.
- How to test:
  - `cd frontend && npm run build`
  - Enter a custom instruction, click `Answer`, and confirm the backend request uses `customInstruction`.
  - Clear the custom instruction, click `Answer`, and confirm it behaves like the built-in answer preset.
  - Verify the top controls render as stacked vertical `Audio` and `AI` blocks.

## 2026-03-10 (cpu-safe stt defaults for local runs)
- User-visible:
  - Fixed local transcription startup on non-CUDA machines by defaulting STT to CPU-safe settings instead of trying to load `libcublas.so.12`.
- Internal:
  - Changed backend STT defaults from `cuda/float16` to `cpu/int8`.
  - Updated backend setup docs and env example to reflect CPU-first local development.
- How to test:
  - Remove any `STT_DEVICE=cuda` override from `backend/.env.local` or set `STT_DEVICE=cpu`.
  - `./scripts/dev.sh start`
  - Start transcription and confirm the backend no longer emits `libcublas.so.12` errors.

## 2026-03-10 (vite react preamble black-screen fix)
- User-visible:
  - Fixed the Electron dev black screen caused by `@vitejs/plugin-react can't detect preamble` after launching `./scripts/dev.sh start`.
- Internal:
  - Replaced the static renderer CSP meta tag with a build-only CSP injected by Vite.
  - Electron main process now skips CSP enforcement in local dev and only applies the stricter policy for packaged/prod loads.
- How to test:
  - `./scripts/dev.sh stop`
  - `./scripts/dev.sh start`
  - Confirm the Electron window renders instead of staying black and the DevTools console no longer shows the preamble error.

## 2026-02-27 (webcam eye-tracking prototype)
- User-visible:
  - Added a runnable webcam eye-tracking prototype that displays coarse gaze direction labels in real time.
  - Added run instructions to root/backend READMEs.
- Internal:
  - Added `backend/app/eye_tracking_prototype.py` using OpenCV + MediaPipe face mesh iris landmarks.
  - Added `opencv-python` and `mediapipe` to backend dependencies.
- How to test:
  - `python -m compileall backend/app/eye_tracking_prototype.py`
  - `cd backend && source .venv/bin/activate && python -m app.eye_tracking_prototype`
  - Confirm webcam window opens, iris landmarks render, and label changes between `left/right/up/down/center`.

## 2026-02-26 (local RAG document ingestion + retrieval)
- User-visible:
  - Added local RAG document ingestion controls in Settings (`Ingest`, `Refresh list`, `Clear RAG DB`).
  - Queries can now use indexed CV/doc chunks automatically; response metadata includes RAG chunk usage count.
- Internal:
  - Added `backend/app/rag_store.py` with local SQLite vector persistence (`documents` + `chunks` tables).
  - Added OpenAI embedding client support (`/embeddings`) and retrieval injection into `run_query` context.
  - Added new WS messages: `rag_ingest`, `rag_list`, `rag_clear`, `rag_documents`, `rag_ingest_result`.
  - Added DB docs (`docs/db/INDEX.md`, `docs/db/SCHEMA.md`) and ADR 0008.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Open Settings, ingest a known CV/document path, confirm it appears in indexed docs table.
  - Ask a question tied to that document and confirm query runs with RAG notice.

## 2026-02-25 (prod renderer blank-screen fix)
- User-visible:
  - Fixed `./scripts/prod.sh start` showing a black frontend window in production mode.
- Internal:
  - Set Vite `base: './'` so production `dist/index.html` uses relative asset URLs (`./assets/...`) compatible with Electron `loadFile(...)`.
  - Keeps CSP hardening in place while restoring packaged renderer asset loading.
- How to test:
  - `cd frontend && npm run build`
  - `./scripts/prod.sh stop`
  - `./scripts/prod.sh start`
  - Confirm frontend renders UI instead of a blank/black window.

## 2026-02-25 (electron csp hardening)
- User-visible:
  - Removed the Electron development security warning about missing/insecure Content Security Policy.
- Internal:
  - Added an explicit CSP header in Electron main process via `session.defaultSession.webRequest.onHeadersReceived`.
  - Added matching CSP meta tag to `frontend/index.html` for packaged file loads.
  - CSP disallows `unsafe-eval` and constrains script/object/frame sources while keeping required WS/HTTP connectivity.
- How to test:
  - `cd frontend && npm run build`
  - `cd frontend && npm run dev`
  - Open Electron DevTools console and confirm the CSP warning no longer appears.

## 2026-02-24 (inline answer action + smaller response text)
- User-visible:
  - Added an `Answer` button in the selected-text editor header (same row as `Reset to selection`) so you can run the preset answer without scrolling to top controls.
  - Response text rendering is now 40% smaller.
- Internal:
  - Output pane now accepts `onAnswer`/`canAnswer` handlers and wires the new button to the existing preset-run path.
  - Added `selected-text-editor-actions` layout styles and reduced `.output-body pre` font size.
- How to test:
  - `cd frontend && npm run build`
  - On Desk page, type in the editable selected-text box and click `Answer` next to `Reset to selection`; verify query runs.
  - Verify response text appears visibly smaller than before.

## 2026-02-24 (query input integrity: draft text + screenshot inclusion)
- User-visible:
  - Fixed a bug where manually edited selected text could be overwritten by stale transcript selection updates before sending a query.
  - Capturing a screenshot now automatically enables screenshot inclusion for the next query.
  - Clearing screenshot preview now disables screenshot inclusion to avoid sending empty screenshot flags.
- Internal:
  - Added selection-key and draft-edit guards in frontend query input flow so repeated `selectionchange` events do not clobber user edits.
  - Updated screenshot capture/clear handlers to keep `includeScreenshotInQuery` synchronized with preview state.
- How to test:
  - `cd frontend && npm run build`
  - Select transcript text, edit it manually, then run preset/custom while transcript updates continue; verify sent answer follows edited text.
  - Capture screen and run query; verify response meta shows `Screenshot sent: yes`.

## 2026-02-24 (env example updates for STT tuning)
- User-visible:
  - Added missing STT language and silence-guard variables to `backend/.env.example`.
- Internal:
  - Documented `STT_MIC_LANGUAGE`, `STT_SYSTEM_LANGUAGE`, `STT_LANGUAGE`, `STT_MIN_DECODE_RMS`, and `STT_NO_VAD_FALLBACK_MIN_RMS` in the env template.
- How to test:
  - Open `backend/.env.example` and verify the new STT variables are listed.

## 2026-02-24 (silence hallucination guard for STT)
- User-visible:
  - Reduced false transcript rows on silence (for example repeated `You` while audio meter is effectively zero).
- Internal:
  - Added `STT_MIN_DECODE_RMS` silence gate to skip partial/final decoding on very low-energy windows.
  - Added `STT_NO_VAD_FALLBACK_MIN_RMS` so no-VAD fallback is only used when audio energy is high enough.
  - Whisper decode now uses `condition_on_previous_text=False` to reduce repetition loops on low-information audio.
- How to test:
  - `python -m compileall backend/app`
  - Start transcription in a quiet room/system silence and verify repeated fake rows no longer appear.
  - If speech gets clipped on very quiet input, lower `STT_MIN_DECODE_RMS` slightly (for example `0.0007`).

## 2026-02-24 (mic startup source fallback + recording indicator)
- User-visible:
  - Fixed a startup issue where microphone mode could fail to transcribe until switching modes.
  - Added a blinking red dot near the active volume meter while transcription is running.
- Internal:
  - Backend now validates requested monitor/mic sources against currently available sources and auto-falls back to valid defaults when saved source names are stale.
  - Source validation is applied both in `audio_sources` broadcasts and `start_transcription`.
  - Prompt bar meter labels now render per-mode recording activity dots with a blink animation.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Launch in mic mode and press `Start`; verify mic transcribes immediately without requiring mode toggles.
  - While transcribing, verify the active mode meter shows a blinking red dot.

## 2026-02-24 (mic language-hint stabilization)
- User-visible:
  - Microphone transcription is now more stable for accented English by default, reducing random language switches between rows.
  - Running transcription status now shows the active STT language mode (`language: en` or `language: auto`).
- Internal:
  - Added mode-specific STT language hints:
    - `STT_MIC_LANGUAGE` (default `en`)
    - `STT_SYSTEM_LANGUAGE` (default auto)
    - `STT_LANGUAGE` (global fallback)
  - Faster-whisper transcribe calls now pass configured language hints and keep the setting in sync when switching system/mic modes.
- How to test:
  - `python -m compileall backend/app`
  - Start app in microphone mode and verify transcript rows no longer bounce across random languages.
  - Optionally set `STT_MIC_LANGUAGE=it` in `backend/.env`, restart backend, and verify mic transcription uses Italian.

## 2026-02-24 (persisted desk preferences + quick input switch)
- User-visible:
  - Desk selections now survive app restart (input mode, sources, model, preset, custom instruction, and screenshot-toggle choice).
  - Added a `Switch to ...` button next to `Start/Stop` for quick mic/system input toggling.
  - Switching inputs while transcription is running now continues transcription automatically after the backend capture restart.
- Internal:
  - Added frontend `ui-preferences.v1` localStorage persistence and state hydration for desk controls.
  - Audio/model selection reconciliation now keeps user-selected values when still valid and syncs them back to backend source/mode state.
  - Updated model list handling to preserve the selected model when still available.
- How to test:
  - `cd frontend && npm run build`
  - Launch app, set mode/source/model/preset/custom instruction and screenshot toggle, restart app, and confirm values are preserved.
  - Start transcription and click `Switch to ...`; confirm mode changes and transcript continues updating.

## 2026-02-24 (transcript selection single-line normalization)
- User-visible:
  - Multi-row transcript selections now paste into selected text as one line, with spaces between rows (no per-row line breaks).
- Internal:
  - Selection extraction now inserts row-boundary spaces and normalizes any line feeds to single spaces.
- How to test:
  - `cd frontend && npm run build`
  - Start the app, select text across several transcript rows, and verify selected text is single-line with readable spaces between row boundaries.

## 2026-02-24 (transcript selection row-spacing fix)
- User-visible:
  - Selecting multiple transcript rows now keeps readable separation between rows instead of collapsing adjacent lines together.
- Internal:
  - Frontend selection extraction now injects row separators before text normalization, preventing `textContent` row-boundary collapse.
  - Selection fallback cleanup now also removes `SYS` and `MIC` source tags when present in raw selection text.
- How to test:
  - `cd frontend && npm run build`
  - Start the app, select text spanning 2+ transcript rows, and verify selected text includes spacing/newline boundaries (for example no `...?next...` concatenation).

## 2026-02-23 (production launcher script)
- User-visible:
  - Added `scripts/prod.sh` with `start|stop|restart|status|logs` for a production-style run (backend + built Electron frontend).
- Internal:
  - `prod.sh` runs Electron from built artifacts (`dist-electron/main.cjs`) with `NODE_ENV=production` and no Vite dev server.
  - Uses dedicated prod PID/log files under `.run/`:
    - `prod-backend.pid`, `prod-frontend.pid`
    - `prod-backend.log`, `prod-frontend.log`
  - Can force frontend rebuild via `PROD_FRONTEND_REBUILD=1`.
- How to test:
  - `bash -n scripts/prod.sh`
  - `./scripts/prod.sh status`
  - `./scripts/prod.sh start` (on a free backend port) and confirm both services report running.

## 2026-02-23 (audio meter responsiveness tuning)
- User-visible:
  - Audio level bars now react faster and with finer resolution (less “stale” jump behavior).
  - Audio level bars now work even before pressing `Start`, so input routing can be debugged without running transcription.
- Internal:
  - Backend meter emission cadence increased and now emits immediately on significant level jumps.
  - Meter level now uses combined RMS + peak-derived scaling to improve attack responsiveness.
  - Backend now runs dedicated always-on meter capture loops for system and mic sources, separate from STT capture.
  - Frontend meter width now uses fractional percentages instead of integer rounding.
  - Added optional meter-tuning env vars in backend:
    - `AUDIO_LEVEL_INTERVAL`
    - `AUDIO_LEVEL_RMS_REF`
    - `AUDIO_LEVEL_PEAK_REF`
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Start transcription, produce short bursts of sound, and verify meter reflects spikes immediately with smoother detail.

## 2026-02-23 (dual audio mode: system + microphone)
- User-visible:
  - Added input mode switching between `System audio` and `Microphone`.
  - Added separate source dropdowns for system monitor and mic sources in the Prompt bar.
  - Added separate system/mic audio meters.
  - Transcript rows now carry source tags and microphone transcript text uses a distinct color.
- Internal:
  - Backend audio source discovery now returns both monitor sources and mic sources.
  - Added `set_mic_source` and `set_audio_mode` WebSocket messages and expanded `audio_sources` payload.
  - Switching source/mode while running now auto-restarts capture with model reuse to reduce switching overhead.
  - Transcript and audio-level WS events now include source metadata (`streamKind`/`sourceName`).
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Start app, set mode to `System audio`, confirm system meter and transcript updates.
  - Switch mode to `Microphone`, speak, and confirm mic meter updates plus distinct transcript text color for mic rows.

## 2026-02-23 (speed-tuned aggregate score + editable pre-send text area)
- User-visible:
  - Tuned aggregate benchmark scoring to prioritize speed even more strongly.
  - Added an editable selected-text textarea in the Response column before output.
  - Selected-text textarea now collapses to 2 rows and expands to 10 rows on focus (configurable).
- Internal:
  - Updated score weights to `82% speed / 13% reliability / 5% quality` with tighter TTC/TTFT pivots.
  - Kept frontend fallback score calculation aligned with backend formula for older stored benchmark history rows.
  - Added `.envb` loader support in `frontend/vite.config.ts` and introduced:
    - `VITE_SELECTED_TEXT_ROWS_COLLAPSED`
    - `VITE_SELECTED_TEXT_ROWS_FOCUSED`
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Select transcript text, verify it appears in Response column textarea, edit it, and run query.
  - Focus/blur the textarea and verify row expansion/collapse behavior.

## 2026-02-23 (benchmark TTC + speed-first aggregate score)
- User-visible:
  - Benchmark logs/results now expose explicit `TTC` (time-to-complete) metrics.
  - Added `Agg Score` (0-100) in benchmark result tables, designed to prioritize speed.
- Internal:
  - Backend benchmark payload now includes `ttcMs` on attempts and `avgTtcMs|minTtcMs|maxTtcMs` plus `aggregateScore` on result rows.
  - Added a speed-first aggregate scoring formula (heavy TTC/TTFT weighting, with reliability and quality penalties).
  - Frontend latest/history/live benchmark tables now read TTC fields directly and render aggregate score.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Run a benchmark and verify TTC + Agg Score columns populate in Settings tables.

## 2026-02-23 (latest-result table hides empty models)
- User-visible:
  - "Latest Result Per Model" now renders only models that have benchmark results.
  - Models with no results are no longer shown as empty rows.
- Internal:
  - Frontend filters `latestPerModel` to `hasData` rows before rendering.
- How to test:
  - `cd frontend && npm run build`
  - Open Settings with models loaded but no benchmark history and confirm table shows the empty-state message.
  - Run benchmark for one model and confirm only that model appears in the table.

## 2026-02-23 (benchmark test persistence)
- User-visible:
  - Benchmark tests created/edited in Settings now persist across app restart and settings page remounts.
- Internal:
  - Added `benchmark-tests.v1` localStorage persistence for the editable test list.
  - Added safe load/normalize logic for stored test rows (invalid rows are filtered, row ids are rebuilt).
- How to test:
  - `cd frontend && npm run build`
  - Open Settings, create/edit/delete benchmark tests, then switch pages and restart app; confirm tests remain.

## 2026-02-23 (benchmark history de-dup + key warning fix)
- User-visible:
  - Fixed duplicate-key warnings in Settings benchmark history when the same benchmark run was recorded more than once.
- Internal:
  - Frontend now normalizes benchmark history by `benchmarkId` on localStorage load and on each `benchmark_complete` update.
  - Duplicate benchmark entries are dropped while preserving latest-first ordering and history cap.
- How to test:
  - `cd frontend && npm run build`
  - Run a benchmark, then trigger/observe repeated completion events for the same `benchmarkId` (or duplicate localStorage rows) and verify only one history card renders and no React duplicate-key warning appears.

## 2026-02-22 (query streaming + stop + rerun)
- User-visible:
  - Query responses now stream into the Response pane immediately instead of waiting for the full completion.
  - Added `Stop` button to cancel an in-flight query.
  - Added `Do it again` button to rerun the last query payload quickly.
- Internal:
  - Backend now executes `run_query` in a cancellable background task and emits `query_chunk` WebSocket events.
  - Added `cancel_query` frontend→backend WebSocket message handling.
  - Frontend now tracks active query request ids to merge streamed chunks safely and ignore stale responses.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Run a preset/custom query and confirm streamed text appears incrementally.
  - Click `Stop` mid-response and verify streaming halts with partial text preserved.
  - Click `Do it again` and verify the previous query re-runs.

## 2026-02-22 (dev launcher unmanaged frontend cleanup)
- User-visible:
  - `scripts/dev.sh stop` now also cleans up lingering frontend dev processes for this repo when no frontend PID file exists.
  - `scripts/dev.sh status` now reports unmanaged frontend dev process PIDs when detected.
  - `scripts/dev.sh start` now fails fast if an unmanaged frontend dev stack is already running.
- Internal:
  - Added frontend process discovery based on known repo dev toolchain executables (`concurrently`, `vite`, `tsc`, `wait-on`, `electron` under `frontend/node_modules`).
  - Added process-group fallback termination for unmanaged frontend stacks.
- How to test:
  - `bash -n scripts/dev.sh`
  - Start frontend manually (`cd frontend && npm run dev`)
  - `./scripts/dev.sh status` (should show unmanaged frontend PIDs)
  - `./scripts/dev.sh stop` (should clear unmanaged frontend processes)

## 2026-02-22 (dev launcher process cleanup)
- User-visible:
  - `scripts/dev.sh start` now fails fast with a clear message when the backend WS port is already occupied, including the blocking PID/command.
  - `scripts/dev.sh stop` now clears lingering backend listeners on the configured WS port (`BACKEND_WS_PORT`, default `8765`) even without a PID file.
- Internal:
  - Launcher now starts backend/frontend in separate process groups (`setsid`) and uses group-aware termination for managed processes.
  - Added listener discovery helpers using `lsof` (fallback `ss`) and unmanaged-listener reporting in `status`.
- How to test:
  - `bash -n scripts/dev.sh`
  - `./scripts/dev.sh start`
  - `./scripts/dev.sh restart`
  - `./scripts/dev.sh stop`
  - Start backend manually (`cd backend && ./.venv/bin/python -m app.main`), then run `./scripts/dev.sh stop` and confirm port `8765` is free.

## 2026-02-22
- User-visible:
  - Added `scripts/dev.sh` to quickly start/stop/restart both backend and frontend.
  - Added launcher utility commands: `status` and `logs`.
- Internal:
  - Added living docs set (`docs/INDEX.md`, `docs/STATUS.md`, `docs/API.md`, `docs/ARCHITECTURE.md`) and ADR index scaffold.
- How to test:
  - `./scripts/dev.sh start`
  - `./scripts/dev.sh status`
  - `./scripts/dev.sh logs`
  - `./scripts/dev.sh stop`

## 2026-02-22 (benchmark update)
- User-visible:
  - Benchmark now supports running multiple tests per run using `test_id | prompt` lines.
  - Benchmark history no longer gets overwritten on each run and is persisted in frontend local storage.
  - Benchmark results now show per-test/per-model rows and JSON-valid response count.
- Internal:
  - Backend `run_benchmark` now executes full `tests x models x repeats` matrix and emits richer progress/complete payloads.
  - Added shared benchmark harness prompt and structured test-case input builder in `backend/app/benchmark_harness.py`.
  - Kept backward compatibility for legacy benchmark requests using `selectedText`.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Start app, open Settings, add 2+ test lines, run benchmark twice, and verify both runs remain in history.

## 2026-02-22 (benchmark summary by model)
- User-visible:
  - Added "Latest Result Per Model" table in Settings, showing newest available benchmark metrics per model.
- Internal:
  - Computes per-model summary from benchmark history in descending run order.
  - Persisted approach remains JSON/localStorage-based for MVP (no Prisma DB introduced).
- How to test:
  - `cd frontend && npm run build`
  - Run benchmarks using at least two models, then verify the summary table updates with latest rows for each model.

## 2026-02-22 (benchmark images + CRUD + verbose logs)
- User-visible:
  - Added benchmark image upload/replace/delete with explicit reference ids (for example `IMAGE_1`).
  - Added simple test CRUD UI in Settings (create/update/delete/select).
  - Test prompt editor now uses a dedicated 5-row textarea.
  - Added live verbose benchmark log table with per-attempt status, JSON validity, latency, error, and response preview.
- Internal:
  - Backend benchmark payload now carries `imageRef` and emits `benchmark_log` events during execution.
  - Benchmark progress payload now includes rolling success/failure counters.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Upload an image with ref `IMAGE_1`, create a test that references it, run a benchmark, and verify live logs + history rows.

## 2026-02-22 (benchmark telemetry: latency usage cost quality)
- User-visible:
  - Benchmark logs and results now include TTFT, final latency, token usage, estimated cost, image-capability outcome, and quality score/checks.
  - Settings tables now surface those metrics per attempt and per model/test rollup.
- Internal:
  - Benchmark requests now use streaming Responses API path to capture time-to-first-token.
  - Added backend model pricing catalog with `OPENAI_MODEL_PRICING_JSON` override support for cost estimation.
  - Added rubric evaluator for pass/fail quality checks and image-modality success tracking.
- How to test:
  - `python -m compileall backend/app`
  - `cd frontend && npm run build`
  - Run a benchmark and verify `benchmark_log` rows include TTFT/tokens/cost/quality fields.

## 2026-02-22 (benchmark image uploader UI refresh + larger preview)
- User-visible:
  - Benchmark image upload now reliably updates UI after upload/replace.
  - Benchmark image previews are now 3x larger for easier verification.
- Internal:
  - Uploader now reads file from input ref as fallback and clears the native file input value after successful upload.
- How to test:
  - `cd frontend && npm run build`
  - Upload/replace an image ref (including re-uploading the same file) and confirm table updates immediately.

## 2026-02-22 (benchmark image full-size modal)
- User-visible:
  - Clicking an image preview now opens a larger modal preview.
  - Modal closes on backdrop click or Close button.
- Internal:
  - Added modal state in Settings benchmark image section.
  - Added modal/backdrop CSS styles with responsive max-height behavior.
- How to test:
  - `cd frontend && npm run build`
  - In Settings > Benchmark Images, click a thumbnail and verify full-size modal opens/closes.

## 2026-02-22 (transcript direction + selection flow)
- User-visible:
  - Transcript LIVE row is now anchored at the bottom of the transcript pane.
  - New transcript rows now progress forward and push older rows upward instead of rendering in reverse order.
  - Transcript action button now scrolls to latest (bottom).
  - Text selection behavior is more consistent for transcript-only selection and time-range extraction.
- Internal:
  - Live row buffering now appends instead of prepending.
  - Transcript pane now renders in chronological order and auto-scrolls to bottom when not paused.
  - Selection tracking moved to `selectionchange` listener constrained to transcript container rows.
- How to test:
  - `cd frontend && npm run build`
  - Start transcription, confirm live text stays at bottom and newest finalized lines appear below older ones.
  - Select text across multiple transcript rows and verify selection remains stable.

## 2026-02-22 (sticky selection + compact transcript rows)
- User-visible:
  - Transcript selection is now sticky and no longer clears on incidental outside clicks.
  - Added explicit `Clear Selection` action in transcript controls.
  - Transcript row presentation is denser (shorter line-height/padding) for faster scanning.
- Internal:
  - Selection handler now ignores collapsed/non-transcript selections instead of clearing selected text state.
  - `clear_transcript` action now resets selected text/time range state in app.
- How to test:
  - `cd frontend && npm run build`
  - Select transcript text, click elsewhere, confirm selection context remains until pressing `Clear Selection` or `Clear`.
  - Verify transcript rows are visually more compact.

## 2026-02-22 (transcript max rows + typeface)
- User-visible:
  - Transcript viewport height now honors `VITE_MAX_ROWS` much more closely (including small values like `10`).
  - Transcript row text now uses `Roboto Condensed` at weight `600`.
- Internal:
  - Replaced oversized `maxHeight` minimum with a tighter rows-based height calculation.
  - Applied `Roboto Condensed` font style to transcript and LIVE row text only.
- How to test:
  - Set `VITE_MAX_ROWS=10`, restart frontend dev server, and verify only around ~10 rows are visible before scroll.
  - Verify transcript text face/weight changed to Roboto Condensed 600.

## 2026-02-22 (latest result table hover tooltips)
- User-visible:
  - Added descriptive tooltips to `Latest Result Per Model` header cells.
  - Added per-cell hover titles so each value shows its column label/value.
- Internal:
  - Implemented native `title` attributes for header and data cells in the latest result table.
- How to test:
  - Hover over table headers and data cells in `Latest Result Per Model` and verify tooltip text appears.

## 2026-02-22 (live log preview truncation)
- User-visible:
  - `Live Runner Log` preview column now shows only the first 100 characters.
  - Hovering preview cells shows full preview text in tooltip.
- Internal:
  - Added preview truncation helper and full-text `title` on preview cells.
- How to test:
  - Run benchmark, confirm Preview column is truncated and full text appears on hover.
