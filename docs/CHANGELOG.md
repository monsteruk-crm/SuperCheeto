# Changelog

## 2026-10-26 (M06 complete: Sound and Settings preservation)
- User-visible: dedicated accessible Sound dialog, persistent selected-input meter with honest signal states, monitoring after Stop, acknowledged device fallback, retained raw selection/focus/drafts, and original Settings workflows. Corrected modal button/label contrast and added associated Settings input labels/error visibility.
- Internal: isolated meter subscriptions avoid transcript/answer rerenders; source changes resolve before invalidation/restart, inactive/no-op choices avoid restarting; controller lease guards capture mutations; monitor EOF/failure cleans up. Existing wire/status envelope, storage keys and SQLite schema remain. ADR 0017 records semantics.
- Verification: backend 175 tests PASS; frontend 115 PASS; build PASS (302 modules); standalone TypeScript retains only 3 existing ImportMeta.env errors; diff PASS/data clean. Rendered Sound/Settings, required sizes and isolated persistence checks passed; real readers/benchmark orchestration used local fixtures. No cloud inference, actual device capture/STT or native controls acceptance. User help is reserved for M09/M10. [Full evidence](notes/2026-10-26-m06-acceptance.md).

## 2026-10-25 (M04/M05 completion)
- User-visible: four-panel manual workbench, safe streamed Markdown/GFM as HTML, editable frozen targets, pin/no-call, explicit Preset/Custom, notes, retained answer actions, readable anchors and persistent pointer/keyboard layout. Saved Preset now survives reload with custom text retained.
- Internal: protocol v4/ADR 0016/shared fixtures, server-owned frozen reruns, snapshot leases, protected capacity/state replay, real reasoning propagation and usage, empty-index embedding skip, adversarial late-completion guards, 40ms render fallback and Electron external-link isolation.
- Verification: backend 160 tests PASS; frontend 106 PASS; production build PASS (300 modules); diff check PASS; data clean. Standalone TypeScript retains exactly 3 existing ImportMeta.env errors. Required dimensions and mock WS incremental/selection/layout/anchor flows PASS. One authorized synthetic live inference completed with actual usage and rendered answer. Actual native capture/shortcuts, audio/STT and full Settings/AUTO acceptance remain later milestones; [evidence](notes/2026-10-25-m04-m05-acceptance.md) records exact boundaries.

## 2026-10-25 (M04/M05 continuation: live answer rendering and acceptance hardening)
- User-visible: streamed Gateway answers now render Markdown/GFM in the answer card, including headings, emphasis, lists, tables, quotes and code blocks. The four-panel Desk displays the rendered answer while the stream is still active. Transcript follow can pause, count new finals, resume or jump latest; required desktop and 1000px browser layouts were checked, including keyboard resizing. Raw HTML remains disabled. Delayed command-status replies now settle Keep/Remove/note actions without leaving controls stuck.
- Internal: added `react-markdown` and `remark-gfm` under [ADR 0015](adr/0015-safe-markdown-answer-rendering.md), card Markdown styles and harness checks for real emphasis nodes and escaped raw HTML; exercised delayed `command_status` reconciliation, pause-follow, and note-draft preservation after rejection; closed M04 acceptance failure-injection, citation rejection, untrusted-source prompt-boundary and human-note test cases. Ran two live Gateway calls with only a synthetic arithmetic transcript in the isolated browser/backend (the second verified Markdown rendering); no audio or persistent RAG DB was used.
- How to test: backend full discovery — 150/150 PASS; frontend Vitest — 78/78 PASS; production build — PASS (296 modules); `git diff --check` — PASS. Live rendered answer PASS (`google/gemini-3.8-flash`, `no_documents`, streamed before terminal; 1.82 s backend first delta and 1.85 s client first display after press). Full M04/M05 remain IN PROGRESS because pointer/persisted resizer, reading-anchor, full legacy parity, target editor and timing/cancellation matrices remain open; see progress ledger.

## 2026-10-25 (M05: exact transcript selection handoff)
- User-visible: selecting words in the raw transcript and choosing “Draft answer from selection” now freezes the exact source offsets; “Pin this moment” creates a pinned recent-context snapshot. The responsive grid uses CSS-driven proportions so its narrow two-by-two layout can take effect.
- Internal: App now retains the component's `SourceSpan[]`, converts browser UTF-16 offsets to protocol Unicode code-point offsets, and sends them with `create_snapshot(kind="selection")`. Rerun retains the original screenshot data by accepted request instead of reading the current screenshot selection. Event callback dispatch removes any wire `type` field before adding the reducer discriminant. Added a fake-transport assertion with a supplementary Unicode character before the selection.
- How to test: `cd frontend && npm run test -- --run` — 75/75 PASS; `npm run build` — PASS (39 modules); `npx tsc --noEmit` — FAIL with only the three existing `ImportMeta.env` TS2339 errors. Backend full suite — 143/143 PASS. M04/M05 remain IN PROGRESS; live/native visual acceptance was not run.

## 2026-10-25 (M04-T02: bounded reconciliation and target retention regressions)
- User-visible: no Desk UI change. The manual answer transport now has regression coverage proving that a reconciliation response remains accurate if the same bounded-history operation prunes the queried command record; a late missing Gateway credential returns a scoped dependency error and a definitive failed answer instead of leaving the request running.
- Internal: added synthetic transport tests for forced-GC retention/release of explicit unpinned snapshot targets, status reconciliation at the registry capacity boundary, and generation-time access failure. The acceptance handoff now captures and rechecks the server session epoch after asynchronous supersession, rejecting the command and releasing its retained source if clear/restart or owner disconnect invalidates the session mid-flight. Supersession teardown exceptions also fail closed and release the retained source. Post-supersession commit/ack failure handling remains under test.
- How to test: `cd backend && .venv/bin/python -m unittest tests.test_cockpit_transport tests.test_answer_service` — 50 tests PASS; full backend discovery — 141 PASS. Frontend Vitest 72 PASS and production build PASS. All are synthetic with mocked generation/RAG and temporary SQLite; live Gateway/audio/UI/native tests remain NOT RUN. `git diff --check` PASS.

## 2026-10-25 (M04-T01: answer-service extraction; T03/T04 backend foundation)
- User-visible: no Desk UI change yet. The manual protocol answer path now emits real RAG/generation/first-delta timing and v3 retrieval records can identify the exact local document path and `docId:chunkIndex` chunk. Retrieval outcomes distinguish an empty index from no matches and failure; failed retrieval context explicitly warns the model not to claim documents were checked.
- Internal: extracted `AnswerService` to `backend/app/answer_service.py`, injecting the local store, embedder, runner provider and clock. It forwards deltas immediately, preserves the chosen model/screenshot inputs, and leaves HTTP/SSE framing, terminal validation, fallback and upstream cancellation in the existing `AIGatewayClient`. v2 retrieval wire payloads remain unchanged. Added offline service and transport evidence tests. M04-T02 strictly validates instruction/source/model/screenshot/note/reasoning/timing inputs before acceptance; rejected requests do not supersede current work, accepted source is retained before asynchronous supersession/GC, and serialized command handling prevents concurrent duplicate acceptance while keeping one active answer, and bounded registries prune terminal history without evicting live requests.
- How to test: PASS — latest backend suite 135 tests; v3 transport subset 23 tests; earlier focused service/transport/contracts/Gateway-streaming suite 51 tests; frontend Vitest 72 tests; frontend production build. `git diff --check` PASS. `npx tsc --noEmit` remains the exact pre-existing 3-error `ImportMeta.env` failure. Live Gateway, audio/STT, rendered UI, first-visible and latency acceptance NOT RUN. M04 remains in progress; see the progress ledger.

## 2026-10-25 (M3bis: amended realtime contracts, model readiness and timing)
- User-visible:
  - No Desk/UI behavior changed yet; this milestone implements the wire contract the workbench will display. The client now negotiates protocol v3 on connect and falls back to v2 unchanged.
  - A request that needs a capability the selected model is not positively known to have (for example a screenshot on an unverified model) is now rejected with a visible `unsupported_capability` error instead of silently dropping the image. A model missing from a Gateway catalog this backend actually read is rejected with `unavailable_model`. Neither case places a paid call, and the target is retained.
  - Deprecated model aliases are no longer invisible: the accepted request records the original selection, the substituted model and a notice.
- Internal:
  - Added ADR 0014 (protocol v3: model-readiness metadata and the timing contract) and amended ADR 0012 to point at it; the recorded v2 contract and legacy adapter are unchanged.
  - `docs/API.md` gained a "Protocol v3" section: negotiation (`supportedProtocolVersions`, highest-common selection, rejection of unknown versions), v3 command additions (`reasoningEffort`, `clientPressedAtMs`), model-readiness rules and error codes, the frozen `answer_accepted.frozenInputs` block, and the C08 timing contract with units, clock origins, nullability, ordering rules and event placement.
  - `backend/app/cockpit_models.py`: v3 version constants, `ModelRole`, `ModelSelectionSource`, `CapabilityCertainty`, `TimingClock`, model-capability/settings/frozen-input/timing dataclasses, and the `unsupported_capability`/`unavailable_model` error codes.
  - `backend/app/model_roles.py` (new): role/capability readiness with a dated static catalog (Flash answer default, provisional Flash-Lite detector), positively-known image/structured capabilities, deprecated-alias provenance, and reasoning that is applied only for the verified default.
  - `backend/app/cockpit_protocol.py`: v3 parsing for model settings, backend/client timing (clock labels, ordering), `answer_accepted` and `answer_timing`; existing v2 rules untouched.
  - `backend/app/assistance.py`: per-version capability advertisement (`model_readiness`, `timing` for v3 only), wire-version negotiation helper, and request-record fields for frozen inputs, model settings, timing/`timingSeq` and the echoed client press instant.
  - `backend/app/main.py`: negotiation in `hello`, version-correct envelopes, model-readiness preflight before the snapshot is consumed, frozen model/screenshot metadata, scoped `answer_timing` at acceptance, and final `timing`/`modelSettings` in `answer_finished`. `_broadcast_models` now remembers the catalog it actually read.
  - `backend/app/ws_server.py`: `ConnectionInfo.protocol_version`.
  - `frontend/src/ws.ts` advertises `[3, 2]`, adopts the negotiated version, and dispatches `answer_timing`; `cockpit/types.ts` and `cockpit/protocol.ts` mirror the v3 contract; `cockpit/reducer.ts` keeps backend and client timing in separate fields, applies only newer `timingSeq`, refuses to revive terminal records, records the first-visible checkpoint and derives press-to-visible only from two client values.
  - Added `contracts/v3/` (6 valid, 9 invalid fixtures) read by both the backend and frontend contract harnesses. `contracts/v2/` is unchanged.
- How to test / results:
  - PASS: `cd backend && .venv/bin/python -m unittest discover -s tests` → 118 tests OK (synthetic; injected generation, stub RAG, isolated temp storage, ephemeral local ports).
  - PASS: `cd backend && .venv/bin/python -m unittest tests.test_ai_gateway_client tests.test_gateway_streaming tests.test_cockpit_contracts tests.test_cockpit_model_roles` → 52 tests OK.
  - PASS: `cd frontend && npm run test -- --run` → 5 files, 72 tests passed (including 30 shared contract fixtures).
  - PASS: `cd frontend && npm run build`.
  - FAIL (pre-existing, unrelated, unchanged): `cd frontend && npx tsc --noEmit` → the same 3× `TS2339` `import.meta.env` errors in `App.tsx`.
  - NOT RUN: real audio/STT, live Gateway inference or catalog access, rendered UI, first-visible/latency measurement, native Electron. No latency, quality, or account-access claim is made.


## 2026-10-25 (PLAN03: revised realtime cockpit execution plan)
- User-visible:
  - Updated the execution plan from the revised implementation brief. M00–M03 and RT01 remain complete; new M3bis is NOT STARTED and precedes M04.
  - No application behavior changed in this documentation iteration.
- Internal:
  - Added a requirement-to-milestone map, expanded C07, and added C08 for timing/model-readiness evidence. M3bis owns follow-up contracts/types/transport and regression checks for the completed foundations.
  - Made progressive display, model/attachment validation, independent bounded detection, partial/empty/cancel handling, and measured timing explicit in M04/M05/M07/M08/M10 and A25–A28.
  - Synchronized the progress ledger, STATUS, and plan indexes. Accepted ADRs and the implementation brief remain unchanged; future wire changes require documented versioning before implementation.
- How to test:
  - Documentation link/anchor, task/acceptance-ID, completed-milestone preservation, and brief-unchanged checks: see PLAN03 in the progress command log.
  - `git diff --check`: result recorded in the progress command log.
  - Runtime suites, current catalog/model inference, latency/quality, rendered UI/audio/native acceptance: NOT RUN (documentation only).

## 2026-10-23 (RT01: transcript-text realtime response foundation)
- User-visible:
  - Fresh answer default is `google/gemini-3.8-flash` with supported low reasoning. Existing `VERCEL_MODEL` and saved/user-selected models remain in force; no private environment/preferences were changed.
  - Interrupted, malformed, failed or incomplete streams cannot appear completed. Already streamed partial drafts remain visible through v2, and actual empty output is not replaced with a success-looking placeholder.
  - Local audio/STT remain local; this is streamed text generation from a transcript, with all existing Settings/RAG/preset/benchmark features retained.
- Internal:
  - `ai_gateway_client.py` parses SSE frames across network/UTF-8 boundaries, ignores reasoning, checks Responses/Chat terminal semantics, requests Chat streaming usage, closes upstream on cancellation, and includes API-format fallback overhead in generation/first-text timing. Same-model fallback remains limited to Responses HTTP 404 before content; no retry after partial output or 401/429/5xx.
  - Default/model-specific low reasoning was checked against the full public Gateway catalog. The proposed live-audio example uses a different session API; it is not required for transcript-text answers.
  - Added ADR 0013 and updated implementation prompt, plan C07, design spec, architecture/API/README and progress ledger. M04 still starts at T01; detector, progressive cockpit rendering and end-to-end timing evaluation remain open.
- How to test (all PASS):
  - `cd backend && .venv/bin/python -m unittest tests.test_ai_gateway_client tests.test_gateway_streaming tests.test_cockpit_transport` — 51 tests, synthetic provider frames plus real ephemeral local WebSockets.
  - `cd backend && .venv/bin/python -m unittest discover -s tests` — 92 tests.
  - `git diff --check` — no whitespace errors. Local documentation link/anchor check recorded in the progress ledger.
  - Live model inference, account access, latency/quality, real audio and rendered/native UI: NOT RUN. Frontend code was unchanged in this amendment; its checks were not rerun. The recorded pre-existing `tsc` typing failure remains open.

## 2026-10-23 (M03: owned, versioned transport)
- User-visible:
  - The app now negotiates protocol v2 on connect (`hello` → `hello_ack`), so a second window sees the first window as read-only for assistance instead of silently generating or cancelling in its place.
  - A lost connection now leaves a visible "connection lost, status unknown" notice and clears the running indicator; the request is never resent automatically.
  - Legacy manual queries are unchanged, but their replies now arrive before the "not running" state, so the answer text is never dropped.
- Internal:
  - `backend/app/ws_server.py` now assigns a server-side `connectionId` per socket, exposes `send_to`/`connections`, and calls connect/disconnect hooks; shared transcript/audio/status events stay broadcast.
  - New `backend/app/assistance.py`: single control lease, server-owned `sessionEpoch`, bounded `commandId` outcomes (duplicate suppression + reconciliation), request records with one active answer slot, and interaction holds.
  - `backend/app/main.py` routes v2 commands (`hello`, `claim_control`, `get_command_status`, `create_snapshot`, `run_context_query`, `run_snapshot_query`, `cancel_answer`, `interaction_state`), scopes chunks/completions/errors to the owning connection, cancels owned work on owner disconnect, and rejects unimplemented v2 commands with `not_ready`. Capabilities advertised: `assist`, `snapshots`.
  - Generation is behind an injectable runner so transport tests use a mocked generator; the legacy `run_query` worker now shares it.
  - `frontend/src/ws.ts`: typed send results (`offline`/`not_ready`), five-second acknowledgement deadline, `get_command_status` reconciliation, epoch/identity adoption, and `dispose()` cleanup; offline sends are never queued for replay.
  - New `frontend/src/cockpit/reducer.ts`: retains request records until a definitive status and ignores stale epochs, foreign backend instances, unknown identities, duplicate `eventSeq`, and late events for cancelled requests.
- How to test:
  - `cd backend && .venv/bin/python -m unittest discover -s tests` (82 tests; includes 18 two-client transport tests).
  - `cd frontend && npx vitest run` (44 tests; includes transport, reducer, and the App connection-loss harness test).
  - `cd frontend && npm run build`.

## 2026-10-23 (M02: immutable source snapshots)
- User-visible:
  - None yet: snapshot creation is available on the v2 surface but the desk UI still uses the legacy flow until M05.
- Internal:
  - `backend/app/transcript.py` records every committed segment as an immutable `SourceRecord` with `segmentKey` (`audioEpoch#segmentId`) and a monotonic `transcriptRevision`, tracks the live partial tail, and supports epoch rotation and clear without discarding history.
  - New `backend/app/source_snapshots.py`: recent-window freezing at an explicit press-time anchor (complete intersecting segments from the anchor's audio epoch only), exact-selection freezing with validated code-point offsets, pinned moments with a 50-snapshot capacity limit, a 24,000-character limit that rejects instead of truncating, and reference-counted garbage collection. No model call is made.
  - `Snapshot` gains `tentative` (explicitly requested partial text; never usable for AUTO).
  - `backend/app/main.py` rotates the audio epoch on every capture start/stop and stores partial text from the live callback.
  - `docs/API.md` documents source semantics, selection snapshots, `command_ack` rejection codes, and `snapshot_created.tentative`.
- How to test:
  - `cd backend && .venv/bin/python -m unittest tests.test_cockpit_snapshots -v` (22 tests).

## 2026-08-06 (Vercel AI Gateway migration)
- User-visible:
  - Cloud AI calls (language queries, embeddings, model discovery) now route through Vercel AI Gateway instead of direct OpenAI.
  - Default model is now `openai/gpt-5.6-sol` (via `VERCEL_MODEL`); old bare model IDs like `gpt-5.1` are auto-prefixed to `openai/gpt-5.1`.
  - Model selector now only shows language models (embedding/image/video models are filtered out).
  - UI text updated to reference "AI Gateway" instead of "OpenAI" where appropriate.
- Internal:
  - Replaced `backend/app/openai_client.py` with `backend/app/ai_gateway_client.py` (`AIGatewayClient`).
  - Auth reads `AI_GATEWAY_API_KEY` first, falls back to `VERCEL_OIDC_TOKEN`; `OPENAI_API_KEY` is no longer used.
  - Base URL defaults to `https://ai-gateway.vercel.sh/v1` (configurable via `AI_GATEWAY_BASE_URL`).
  - Model normalization: bare IDs get `openai/` prefix; `gpt-5.2-chat-latest`/`gpt-5.3-chat-latest` map to `openai/gpt-5.6-sol`.
  - Model discovery filters to `type == "language"` rows from `/models` endpoint.
  - Embedding default changed to `openai/text-embedding-3-small`.
  - Pricing override env var renamed to `AI_GATEWAY_MODEL_PRICING_JSON`; keys use `creator/model` form.
  - Added `openai/gpt-5.6-sol` to pricing catalog (base-tier: $5.00/$30.00 per 1M tokens).
  - Frontend type `OpenAIModelInfo` renamed to `GatewayModelInfo`.
  - Added 23 unit tests in `backend/tests/test_ai_gateway_client.py`.
  - Audio capture and STT remain entirely local; no changes to `audio_capture.py`, `stt.py`, or `requirements.txt`.
- How to test:
  - `cd backend && .venv/bin/python3.14 -m unittest tests.test_ai_gateway_client -v`
  - `cd frontend && npm run build`
  - Set `AI_GATEWAY_API_KEY` in `backend/.env.local`, start app, confirm queries work through Gateway.
  - Verify model selector contains `openai/gpt-5.6-sol` and no embedding models.

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
# 2026-10-09

- Restored backend startup in the local virtualenv by fixing its `python` and `python3` symlinks to the installed Python 3.14 interpreter; confirmed `faster_whisper` imports and the WebSocket server starts. No application source or dependency declaration changed.
- Verification: `source .venv/bin/activate && timeout 4s python -m app.main` from `backend/` (server reached listening state; timeout stopped the smoke check).


## 2026-10-23 (Live Helper UX design and implementation handoff)
- User-visible:
  - Added a proposed dark translucent conversation cockpit, editable HTML prototype, Desk/Focus preview images, and a source-grounded Codex implementation prompt. User selected both Answer now and continuous FULL AUTO.
  - Proposed passage-level targeting, stable streamed answer placement, reading floor, Hold, pending-question handoff, truthful evidence and compact Focus mode.
- Internal:
  - Added docs/design/INDEX.md and linked the specification/prompt from docs/INDEX.md and STATUS.md. ADR 0011 is Proposed; application code and live API remain unchanged.
  - Created Superdesign baseline from the actual React Desk components with sample data, imported the authored cockpit, and retained design context/resume state. No model generation credits were used for those HTML imports.
  - Preserved pre-existing STATUS/CHANGELOG edits and .mcp_memory/. Added ignores only for temporary design files and browser-check artifacts.
- How to test / results:
  - PASS: `node --check .superdesign/tmp/prototype-inline.js` after extracting the prototype's inline script with Python HTMLParser.
  - PASS: local browser at http://127.0.0.1:8127/live-helper-cockpit.html; rendered Desk at 1440x900 and 1000x720, Focus at 640x640. Primary footer remains visible, no sideways overflow, answer/support text do not overlap; bounded answer scrolling works at smaller sizes. Inspected saved PNGs visually and repaired flex shrinking found during Focus review.
  - PASS (scripted prototype only): Answer now completes; passage targeting exposes a next-request manual target and labels the previous answer; clearing returns to latest behavior; FULL AUTO advances to the next scripted question; Hold retains current answer with a queued question; disconnect retains output/disables send; reconnect leaves AUTO paused; Focus hides transcript.
  - BLOCKED: the browser approval proxy rejected the scripted Show next click as potentially destructive. That specific click remains unverified. Its unsafe code-runner is also disabled; other checks used allowed individual clicks and read-only page inspection.
  - NOT RUN: drag/Shift-click production targeting, all keyboard/native shortcuts, actual audio/STT, semantic detector quality, real Gateway/RAG calls, native pin/Ubuntu translucency, and application build/tests. This iteration adds design artifacts and documents only.
  - Preview-only Tailwind CDN emits its normal production-use warning; actual application implementation must use local styles/build assets.

## 2026-10-23 (four-column workbench revision and fallible-AI recovery)
- User-visible:
  - Revised the design after the user rejected the oversized answer pane and neat-question assumptions: full-height raw transcript, possible questions, working answers and kept/previous answers. Two real answer columns, compact persistent cards, independent scrolling and Transcript + layout.
  - Primary action now snapshots recent raw words directly (20/45/90s), independent of successful question detection. Added pin-moment, editable/splittable human-set questions, source inspection and Wrong question recovery.
  - The synthetic example includes unfinished/overlapping speech, a wrong deadline interpretation AND an unflagged wrong automatic draft, with original negation and human correction visible. Drafts remain explicitly unreviewed; auto eligibility/source grounding do not imply truth.
  - Removed the proposed timed answer-replacement/countdown policy. Existing/pinned answers remain as new cards arrive.
- Internal:
  - Updated the existing Superdesign draft in place with reversible version history; retained the original application baseline. Updated the UX specification, complete implementation prompt, design-system/resume context, proposed ADR 0011, indexes and STATUS.
  - Application source, live API, capture, Gateway/RAG and databases remain unchanged. Existing unrelated work is preserved.
- How to test / results:
  - PASS: `node --check .superdesign/tmp/prototype-inline.js` after HTMLParser extraction of the revised inline script.
  - PASS (scripted preview): four columns at 1680x1000 (raw 515px; question 359px; answers 382px each) and 1440x900 (raw 440px; question 306px; answers 326px each); Transcript + expands raw to about 633px at 1680. No horizontal overflow, primary footer remains visible. At 1000x720 all four panels use two rows; answer-only Focus uses two columns at 960x800. Saved screenshots inspected.
  - PASS (scripted preview): View raw highlights original negated source and suspends following; correct/save preserves raw text; splitting into two user-set questions supersedes the old interpretation and disables its stale actions. Wrong question on the unflagged wrong AUTO draft opens the original negation and retains the bad draft plus separate human correction.
  - PASS (scripted preview): pin/clear recent context and direct last-20s draft work without a candidate; new draft preserves earlier/pinned cards. Ambiguous new speech adds Needs review without an automatic answer; a later eligible request creates an additional AUTO draft while the kept answer and original raw words remain.
  - PASS (synthetic flood): after 18 appended bursts, 9 question cards and 8 working drafts were present; original raw context, separate partial tail and pinned answer remained intact, with no active job left at inspection. This is UI stress evidence, not real transcription/detection acceptance.
  - Fixed during review: clipped Clear target control under long labels and a Tailwind outline class collision. Rechecked the corrected controls. Browser reports zero script errors; the preview CDN retains its expected production-use warning.
  - NOT RUN: real audio/STT/detector accuracy, actual Gateway/RAG/evidence, native window/shortcuts/transparency, complete production cancellation/scheduling races, merge/undo/draggable-divider implementation, and exact drag/keyboard selection acceptance. No application build/test run was needed for this design-only revision.

## 2026-10-23 (Sound overlay, persistent level bar and original feature parity)
- User-visible:
  - Added a dedicated Sound button and preferences overlay with system/microphone choice, both device selectors/meters and RMS/peak detail, refresh, start/stop and Done/close. The selected-input level bar remains in the main header when closed and in Focus.
  - Added an explicit Settings entry marking the original separate screen. The actual original application and its Settings/RAG/docs/model/query/benchmark/image/history functionality remain unchanged; the implementation prompt now requires a full feature-parity checklist and preservation of stored data.
  - Replaced the contradictory prompt instruction that moved all metering out of the main screen. Sound open/close must preserve capture, requests and reading state; active-input changes pause AUTO deliberately.
- Internal:
  - Updated prototype, screenshots, design specification/system, proposed ADR 0011, navigation indexes and STATUS. Added desktop and compact Sound previews. All audio levels/devices in this prototype are explicitly simulated.
  - Kept Sound keyboard focus contained, return focus to Sound on close, and prioritize dialog Escape over background query cancellation. Made dialog content scroll internally so its action footer stays reachable in a compact panel.
  - Inventoried actual App/PromptBar/OutputPane/TranscriptPane/SettingsPage capabilities for the prompt, including exact rerun, selected-text editing/reset, preset/custom execution, screenshot shortcut and RAG/benchmark details. A production Settings toast/placeholder is explicitly prohibited.
- How to test / results:
  - PASS: final inline JavaScript extraction plus `node --check .superdesign/tmp/prototype-inline.js`; `git diff --check`.
  - PASS (scripted in-app preview): Sound open/close, initial/contained keyboard focus, Shift+Tab wrapping, focus return, selected source/main meter label follows input, stop transcription retains signal metering, changing active input pauses AUTO and retains four original answer cards.
  - PASS (scripted in-app preview): Escape in Sound closes the dialog and retains the in-flight draft as unreviewed, without a cancelled/stopped request state.
  - PASS: at actual 689x607 panel size, main meter/header and dialog Done/Start-Stop controls fit; at 1440x900 all four columns plus main level bar/Settings entry fit; at 960x800 Focus the main meter and Settings entry remain visible. Temporary viewport overrides were reset. Saved fresh Desk/Focus/Sound screenshots and refreshed the existing user tab without creating another tab.
  - Fixed during review: compact overlay originally extended below the viewport; now only its body scrolls and its action footer stays visible. Removed decorative level gradient that could imply clipping at low signal. Initial favicon 404 fixed with an empty data icon; preview-only Tailwind CDN warning remains.
  - NOT RUN: real hardware/device capture, source discovery/error handling, genuine metering, native shortcuts/transparency, actual full feature-parity acceptance or application build/tests. This iteration changes design artifacts and the implementation handoff only.

## 2026-10-23 (cockpit milestone execution plan and progress ledger)
- User-visible:
  - Added a detailed milestone plan for the cockpit implementation brief and a separate progress Markdown for clean-context resumption.
- Internal:
  - Defined ordered task IDs, file targets, protocol/source/request defaults, ownership and AUTO transition rules, feature-parity checks, and acceptance gates.
  - Required progress updates after each task, check, failure, interruption, and handoff. Added plan/index links without replacing pre-existing design documentation.
  - Application source, runtime contracts, credentials, audio, and persisted data are unchanged. Implementation starts at M00-T01.
- How to test / results:
  - PASS: local document validator found 94 ordered tasks across 12 milestones, all 24 acceptance cases in the plan and progress ledger, 53 valid local links/anchors, and closed code fences. Local prose/requirement review and `git diff --check` passed.
  - NOT RUN: application builds/tests, real audio/STT, Gateway/RAG calls, and native Electron acceptance. These belong to the execution milestones.

## 2026-10-23 (cockpit M00: baseline + deterministic frontend harness)
- User-visible:
  - Added a deterministic frontend test harness (`npm run test` / `npm run test:watch`) using Vitest, jsdom, React Testing Library and user-event. It is fully mocked: no live backend, audio capture, RAG ingestion, or paid Gateway calls.
  - Documented the harness in `README.md` and `frontend/README.md`.
- Internal:
  - Added `frontend/vitest.config.ts` (local config; production build still uses `vite.config.ts`) and `frontend/src/cockpit/__tests__/setup.ts`.
  - Added test-only helpers under `frontend/src/cockpit/__tests__/helpers/`: fake clock, fake WebSocket transport (records outgoing messages and dispatches server events to the right handler), and mocked Gateway/detector. Added test-only synthetic messy-speech fixtures under `frontend/src/cockpit/__tests__/fixtures/`.
  - Added `frontend/src/cockpit/__tests__/app_harness.test.tsx` proving one existing transcript/selection action (finalized row render + Clear Selection/Clear) and one existing Settings action (screenshot-inclusion toggle persisted to `ui-preferences.v1`) through the real `App` seam, plus `helpers.test.ts`.
  - ADR 0011 records the frontend test-tool choice (Vitest/jsdom/RTL/user-event) while remaining Proposed.
- How to test / results:
  - PASS: `cd frontend && npm run test -- --run` → 2 files, 7 tests passed.
  - PASS (baseline): `cd frontend && npm run build`; `cd backend && .venv/bin/python -m unittest discover -s tests` → 37 tests OK; `git diff --check`.
  - FAIL (pre-existing, unrelated, kept as a baseline failure): `cd frontend && npx tsc --noEmit`. Before this milestone it failed with missing `@types/react`/`@types/react-dom` (TS7016/TS7026). Installing those types for React Testing Library removed those errors; the command still fails with 3× `TS2339: Property 'env' does not exist on type 'ImportMeta'` in `App.tsx` (missing `vite/client` types). This remaining failure is unrelated type configuration and is not repaired here; it does not block the harness.
  - NOT RUN: real audio/STT, live WebSocket service, Gateway/RAG calls, native Electron acceptance. These belong to later milestones.

## 2026-10-23 (cockpit M01: v2 contracts before wiring)
- User-visible:
  - No runtime behavior change. Protocol v2 is specified, modelled, and contract-tested only; the current WebSocket contract is unchanged and no v2 message is emitted or accepted yet.
- Internal:
  - Expanded ADR 0011 with contracts C01-C06, the authorized bootstrap extension, and the M00 frontend test-tool note (still Proposed).
  - Added ADR 0012 (protocol v2, single-controller ownership, scoped lifecycle, legacy migration, test tools) and indexed it. ADR 0012 also records the candidate workflow, independent state dimensions, and the M08 event transition tables.
  - Documented the complete proposed v2 surface in `docs/API.md`: envelope/identity fields, capability rollout, every client->server command and server->client event payload, ownership/claim-release rules, epoch invalidation, the five-second acknowledgement timeout and idempotency, stable error codes, and legacy compatibility examples.
  - Added `backend/app/cockpit_models.py` (snake_case dataclasses/enums) and `frontend/src/cockpit/types.ts` (camelCase wire types) covering spans, snapshots, targets, candidate revisions, answers, control state, and commands.
  - Added `backend/app/cockpit_protocol.py` and `frontend/src/cockpit/protocol.ts` pure contract parsers, plus shared fixtures under `contracts/v2/` (5 valid, 6 invalid) and harness tests on both sides.
  - Added `docs/ARCHITECTURE.md` protocol-v2 notes and `docs/INDEX.md` links for ADR 0012 and the shared contracts.
- How to test / results:
  - PASS: `cd backend && .venv/bin/python -m unittest tests.test_cockpit_contracts -v` → 5 tests OK; backend and frontend parse the same `contracts/v2/` fixtures with identical outcomes.
  - PASS: `cd frontend && npm run test -- --run` → 3 files, 22 tests passed (including 15 contract-fixture checks).
  - PASS: `git diff --check`.
  - FAIL (pre-existing, unrelated, unchanged): `cd frontend && npx tsc --noEmit` (3x `TS2339` `import.meta.env`). Not repaired.
  - NOT RUN: any live v2 message, real backend wiring, audio, Gateway/RAG calls, or native Electron acceptance. These belong to M02+.


## 2026-10-26 — M07 question proposals/correction and Gateway audit
- User-visible: bounded optional question suggestions; truthful disabled/waiting/running/empty/failed states, retry, exact source excerpts/View raw, manual creation/target selection and edit/split/merge/dismiss/undo. Wrong question retains the original source/card and creates a linked corrected draft. Human wording stays separate from model interpretation. Source/answer controls and existing Settings workflows remain available.
- Internal: protocol v5 and 23 shared fixtures, one cancellable detector plus latest dirty revision, immutable 200-revision candidate history/leases and compact reconciled command receipts. Structured output/low reasoning through the pooled Gateway HTTP client; endpoint guard prevents a direct-provider route, including overrides loaded from local dotenv at Settings construction. Obsolete compiled OpenAI client artifacts removed. Operator removed old private OpenAI env variables; no secret values displayed.
- Tests run: `cd backend && .venv/bin/python -m unittest discover -s tests` — 198 PASS; `cd frontend && npm run test -- --run` — 146 PASS/10 files; `cd frontend && npm run build` — PASS/303 modules; `npx tsc --noEmit` — same 3 baseline ImportMeta.env errors; `git diff --check` — PASS. Actual local WebSocket and rendered desktop/compact workflows used synthetic transcript/Gateway dependencies and temporary SQLite. No paid inference, hardware audio/STT or native Electron acceptance. [Full evidence/screenshots](notes/2026-10-26-m07-acceptance.md).


## 2026-10-26 (M08 complete: owned FULL AUTO)
- User-visible: explicit Assist/FULL AUTO and pause/readiness/pending controls; automatic unreviewed source-linked drafts, review exclusions, manual takeover, editing/selection holds and deferred publication. Pause preserves active output; Stop/capture/source/clear/ownership transitions retain evidence and disarm as specified. Reconnect stays Assist and reconciles listening controls.
- Internal: pure backend scheduler + AutoService reuse the existing Gateway text answer path and ownership/command lock; one active/newest pending/deferred result, revisioned configuration and no automatic paid retries. v6 contracts/32 fixtures preserve v2–v5 manual formats. Generation outcome remains separate from superseded publication; held candidate labels reconcile after completion. Strict config whitelist rejects private execution-field injection.
- How to test: `cd backend && .venv/bin/python -m unittest discover -s tests -q` — 226 PASS; `cd frontend && npm test -- --run` — 186 PASS; `npm run build` — PASS (304 modules); `npx tsc --noEmit` — same 3 baseline ImportMeta.env errors. Actual local two-client WS, synthetic 81-question flood and rendered desktop/compact AUTO/hold/manual correction/reload checks passed. No paid inference, real audio/STT or native Electron acceptance. [Full evidence](notes/2026-10-26-m08-acceptance.md).


## 2026-10-26 (resolve standalone TypeScript baseline)
- Internal: added Vite's supplied client typings in `frontend/src/vite-env.d.ts`, fixing all three ImportMeta.env errors. Runtime environment parsing remains unchanged. Ignored local agent databases/editor backups when preparing the accumulated cockpit work for publication.
- Verification: `cd frontend && npx tsc --noEmit` PASS (zero errors); `npm run build` PASS (304 modules); `npm test -- --run` PASS (186 tests); `cd backend && .venv/bin/python -m unittest discover -s tests -q` PASS (226 tests). Staged whitespace and local-artifact/credential-pattern checks PASS. No new dependency, protocol or architecture change.
