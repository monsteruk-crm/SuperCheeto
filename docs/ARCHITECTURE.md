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
- `backend/app/transcript.py`: transcript segment storage and context window handling. Since M02 it also records every committed segment as an immutable `SourceRecord` (key `audioEpoch#segmentId`, monotonic `transcriptRevision`), tracks the live partial tail, and rotates the audio epoch on every capture restart.
- `backend/app/source_snapshots.py`: immutable snapshot creation — recent-window freezing at a press-time anchor, exact-selection freezing with validated code-point offsets, pinned moments, capacity limits, and reference-counted garbage collection. Makes no model call.
- `backend/app/assistance.py`: the single control lease, the server-owned `sessionEpoch`, bounded command outcomes for duplicate suppression/reconciliation, request records with one active answer slot, human interaction holds, per-version capability advertisement and wire-version negotiation, plus the v3 frozen-input/timing metadata carried on each request record.
- `backend/app/main.py`: active audio mode/source orchestration, runtime source switching, source-tagged WS broadcasts, protocol v2/v3/v4/v5 command handling, model-readiness preflight before any paid call, and the owned request lifecycle/wire events. It delegates one-answer retrieval/generation orchestration to `answer_service.py`.
- `backend/app/answer_service.py`: one accepted request's local RAG search, evidence provenance, acceptance-relative RAG/Gateway/first-delta timing and direct delta forwarding. Injected runner/store/embedding dependencies keep tests offline; it does not own sockets or construct clients.
- `backend/app/ai_gateway_client.py`: asynchronous transcript-text generation against Vercel AI Gateway (Responses SSE, same-model Chat Completions fallback on pre-content 404), framed stream parsing, completion/error validation, usage and time-to-first-answer-text. Fresh default is `google/gemini-3.8-flash` with supported low reasoning; explicit configured/saved choices remain. See [ADR 0013](adr/0013-stream-transcript-text-answers.md).
- `backend/app/rag_store.py`: local SQLite vector DB ingestion/search for `.txt`, `.md`, `.pdf`, `.docx`.
- `backend/app/benchmark_harness.py`: standardized benchmark instruction and per-test payload formatting.
- `backend/app/model_pricing.py`: model token pricing catalog + environment override for benchmark cost estimation.
- `backend/app/model_roles.py`: role (`answer`/`detector`) and capability readiness. Resolves the effective model and where it came from, the accepted reasoning preference, and the text/image/structured capabilities along with how certain they are. A dated static registry covers the two models this build defaults to; anything else is `unknown`. Rejects an unverified screenshot or detector capability with `unsupported_capability`, a model missing from a catalog this backend read with `unavailable_model`, and records a deprecated alias substitution visibly. No IO.
- `backend/app/ws_server.py`: connection registry with server-assigned `connectionId`, per-connection negotiated `protocolVersion`, shared broadcasts, targeted `send_to` replies, and connect/disconnect lifecycle hooks.
- `backend/app/cockpit_models.py`: protocol v2/v3/v4/v5 dataclasses/enums (source spans, snapshots, targets, candidates, answers, control state, commands, model settings/capabilities, timing blocks). No runtime or IO.
- `backend/app/cockpit_protocol.py`: pure protocol v2/v3/v4/v5 contract parsing/validation that raises stable `ErrorCode`s, including model settings, timing blocks and their clock labels/ordering.
- `frontend/src/`: transcript UI, prompt controls, output pane, and WS client behavior.
- `frontend/src/cockpit/types.ts`: camelCase protocol v2/v3/v4/v5 wire types mirroring the backend models.
- `frontend/src/cockpit/protocol.ts`: pure protocol v2/v3/v4/v5 contract parsing/validation mirroring the backend parser.
- `frontend/src/cockpit/reducer.ts`: request-record reducer that retains records until a definitive status and ignores stale epochs, foreign backend instances, unknown identities, duplicate `eventSeq`, out-of-order timing, timing for terminal records, and late events for cancelled requests. Keeps backend and client timing in separate fields and derives press-to-visible only from two client values.
- `frontend/src/ws.ts`: negotiating WebSocket client — advertises `[4, 3, 2]` in `hello`, adopts the negotiated version, types the send outcome, refuses to queue paid commands while offline, enforces a five-second acknowledgement deadline, reconciles by `commandId` via `get_command_status`, dispatches scoped `answer_timing`, and disposes sockets/reconnect timers without replaying commands.
- `contracts/v2/`, `contracts/v3/`, `contracts/v4/`, `contracts/v5/`: shared valid/invalid contract fixtures parsed by both the backend (`backend/tests/test_cockpit_contracts.py`) and frontend (`frontend/src/cockpit/__tests__/protocol.test.ts`) harnesses. Each directory keeps its own version's rules.
- `frontend/src/components/SettingsPage.tsx`: benchmark test CRUD, image reference registry, and verbose benchmark log rendering.
- `scripts/dev.sh`: local orchestration for backend/frontend process lifecycle.

## Runtime assumptions
- Ubuntu/Linux environment with PulseAudio or PipeWire (Pulse shim) for monitor capture; `pactl` is preferred but source discovery also works with PipeWire-native `pw-dump`.
- Local Python 3.11+ environment for backend dependencies.
- Node.js/npm environment for Electron + Vite frontend.
- `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN`) set in environment or `backend/.env.local`.
- Cloud AI calls (language, embeddings, model discovery) go through Vercel AI Gateway at `https://ai-gateway.vercel.sh/v1`.
- Audio capture and STT remain entirely local; no audio is sent to any cloud service.
- Realtime assistance means streamed text generation from frozen transcript/context. No cloud-audio Live session, ephemeral client provider token, provider WebRTC or persistent provider WebSocket is introduced. The existing reusable Python HTTP client streams deltas through the local owned WebSocket lifecycle. Provider errors/premature EOF fail with partial text preserved; genuine empty output is not replaced by a placeholder. Cockpit rendering is implemented; detector/AUTO remain later milestones.
- RAG embeddings use Gateway embeddings API (`openai/text-embedding-3-small`); vectors persist locally at `RAG_DB_PATH`.
- When switching between monitor/mic while transcribing, backend restarts only capture/transcription loops and reuses the loaded STT model to minimize switch delay.

## Protocol v2 (M02/M03 wired)
- Protocol v2 is specified in [API.md](API.md), [ADR 0011](adr/0011-question-assistance-cockpit.md) and [ADR 0012](adr/0012-cockpit-protocol-and-session-lifecycle.md), and modelled in `backend/app/cockpit_models.py` + `frontend/src/cockpit/types.ts`.
- `backend/app/cockpit_protocol.py` and `frontend/src/cockpit/protocol.ts` validate the shared `contracts/v2/` fixtures.
- Implemented commands: `hello`, `claim_control`, `get_command_status`, `create_snapshot`, `run_context_query`, `run_snapshot_query`, `cancel_answer`, `interaction_state`. Unimplemented v2 commands are rejected with `not_ready` and their capabilities are not advertised.
- Data flow for one manual answer: client sends `run_context_query` with its press-time anchor → server freezes an immutable snapshot from committed source records → `command_ack` + `snapshot_created` + `answer_accepted` → `answer_chunk`* (each with `eventSeq`) → `answer_finished` with the authoritative final text, status, and retrieval evidence.
- Ownership: the first v2 claimant holds the lease; everyone else is read-only for assistance and capture-changing commands. Owner disconnect cancels owned requests, releases the lease, and increments `sessionEpoch`, so the next claimant must renegotiate.
- Scoping: transcript/audio/status/model/RAG/benchmark events stay broadcast; answer chunks, completions, and errors go only to the owning connection.
- Identity: `backendInstanceId` is created per backend process; `audioEpoch` per capture incarnation; `sessionEpoch` per assistance generation. `segmentKey` is `<audioEpoch>#<segmentId>`.
- Legacy `run_query` clients keep working when no controller holds the lease; their requests are scoped to the sending connection for cancellation. `query_response` now precedes the nonterminal `query_state`, so a client cannot drop a record before its final text.
- Snapshots, answer cards, and request records are ephemeral in memory. Persistent preferences, benchmark data, and the RAG SQLite store are unchanged.
- `frontend/src/components/AnswerCard.tsx` renders incremental model text with `react-markdown` + `remark-gfm`. Raw HTML is not enabled; code blocks, lists, tables, headings, links, and inline emphasis stay in React's escaped element tree. See [ADR 0015](adr/0015-safe-markdown-answer-rendering.md).
- Delayed `command_status` events use the same acknowledgement reconciliation path as immediate `command_ack` events. Answer actions stay visibly pending until the server confirms acceptance/rejection; unknown outcomes clear the pending control and show a status warning.

## Protocol v3 (M3bis contract; M04 backend producers wired)
- Protocol v3 is specified in [API.md](API.md) ("Protocol v3") and [ADR 0014](adr/0014-protocol-v3-timing-and-model-readiness.md). It is additive: the v2 contract stays valid, and the server negotiates the highest common version during `hello`.
- Data flow adds two things to the v2 manual answer path: a **preflight** (`model_roles.resolve_model_settings`) that resolves role, effective model, selection source, accepted reasoning and capabilities *before* the snapshot is consumed, and a **scoped timing** channel (`answer_timing`, `timingSeq`) plus `answer_finished.timing`.
- Model capability metadata is a dated static registry, not a live catalog proof: `certainty: "catalog"` means public metadata checked on 2026-10-23, `unknown` means nothing is positively known. A screenshot on an unverified model is rejected (`unsupported_capability`) rather than dropped; a model missing from a catalog this backend actually read is rejected (`unavailable_model`).
- Timing keeps two clock domains apart: backend milliseconds from request acceptance (`server_monotonic`) and client milliseconds (`client_monotonic`). RAG and generation windows/first-delta are produced by `answer_service.py`; missing stages remain `null` and listed in `timing.backend.unavailable`. First-visible time is recorded by the client when streamed Markdown becomes visible in M05.
- `answer_service.py` performs local retrieval and forwards Gateway-compatible answer deltas through the owned request callback. Outcomes distinguish `used`, `no_documents`, `no_matches`, and `failed`; v3 evidence includes file path and stable `docId:chunkIndex` identity.
- The current Desk's exact text selection is converted to source spans in `CockpitDesk.tsx`, retained by `App.tsx`, and frozen as a selection snapshot. Recent answers and pinned moments use the same immutable snapshot store. The browser harness covers the selection offset handoff and pre-terminal card rendering; responsive/native presentation and full manual-action parity are still open in the progress ledger.
- No detector/AUTO capability is advertised, and no new persistence keys or databases are introduced.

## Protocol v4 and manual workbench (M04/M05 complete)

[ADR 0016](adr/0016-manual-targets-and-frozen-reruns.md) defines manual target wording separately from immutable raw source, snapshot leases, server rerun and authoritative `answer_state`/command-result reconciliation. A terminal record retains copied notes/content hashes, screenshot bytes, source, wording, instruction, effective model/reasoning and retrieved evidence. Reruns reference that server record and do not search mutable RAG again. Empty indexes skip embeddings. Working cards are bounded at 50; kept/selected/inspected cards are protected, with explicit rejection if capacity cannot be reclaimed. Eviction/removal releases source and large payload references.

`CockpitDesk.tsx`, `RawTranscript.tsx`, `AnswerCard.tsx` and `PanelDivider.tsx` own the four panels, stable source DOM, conditional editor, explicit modes, human notes and card actions. `cockpit/layout.ts` validates/persists proportions and adjacent dividers; `use_reading_anchor.ts` preserves visible-card offsets. Request records append in stable order. `stream_buffer.ts` batches genuine deltas on an animation frame with a 40ms fallback and flushes before terminal/error/disconnect. The committed visible card records first-display on a frame/visibility checkpoint, separately from receive/terminal times.

Markdown uses React Markdown/GFM, disables raw HTML and suppresses remote image fetches. Electron opens HTTP(S) links externally and rejects navigation/new windows into the preload renderer. Desk/Settings stay mounted to preserve edits while switching pages. Historical cards after ownership/reconnect remain read-only. Screenshot capture uses the existing narrow preload bridge; native behavior is accepted in later M09/M10, not inferred from the renderer harness.

## M06 Sound and telemetry isolation

`audio/meter_store.ts` receives source-labelled `audio_level` events outside App state; only AudioMeter subscribes using useSyncExternalStore. Meter-only timers evaluate client monotonic freshness/clip hold without rerendering raw rows or answer cards. SoundDialog uses the original handlers and a modal focus boundary/inert background; it saves/restores native raw selection and keeps Desk/Settings mounted.

Backend meter lifetimes are independent of transcription and end on controller shutdown. Stream EOF/failure closes capture and reports source-specific unavailable status. AudioCapture tolerates an already-exited process during stop. Device resolution precedes active source invalidation/restart; inactive changes and no-op requests avoid it. Failed discovery leaves acknowledged settings intact. Original Settings behavior/storage is retained and its inputs have associated labels; contextual errors remain visible there. [ADR 0017](adr/0017-sound-monitoring-and-source-reconciliation.md) records the decision and existing-envelope compatibility.

## M07 question side path

```text
local finalized records -> frozen bounded DetectorInput -> Gateway structured-output request
 -> complete output + source provenance validation -> immutable candidate history -> QuestionInbox
human expected-revision mutations ---------------------> candidate history / frozen targets
manual snapshot + target ------------------------------> existing AnswerService -> independent streamed card
Wrong question -> retained original source/card -> linked human target -> explicit corrected draft
```

`QuestionDetector` coalesces finalized revisions with one active task and one dirty flag. Cancellation/source invalidation/human generation checks discard stale interpretations. `QuestionService` owns the bounded ephemeral 200-revision working set and source reference counts; command receipts reconstruct authoritative state for reconciliation. Answers retain independent source leases. No capture/STT or persistent RAG strategy changed. Protocol v5 and Gateway-only endpoint enforcement: [ADR 0018](adr/0018-bounded-question-proposals-and-gateway-routing.md).

## M08 owned automatic execution
```text
new finalized detector proposal + explicit review flags
 -> pure AutoScheduler (armed/config/attempted/newest pending)
 -> AutoService under controller command lock -> existing AnswerService -> retained request
human interaction holds ------------------------> AUTO publication gate -> validated flush/supersede
manual request ---------------------------------> matching AUTO supersession -> same answer slot
```
AUTO state is ephemeral and controller-owned. No arming replay, separate provider session, automatic audio upload or storage migration. Configurations are acknowledged/revisioned and frozen per accepted answer. Hold reasons cover raw selection, target/editors, Settings and configuration acknowledgement; audio capture and manual output continue. One deferred record blocks subsequent AUTO generation until release/discard. The full computed result stays on its bounded protected request, while displayed partials remain stable; generation status survives superseded publication. Existing snapshot/card/candidate bounds and source leases apply. Source/clear/owner lifecycle invalidates and disarms; reconnect remains Assist. v6 and [ADR 0019](adr/0019-owned-full-auto-scheduling.md) define the contract; [M08 evidence](notes/2026-10-26-m08-acceptance.md) defines the synthetic acceptance boundary.

## PR #1 lifecycle and runtime-data correction
The hub owns one shielded disconnect task per socket, shared by failed sends/broadcasts and handler-finally cleanup. Cancellation of the originating answer cannot strand the control lease. Session invalidation finishes cancellation of manual/AUTO work before advancing its epoch. Status reads acknowledge their own command ID separately from the queried result and time out without recursive polling. STT and transcript duplicate filtering require overlapping audio times; source/epoch identities guard the store. Runtime RAG databases and SQLite sidecars are ignored and untracked, with local user bytes preserved. See [ADR 0020](adr/0020-review-lifecycle-and-local-data-safety.md) and [review evidence](notes/2026-10-26-pr1-review-remediation.md).
