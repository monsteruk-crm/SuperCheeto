# Live Helper: four-column workbench

Status: proposed design, revised 23 October 2026. The user rejected the original oversized answer pane and the assumption that question detection would reliably partition live speech. This revision supersedes the earlier 70/30 design. Dark translucent styling, manual assistance and FULL AUTO remain requested. Application source and the live protocol are unchanged.

## Review

- [Superdesign canvas](https://superdesign.dev/teams/05109335-d011-44e5-87b4-d385414e53f9/projects/e49023ac-d262-44d6-8fa0-7eef01c3c806).
- [Current proposed workbench](https://p.superdesign.dev/draft/9eaaa6ad-5233-46a9-af20-5e1ca90951ee). Same draft; earlier designs are retained in version history.
- [Original application baseline](https://p.superdesign.dev/draft/4c4df4f2-844d-4c91-9907-3943bf4f62df) — actual React components statically rendered with sample data.
- [Interactive HTML](live-helper-cockpit.html), [desktop preview](live-helper-cockpit.png), [answer-only Focus preview](live-helper-focus.png).
- [Complete Codex implementation prompt](../prompts/live-helper-cockpit-implementation.md), [proposed ADR 0011](../adr/0011-question-assistance-cockpit.md).

The prototype uses synthetic messy speech and scripted results, including a deliberately wrong interpretation AND an unflagged wrong automatic answer. It does not record audio, detect real questions, call models/RAG, identify speakers or control native windows. The word-flood controls are preview scaffolding and must not ship.

## Design principle

Raw speech, interpreted intent and generated advice are three separate things. The operator must be able to see where they disagree. A polished answer does not establish that the AI understood the question, transcribed correctly, or answered accurately. Recovering from those failures must be quick.

The primary action works on a frozen recent slice of raw speech WITHOUT requiring a successful detector. The question list is a fallible sidecar, not a partition of the transcript or the only route to an answer. Candidate labels are workflow states, not calibrated confidence or evidence of correctness.

## Four columns

Left to right: raw transcript → possible questions → working answers → kept/previous answers. There are two actual answer columns, not one huge answer stretched across two grid tracks and not two simultaneous model calls.

| Column | Contents and behavior |
| --- | --- |
| Raw transcript | Full-height unedited stream with natural wrapping, sparse time/source marks and one tentative partial tail. No invented speaker bubbles, cleaned sentences or forced question boundaries. Select any words, pin a moment, inspect a source, widen the column or resume live following. |
| Possible questions | Overlapping AI interpretations, original excerpt/time, Possible request / Needs review / Still forming / Set by you, View raw, Edit, Dismiss and an answer action. Manual question creation does not depend on the detector. |
| Working answers | Compact independently identified draft cards with frozen target/source, speakable lead, brief support, relevant assumptions, actual evidence and Wrong question / Keep / Copy. Earlier drafts remain accessible below. |
| Kept & previous | Answers or human notes the operator needs to retain while new drafts arrive. Pinning means useful to keep visible, never verified. Cards remain stable while other columns update. |

At 1680×1000, the balanced prototype gives the transcript approximately 515px, questions 359px and each answer column 382px. Transcript + widens the raw column to approximately 633px. These are measured prototype dimensions, not a validated optimum. All four panels use nearly the full window height; content uses natural card heights and independent scrolling instead of a large empty answer panel.

Production should support keyboard-operable resizable dividers with minimum useful widths and persisted layout preference. The prototype has a deterministic Transcript + toggle rather than draggable dividers. At 1260px and above it uses four columns; below that, two rows of two panels preserve useful reading width. At narrow phone-like widths panels stack. Focus is an optional answer-only two-column view, around 900px wide, not the primary layout.

Keep a slim session bar (listening/input, always-visible selected-input level bar, dedicated Sound button, profile, Assist or FULL AUTO, layout/focus, Settings and quick controls) and stable bottom action bar. Answer typography is about 19–21px for leads, 12–14px support and 14–15px raw transcript; production must retain useful text size and zoom. Amber marks actions and uncertainty; green is limited to audio/input state. There is no green AI-correct/verified indicator.

## A fast route that survives detector failure

With no explicit target, Answer last 20s (`Ctrl+Alt+Enter` proposed) immediately freezes the latest stable source time window and requests a cautious contextual draft. The visible 20/45/90-second control changes that window. The model may infer a request, but it must expose that interpretation and any ambiguity. If the context contains no useful request, say so; do not invent one merely to produce a fluent answer. Offer clarification or user-set intent.

Pin this moment freezes recent context without sending a request. Precise drag/keyboard selection exposes nearby Draft answer and Make question. These paths work when the detector returns nothing or the speech contains several unfinished questions. A confirmed final segment can still contain STT mistakes; preserve the words as received, and record human corrections separately.

An explicit selected/candidate/user-set target overrides the next manual request, is visibly labelled and can be cleared. It is consumed after sending. Draft metadata and source evidence are immutable for that request even as the transcript continues. Guide/profile/screenshot use must be visible, deterministic and recoverable.

## Questions are proposals

Examples in the prototype deliberately include:

- An interpretable indirect request spanning a stream without punctuation.
- A WRONG proposed Friday delivery question beside raw words explicitly rejecting a deadline.
- An unflagged automatic draft suggesting Friday as a release target. This demonstrates recovery when the AI fails to flag its own error; the original words and separate human correction remain accessible.
- A mixed launch/data/rollback request that needs a human choice or split.

Every candidate links to its original source span in the unfiltered raw stream. Viewing it pauses following, highlights only that source and leaves live capture running. No question filter can remove the raw words from view. A candidate can overlap others or span arbitrary timing chunks; segment and silence boundaries are not necessarily thought boundaries.

Edit revises the interpreted intent; raw words remain unchanged. One request per line supports splitting in the prototype. Production also needs merging related spans, dismiss/undo, and manual creation from any selected source. Correction records retain candidate lineage/revision and suppress stale automatic results for the superseded interpretation. They do not prove that the corrected interpretation or answer is true, or promise that a model has learned permanently.

Candidate workflow states: proposed, incomplete, needs-review, user-set, queued, answered, dismissed, superseded. Keep classification reasons concrete, e.g. missing referent, negation conflict or overlapping requests. No invented percentage certainty. An apparently complete candidate can still be wrong; its answer is always an unreviewed draft.

## Two answer columns and explicit recovery

One model answer creates one card. Each card keeps its own question/context snapshot, request ID, interpretation version, general assumptions, evidence and stopped/error status. New drafts do not replace a pinned or selected card, wipe earlier text, swap questions under an old answer or continuously rearrange the board. Preserve reading anchors in scrolled columns; announce new cards with an unobtrusive jump affordance instead of scrolling the user away.

Working and kept/previous are roles for the two columns, not competing model opinions. Keep in view moves a completed card to the second column; user notes can retain a correction that matters to subsequent requests. General advice is distinguished from actual retrieved evidence. No documents used means no document evidence is available. Being source-linked does not establish factual accuracy.

Wrong question opens an intent correction beside the source workflow. A corrected request generates a NEW linked draft, marks the previous interpretation superseded and retains the original. Missing facts can lead to a clarification rather than a definitive recommendation. Copies are manual. No answers are spoken or sent into another app.

The earlier 8-second forced answer replacement/countdown/Show next design is superseded. Persistent cards and explicit pinning remove the need to automatically overwrite a reading surface on a timer. Hold remains useful as a publication/viewport lock if implemented, but keeping prior content is the default.

## Assist and FULL AUTO

Assist is the default. It can propose questions, but the operator chooses which to answer or uses a recent raw-context request directly.

FULL AUTO is explicitly armed per session and automatically creates unreviewed drafts for new eligible proposals. Clearly incomplete, conflicting, negated, ambiguous or unsupported interpretations stay in Needs review instead. Eligibility itself is fallible; do not imply that automation eliminates errors. Keep AUTO visibly active and every generated draft source-linked and easy to correct.

Use one answer job and one newest pending automatic candidate, with all other suggestions retained in the inspectable question inbox. No invisible deletion of unanswered questions because the latest-pending slot changes. Never repeatedly cancel a stream as words arrive. Manual correction, selection and an open editor hold automatic targeting/publication; raw capture continues. A manual request explicitly supersedes active automatic work. Stop preserves partial content and prevents immediate regeneration of the same item; pausing AUTO keeps transcription running.

Question detection runs on bounded immutable source snapshots, with actual segments and source ranges validated. It can be wrong about meaning despite valid provenance. Tentative partials may show a cue but cannot silently trigger a committed request. No cloud call on every word/meter update. Start with configurable finalized-text debounce and bounded lookback; measure actual speech-end→useful-draft latency. Do not turn expected model latency or STT delay into a promised UX number.

Disconnect/restart/source change/transcript clear invalidates old work and pauses AUTO until re-armed. One owning UI session prevents double automation across refreshes/windows. Bind every event to session epoch + request + source/candidate revision. No stale event may populate a different card or revise a frozen answer.

## Raw transcript under pressure

Keep it as received, not cleaned into convenient questions. Show a raw/unreviewed status and source metadata rather than pretending that STT is correct. Finalized text nodes remain stable while selecting. Append incoming committed data; only the separate partial tail mutates. Record STT revisions explicitly if needed, without altering a submitted snapshot.

Manual scroll, selection or source inspection suspends following, not capture. Count incoming words/segments and show one Resume live control. Streaming source input must not erase an editor, selection or frozen target. Test a flood of fragments, absent punctuation, repeated phrases, corrections, topic switches, overlapping requests and detector misses.

## Sound preferences and the main level bar

The Sound button opens an in-app overlay on top of the still-mounted four-column Desk. It contains system/microphone input choice, separate monitor/microphone device selectors, both input meters with RMS/peak detail, Refresh sources and Start/Stop listening. A compact selected-input signal bar remains visible in the main header when the overlay is closed, open or in Focus. Friendly device names are examples in the prototype; the real app must use discovered sources and existing preferences/actions.

Opening/closing Sound leaves capture, answers, selections and scroll state alone. Escape closes this dialog and returns focus to Sound; it must not cancel a request underneath it. Changing the active input/device deliberately pauses AUTO and uses the existing capture-restart/source acknowledgement behavior, preserving old card provenance. Signal monitoring remains separate from transcription state; reuse the existing always-on audio_level stream. Do not fake values in production or add nonfunctional volume/gain controls. Handle missing sources, refresh failures, stale/unavailable telemetry and clipping honestly.

The prototype uses explicitly simulated levels and devices. The dialog is opaque for readability; peripheral UI may remain translucent. Keyboard focus stays in the dialog while open. The header bar is not replaced by a mere listening indicator or relocated exclusively into this dialog. [Sound overlay preview](live-helper-sound.png).

## Original feature preservation and the separate Settings screen

All original capabilities remain required. This design relocates controls and adds assistance; it does not permit a reduced replacement app. The original separate SettingsPage remains the destination for Query Settings, screenshot-inclusion preference, local RAG file/folder ingestion/list/refresh/clear and notices, Model Catalog, benchmark harness/model selection/repeats, test CRUD, image registry/previews, live runner progress/logs, detailed results/latest-per-model/tooltips and history/clear. Existing stored preferences, benchmark tests/history/images and RAG SQLite data must survive.

Keep model/preset/custom execution (including code/action-item presets), manual selected-text editing/reset/clear, transcript following/jump/clear, streamed answers/cancel/exact rerun, screenshot capture/shortcut/preview/removal and request metadata accessible. The implementation prompt now includes a source-grounded parity table and a requirement to verify every original action. Preserve additional supported features discovered in current source as well. Removing duplicate visual summaries does not remove their capabilities.

The prototype has a visible Settings entry that explains this preserved second-screen boundary. It does not recreate or invoke the real RAG/benchmark page. Production must wire it to the ORIGINAL App Settings navigation and working SettingsPage; a toast or placeholder would not satisfy the implementation.

## Realtime text and model choice

The input to the generator is an existing transcription. Keep capture/STT local, freeze text/context at request acceptance, and stream real model content into its identified answer card. The initial configurable answer default is Gemini 3.8 Flash with supported low reasoning; preserve saved/explicit choices. See [ADR 0013](../adr/0013-stream-transcript-text-answers.md) and the [implementation prompt](../prompts/live-helper-cockpit-implementation.md) for verified capabilities, transport and evaluation requirements. The example Gemini Live model is not required for this text-snapshot flow.

Show useful prose as it arrives, with Stop answer available. A failed/cancelled/incomplete stream retains its partial draft; an empty completion stays empty. Never animate a fully buffered answer to imitate streaming, expose thinking as the answer, or wait for the full structured answer before first display. Detection is a separate bounded structured-text path; manual raw-context answering remains independent. Record first-visible-answer delay separately from model TTFT and STT delay. The scripted HTML is not live streaming/latency evidence.

## Runtime and transparency

System/mic identify audio sources, not people. The current backend transcribes one selected input and restarts capture on changes. A system monitor may contain several people or the user's own playback. Do not promise other-speaker-only behavior without implementing and testing speaker separation.

Use subtle background alpha while glyphs/answer cards remain opaque. The opaque Desk is the reliable baseline; real Ubuntu window translucency, resizing, pinning and global shortcuts need verification against the installed Electron version and compositor. Prior source review found Electron 31 and a normal opaque BrowserWindow. Keep context isolation, disabled node integration and packaged CSP. A browser preview is not a native transparency check. The native limitations described in the implementation prompt must be re-checked during implementation; no native behavior is claimed here.

## Source-to-screen mapping

| Existing file | Proposed responsibility |
| --- | --- |
| `frontend/src/App.tsx` | Four-panel composition and bounded answer records; keep benchmark state separate. Remove duplicated selected-text footer. |
| `frontend/src/components/PromptBar.tsx` | Slim session/action bars, persistent selected-input meter, dedicated Sound overlay, Settings navigation and quick controls. Recent-context action does not depend on a question detector. |
| `frontend/src/components/TranscriptPane.tsx` | Raw continuous stream, stable source anchors, selection, snapshots, reading/following state. No forced question grouping. |
| `frontend/src/components/OutputPane.tsx` | Two answer columns/card system, independent target/source metadata, correction, pinning and history. |
| New `QuestionInbox` component | Optional candidate interpretations, exact source links, revisions, split/merge/dismiss/manual paths. |
| `frontend/src/components/SettingsPage.tsx` | Preserve model/profile/custom/RAG/benchmark/image workflows. |
| `frontend/src/styles.css` | Four-panel responsive layout, useful type sizes, independent scroll and restrained alpha. |
| `frontend/src/types.ts`, `frontend/src/ws.ts` | Typed versioned snapshots/candidates/answer records, readiness, scoped events and stale-result rejection. |
| `backend/app/main.py`, `transcript.py` | Immutable source snapshots, raw-context path, fallible candidate sidecar, scheduler and lifecycle. |
| `backend/app/ai_gateway_client.py`, `rag_store.py` | Existing generation/retrieval, structured optional detector, actual evidence, clarification outputs. |
| `backend/app/ws_server.py` | Sender/owner identity, targeted replies, disconnect hooks and capability migration. |
| `frontend/electron/main.cts`, `preload.cts`, `frontend/src/global.d.ts` | Narrow shortcut/window IPC, capability reports and working fallback. |

Verified source facts from the prior pass (source fingerprints unchanged for this revision): `executeQuery()` clears output; `runAnswer()` hardcodes answer preset/custom precedence; `WSClient.send()` drops disconnected sends; the backend has one global query task and broadcasts events; terminal state can precede the final response. Address these before adding AUTO. Protocol versioning, source/request provenance and cancellation races remain required implementation work.

## Acceptance boundary

This is a design revision only. Prototype JavaScript, rendered layouts and selected scripted recovery/stress interactions are checked; see CHANGELOG for exact evidence. Real STT/detector accuracy, Gateway/RAG latency/evidence and native Ubuntu acceptance are NOT RUN. Split is demonstrated as one user-set request per line; merge, undo, draggable dividers and complete production scheduling are implementation requirements, not claimed prototype features. The live API remains unchanged.
