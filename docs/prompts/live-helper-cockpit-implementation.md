# Codex implementation prompt: Live Helper cockpit

Implement the approved UX direction described below in `/home/lisophorm/PycharmProjects/PythonProject`. Work through the stages to a working end-to-end result; do not stop at a visual mockup. The user selected a dark translucent workbench and BOTH one-press contextual answering and continuous FULL AUTO. The latest revision explicitly rejects the original large 70/30 answer/transcript design and any assumption that the detector reliably divides raw speech into questions.

## Authority and starting state

Read `AGENTS.md`, `docs/INDEX.md`, `docs/STATUS.md`, the execution plan/progress ledger, then the design and ADRs 0011–0013. Inspect Git status/diffs before editing. Preserve all unrelated changes, including pre-existing STATUS/CHANGELOG edits and `.mcp_memory/`. Do not reset the worktree. Inspect relevant source before relying on this prompt's snapshot. M00–M03 are complete; the streaming foundation amendment below is implemented and synthetic-tested. Resume at the ledger's next task (currently M04-T01), rather than rebuilding completed transport/snapshot work.

Use `docs/design/live-helper-cockpit.html` and its PNGs as the visual and behavioral reference. Its demo scenario controls, simulated meters/example audio devices, fixed example answers, and preview notices are scaffolding; never ship them into production. The prototype simulates behavior and is not evidence that native overlays or question detection work. The design canvas and preview links are in the design specification.

Keep the Python backend + React/Electron app, local audio capture/local faster-whisper, localhost WebSocket, Gateway language/embedding calls, and existing RAG/preset/custom-prompt functionality. Preserve manual text selection and run-on-selection required by `docs/prompts/bootstrap.md`. Record the authorized extension to latest-question detection/FULL AUTO in ADR 0011 before changing the contract; keep it Proposed until the relevant decisions are implemented and checked. Preserve Settings and its benchmark/image/RAG workflows.

## Product outcome

The operator sees FOUR actual columns: raw transcript, possible questions, working answers, kept/previous answers. Two columns contain answer cards; this is neither one stretched answer nor two model calls for every question. The raw stream gets a generous full-height reading surface. AI interpretation is optional and fallible, and correcting a mistake is a primary workflow.

With no target, ONE press snapshots the most recent raw time window and asks for a cautious contextual draft. The request can succeed or ask for clarification even if the question detector misses everything. FULL AUTO can draft new eligible proposals while every draft remains visibly unreviewed and source-linked. No answers are automatically spoken, sent, or injected into another application.

## Realtime text responses — required implementation contract

The user clarified that we parse a transcription. Keep audio capture and faster-whisper local. Realtime here means real incremental **text** generation into the matching answer card. The suggested Gemini Live model can take text, but its voice-session API is not required for this workflow. Do not replace local STT with cloud audio or use a realtime token/WebRTC example as a text-generation implementation. Follow [ADR 0013](../adr/0013-stream-transcript-text-answers.md).

- Initial answer model: `google/gemini-3.8-flash`, with supported low reasoning. This is a configurable starting choice, not measured proof of best speed or accuracy. The full public Gateway catalog was checked on 23 October 2026. Preserve `VERCEL_MODEL`, saved model preferences and explicit model selection. Never edit private environment files or wipe preferences to enforce a default.
- Use the existing async Python Gateway client and reusable HTTP connection pool. Request `/v1/responses` with `stream: true`; its same-model Chat Completions fallback is only for a Responses HTTP 404 before any answer text. Responses uses `reasoning: {effort: "low"}`; Chat Completions uses `reasoning_effort: "low"`. These defaults apply only to the verified Flash model; validate another model's current capabilities/accepted values before adding parameters. No automatic switch to a different model or paid retry after a partial/failure/timeout/rate limit.
- Retain the implemented SSE framing, fragmented UTF-8 handling, per-content-part deduplication, reasoning exclusion, cancellation/stream closure, terminal validation and usage collection. A Responses answer needs `response.completed`; a Chat answer needs successful `finish_reason: stop`. Error/incomplete/malformed/premature-EOF/length/filter endings must fail visibly with partial text retained. A genuine empty completion stays empty. The adapter now implements these behaviors; preserve its regression tests when extracting the service.
- Forward nonempty content immediately as scoped `answer_chunk`s. Keep one stream bound to its immutable snapshot, effective model/instruction and request/answer identities. Append into that card without changing the raw transcript, target editor, kept cards or viewport anchor. A small bounded render batch (at most 50ms) is allowed; never wait for a whole paragraph, full JSON answer or completion before first display. Do not simulate typing after a buffered response.
- For contextual answering, start with a concise usable line or a necessary clarification, then supporting detail. Inferred intent and evidence can arrive separately without blocking prose; preserve arbitrary code/action-item/custom outputs. Reasoning tokens/thinking are not answer text. All streamed/final content stays unreviewed, including apparently certain AUTO output.
- Keep question detection independent of answering. Initially evaluate `google/gemini-3.5-flash-lite` with supported low reasoning for bounded schema-constrained detection in M07; this is not an implemented detector. Parse/validate structured proposals only after complete output, with real source IDs/offsets and existing debounce/queue bounds. The direct raw-context answer path must not wait for this detector. There is no model call per word, partial or audio-level tick.
- Recheck `/v1/models`: require language text input/output for answers, image input for an explicit screenshot, structured-output support for the detector. Public metadata does not prove account access. Surface unsupported/unavailable models rather than silently dropping screenshots, swapping models or claiming success. Preserve Settings catalog, benchmarks, RAG, presets and existing data.
- Add timing to the M04/M05 request-details path using documented contracts: press/accept time, RAG time, Gateway start, first nonempty answer delta, first visible text and completion. Keep Gateway TTFT distinct from speech-end-to-visible-answer and STT finalization lag. Current client/benchmark timing is not end-to-end latency. Record sample count, actual model/profile, reasoning/usage when reported, errors and quality/correction cases. No guaranteed latency claim from a model name or mock test; keep the existing bounded live-smoke limits.
- Verify progressive delivery BEFORE the terminal event; cancellation before/after first content; split network/Unicode/SSE frames; heartbeat/empty/usage-only events; errors after partial text; no duplicate fallback/retry; empty completions; and stale request events. M04/M05/M07/M10 gates remain required. Native provider WebSocket sessions are a later measured optimization only if supported and beneficial; the local app WebSocket does not imply a provider voice session.

## Stage 1: four-column workbench and raw-context action

Build the real Desk from the revised HTML/PNG reference, not the old 70/30 layout:

- Left to right: full-height RAW transcript, Possible questions inbox, Working answers, Kept & previous. Balanced prototype grid is roughly 31% / 22% / 23.5% / 23.5%; Transcript + widens the first column. Treat those as starting proportions, not a fixed optimum. Production needs accessible resizable dividers with minimum widths and persisted preference.
- Use compact answer cards at natural content heights with independent scroll columns. Show current plus previous/pinned answers simultaneously. Card identity/position and reading anchors survive incoming data. Do not leave half a giant pane empty or erase old answers at the next send. There are no timed 8-second forced replacements or Show next countdowns in this revision.
- Above 1260px, four useful columns; at narrower desktop sizes use two rows of two panels rather than unreadably narrow tracks. Keep primary controls visible at 1440x900, 1680x1000 and 1000x720. Optional Focus is an answer-only two-column view around 900px wide; preserve state and access back to all four panels.
- Slim session bar: connection/listening/input, an ALWAYS-VISIBLE selected-input level bar, explicit Sound button, visible profile/custom override, Assist or FULL AUTO, layout/focus, separate Settings navigation and quick controls. Fixed action bar: Answer last 20s (proposed Ctrl+Alt+Enter), explicit current target/Clear, 20/45/90s window, job state, screen attachment and Guide. During a request the primary position becomes Stop answer.
- No permanent selected-text textarea or duplicated selected-text footer. Detailed audio devices and per-source diagnostics belong in the Sound overlay. The selected-input level bar MUST remain visible in the main header, including Focus mode and while the overlay is closed. Model/preset/custom controls remain accessible through the profile/Guide/Settings routes; destructive clear actions remain available with their existing scope. Keep all existing functionality accessible and preserve Settings/RAG/benchmarks/images.
- Useful text size and zoom: approximately 19–21px answer lead, 12–14px supporting detail and 14–15px raw text. Small system monospace is for times/keys only. Fully opaque text/cards and subtle peripheral alpha. No green verified/correct indicator, fabricated confidence percentages, stock photos or invented logo.

## Preserve the original features and second screen — required

This is a redesign/extension, not permission to delete or replace existing capabilities with placeholders. Inspect the current Desk, SettingsPage, App handlers, persisted keys and protocol before changing them, and maintain a feature-parity checklist. Keep the existing separate Settings screen and wire an explicit Settings entry to App's existing activePage navigation; Sound preferences is a temporary overlay on the Desk, not a replacement for that second screen. Reuse SettingsPage and its working RAG/model/benchmark flows. Do not recreate a reduced settings screen or silently reset state/data while navigating.

| Existing capability | Required destination/behavior |
| --- | --- |
| Audio mode/source selection, quick system/mic switch, separate source selectors, discovery refresh, start/stop, both meters | Sound overlay; selected source plus its live level always remain on the main Desk/Focus header |
| Exact transcript selection/time range, editable pre-send text, reset to original selection, clear selection, pause/resume following, jump latest, clear transcript | Raw panel, nearby target editor/actions and scoped menu; retain manual functions while adding optional question assistance |
| Model selection/refresh/catalog, all existing presets, Run preset and Run custom, editable custom instruction | Visible profile chooser/Guide and the existing Settings routes; keep all supported outputs, including code/action-item presets; no answer-only reduction |
| Streamed responses, cancel, exact rerun/Do it again, selected-text Answer, error/status display, latency/model/screenshot and RAG metadata | Answer cards and expandable request details/actions, preserving request/source identity |
| Screenshot capture, global capture shortcut, preview/removal and include-in-query preference | Explicit Desk attachment actions plus existing Query Settings; preserve the existing Ctrl/Command+Alt+C shortcut and screenshot behavior |
| Local RAG file/folder ingestion (.txt/.md/.pdf/.docx), documents listing with metadata, refresh, clear and ingestion/retrieval notices/errors | ORIGINAL separate Settings screen, wired to existing actions/store/retrieval; no mock ingestion or unannounced persistence change |
| Query Settings and Model Catalog metadata/refresh | ORIGINAL Settings screen |
| Benchmark harness instruction, model multi-select, repeats, test create/update/delete and image refs/missing-ref validation | ORIGINAL Settings screen; preserve runner semantics and validation |
| Image registry upload/replace/delete, reference IDs, preview/full-size image modal | ORIGINAL Settings screen |
| Live benchmark progress/logs, latest-per-model results/tooltips, TTFT/TTC/latency/usage/cost/quality/modality/reliability metadata, history/clear | ORIGINAL Settings screen; retain all existing reported fields and behavior |
| Persisted Desk preferences, benchmark tests/history/images and de-duplication, existing local RAG SQLite data | Keep existing keys/data or provide a lossless explicit migration; no wipe/reset as a styling shortcut |

The list is grounded in the current source, not a limit: preserve any further existing supported action you discover. Removing a duplicated visual summary is allowed only when its information/actions remain available elsewhere. A visible Settings button that only shows a toast is acceptable in this design prototype, but is NEVER acceptable as the production implementation.

### Sound overlay and persistent level bar

- Add a dedicated labelled Sound button in the main header. It opens Sound preferences as an in-app overlay/dialog above the current Desk. Keep four-panel content mounted and listening, current requests, selection/editors, reading positions and stored preferences intact on open/close. No native OS-settings launch or route/page change is needed.
- The overlay exposes system vs microphone transcription input, separate system-monitor and microphone device selectors, current selection, both source signal meters with RMS/peak detail, Refresh sources and Start/Stop listening. Use friendly actual device names when available and retain full IDs in details; never ship the example devices.
- Outside the overlay, continuously show the selected input label and its compact live level bar in the MAIN header. It stays visible in normal, narrow desktop and Focus layouts. This is not a listening-only blinking dot or a meter moved exclusively into Sound. The bar must follow the same selected source/state as the overlay, with a text state for quiet/no signal, clipping, unavailable and stale/disconnected data.
- Bind real values to existing audio_level events (streamKind, sourceName, level, rms, peak), current App source/mode preferences and existing backend commands. Reuse the existing always-on meter behavior: stopping transcription is distinct from stopping input-level monitoring. Do not simulate production values, infer clipping from a decorative gradient, or let level updates rerender/reflow transcript/answer content. The prototype's animated values are illustrative only.
- Opening/closing Sound does not send capture start/stop or source-change commands. Changing the active input/device deliberately reuses the existing capture-restart behavior, pauses FULL AUTO and invalidates stale auto detection for the old source; keep existing answer provenance/cards. Preference changes for an inactive input do not unexpectedly switch active capture. Use the backend's acknowledged/fallback source selection and handle disappearing devices, refresh failure and empty lists honestly.
- Do not add nonfunctional output-volume/gain sliders or imply OS volume control: the current feature is source capture and level monitoring. Preserve any actual supported audio feature found during inspection.
- Accessible dialog: labelled title, initial focus, keyboard focus contained while open, close/Done/outside-dismiss, Escape closes this overlay and returns focus to Sound. Escape in the overlay MUST NOT cancel an in-flight answer. Shortcuts for background request actions must not fire from the dialog. Opening it also must not reset the original Settings page's state.

Raw input and the main action:

1. Render committed text continuously as received, with sparse time/source marks and natural wraps. Preserve disfluencies, missing punctuation, negations, mistakes and interleaved requests. Timing chunks and source segments are NOT question, sentence or speaker boundaries. Do not clean or repartition the raw display to fit question cards.
2. Without an explicit target, the primary action freezes the latest finalized source TIME window and invokes generation directly. A successful detector result is not required. Bind immutable segment IDs/offsets/times/source/epoch to the snapshot. If a partial tail is included only through an explicit choice, label it tentative and freeze it; never let it mutate under the submitted request.
3. Ask the generator to expose the request it THINKS the speaker means, distinguish missing information and ask for clarification when needed. Valid source IDs validate provenance, not interpretation or factual accuracy. An unclear window must not be forced into a definitive invented question/answer.
4. Pin this moment freezes recent context without a model call. Selection offers nearby Draft answer / Make question. Keyboard selection has the same path. User-set requests and raw selections work with detection disabled, failing or returning no candidates.
5. Explicit targets visibly override the next request, can be cleared, and are consumed after sending. An edited target preserves its original source but labels human wording separately. Correcting intent is not silently rewriting STT evidence.
6. Append finalized raw nodes without replacing selected DOM or the user's editor. Only the separate partial tail mutates. Manual scroll/selection/source inspection pauses following, not capture, and shows incoming count plus Resume live. If STT revisions exist, record them and never revise an already submitted snapshot.
7. Profile/custom precedence is explicit. Current runAnswer ignores selected preset except custom guidance; change deliberately. Never let a hidden stored instruction silently override the visible profile. Screenshots remain explicit and visibly attached/removable, never repeatedly auto-captured.

Two answer columns:

- One generation creates one identified card with immutable target/source snapshot, candidate revision when applicable, unreviewed status, concise lead, optional support, relevant assumptions/missing facts and actual evidence. Stream into the right card. Keep old cards and current reading position on detection, send, failure, empty output or cancellation.
- Working answers hold new/current drafts and bounded history; kept/previous holds explicitly pinned cards and human context notes. Pin means keep visible, not verified. Moving a completed card must not duplicate a model call. Do not continuously rebalance/reorder pinned cards.
- New automatic cards cannot seize focus, replace an existing answer, scroll a user away from selected text or switch the interpretation attached to an old card. Use a visible new-draft indicator when the operator is reading history. Add useful working-set/history bounds and communicate eviction; pinned cards are not silently discarded.
- Wrong question opens a correction workflow with original raw context visible. Corrected intent creates a new linked request/card and marks the old interpretation superseded while preserving the original. User notes can explicitly influence future context, but are human claims, not verified facts.
- Evidence references actual retrieved chunks/sources. No documents used is distinct from retrieval failed or general model guidance. A raw-context link proves what was captured, not that STT or the answer is correct. Do not invent citations, personal experience, CV facts or commitments.

## Stage 2: optional, fallible question inbox

Add a QuestionInbox component and backend-owned detector SIDE path. The raw stream and direct context request remain fully functional when this path is unavailable.

- Candidates may overlap, span many fragments, contain multiple requests, be revised or be wrong. Keep raw transcript storage/view independent. Show interpreted wording alongside an exact source excerpt and View raw; clicking it highlights the corresponding original range without filtering out surrounding speech.
- Supported states: proposed, incomplete, needs-review, user-set, queued, answered, dismissed, superseded. Labels describe workflow, never calibrated confidence. Give concrete reasons such as missing referent, conflicting negation or multiple possible intents. Apparently eligible candidates can still be wrong; answers remain drafts.
- Recognize indirect requests, self-corrections and multipart questions; question marks/regex may be hints, never the sole detector. Do not promise other-speaker-only behavior from system/mic labels.
- Let the user edit/split/merge, dismiss with Undo, or make a question from any raw selection/context when the detector missed it. Preserve lineage and revisions. Human correction invalidates old pending results but does not prove truth or guarantee the model permanently learned a rule. Suppress re-triggering a dismissed/superseded exact source span until genuinely new relevant content arrives.
- Use bounded immutable snapshots, structured candidate output and validated actual source IDs/ranges/revisions. Grounding checks must reject fabricated spans; they cannot establish semantic correctness. Never silently normalize away a negation, correction, uncertainty or speaker attribution in the raw evidence.
- One detector in flight, bounded tokens/context, configurable finalized-text debounce initially 0.8–1.2s and a latest-revision dirty flag. No paid call per partial/word/audio-meter event. Late detections cannot overwrite human edits. A later genuinely repeated question may be valid; dedupe by source/time/revision as well as text, not a permanent string hash.
- Separate detector failure from no question found; keep manual/context actions available. Never force a candidate to satisfy a schema or keep retrying paid calls without a bound.
- Treat transcripts/documents/screen text as untrusted content rather than instructions. Keep audio and local STT local; existing Gateway/RAG constraints continue.

## Stage 3: FULL AUTO as automatic drafting with recovery

Implement a backend-owned assistance state machine with independent connection, listening, candidate, human-target/editor, auto-armed, generation, publication and reading-anchor states. FULL AUTO creates drafts; it does not certify the interpretation or answer.

- Assist defaults to OFF for automatic generation: proposals can appear but manual/context actions decide requests. FULL AUTO must be explicitly armed per session; never persist/re-arm it automatically.
- AUTO automatically drafts new eligible complete proposals. Clearly incomplete, conflicting, negated, unsupported or ambiguous candidates stay in Needs review. This policy is fallible too: every AUTO card remains labelled unreviewed, source-linked, correctable and removable. Never describe an AUTO eligibility gate as eliminating hallucination or false positives.
- One answer job and one newest pending automatic candidate. Keep the other unanswered candidates in the inspectable inbox; replacing the pending execution slot does not silently delete them. Do not repeatedly cancel a stream on incoming text.
- Editing, source selection and manual targeting hold automatic targeting/publication until resolved. Capture continues. Manual requests explicitly supersede automatic work. Generation completion cannot publish a stale candidate revision or overwrite a pinned/held card. Distinguish completed results from where/when they are shown.
- New results add identified cards in the working column and preserve the kept column. If scrolling/selection is active, preserve visual anchors and show a new-draft badge. Do not revive the old timer-driven replacement policy. A separate publication/viewport lock can defer inserts if needed, but old content is preserved by default.
- Pause AUTO prevents new automatic jobs but keeps transcription. Stop answer cancels the matching job, preserves partial text, suppresses immediate retry for that candidate and pauses AUTO if it was automated. Stop listening stops audio/detection and pauses AUTO. Keep these controls distinct.
- Disconnect, owner loss, backend restart, source/mode change, transcript clear or epoch change invalidates stale work and pauses AUTO; reconnect never re-arms it. Reset execution state while retaining usable visible drafts/source snapshots where appropriate. Bound paid retries/backoff.

- Preserve M03's single controlling UI lease, sender identity/disconnect hooks and scoped assistance replies. Refreshing or opening a second window cannot double-trigger or cancel another owner's work. Shared audio/status may remain shared.
- Preserve M03's explicit offline-send rejection, acknowledgement and reconciliation without command replay. Offline requests must end visibly, not leave a spinner.
- Preserve M03's final-before-idle legacy ordering and scoped v2 lifecycle. Bind new candidate/chunk/error/terminal handling to requestId + answerId + snapshotId/candidateRevision + session epoch. Keep request records through definitive completion. An old event cannot populate another card, clear a newer request, mutate human-corrected intent or restart a cancelled job. Cancellation must match the job.

Protocol changes require documented protocolVersion (proposed v2), capability/hello negotiation, snapshot/context-query commands, candidate revisions/human corrections, answer records and scoped terminal/error payloads. Preserve existing manual queries for legacy clients and enable auto only after capability negotiation. Update API.md/ADR before wiring both sides. No new transcript database is needed initially: bounded ephemeral working sets/history with explicit limits are suitable. Persist layout/profile/source preferences, not armed AUTO or transcript content by surprise. Record the implemented decision.

## Stage 4: shortcuts and optional native translucency

- Add narrow, typed Electron IPC in `frontend/electron/main.cts`, `preload.cts` and `frontend/src/global.d.ts`. Preserve context isolation, disabled node integration and packaged CSP.
- Register the contextual-answer action with proposed `CommandOrControl+Alt+Enter`; expose registration success/failure. Preserve the existing screenshot shortcut. Provide in-app keyboard/button fallbacks. Escape can stop a query only while the app has focus; do not globally intercept plain Escape.
- Implement a normal pin toggle and Focus mode first. Check actual runtime capability, especially Ubuntu Wayland. Do not claim a registered global shortcut from a DOM keyboard event test.
- Translucency changes BACKGROUND alpha, keeping glyphs opaque. Default around 93% chrome/peripheral panels, near-opaque answer around 98.5%; offer an opaque fallback. Do not use whole-window `setOpacity()` for Linux: documented as ineffective there.
- Inspect the installed Electron version before choosing native flags. If native transparent window creation conflicts with resizing/Wayland, keep a working opaque Desk and use a separate appropriately constrained optional Focus window only if it can be verified; do not silently upgrade Electron or destabilize the app. Preserve state across any window recreation.
- CSS blur is not proof of OS-level blur; do not promise blur over other apps. Native transparent-window tests need DevTools closed and the actual desktop compositor.
- No click-through by default. Do not auto-capture screenshots in FULL AUTO. Include an explicit attachment indicator and remove action.
- Document actual supported native behavior. If native transparency is unavailable, report that exact boundary while shipping the functional opaque cockpit.

Useful primary sources, re-check against installed version: https://www.electronjs.org/docs/latest/tutorial/custom-window-styles ; https://www.electronjs.org/docs/latest/api/base-window ; https://www.electronjs.org/docs/latest/api/global-shortcut .

## Tests and acceptance

Use the repository's existing test/runtime conventions. Inspect the backend interpreter/package paths before running tests; a historic venv repair is not proof that today's interpreter works. Do not print secrets, edit credentials, ingest personal files, or start real paid test loops merely to produce passing results. Synthetic transcript fixtures and mocked Gateway outputs are suitable for deterministic tests. A real end-to-end smoke should use a short clearly identified sample when credentials/audio are available, with measured results, not substituted mocked claims.

Meaningful backend cases:

- Question across multiple finalized segments; indirect request; two linked question parts; statement/no question; incomplete question; duplicate rolling STT suffix; same question genuinely repeated later; mixed source/session reset.
- Detector payload malformed, bad IDs/ranges, stale detector revision, timeout/error, and prompt-injection text in a transcript.
- One active/one newest pending job plus preserved inbox; manual priority; pinned card and reading-anchor protection; auto pause; cancelled request never restarts; source change/reconnect/disconnect ownership loss; two UI sessions cannot double-trigger.
- Late chunk/terminal/error from request A cannot overwrite request B; event order with terminal-before-response; disconnect-send rejection; retrieval failure/no documents; no fake evidence.

Frontend/rendered acceptance:

- Four distinct columns at 1680x1000/1440x900, raw transcript wider than either answer column, useful type/zoom, independent scroll, no side overflow, primary footer visible. At 1000x720 use useful two-by-two panels. Verify accessible resizing/Transcript + and answer-only two-column Focus.
- Messy real-time word flood with no punctuation, repeated fragments, unfinished and overlapping requests, a negation that invalidates a proposed deadline, an unflagged wrong automatic answer (recovery cannot depend on self-reported uncertainty), corrections, genuine later repeats and false negatives. Raw text remains independent of proposed questions.
- Direct last-20/45/90-second action works with detector returning none or unavailable; a snapshot freezes at the press. Pin moment, selection/keyboard equivalent, make missing question, edit/split/merge, dismiss/undo and View raw work during incoming text. Submitted snapshots do not mutate.
- Wrong-question correction preserves original raw words and earlier answer, supersedes the old revision, creates a new linked draft, prevents stale AUTO output, and labels human claims correctly. No green verified AI badges or fake confidence percentages.
- Two simultaneous answer columns, pin/previous-card stability, bounded history, late chunks/errors arriving for old cards, stopped/error/empty states, missing evidence, copy and visible custom/profile precedence.
- AUTO drafts eligible new proposals; ambiguous/conflicting/incomplete ones stay for review; false eligibility remains inspectable/correctable. Manual selection/editor blocks automatic interference. Reading anchors remain stable while new cards arrive. Disconnect/reconnect/source change require deliberate re-arm. No manual click is needed for the normal eligible auto flow.
- Complete and report the feature-parity table above: separate original Settings navigation/return, RAG ingestion/list/refresh/clear, model catalog, presets/custom, screenshot preference/shortcut, benchmark CRUD/images/run/logs/results/history and persisted data all still work. Do not mark a feature preserved from inspecting a button alone.
- Sound opens/closes above the still-mounted Desk; selected-input meter remains visible and updates when closed and in Focus. Both overlay meters match real selected-source telemetry; mode/device changes pause AUTO and keep provenance. Refresh/no-device/error/stale/clipping states are truthful. Escape closes Sound without cancelling an answer; focus returns to Sound. Stopping transcription preserves existing meter monitoring. No repeated automatic captures.
- Actual Electron: registered shortcut from another focused application and registration-failure fallback; pin/Focus; normal close/minimize/drag controls if frameless; optional native translucency over another app with DevTools closed and actual Ubuntu compositor/resizing/restore checks. DOM shortcuts or browser alpha do not establish native acceptance.

Run and report these exact existing commands where applicable:

```sh
cd frontend && npx tsc --noEmit
cd frontend && npm run build
cd backend && .venv/bin/python -m unittest discover -s tests
git diff --check
```

If an interpreter or command differs, report what you actually used and why. Add focused tests for new orchestration/race contracts; do not treat an unchanged test grouping/build as detector accuracy or native acceptance. Any new tools/commands must be documented.

Maintain `docs/STATUS.md` after each stage/interruption and append results to `docs/CHANGELOG.md`. Keep a short acceptance matrix with PASS / FAIL / BLOCKED / NOT RUN and evidence. Update `docs/INDEX.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, relevant READMEs, and ADR index in the same iteration as behavior/contract changes. Do not mark the proposed ADR accepted before its decisions are actually implemented.

Finish with the implemented behavior, changed files, checks and measured limits. Distinguish mock detector/synthetic browser checks from real STT/Gateway/Ubuntu window acceptance. Do not claim FULL AUTO is complete if only a toggle or scripted demo works.
