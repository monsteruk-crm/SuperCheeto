# Live Helper cockpit execution plan

Date: 25 October 2026. Version: 3. Status: M00–M03, RT01, and M3bis are complete for their recorded scopes. M04 is IN PROGRESS; M04-T01 is complete and M04-T02 remains active. Resume from the companion ledger's exact next action.

Audience: an implementation agent that needs explicit tasks and completion checks.

Repository: `/home/lisophorm/PycharmProjects/PythonProject`.

Requirements: [implementation brief](../prompts/live-helper-cockpit-implementation.md), [design specification](../design/live-helper-cockpit.md), and [bootstrap](../prompts/bootstrap.md).

Visual reference: [interactive HTML](../design/live-helper-cockpit.html), [Desk](../design/live-helper-cockpit.png), [Focus](../design/live-helper-focus.png), [Sound](../design/live-helper-sound.png), and [compact Sound](../design/live-helper-sound-compact.png).

**Mandatory companion file:** [live-helper-cockpit-progress.md](live-helper-cockpit-progress.md). Keep this second Markdown file current after every task, check, failure, interruption, and handoff. A clean-context agent must resume from that file.

## Contents

1. [Execution rules and restart procedure](#execution-rules-and-restart-procedure)
2. [Starting facts and file map](#starting-facts-and-file-map)
3. [Implementation contracts](#implementation-contracts)
4. [Milestone sequence](#milestone-sequence)
5. [M00: establish the baseline](#m00-establish-the-baseline)
6. [M01: specify contracts before wiring](#m01-specify-contracts-before-wiring)
7. [M02: implement immutable source snapshots](#m02-implement-immutable-source-snapshots)
8. [M03: implement owned, versioned transport](#m03-implement-owned-versioned-transport)
9. [M3bis: amend realtime contracts and reliability](#m3bis-amend-realtime-contracts-and-reliability)
10. [M04: implement manual answer records and evidence](#m04-implement-manual-answer-records-and-evidence)
11. [M05: implement the four-panel manual workbench](#m05-implement-the-four-panel-manual-workbench)
12. [M06: implement Sound and preserve Settings](#m06-implement-sound-and-preserve-settings)
13. [M07: implement question proposals and correction](#m07-implement-question-proposals-and-correction)
14. [M08: implement FULL AUTO scheduling](#m08-implement-full-auto-scheduling)
15. [M09: implement Electron controls and native fallbacks](#m09-implement-electron-controls-and-native-fallbacks)
16. [M10: execute integrated acceptance](#m10-execute-integrated-acceptance)
17. [M11: finish documentation and handoff](#m11-finish-documentation-and-handoff)
18. [Acceptance cases](#acceptance-cases)
19. [Commands and completion rules](#commands-and-completion-rules)

## Execution rules and restart procedure

1. Read `AGENTS.md`, `docs/INDEX.md`, and `docs/STATUS.md` first.
2. Read the companion progress file before choosing a task.
3. Read this plan's contract section and the current milestone only.
4. Read the brief and relevant source sections for that milestone.
5. Inspect `git status --short` and the relevant diff before editing.
6. Preserve existing changes, local data, credentials, and design artifacts.
7. Execute milestones in order. Execute numbered tasks in each milestone in order.
8. Keep only one implementation task `IN PROGRESS` in the ledger.
9. Run the task's checks before advancing its status.
10. Record command, working directory, result, and evidence in the ledger.
11. Update `docs/STATUS.md` and the current milestone's `docs/CHANGELOG.md` entry after each behavior-changing task, milestone, and interruption.
12. Update affected API, architecture, README, and ADR documents within the milestone that changes their subject.
13. Set the exact next task ID before yielding or compacting context.
14. Resume the recorded next task. Do not restart completed milestones without evidence of regression.

The brief takes precedence over implementation details proposed here. Record a brief conflict before changing the plan. Use an ADR for a meaningful architectural change. Do not silently reduce required behavior to fit an easier implementation.

Do not implement the prototype's demo buttons, sample devices, simulated meters, canned answers, or preview notices. Do not restore its superseded 70/30 layout or timed answer replacement. Do not replace the existing Settings screen.

**Defer all browser acceptance and live-application testing until the end of the work.** Complete implementation and all suitable deterministic, mocked, and non-live checks first. Then perform browser acceptance tests and any checks that require the running application, real Electron windows, live services, hardware, or real audio together in the final integrated-acceptance phase (M10), after implementation is otherwise complete. The current CLI does not provide a reliable way to exercise the Electron application properly; do not use an intermediate CLI/browser run as evidence that Electron behavior passes. If the available tooling still cannot perform a required live check at M10, record it as BLOCKED or NOT RUN with the reason and evidence; do not substitute a mocked or CLI result or claim acceptance. Any code changes made in response to final live testing require rerunning the affected checks and the relevant final acceptance checks.

The original plan was documentation-only. Since then M00–M03 and the text-streaming amendment have been implemented and synthetic-tested. Pending tasks below do not imply runtime acceptance; see the ledger for current evidence.

### Revision 3: brief alignment and completed-work boundary

This revision planned the revised realtime, model, flow, and reliability requirements. M00–M03 task lists and historical gates remain intact. M3bis is complete for the synthetic contract/type/transport scope; RT01 remains completed streaming-foundation work, not completion of the cockpit integration. M04 is now in progress.

| Revised brief requirement | Work already recorded | Remaining execution home |
| --- | --- | --- |
| Local STT, frozen text, pooled async Gateway SSE, real content deltas | M02 snapshots; RT01 adapter and fresh answer default | M3bis audit/regressions; M04 service integration; M05 visible cards |
| Configurable answer model, role-specific reasoning, screenshot/detector capability checks | RT01 answer default and override preservation; catalog checked on 23 October | M3bis model-readiness contract; M04 acceptance validation; M07 detector evaluation |
| Press/accept, RAG, Gateway, first delta, first display, completion timing | RT01 Gateway-only timing; no proven end-to-end latency | M3bis contract/type/transport additions; M04/M05 collection/display; M10 measured smoke |
| Partial/empty/failure/cancel truth, no duplicate fallback or replay, scoped stale-event rejection | RT01 stream adapter; M03 transport/lifecycle | M3bis regression gate; M04/M05 progressive integration; M08 scheduling; M10 acceptance |
| Direct contextual prose independent of complete detector JSON | M02 direct snapshots; detector not implemented | M04/M05 manual path; M07 bounded side path; M08 automatic drafting |

Changes to previously completed contract/type/transport work belong to **M3bis**, before M04. Do not reopen or renumber M00–M03. Record each delta as already satisfied, missing, or regressed before editing code. The brief's parenthetical M04-T01 resume pointer describes the earlier checkpoint; the companion ledger now resumes M3bis-T01.

## Starting facts and file map

The table records the original pre-M00 baseline, not today's runtime. M02/M03 have already replaced the global/unowned lifecycle and mutable source assumptions below. Recheck touched functions and the ledger at execution time; do not undo completed work.

| Existing path | Starting behavior | Required responsibility |
| --- | --- | --- |
| `backend/app/main.py` | Global `_query_task`; cancellation does not validate task identity; terminal state precedes final response | Integrate owned requests, snapshots, detector, scheduler, and scoped lifecycle |
| `backend/app/ws_server.py` | Handler receives no sender identity; replies broadcast; no disconnect callback | Connection identity, targeted replies, owner lifecycle, and shared telemetry |
| `backend/app/transcript.py` | Mutable segment list, recent duplicate filtering, time-based context builder | Preserve existing filtering; add versioned source references and immutable snapshots |
| `backend/app/stt.py` | Final segment IDs and capture-relative times; separate partial callbacks | Keep local STT; tag each capture incarnation without changing its audio strategy |
| `backend/app/ai_gateway_client.py` | Existing Gateway generation, streaming, model normalization, and fallback | Reuse generation; add bounded structured detection without a second answer call |
| `backend/app/rag_store.py` | Existing SQLite documents/chunks and `RetrievedChunk` metadata | Reuse retrieval and real chunk identity; preserve the database |
| `frontend/src/App.tsx` | Single output string; `executeQuery` clears it; existing Settings navigation and persisted data | Compose workbench; retain existing actions and Settings; store identified answers |
| `frontend/src/ws.ts` | Reconnects; `send` silently drops offline commands | Negotiation, explicit send outcome, scoped dispatch, and reconnect cleanup |
| `frontend/src/types.ts` | Legacy segments, selection ranges, queries, and benchmark types | Add v2 source/snapshot/candidate/answer types without removing legacy types |
| `frontend/src/components/TranscriptPane.tsx` | Sticky selection, finalized rows, partial tail, and following | Stable raw nodes, exact offsets, source inspection, and target actions |
| `frontend/src/components/OutputPane.tsx` | Single streamed response and selection editor | Reuse presentation/actions in identified cards and a conditional target editor |
| `frontend/src/components/PromptBar.tsx` | Audio, model, preset/custom, screenshot, and run controls | Redistribute real controls into session/action bars, Guide, and Sound |
| `frontend/src/components/SettingsPage.tsx` | Working RAG, catalog, benchmark, image, results, and history workflows | Preserve the actual component and handlers; preserve unsaved state across navigation |
| `frontend/src/styles.css` | Existing compact desk styles | Scoped workbench styles; preserve Settings readability |
| `frontend/electron/main.cts`, `preload.cts`, `frontend/src/global.d.ts` | Isolated renderer; screenshot IPC and shortcut; opaque window | Typed answer/window IPC, capability reports, and native fallbacks |

Create focused modules rather than moving orchestration into the large existing controllers:

- Backend: `cockpit_models.py`, `cockpit_protocol.py`, `source_snapshots.py`, `answer_service.py`, `question_detector.py`, and `assistance.py` under `backend/app/`.
- Frontend: `cockpit/types.ts`, `cockpit/reducer.ts`, `cockpit/audio_levels.ts`, and `cockpit/request_builder.ts` under `frontend/src/`.
- Components: `CockpitDesk.tsx`, `SessionBar.tsx`, `ActionBar.tsx`, `SoundDialog.tsx`, `SelectedInputMeter.tsx`, `TargetEditor.tsx`, `QuestionInbox.tsx`, `AnswerCard.tsx`, and `AnswerColumns.tsx` under `frontend/src/components/`.
- Tests: focused `test_cockpit_*.py` modules under `backend/tests/`; frontend tests under `frontend/src/cockpit/__tests__/` and component `__tests__/` directories.

These are planned paths. Create a module when its milestone starts. Record a justified name change in the ledger and update this map.

## Implementation contracts

### C01. Separate raw evidence, intent, execution, and display

- Raw finalized text remains exactly as accepted by the existing STT/store pipeline. Do not add semantic cleanup or question grouping.
- Keep the existing near-duplicate STT suppression. Detector deduplication is a separate operation.
- A snapshot owns copies of text and source metadata. Later transcript changes cannot modify it.
- Candidate wording and human-edited wording are separate from the raw excerpt.
- One generation creates one answer card. Working and kept columns are display locations, not parallel model jobs.
- Separate candidate workflow, generation status, unreviewed label, placement, and supersession metadata. Pinning does not imply correctness.
- Keep snapshots/cards ephemeral initially. Preserve existing persistent preferences, benchmark data, and RAG SQLite storage.

### C02. Identity and source offsets

Define these fields in M01 and implement them consistently on both sides:

| Field | Meaning |
| --- | --- |
| `backendInstanceId` | New UUID at backend startup; rejects messages from an earlier backend incarnation |
| `connectionId` | Server-assigned identity for one socket; never trust a claimed owner ID from a client payload |
| `sessionEpoch` | Server-owned assistance generation; increment on owner loss, transcript clear, and source/capture invalidation |
| `audioEpoch` | New identity for every capture restart; prevents collisions between reused STT IDs/times |
| `segmentKey` | Composite identity containing `audioEpoch` and the original segment ID |
| `transcriptRevision` | Monotonic revision within the backend instance for committed-source changes |
| `snapshotId` | Server-assigned identity of a frozen source copy |
| `candidateId`, `candidateRevision` | Candidate lineage and immutable interpretation version |
| `requestId`, `answerId` | One execution attempt and its answer card; a rerun gets new IDs |
| `commandId` | Client command identity for acknowledgement and duplicate-send suppression |
| `eventSeq` | Monotonic answer-event sequence; rejects duplicate/out-of-order chunk application |

Use half-open character offsets `[start, end)` measured in Unicode code points. Python slicing follows this convention. Convert browser UTF-16 DOM offsets explicitly. Add a test containing an emoji and a combining character.

Every source span includes `segmentKey`, revision, offsets, `t0`, `t1`, source kind, source name, and `audioEpoch`. Validate ranges against actual stored text. Source kind identifies an input, not a person.

The no-target action sends the last finalized anchor visible at the press. The server freezes a window ending at that anchor. It must not include newer text received before processing the command. Use complete intersecting finalized segments because word-level timing is unavailable. Report the actual included range; do not invent word timestamps.

### C03. Proposed v2 command and event surface

Keep the current top-level `type` envelope. Add `protocolVersion: 2` to v2 traffic. Preserve legacy manual envelopes through an adapter.

| Direction | Names | Required behavior |
| --- | --- | --- |
| Client to server | `hello`, `claim_control` | Negotiate capabilities; request the one control lease |
| Server to client | `hello_ack`, `control_state` | Return backend identity, socket identity, epoch, capabilities, and owner/read-only state |
| Client to server | `get_command_status` | Reconcile an unacknowledged command without repeating its execution |
| Server to client | `command_status` | Return accepted/rejected/unknown and existing record IDs for the queried command |
| Client to server | `create_snapshot` | Freeze recent-window or exact-selection context; no model call |
| Client to server | `run_context_query` | Atomically freeze the press-time window and accept one manual request |
| Client to server | `run_snapshot_query` | Submit a frozen selection, pinned moment, candidate, or corrected target |
| Client to server | `cancel_answer` | Cancel only the matching owned request/answer |
| Client to server | `candidate_action` | Create, edit, split, merge, dismiss, undo, or correct with expected revision |
| Client to server | `answer_action`, `context_note_action` | Keep/unkeep/remove cards; create/edit/remove human notes and explicitly include them in future context |
| Client to server | `set_detection`, `set_auto`, `interaction_state` | Explicit detector control, AUTO arm/pause, and human-target/editor holds |
| Server to client | `command_ack`, `snapshot_created`, `candidate_update`, `detector_state`, `assistance_state` | Report acceptance/rejection, immutable records, revisions, and state |
| Server to client | `answer_accepted`, `answer_chunk`, `answer_finished`, `request_error` | Carry the full request identity; finish with a definitive result/status |

In M01, document each payload's required/nullable fields, enum values, validation errors, and one example in `docs/API.md`. Use these names unless a documented source conflict requires a revision.

- V2 requests carry current backend identity, epoch, and `commandId`.
- Answer events carry request, answer, snapshot, backend/epoch identity, and candidate revision when applicable.
- `interaction_state` identifies selected snapshots, open editors, inspected answer IDs, and publication holds. Backend capacity checks respect these protections.
- `answer_finished` includes final text, status, metadata, and final sequence number. It is authoritative even if chunks were missed.
- Status values are `completed`, `cancelled`, `failed`, `empty`, and `superseded`.
- A nonterminal legacy `query_state` cannot discard the request record before `query_response` arrives.
- Use stable error codes for offline/not-ready, incompatible version, not-owner, stale-epoch, stale-revision, invalid-span, capacity, and dependency failures.
- Advertise only implemented capabilities. Do not advertise `full_auto` before M08 passes.

### C04. Ownership, disconnected sends, and legacy compatibility

- The first successful v2 claimant becomes controller. Other connections remain read-only for assistance and capture-changing commands.
- An observer cannot submit/cancel owner jobs, arm AUTO, edit candidates, or change the active source.
- Owner disconnect cancels owned jobs, invalidates pending detection, releases control, and pauses AUTO.
- A second window claims released control explicitly. Do not transfer or arm automation silently.
- Reconnect negotiates again. Retained client cards become historical records; stale events cannot mutate new jobs.
- Legacy manual clients remain usable when no v2 controller holds the lease. Serialize their requests through the same answer slot.
- A legacy client cannot cancel a different connection's job. Return a scoped busy/not-owner error when control is unavailable.
- Shared transcript/audio/status can remain broadcast. Request chunks, completions, and errors use targeted replies.
- `WSClient.send` returns a typed success/rejection result. It never queues paid commands for replay after reconnect.
- Set a send acknowledgement deadline of five seconds. On expiry, show an unknown-acceptance state and reconcile by `commandId`; do not automatically resend.
- Retain command outcomes during the connection's bounded request history. Duplicate `commandId` returns the prior outcome without another paid call.

### C05. Profiles, targets, attachments, and reruns

- The explicit target wins over the recent-context window. Clear target restores recent-context behavior.
- Consume a target only after positive request acceptance. Keep it after offline, validation, or capacity rejection.
- Use visible modes `Preset` and `Custom`. In Preset mode, send its instruction and no hidden custom override.
- In Custom mode, show the effective instruction. Disable submission for an empty custom instruction.
- On initial migration, expose a nonempty stored custom instruction as an active visible Custom mode. Preserve the saved preset for switching back.
- Retain all four existing presets and explicit Run preset / Run custom actions in Guide/profile controls.
- Preserve original source selection and its editable draft separately. Reset restores source wording; edits never rewrite raw text.
- Freeze effective instruction, model, source context, human notes, and explicit image attachment at acceptance.
- Rerun uses the frozen generation inputs, a new request/answer identity, and the original retrieval context. New speech or changed profile must not alter it.
- Never capture a screenshot from a detector/AUTO loop. Only explicit capture or the preserved screenshot shortcut creates an image.
- Keep attachment preview/removal and screenshot preference. Show which image will be included before sending.
- Human notes have explicit include-in-future-context controls, default OFF. Freeze included note IDs, versions, and text separately from evidence.

### C06. Initial bounds and failure policy

Use named settings/constants and tests for these initial defaults. Record an evidence-based adjustment in the ledger and ADR.

| Item | Initial default |
| --- | --- |
| Recent-context choices | 20, 45, or 90 seconds; default 20 |
| Detector lookback | Latest 90 seconds of finalized text from the current audio epoch |
| Detector debounce | 1.0 seconds after committed-source changes; configurable within the proposed 0.8 to 1.2 second starting range |
| Detector concurrency | One active call plus one latest-revision dirty flag |
| Detector output | At most eight proposals per call; 1,500 output tokens; 15-second timeout |
| Detector context | At most 12,000 characters, retaining actual source spans and a visible truncation notice |
| Detection calls | Minimum two seconds between starts; no automatic retry of a failed unchanged revision |
| Generation concurrency | One active answer plus one newest pending AUTO candidate |
| Candidate working set | 200 revisions/records, with explicit capacity/eviction notices |
| Working answers | 50 cards; evict only oldest terminal, unpinned, uninspected cards |
| Kept answers and human notes | 50 items; reject additional keeps visibly rather than discard a kept item |
| Unattached pinned moments | 50 snapshots; reject additional pins visibly at capacity |
| Source snapshot size | 24,000 characters; reject oversized manual input visibly, without silent truncation |
| Meter freshness | Stale after two seconds without a sample for the selected source; disconnected immediately on socket loss |

Snapshots are owned by live candidates, targets, moments, or cards and released when their last reference is removed. New cockpit stores must not accumulate unreferenced objects. Preserve the existing session transcript behavior initially; do not introduce a new transcript retention policy or database in this feature.

Capacity never silently removes active, selected, edited, inspected, pending, or pinned material. If no safe eviction exists, reject a manual creation or pause AUTO with a capacity reason. Keep capture/manual recovery available.

Keep only the same-model API-format compatibility fallback specified in C07. Do not silently select another model. Add no outer paid retry loop. Detector failures, no candidates, retrieval failures, empty answers, and cancelled answers are distinct states.

### C07. Realtime answers from transcript text

Follow [ADR 0013](../adr/0013-stream-transcript-text-answers.md) and the brief's "Realtime text responses" contract. Local audio/STT → frozen text/context → async Gateway SSE → scoped answer chunks → stable answer card. No voice session or cloud audio is required. The initial configurable answer default is `google/gemini-3.8-flash` with supported low reasoning. Preserve explicit environment/saved selections. The foundation adapter already parses framed streams, ignores reasoning, validates completion, retains partial failures, closes on cancel and distinguishes empty output; preserve it during extraction. Do not interpret continuous AUTO as a provider audio session or a request per partial/word.

Reuse the async Python client and HTTP connection pool. Send Responses `stream: true`, with `reasoning: {effort: "low"}` only for the verified Flash default. Its same-model Chat fallback uses `reasoning_effort: "low"` and requests streaming usage. Fallback is allowed only for a Responses HTTP 404 before answer content. Do not retry 401/429/5xx, timeout, malformed/incomplete streams, or partial output. Do not apply reasoning parameters to another model without capability validation.

Require Responses `response.completed` or Chat `finish_reason: stop`. Retain partial text on error, incomplete/malformed frames, premature EOF, length/filter endings, or cancellation. A genuine empty completion remains `empty`. Close the upstream stream on cancellation. Preserve fragmented UTF-8, multiline SSE, per-content-part deduplication, reasoning exclusion, heartbeat/empty/usage-only event handling, and usage collection.

M07's provisional detector candidate is `google/gemini-3.5-flash-lite`. Evaluate bounded structured output and supported low reasoning before enabling it. Parse proposals only after complete output, validate actual source IDs/offsets/revisions, and keep the direct answer independent of detector completion or failure. Recheck `/v1/models` for language text input/output, image input for explicit screenshots, detector structured output, and model-specific reasoning. Surface incompatible, unavailable, or unverified capabilities honestly. Catalog metadata does not prove account access, quality, or latency.

Forward nonempty answer text immediately to its scoped card. M04/M05 allow render batching of at most 50ms. Never buffer a paragraph, complete JSON object, or whole answer before first display. For contextual answers, lead with a concise usable line or necessary clarification. Inferred intent/evidence can arrive separately without blocking prose. Preserve arbitrary code/action-item/custom outputs. All partial and final drafts remain unreviewed. Incoming text cannot rewrite raw evidence, a target editor, kept cards, or viewport anchors.

The RT01 foundation required no local schema change. Additional timing/model metadata now requires M3bis contracts before runtime wiring. Native provider WebSocket sessions remain a later measured optimization with verified support and a separate decision.

### C08. Timing, model-readiness, and reliability evidence

M3bis defines the precise wire fields, compatibility/version rules, types, and fixtures for this contract. M04 collects backend/request data; M05 records first visible content and exposes request details. These additions are pending, not current API guarantees.

| Measurement | Definition and clock boundary |
| --- | --- |
| Press and acceptance | Record client press and backend acceptance with request identity; derive press-to-visible on the same client monotonic clock |
| RAG duration | Backend monotonic retrieval start/end; distinguish skipped, used, no documents/matches, and failed |
| Gateway start and first answer delta | Backend monotonic start to first nonempty answer-content delta; include same-model API fallback overhead; ignore reasoning/heartbeat/usage-only frames |
| First visible text | Client display checkpoint after a nonempty delta reaches the rendered matching card; receiving a socket event alone is insufficient |
| Completion | Backend Gateway duration and client request-to-terminal duration remain distinct; failed/cancelled/empty runs keep their actual outcome |
| STT finalization lag and speech-end-to-useful-visible text | Measure separately with a known sample and aligned source timing in M10; capture-relative segment times alone cannot establish either metric |

Document units, clock origin, nullable/unavailable values, and correlation IDs. Never subtract client and backend monotonic timestamps. Never substitute zero or benchmark TTFT for an unavailable end-to-end measurement. Timing events follow the same owner/request/answer/snapshot/epoch scoping and stale-event rules as content. Timing updates cannot revive a terminal record or clear a newer job.

Freeze effective model, role, profile/instruction, accepted reasoning settings, and explicit screenshot with the request. Preserve user/environment/saved choices and existing Settings/catalog/benchmarks. Record reasoning/usage only when reported; label estimates. Unsupported image input must reject the attachment-bearing request visibly, never silently omit the image. Preflight validation failure must retain the target and avoid a paid call. Catalog checks cannot guarantee account access; a provider access failure after acceptance becomes a scoped failed result without retry or model replacement.

Report sample count, sample length, actual model/profile, reasoning/usage availability, errors, quality mistakes, and correction cases alongside latency. A mocked progressive stream proves integration only. Do not make latency or model-ranking claims from catalog metadata, a model name, or synthetic tests.

## Milestone sequence

| Milestone | Depends on | Reviewable outcome |
| --- | --- | --- |
| M00 | None | Reproducible baseline, parity inventory, deterministic test harness |
| M01 | M00 | Written v2/state/storage contracts and fixtures |
| M02 | M01 | Frozen recent/selected context independent of detection |
| M03 | M02 | Negotiated ownership and reliable scoped request lifecycle |
| M3bis | M03 + RT01 | Amended timing/model contracts, compatible metadata transport, and preserved streaming/lifecycle regressions |
| M04 | M3bis | Manual generation into immutable answer records with truthful evidence and backend timings |
| M05 | M04 | Functional four-panel manual workbench, cards, targets, and resizable layout |
| M06 | M05 | Real Sound overlay/meter and preserved original Settings/data |
| M07 | M06 | Bounded optional detector, candidate operations, and wrong-question recovery |
| M08 | M07 | Backend-owned FULL AUTO with race and lifecycle safeguards |
| M09 | M08 | Typed native controls, shortcuts, pin/Focus, and opaque fallback |
| M10 | M09 | Integrated automated, rendered, live-service, hardware, and native evidence |
| M11 | M10 required cases | Accurate final docs, ADR status, and resumable handoff |

A milestone is complete only when its tasks, required checks, acceptance cases, and documentation updates pass. An optional native transparency limit can remain documented. A missing required hardware/service check prevents claiming full end-to-end completion.

M00 can complete with an identified unrelated baseline failure if feature checks remain runnable. Keep that result FAIL in every later report. Block the affected milestone if the failure prevents its required checks. Do not expand scope to repair unrelated behavior.

## M00: establish the baseline

Entry: implementation has not started.

1. **M00-T01:** Record branch, HEAD, dirty paths, running services, interpreter executable/version, imported dependency paths, Node/npm, and installed Electron versions in the progress file. If dependencies are missing, record the prerequisite and use the existing README setup procedure. Do not delete an existing environment or rewrite its launchers from historical assumptions.
2. **M00-T02:** Inventory every current Desk/Settings action using the source-to-screen table in the brief. Expand the ledger's parity table for additional actions. Record handler, destination, stored keys, and verification method.
3. **M00-T03:** Record persistence boundaries: `ui-preferences.v1`, `benchmark-history.v1`, `benchmark-images.v1`, `benchmark-tests.v1`, and the effective RAG SQLite path. Record existence/shape only; do not print private contents.
4. **M00-T04:** Run the four existing baseline commands in the command section. Record failures separately from later regressions. Do not repair unrelated code.
5. **M00-T05:** Record the frontend test-tool choice in ADR 0011 before adding dependencies. Keep its overall status Proposed. Add frontend deterministic tests using Vitest, jsdom, React Testing Library, and user-event. Choose releases compatible with the installed Node and current Vite. Do not upgrade the application stack. Add `test` and `test:watch` scripts, a local configuration, and documented commands. Keep backend tests on `unittest`.
6. **M00-T06:** Add a fake clock, mocked Gateway/detector, fake WebSocket transport, and synthetic messy-speech fixtures. Keep them test-only. Prove one existing selection action and one existing Settings action through the harness.
7. **M00-T07:** Record the baseline gate and the exact next task. Update STATUS, CHANGELOG, README test commands, and frontend README.

Gate: baseline failures are identified; focused harness tests pass; no real capture, private ingestion, or paid call occurred. The parity inventory covers every row in the brief.

## M01: specify contracts before wiring

Entry: M00 gate recorded.

1. **M01-T01:** Expand ADR 0011 with C01 to C06 and the authorized bootstrap extension. Keep it Proposed during implementation.
2. **M01-T02:** Create the next available ADR for protocol v2, single-controller ownership, scoped lifecycle, legacy migration, and test-tool choices. Use `0012-cockpit-protocol-and-session-lifecycle.md` if that number remains free. Keep it Proposed until M03 validation passes.
3. **M01-T03:** Specify complete command/event payloads from C03 in API.md. Include capability rollout, claim/release rules, epoch invalidation, acknowledgement timeout, idempotency, error codes, and legacy examples.
4. **M01-T04:** Define backend dataclasses/enums and matching frontend types for spans, snapshots, targets, candidate revisions, answers, control state, and commands. Use snake_case internally in Python and the documented camelCase wire format.
5. **M01-T05:** Define candidate workflow and independent generation/publication/interaction states. Write transition tables for the events listed in M08 before creating the scheduler.
6. **M01-T06:** Add valid/invalid contract fixtures and parsers. Cover missing identity, invalid offsets, wrong protocol version, stale revisions, unknown actions, and mismatched candidate/snapshot identity.
7. **M01-T07:** Update ARCHITECTURE and indexes. Record the protocol ADR path and frozen constants in the progress file.

Gate: backend and frontend parse the same fixtures. API examples match types. No AUTO capability is advertised. No live contract has changed without its documentation.

## M02: implement immutable source snapshots

Entry: M01 contracts and fixture checks pass.

1. **M02-T01:** Add backend/audio epochs and globally unambiguous segment keys at the controller boundary. Preserve legacy IDs, timestamps, source labels, and STT duplicate behavior.
2. **M02-T02:** Implement finalized-source revision tracking and immutable snapshot creation in `source_snapshots.py`, integrated with `TranscriptStore`.
3. **M02-T03:** Implement recent-window snapshots from the explicit press-time anchor. Include intersecting complete segments only. Exclude partials by default. Reject an unknown/stale anchor before generation.
4. **M02-T04:** Implement exact-selection snapshots from validated segment offsets. Preserve raw copies, source times, audio epochs, and separate human wording. Freeze an explicitly requested partial as tentative; never use partial-only data for AUTO.
5. **M02-T05:** Implement pin-moment creation without a Gateway call, snapshot references, capacity rejection, and garbage collection of unreferenced snapshots.
6. **M02-T06:** Test 20/45/90-second boundaries, a final arriving after the press, selection across segments, Unicode offsets, no finalized text, source restart, transcript clear, and later store mutation.
7. **M02-T07:** Update API/architecture source semantics, STATUS, CHANGELOG, and the ledger.

Gate: snapshots remain byte-for-byte stable after new finals, partial updates, clear, and source restarts. New source identity does not collide with old cards. Pinning makes zero model calls.

## M03: implement owned, versioned transport

Entry: M02 snapshot checks pass.

1. **M03-T01:** Pass connection context into hub handlers. Add targeted `send_to`, connect/disconnect hooks, and safe failed-send cleanup. Retain broadcast for shared events.
2. **M03-T02:** Implement hello/capability negotiation, the control lease, explicit control claiming, and scoped command rejection. Advertise capabilities incrementally.
3. **M03-T03:** Add `commandId` acknowledgement, duplicate-command handling, request records, event identity, and matching cancellation. Route legacy manual requests through the same ownership rules.
4. **M03-T04:** Add client readiness, typed send rejection, five-second acknowledgement timeout, and command-status reconciliation. Clean up sockets/reconnect timers when disposed. Never replay generation commands on reconnect.
5. **M03-T05:** Add reducer handling that retains request records until definitive completion. Ignore stale epochs, wrong owners, invalid IDs, duplicate event sequences, and late events for cancelled requests.
6. **M03-T06:** Use two actual local WebSocket clients with mocked generation. Test owner/observer behavior, owner disconnect, reconnect, legacy manual compatibility, wrong-request cancellation, and terminal-before-response ordering.
7. **M03-T07:** Test rejected offline sends and lost acknowledgements. Verify no endless spinner and no duplicate paid execution. Update API, ADR status when justified, STATUS, CHANGELOG, and ledger.

Gate: one UI cannot generate or cancel for another owner. All query outcomes are scoped. A lost connection leaves a visible terminal/unknown state and AUTO unarmed.

## M3bis: amend realtime contracts and reliability

Entry: M00–M03 and RT01 retain their recorded COMPLETE status. This is follow-up work for completed foundations. Detector/AUTO stay disabled.

1. **M3bis-T01:** Audit the revised brief against C07/C08, ADRs 0012/0013, API.md, current types/parsers, and the M03/RT01 tests. Record satisfied/missing/regressed deltas. Preserve completed tasks and evidence.
2. **M3bis-T02:** Specify model-readiness contracts for answer and detector roles. Cover overrides, effective reasoning, text/image/structured capabilities, catalog uncertainty, and visible unsupported/unavailable failures. Preserve existing catalog/Settings paths. Keep detector execution in M07.
3. **M3bis-T03:** Specify C08 timing fields and event placement in API.md and the protocol ADR before wiring. Define units, origins, nullable values, first-visible reporting, and legacy compatibility. Bump `protocolVersion` when changing the wire contract, per AGENTS.md. Document capability negotiation and rejection of incompatible clients; preserve the recorded v2 contract and legacy manual adapter.
4. **M3bis-T04:** Extend backend/frontend models, parsers, and shared contract fixtures for the approved metadata. Test absent/unknown measurements, invalid values, model settings, and protocol negotiation. Do not reinterpret historical v2 fixtures as the new contract.
5. **M3bis-T05:** Extend owned request records, scoped metadata serialization, and client reduction for the amended contract. Preserve command acknowledgement, duplicate suppression, no replay, matching cancellation, authoritative terminal state, and final-before-idle legacy ordering. Leave measurement producers/card display to M04/M05.
6. **M3bis-T06:** Run shared-contract, Gateway streaming, two-client transport, and reducer regressions with injected generation/RAG and temporary storage. Include metadata after cancellation, stale epochs, lost acknowledgement, partial/empty/failed streams, and no duplicate paid execution. Assert transport tests cannot construct a live external client. Adapter tests must use mocked HTTP/SSE transport.
7. **M3bis-T07:** Update API/architecture/READMEs/ADRs and indexes for changes actually implemented. Record commands/results in STATUS, CHANGELOG, and the ledger. Hand off to M04-T01 with precise remaining producers/display work.

Targets: `cockpit_models.py`, `cockpit_protocol.py`, `assistance.py`, controller request serialization, frontend `cockpit/types.ts`, `protocol.ts`, `reducer.ts`, `ws.ts`, shared `contracts/`, and their existing tests. Reuse RT01's adapter; repair it only if this audit proves a regression.

Gate: amended contracts and matching parsers/transport pass synthetic checks while M03/RT01 regressions stay green. No detector/AUTO capability is advertised. No first-visible or live-latency result is claimed before M05/M10. This plan revision alone does not complete M3bis.

## M04: implement manual answer records and evidence

Entry: M3bis amended-contract and preserved M03/RT01 regression gates pass. Detector/AUTO remain disabled.

1. **M04-T01:** Extract generation into `answer_service.py`. Preserve C07/ADR 0013's real text-streaming adapter, terminal validation, cancellation, partial/empty handling, explicit model choice, normalization, screenshot input and RAG search. Inject dependencies for tests; do not reintroduce a cloud-audio realtime session or buffered answer.
2. **M04-T02:** Implement atomic `run_context_query` and `run_snapshot_query` acceptance. Validate target/model/instruction/source/capacity before acknowledging. Apply M3bis model-readiness rules: text support, explicit image support, and model-specific reasoning. Reject known unsupported/unavailable choices visibly without switching models or dropping images. Capture/recheck the session epoch around asynchronous supersession, retain/release the source safely on every acceptance outcome, and fail closed if teardown fails. Handle access failures discovered during generation as scoped failures. Store frozen generation inputs and one answer record.
3. **M04-T03:** Stream nonempty chunks immediately into the matching answer record, before completion. Emit definitive final text/status and C08 backend timings through the M3bis contract. Preserve partial text on cancellation/failure. Distinguish empty output from success. Keep the pooled async client and same-model pre-content 404 fallback; add no paid retry loop.
4. **M04-T04:** Return actual retrieval metadata: document ID/path/title, chunk index, exact excerpt, and retrieval outcome. Use `doc_id:chunk_index` as the existing chunk identity. Keep raw-context provenance separate from document evidence.
5. **M04-T05:** Distinguish retrieval `used`, `no_documents`, `no_matches`, and `failed`. Continue with an explicit retrieval-failure notice when general guidance is allowed. Reject invented model citation IDs. Preserve captured evidence if the underlying document is later removed.
6. **M04-T06:** Implement preset/custom precedence, clarification behavior, immutable rerun inputs, and screenshot attachment metadata. Lead contextual prose with a usable line or necessary clarification. Expose inferred intent separately without delaying prose for complete metadata/JSON. Freeze effective reasoning settings as well as model/profile. Do not force arbitrary code/action-item preset output into an answer-only schema.
7. **M04-T07:** Test streamed success before the terminal event, cancellation before/after first chunk with upstream closure, split network/Unicode/SSE frames, heartbeat/empty/usage-only events, failed/incomplete/malformed/truncated streams, genuine empty text, old completion after a new request, exact model/profile/reasoning rerun, capability rejection, no duplicate fallback/retry, no documents, retrieval failure, false citation, and untrusted source instructions. Assert integration tests cannot construct a live external client; use mocked HTTP/SSE in adapter tests. Retain `test_gateway_streaming.py` and the Gateway-to-owned-transport failed/empty regression.
8. **M04-T08:** Update API, architecture, query READMEs, STATUS, CHANGELOG, and ledger.

Gate: one request creates one durable-in-session draft record. Nonempty deltas arrive before terminal completion without detector dependency or full-answer buffering. Backend timing and effective model settings use the M3bis contract. Later speech/profile/RAG changes do not mutate its source or rerun inputs. No unsupported claim of document verification appears.

## M05: implement the four-panel manual workbench

Entry: M04 manual generation cases pass. Use synthetic fixtures for rendered checks.

1. **M05-T01:** Extract cockpit state from benchmark state in App. Replace the single output string with identified answer records. Keep original handlers reachable during the transition.
2. **M05-T02:** Build the four actual panels in order: raw, possible questions, working answers, kept/previous. Show an honest detector-disabled inbox until M07. Build slim session and fixed action bars.
3. **M05-T03:** Implement 31/22/23.5/23.5 starting proportions, Transcript +, and independent scroll. Set minimum column widths to 320/240/240/240px. Use at least 1260px for four columns; use two-by-two below it. Add keyboard/pointer separators and persisted proportions in a new `cockpit-layout.v1` key. Validate corrupt/old values and clamp on resize. Start with 20px answer leads, 13px supporting text, and 15px raw text.
4. **M05-T04:** Preserve finalized raw DOM nodes with stable keys. Keep one partial tail. Implement drag and keyboard selection offsets, pause-follow, incoming count, Resume live, jump latest, and View raw without filtering surrounding text.
5. **M05-T05:** Add Answer last 20/45/90s, Pin this moment, nearby Draft answer / Make question, and a conditional target editor. Make question initially creates a human-worded manual target; M07 adds its inbox lineage. Preserve reset/clear and edited-draft protection. Remove the permanent textarea and duplicated selected-text footer only after parity passes.
6. **M05-T06:** Render compact answer cards with unreviewed/source/intent/status/evidence details, Copy, Keep, remove, cancel, and rerun. Append genuine deltas with render batching at most 50ms. Show a useful contextual lead or clarification before supporting metadata; preserve code/custom output. Implement human-note create/edit/remove and explicit context inclusion. Send keep/remove/inspection state to the backend so capacity and snapshot references remain consistent. Moving a completed card between columns must make zero generation calls. Add explicit capacity/eviction notices.
7. **M05-T07:** Implement reading-anchor protection and new-draft indicators. Never reorder pinned cards, steal focus, scroll away from selection, or replace an earlier card on a new send.
8. **M05-T08:** Wire Guide/profile/custom/model refresh and screenshot capture/preview/removal/preferences to existing handlers. Add C08 press/first-visible/completion checkpoints and request details using the M3bis contract. Show backend RAG/Gateway timings separately from client press-to-display and live-smoke STT/speech measurements. Keep error/model/reasoning/usage/screenshot/RAG metadata truthful when absent.
9. **M05-T09:** Check 1680x1000, 1440x900, and 1000x720; test keyboard separators and persisted layouts. Use a delayed mocked terminal event to prove visible text arrives during generation and the render batch stays within 50ms. Test cancellation before/after display, stale content/timing events, retained partial/empty/failure cards, selection during incoming text, and target consumption only after acknowledgement.
10. **M05-T10:** Update the parity matrix, STATUS, CHANGELOG, architecture, and user-facing manual workflows.

Gate: detector-disabled manual answering works through the real UI/service seam with mocked Gateway. Genuine incremental text becomes visible before terminal completion. No buffered typing simulation passes this gate. All four panels are real; previous answers, editors, raw nodes, and viewport anchors survive streaming, sends, and failures. Request details distinguish timing clock boundaries. Primary controls remain visible without horizontal overflow.

## M06: implement Sound and preserve Settings

Entry: M05 manual workbench checks pass.

1. **M06-T01:** Move real mode/source selectors, quick switch, refresh, Start/Stop, and both source meters into SoundDialog. Opening or closing the dialog sends no capture/source mutation command.
2. **M06-T02:** Keep the selected-input label and meter in the main header, including narrow and Focus modes. Feed both views from `audio_level` source identity, level, RMS, peak, and timestamp.
3. **M06-T03:** Move high-rate levels into an isolated subscription/store or memoized meter subtree. Verify level events do not rerender finalized raw rows or answer cards. Keep monitoring when transcription stops.
4. **M06-T04:** Implement quiet, active, clipping, unavailable, stale, and disconnected meter states. Use normalized PCM peak at least 0.98 for a 500ms clipping warning. Use RMS below 0.001 and peak below 0.005 for quiet; label this as signal level, not voice detection. Measure freshness from browser monotonic receive time. Do not compare backend monotonic `t` with browser wall time. Use backend-acknowledged fallback sources. Handle empty devices and failed refresh.
5. **M06-T05:** Guard active mode/device changes through source invalidation. Pause AUTO, invalidate old detector work, and preserve cards. An inactive selector change only updates that preference. Opening Sound alone must not pause/cancel a job.
6. **M06-T06:** Implement labelled dialog, initial focus, focus trap, Done/close/outside dismissal, Escape priority, and focus return. Block background request shortcuts while a dialog/editor consumes the key.
7. **M06-T07:** Wire explicit Settings navigation to the original SettingsPage and original handlers. Keep the Desk mounted or preserve its exact state. Keep Settings mounted when needed to preserve unsaved instruction/test/image-modal state.
8. **M06-T08:** Exercise every parity row using isolated test data: RAG file/folder types, query settings/catalog, benchmark CRUD/image refs/previews, logs/results/history, and persisted preferences. Use temporary RAG SQLite storage for clear tests; never clear the user's real index.
9. **M06-T09:** Record rendered Sound/Settings results, persistence results, STATUS, CHANGELOG, and any changed source semantics in API/README.

Gate: Sound open/close preserves capture, job, selection, editor, and scroll state. Escape closes Sound without stopping the answer. Original Settings/data workflows pass behavioral checks, not button-presence checks.

## M07: implement question proposals and correction

Entry: M06 parity/Sound gate passes. Keep AUTO capability unavailable until M08.

1. **M07-T01:** Implement backend `question_detector.py` as an optional side path over frozen finalized snapshots. Initially evaluate `google/gemini-3.5-flash-lite` using M3bis role/capability rules. Validate current structured-output and reasoning support before setting low reasoning; report access/capability failure visibly. Default to proposals enabled only after controller negotiation; expose detection disable/retry. No call occurs for a partial or meter update.
2. **M07-T02:** Apply C06 debounce/lookback/token/timeout bounds, one in-flight detector, and latest-revision dirty flag. Retry an unchanged failed revision only on explicit retry. A new finalized revision can schedule a fresh bounded attempt.
3. **M07-T03:** Parse structured candidates only after complete output, with interpreted wording, source spans, completeness/review reasons, and origin. Reject fabricated IDs/ranges, excessive output, stale epochs, and stale human revisions. Keep no-candidate success distinct from detector failure. An answer never waits for this structured output.
4. **M07-T04:** Store overlapping candidates independently of raw text. Use source span/audio epoch/revision lineage for deduplication. Suppress dismissed/superseded exact spans. Allow a genuinely later repeated request with different source identity.
5. **M07-T05:** Implement candidate create/edit/split/merge/dismiss/undo with expected revisions. Editing creates a new immutable revision; split/merge supersede their parents and retain lineage. Late detector output cannot overwrite human wording.
6. **M07-T06:** Build QuestionInbox with every required workflow state, exact excerpts, View raw, target selection, manual creation, and concrete review reasons. Avoid confidence percentages and speaker claims.
7. **M07-T07:** Implement Wrong question on every card, including apparently eligible wrong AUTO fixtures. Keep original source and old answer, supersede the interpretation, and create a linked corrected target/new draft. Label optional future-context notes as human claims.
8. **M07-T08:** Test all detector fixture cases in A14 and correction cases in A15. Include no punctuation, indirect/multipart requests, negation, incomplete referents, false negatives, malicious text, genuine repeats, malformed output, and unsupported structured/reasoning capabilities. Prove a stalled/failed detector cannot delay a direct manual answer. Use mocks here; record real model quality/access only within M10's live limits.
9. **M07-T09:** Update API schemas, detector configuration, STATUS, CHANGELOG, parity evidence, and ledger.

Gate: detector failure/disable/no candidates cannot block recent-context, selection, or user-set answering. Correction preserves evidence and rejects late revisions. Grounding checks claim provenance only.

## M08: implement FULL AUTO scheduling

Entry: M07 detector/correction gate passes. Manual ownership/race gates still pass.

1. **M08-T01:** Implement the M01 state tables and M3bis amendments in backend `assistance.py`. Keep listening, owner/connection, candidate, human interaction, AUTO armed/paused, generation, and publication states independent. AUTO reuses M04's frozen text/SSE answer service, model checks, cancellation, and timing; it creates no provider audio session or alternate retry path.
2. **M08-T02:** Implement explicit per-session AUTO arm/pause. Never persist armed state. Gate on negotiated `full_auto` capability, current controller, and usable source epoch.
3. **M08-T03:** Add one active answer and one newest pending eligible detected candidate. Replacing pending work returns the earlier candidate to the visible unanswered state. It never deletes it or cancels the active stream.
4. **M08-T04:** Route incomplete, conflicting, negated, unsupported, and ambiguous proposals to review. Every accepted AUTO answer remains unreviewed. User-created/edited targets require an explicit manual request.
5. **M08-T05:** Implement manual priority and interaction holds. Selection, target creation, or editing blocks new automatic targeting/publication. A manual send supersedes active AUTO execution through matching cancellation. Capture continues.
6. **M08-T06:** If an AUTO result completes during a hold, retain it in a deferred publication record. Revalidate epoch/candidate revision on release. Mark stale results superseded; never publish them as current.
7. **M08-T07:** Add the transition rules below. Test each rule with a fake clock and delayed completion before enabling the UI toggle.
8. **M08-T08:** Wire Assist/FULL AUTO, pause reasons, pending state, and new-draft badges. Advertise `full_auto` only now. No normal eligible automatic request needs a manual answer click.
9. **M08-T09:** Run race cases A16/A17 and a sustained synthetic word flood. Verify concurrency/call counts and retained reading anchors. Update API, architecture, ADR decisions, STATUS, CHANGELOG, and ledger.

Required transitions:

| Event | Execution effect | Required retained state |
| --- | --- | --- |
| New eligible candidate, idle and armed | Start one AUTO answer | Existing cards and inbox |
| New eligible candidate, answer busy | Replace newest pending slot only | Earlier unanswered candidates remain inspectable |
| Manual selection/editor/target | Hold AUTO targeting/publication | Capture, selection, current cards |
| Manual send | Supersede matching AUTO work; start accepted manual request | Partial old card, original source, revision lineage |
| Pause AUTO | Clear pending execution; allow current answer to finish | Transcription and all cards |
| Stop answer | Cancel matching job; suppress same-revision retry; pause AUTO when automated | Partial answer and source |
| Stop listening | Stop capture/detection; clear pending AUTO; pause AUTO | Prior answers and snapshots |
| Active source/mode change | New audio/assistance epoch; cancel stale automatic work; pause AUTO | Old answer provenance |
| Transcript clear | Clear live raw/candidate execution state; invalidate epoch; pause AUTO | Explicitly kept cards and their source copies |
| Owner loss/disconnect/backend restart | Cancel owned work; invalidate pending; pause AUTO | Usable historical cards in the client |
| Reconnect/control claim | Negotiate capabilities; remain in Assist | Retained historical records; no replay |
| Candidate edit/split/merge/dismiss | Invalidate pending/active old automatic revision | Old raw evidence and superseded records |

Gate: all transitions pass deterministic tests. Two windows cannot double-generate. A cancelled candidate never immediately restarts. A false eligible answer remains source-linked and correctable.

## M09: implement Electron controls and native fallbacks

Entry: M08 scheduler gates pass; opaque cockpit remains functional.

1. **M09-T01:** Record the installed Electron version and Ubuntu display/compositor details. Check official Electron documentation for that version before choosing native options.
2. **M09-T02:** Add typed IPC for answer shortcut dispatch, capability/registration status, always-on-top pin, and Focus/window state. Validate payloads. Preserve context isolation, disabled Node integration, and packaged CSP.
3. **M09-T03:** Register `CommandOrControl+Alt+Enter`; retain `CommandOrControl+Alt+C`. Surface registration failure and retain visible/button and focused-keyboard fallbacks. Register no global plain Escape.
4. **M09-T04:** Route the shortcut through the same target/request builder as the button. Respect modal/editor precedence and readiness. Prevent duplicate delivery from DOM and native handlers.
5. **M09-T05:** Implement Pin window and answer-only two-column Focus around 900px wide. Keep Pin window distinct from Keep answer and Pin this moment. Preserve cards, layout, source meter, Settings access, and return to the full workbench.
6. **M09-T06:** Implement optional background translucency with opaque glyphs/cards and an opaque toggle. Start near 93% peripheral alpha and 98.5% answer alpha. Do not use whole-window opacity or claim CSS blur as native blur.
7. **M09-T07:** Prefer the existing opaque window if native transparency conflicts with resize/Wayland. Use a separate optional Focus window only after state sharing and single-owner tests pass. Do not upgrade Electron silently.
8. **M09-T08:** Verify native shortcut from another application, registration-failure fallback, pin/Focus, resizing/restore, and optional transparency over another app with DevTools closed. Record exact unavailable cases. Update native support docs and ledger.

Gate: shortcut/button behavior shares one execution path; screenshot shortcut still works. Opaque Desk, pin, and Focus are functional. Optional native transparency has evidence or a precise documented unsupported boundary.

## M10: execute integrated acceptance

Entry: M09 functional gates pass. All earlier required regressions pass again after the last implementation change.

1. **M10-T01:** Run the full automated command set. Resolve introduced failures. Keep unrelated baseline failures separately identified with their unchanged evidence. This is the final pre-live gate; finish implementation and automated fixes before proceeding to live acceptance.
2. **M10-T02:** Exercise A01 to A17, A21 to A23, and A25 to A28 through rendered production components and the real local WebSocket service, using mocked external dependencies first. Prove a nonempty answer is visibly rendered before a delayed terminal event, including partial failure and cancellation cases. Keep these automated/mocked checks distinct from browser and live-app acceptance.
3. **M10-T03:** Execute the full parity matrix in isolated data storage. Verify navigation away/back and application reload. Compare stored key counts/metadata without exposing personal content.
4. **M10-T04:** Capture Desk at 1680x1000, 1440x900, and 1000x720; Focus near 960x800; Sound at desktop and compact sizes. Test pointer/keyboard selection and divider resizing during incoming text. Test 125% and 150% text zoom. These are live-application checks and must be performed only now, after implementation and pre-live automated checks are complete.
5. **M10-T05:** Run A24 with a clearly identified short nonpersonal audio sample when hardware and credentials are available. Record real versus synthetic boundaries. Do not replace missing live evidence with mocked PASS results. This live/hardware check is end-of-work only.
6. **M10-T06:** Measure C08 checkpoints within the same bounded smoke. Record sample count/length, actual answer/detector models, effective profile/reasoning, press/accept, RAG, Gateway TTFT, first visible text, completion, STT finalization lag, speech-end-to-first-useful-visible text, detector/answer starts, cancellations, and reported usage/cost. Keep clock domains separate and unavailable metrics explicit. Record semantic mistakes, clarification quality, and correction steps. Do not rank models from this small smoke or replace live results with benchmark/mock timing. This live-service/model measurement is end-of-work only.
7. **M10-T07:** Execute browser acceptance and A18/A19 in actual Electron. Execute optional A20 only where native transparency is supported. Check dev and production file-loaded launch paths with DevTools closed for native checks. The current CLI is not a reliable Electron test path; use an appropriate real Electron/browser test path for these acceptance checks. If none is available, mark the relevant cases BLOCKED or NOT RUN and state why.
8. **M10-T08:** Finish the acceptance and parity tables with evidence paths, commands, and PASS/FAIL/BLOCKED/NOT RUN. Fix required failures and rerun affected checks. If any fix follows live testing, rerun the affected pre-live checks and relevant live acceptance checks before finalizing the tables.

Live smoke bounds: use a sample of at most 90 seconds. Stop after one successful manual draft and one successful eligible AUTO draft. Limit detector calls to three. Disable AUTO/detection immediately afterward. Use at most one model/test/repeat for a real benchmark smoke. Do not add automatic paid retries or ingest private files. Missing credentials/device access is a recorded blocker, not permission to edit secrets.

Gate: every required acceptance case has current evidence. Synthetic, live-AI, real audio, and native results are explicitly separate. Required blocked/not-run cases remain open and prevent an end-to-end completion claim.

## M11: finish documentation and handoff

Entry: M10 required acceptance cases pass. Optional A20 can have a documented native limit.

1. **M11-T01:** Align README, frontend/backend READMEs, API, architecture, configuration examples, and storage documentation with actual implemented behavior. Add no transcript database.
2. **M11-T02:** Mark ADR 0011 Accepted only when its required implemented decisions have matching acceptance evidence. Record any optional native boundary. Update the protocol ADR and ADR index accurately.
3. **M11-T03:** Update STATUS with working behavior, remaining issues, and next three priorities. Append exact checks/results to CHANGELOG. Update indexes for every new document/evidence note.
4. **M11-T04:** Complete the progress file with final HEAD/worktree state, files changed, command results, evidence, residual risks, service cleanup, and next task or `NONE`.
5. **M11-T05:** Perform the clean-context audit below and run `git diff --check`. Produce a concise user handoff. Do not create a commit or publish changes unless requested.

Clean-context audit: a new agent can locate authority, identify the exact next task, find the latest evidence, understand blockers, and continue without reading chat history. Failed acceptance must remain visible. Do not set the project complete because a build passes.

## Acceptance cases

Copy these IDs into the companion ledger. Keep result/evidence there so this plan stays stable.

| ID | Given / when | Required result | First gate |
| --- | --- | --- | --- |
| A01 | Offline send, lost acknowledgement, duplicate command, late chunk/terminal/error | Explicit state; no replay/duplicate call; only matching record changes | M03 |
| A02 | Press 20/45/90s while finals continue; mutate/clear/restart later | Press-time immutable source; no detector dependency; honest segment boundaries | M02/M04 |
| A03 | Drag/keyboard selection, edit/reset/clear, Pin moment, missing question | Same usable manual paths; raw evidence preserved; pin makes no call | M05/M07 |
| A04 | Success, stop, pre-stream failure, empty output, rerun after new speech | Stable separate cards; partial retained; exact inputs reused with new IDs | M04/M05 |
| A05 | No docs, no matches, retrieval error, real retrieved chunk, false citation | Distinct truthful metadata; actual evidence only; no fake verification | M04 |
| A06 | Saved custom instruction plus preset; mode switch; model change; screenshot | Visible deterministic effective input; frozen metadata; attachment preview/removal | M05 |
| A07 | Required viewport sizes, zoom, pointer/keyboard divider, Transcript + | Four or two-by-two useful panels; footer/meter accessible; saved layout restored | M05/M10 |
| A08 | Many drafts, pin/inspect/select old card, capacity reached | Stable anchors and kept cards; new-draft notice; bounded stores; explicit eviction/rejection | M05/M08 |
| A09 | Sound open/close during answer; Escape; stop listening; device change/error | No accidental cancel; focus restored; main meter stays; telemetry honest; AUTO pauses on active source change | M06 |
| A10 | Enter original Settings, ingest/list/refresh/clear temporary RAG, catalog/query settings | Original handlers work; Desk/Settings unsaved state retained; no user-data deletion | M06 |
| A11 | Benchmark test CRUD; missing image ref; image upload/replace/delete/full preview | Original validation, IDs, and persisted data survive | M06 |
| A12 | Benchmark run/logs/progress/results/latest tooltips/history/duplicate completion | Existing fields, score semantics, de-duplication, and clear scope preserved | M06/M10 |
| A13 | Navigate/restart with existing preferences/tests/history/images/RAG | No reset; same keys/data; new layout key isolated; AUTO not persisted | M06/M08 |
| A14 | Messy, indirect, multipart, incomplete, repeated, negated, injection/malformed/stale detector input | Fallible grounded proposals; no regex-only detection; bounded calls; raw/manual path intact | M07 |
| A15 | Edit/split/merge/dismiss/undo; correct an unflagged wrong draft during late detection | Original evidence/card retained; revisions linked; stale work blocked; human claims labelled | M07/M08 |
| A16 | AUTO armed; active plus several eligible candidates; manual hold/send/stop/pause | One active plus newest pending; inbox retained; manual priority; no immediate retry | M08 |
| A17 | Two sockets; owner loss; source/reset/clear/reconnect; repeated STT IDs | No duplicate automation or cross-cancel; epoch isolation; explicit re-arm | M03/M08 |
| A18 | Actual global shortcut from another app; registration refusal; screenshot shortcut | Correct single action; honest registration status; usable fallback; no global Escape | M09/M10 |
| A19 | Actual Electron pin, Focus, resize/minimize/restore, return to Desk | Functional opaque baseline; state and meter retained; window controls usable | M09/M10 |
| A20 | Optional transparency over another app, DevTools closed, actual compositor | Readable opaque text; supported behavior measured or precise opaque-fallback boundary | M09/M10, optional |
| A21 | Untrusted transcript/docs/screen text; optional screenshot; IPC mutation attempt | Content never becomes control instructions; local audio/STT remain local; narrow IPC/CSP preserved | M04/M09/M10 |
| A22 | Sustained synthetic flood and bounded real sample | No meter-driven calls/reflows; concurrency bounds hold; measured latency/call counts stated | M08/M10 |
| A23 | Dev launch and production file-loaded Electron build | No blank window, missing assets, runtime exceptions, or packaged security regression | M09/M10 |
| A24 | Real short audio through STT, direct answer, detector, AUTO, and synthetic-document RAG | Measured end-to-end draft and recovery; genuine level/source data; no mocked claim | M10 |
| A25 | Fragmented network/Unicode/SSE, heartbeat/usage-only events, delayed terminal, failure or cancel before/after content | Genuine text visible before terminal; render batch ≤50ms; no reasoning/duplicates; partial retained; empty remains empty; upstream closes | M3bis/M04/M05 |
| A26 | Fresh default, saved/environment override, unsupported image/structured/reasoning capability, unavailable model | Required role validated; effective settings frozen; explicit failure; no dropped image, model swap, or paid retry | M3bis/M04/M07 |
| A27 | Press through RAG/Gateway/delta/display/completion; missing metrics; stale timing event | Scoped nullable timings with documented clocks; first display differs from receive; no cross-clock subtraction or revived terminal job | M3bis/M04/M05/M10 |
| A28 | Detector stalled/disabled/empty/malformed while direct answer is requested | Direct frozen-text answer streams independently; detector parses complete bounded output; one answer job; no partial/meter-driven calls | M04/M05/M07/M08 |

Use temporary .txt/.md/.pdf/.docx fixtures for RAG format checks. A rendered test with a mocked Gateway validates wiring, not real detector quality, real embeddings, native shortcuts, or hardware capture.

## Commands and completion rules

Run each command from the stated directory. Record the actual command and result, including failures and substitutions.

Existing mandatory commands:

```sh
# Repository root
git status --short
git rev-parse --short HEAD
git diff --check

# frontend/
npx tsc --noEmit
npm run build

# backend/
.venv/bin/python -m unittest discover -s tests
```

Inspect runtime identity before tests:

```sh
# Repository root
backend/.venv/bin/python -c "import sys; print(sys.executable); print(sys.version)"
backend/.venv/bin/python -c "import faster_whisper, websockets; print(faster_whisper.__file__); print(websockets.__file__)"
node --version
npm --version

# frontend/, after confirming node_modules exists
node -p "require('electron/package.json').version"
```

Commands created in M00, unavailable until that task completes:

```sh
# frontend/
npm run test -- --run
npm run test:watch

# backend/, once the named modules exist
.venv/bin/python -m unittest discover -s tests -p 'test_cockpit_*.py'
```

Use `./scripts/dev.sh` and `./scripts/prod.sh` only after inspecting their process and data behavior. Reuse already-running services when suitable. Stop only processes started by this execution. Record port/PID/log locations in the ledger.

`npm run lint` currently prints a placeholder. It is not a validation result. A TypeScript check/build is not rendered acceptance. A mocked detector is not semantic detection acceptance. A DOM keyboard test is not native shortcut acceptance.

At each task boundary, update the second Markdown with:

1. Task ID, result, and files changed.
2. Checks run with PASS/FAIL/BLOCKED/NOT RUN and evidence.
3. Any decision or deviation with its ADR/plan pointer.
4. Remaining blocker, if present, and work that can continue independently.
5. Exact next task and prerequisite.

At completion, report implemented behavior, relevant changed paths, checks, and remaining measured limitations. Leave implementation incomplete when required live/hardware/native evidence is missing. Keep the ledger usable even when execution stops early.
