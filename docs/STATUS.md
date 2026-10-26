# Status

## What works end-to-end
- PR #1 review R1–R5 fixed: exactly-once disconnect/lease cleanup, definitive manual cancellation before epoch changes, overlapping-audio-only deduplication and finite acknowledged reconciliation. Full checks: backend238/frontend188/typecheck/build304 PASS. Runtime RAG files ignored/untracked, local bytes preserved; unmerged history sanitization pending publication. [Review evidence](notes/2026-10-26-pr1-review-remediation.md).
- Frontend standalone TypeScript check passes: `src/vite-env.d.ts` loads Vite client types for the three `import.meta.env` reads. Production build also passes (304 modules). This resolves the historical M00–M08 baseline errors.
- M08 FULL AUTO is complete within synthetic/local-service scope: explicit session arm, one active/newest pending answer, manual priority, review gates, holds/deferred publication, source-linked correction and lifecycle disarm. Protocol v6; 226 backend/186 frontend tests and build304 PASS; standalone TypeScript now passes after the Vite typing follow-up. No paid inference/audio/native acceptance in M08. [Evidence](notes/2026-10-26-m08-acceptance.md), [ADR 0019](adr/0019-owned-full-auto-scheduling.md).
- Backend service runs via `python -m app.main` and serves WebSocket on `ws://127.0.0.1:8765`.
- Frontend Electron app connects to backend and supports transcript selection + prompt execution.
- Backend query failures are logged with stack traces, and `./scripts/dev.sh start` prints a recent backend log excerpt after startup.
- The prompt area now surfaces the latest backend error inline, so failures are visible without opening the terminal.
- Cloud AI calls (language, embeddings, model discovery) now route through Vercel AI Gateway (`https://ai-gateway.vercel.sh/v1`) with OpenAI-compatible REST API.
- Deprecated chat snapshot aliases such as `gpt-5.1-chat-latest` are remapped to Gateway slugs such as `openai/gpt-5.1`, and `gpt-5.2-chat-latest`/`gpt-5.3-chat-latest` map to `openai/gpt-5.6-sol`. Since M3bis the substitution is *visible* in protocol v3: `answer_accepted.frozenInputs.model` records `selectionSource: "deprecated_alias"`, `substitutedFrom` and a notice, while the original selection is preserved.
- Streamed query runs now set `stream: true` on Responses API payloads, restoring live token updates and final answer text for current models.
- Transcript-text realtime amendment (23 October 2026): fresh answer default is `google/gemini-3.8-flash` with supported low reasoning; explicit environment/saved model choices remain. The async Gateway adapter handles framed/fragmented SSE, ignores reasoning, validates completion, closes on cancel, requests Chat streaming usage, retains partial failures through v2 and leaves genuine empty output empty. Same-model Chat fallback is limited to pre-content HTTP 404. Audio/STT stay local. See [ADR 0013](adr/0013-stream-transcript-text-answers.md); full backend suite 92/92 PASS (synthetic), live inference/latency NOT RUN.
- STT now defaults to CPU-safe settings for local runs, so machines without CUDA libraries do not fail trying to load `libcublas`.
- Backend virtualenv startup on this machine was restored by pointing its `python`/`python3` launchers at the installed Python 3.14 interpreter; `faster-whisper` was already installed in that environment.
- Desk uses explicit Preset/Custom mode in Guide; saved custom text is retained but ignored in Preset mode. Sound now contains audio controls, with selected input/meter always visible in the Desk header.
- Desk renders raw transcript, fallible possible questions with detector disable/retry, working answers and kept answers, with independent scroll, persistent pointer/keyboard dividers and a fixed action footer; compact windows use two-by-two panels.
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
- Deterministic frontend test harness runs with `cd frontend && npm run test` (Vitest + jsdom + React Testing Library); test-only helpers/fixtures live under `frontend/src/cockpit/__tests__/` and are never imported by application code.
- Protocol v2 is negotiated on every connect (`hello` → `hello_ack`). One connection holds the assistance control lease; other windows are read-only for assistance and capture-changing commands.
- Committed transcript segments now carry a globally unique `segmentKey` (`audioEpoch#segmentId`) and a monotonic revision, and every capture restart gets a new audio epoch.
- Immutable source snapshots can be frozen from an explicit press-time anchor, from validated exact selections, or as pinned moments, without any model call. Later finals, partial updates, transcript clearing and source restarts cannot rewrite them.
- Manual v2 answers stream as scoped `answer_chunk` events and end with an authoritative `answer_finished` (status, final text, retrieval evidence). Duplicate `commandId` sends never execute twice, and a lost acknowledgement is reconciled instead of resent.
- A lost connection leaves a visible "status unknown" notice and clears the running indicator; offline sends are rejected instead of queued.
- Current client advertises `[5,4,3,2]`; protocol v5 adds question proposals/correction alongside v4 targets/reruns/answer state. Older manual contracts remain supported. See ADRs 0016/0018 and API.md.
- Manual v3/v4 answers freeze role/model/capability provenance: effective model, requested model, selection source, accepted reasoning effort (validated for the selected model and propagated to Gateway), positively-known text/image/structured capabilities and their certainty, plus the screenshot attachment state. A screenshot on a model without verified image input is rejected visibly (`unsupported_capability`) instead of being dropped, and a model absent from a catalog this backend read is rejected (`unavailable_model`) — no paid call either way.
- Manual v3 answers emit scoped timing with documented clock domains: backend milliseconds from request acceptance and client-only press/first-visible values. M04 produces RAG/generation/first-delta timing and retrieval outcomes; M05 records first-visible timing at rendered Markdown display. Retrieval evidence contains actual source identity and paths; failures are explicit and do not imply document review.
- The live helper Desk now renders streamed answer Markdown (including GFM lists/tables) as safe React elements, retains code formatting, and keeps raw HTML disabled. Two live Gateway calls with only a synthetic arithmetic transcript verified the flow before and after Markdown rendering; the updated UI run reported `no_documents`, first answer delta 1.82 s after acceptance, and first display 1.85 s after press.

## In progress
- M04–M08 are complete within their recorded gates. Next is M09-T01 (native Electron controls); see [the progress ledger](plans/live-helper-cockpit-progress.md) and [M08 evidence](notes/2026-10-26-m08-acceptance.md).

## Cockpit execution planning (updated 26 October 2026)
- M07 COMPLETE (synthetic/local-service scope): bounded optional question proposals, source provenance/revisions, edit/split/merge/dismiss/undo, Wrong question recovery, protocol v5 and Gateway-only routing. Backend 198/198; frontend 146/146; build PASS (303 modules); exactly 3 baseline ImportMeta.env errors remain. Real detector quality/hardware remain M09/M10. M08 completion is recorded above. See [M07 evidence](notes/2026-10-26-m07-acceptance.md) and [ADR 0018](adr/0018-bounded-question-proposals-and-gateway-routing.md).
- M06 COMPLETE (synthetic/local-service scope): Sound dialog, persistent selected-input meter, isolated telemetry, monitoring after Stop, acknowledged source reconciliation and original Settings behavioral parity. Backend 175/175; frontend 115/115; production build PASS (302 modules); only the 3 known standalone ImportMeta.env errors remain. No real audio or paid inference used. M07 completion is recorded above. See [M06 evidence](notes/2026-10-26-m06-acceptance.md).
- [Milestone plan](plans/live-helper-cockpit-execution-plan.md) translates the implementation brief into ordered tasks, contracts, file targets, verification gates, and acceptance cases.
- [Progress ledger](plans/live-helper-cockpit-progress.md) is the required second Markdown for task status, evidence, blockers, and clean-context resumption. Update it after every execution task/check/interruption.
- M00 (baseline) is COMPLETE: worktree/runtime baseline recorded, parity inventory and persistence boundaries captured, the four baseline commands run, and a deterministic frontend harness added (`npm run test`). Details and the open `tsc` baseline failure are in the ledger.
- M01 (contracts before wiring) is COMPLETE: ADR 0011 expanded with C01-C06, ADR 0012 added, full v2 payloads documented in API.md, backend/frontend models + parsers created, and shared `contracts/v2/` fixtures verified to parse identically on both sides. M01 itself was specification-only; M02/M03 subsequently wired the runtime.
- M02 (immutable source snapshots) is COMPLETE: audio epochs + `segmentKey`s, immutable recent-window/selection snapshots, pinned moments, capacity rejection and GC, with 22 focused tests.
- M03 (owned, versioned transport) is COMPLETE: connection identity + targeted replies, hello/capability negotiation, single control lease, command-id acknowledgement/idempotency/reconciliation, scoped request lifecycle, connection-scoped legacy queries, and the client reducer. 18 two-client backend transport tests and the frontend transport/reducer tests pass.
- M04 (manual answer records/evidence) is COMPLETE: atomic acceptance, immutable server rerun, model/reasoning propagation, captured notes/screenshots/retrieval, truthful outcomes/timing, adversarial cancellation and strict preflight. Full backend: 160 tests PASS.
- M05 (manual workbench) is COMPLETE: safe streamed Markdown/GFM, target editor, raw selection/follow/highlights, pin zero-call, notes, modes, retained cards/anchors, all dividers and persisted layout. Frontend: 106 tests PASS; production build PASS. Required desktop/compact sizes and one live synthetic Gateway answer passed. Screenshot renderer bridge is tested; actual native capture/shortcuts remain M09/M10. See the completion evidence for boundaries.
- M3bis (amended realtime contracts and reliability) is COMPLETE for its synthetic scope (25 October 2026): protocol v3 negotiation, role/capability readiness, frozen model/screenshot provenance, and the C08 timing contract are specified in [API.md](API.md) "Protocol v3" and [ADR 0014](adr/0014-protocol-v3-timing-and-model-readiness.md), implemented in `backend/app/{cockpit_models,model_roles,cockpit_protocol,assistance,main}.py` and `frontend/src/{ws.ts,cockpit/types.ts,cockpit/protocol.ts,cockpit/reducer.ts}`, and covered by `contracts/v3/` plus new backend/frontend regressions. See the ledger for exact counts. Detector/AUTO were unadvertised at that historical gate; current M07/M08 status is above. No live-latency result is claimed.
- RT01 (user-requested streaming foundation amendment) is COMPLETE: runtime adapter/default, ADR 0013, brief/plan C07, and tests updated without starting M04 or changing local WS payloads. Preserve these stream regressions; detector/UI/timing integration remain pending. Public model catalog checked on 23 October; no paid call or cloud audio was used in RT01.
- Plan revision 3 remains the scope reference. M04/M05 completion does not accept detector/AUTO/native or full integration; ADR 0011 remains Proposed until M11.

## Proposed UX handoff (23 October 2026)
- User selected dark translucency and both manual assistance/FULL AUTO, then requested a four-column workbench: raw transcript, fallible question proposals, working answers and kept/previous answers. The revised primary action snapshots recent raw speech without requiring question detection. [Design index](design/INDEX.md) links the interactive scripted prototype, preview images, source-to-state mapping and [implementation prompt](prompts/live-helper-cockpit-implementation.md).
- Added a dedicated Sound overlay, selected-input level bar permanently in the main header, and explicit Settings entry. The updated implementation prompt requires preservation of every original Desk and second-screen Settings/RAG/docs/benchmark feature and stored data. Audio values/device names in the prototype are simulated.
- The prototype remains a design artifact; its original handoff did not change application behavior. Subsequent M02/M03 and RT01 runtime work is tracked above/in the ledger. [ADR 0011](adr/0011-question-assistance-cockpit.md) remains Proposed for the full workbench; ADR 0012's M03 transport and ADR 0013's text-streaming decisions are accepted within their stated scope.
- Implementation priorities: (1) four-panel workbench/raw-context snapshots and correction paths, (2) optional fallible question inbox plus owned AUTO draft scheduler/protocol migration, (3) actual Ubuntu shortcut/window/transparency acceptance. Persistent cards supersede the old timer-driven answer replacement. Existing engineering priorities below remain open.
- Verification: local prototype rendering and scripted UI interactions only; see the changelog for exact results. Real question detection, audio/Gateway latency, RAG evidence and native transparency/shortcuts are NOT RUN.

## Next 3 priorities
1. M09-T01: inventory Electron/display/compositor and official native support before IPC/shortcut/window changes.
2. M09: implement and verify shortcut, pin and Focus; record precise optional transparency support limits.
3. M10: integrated hardware/STT/Gateway acceptance and bounded latency smoke; user help may be needed for device/native checks.

## Known issues / blockers
- First startup fails if dependencies are missing in `backend/.venv` or `frontend/node_modules`; launcher does not auto-install deps.
  - Paths: `scripts/dev.sh`, `backend/requirements.txt`, `frontend/package.json`.
- `backend/.venv` launchers can become stale if the target Python interpreter is removed or upgraded; recreate the environment with `python3 -m venv .venv` and reinstall `requirements.txt` if `python` is missing or imports resolve from a different interpreter.
  - Paths: `backend/.venv/bin/python`, `backend/README.md`.
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
