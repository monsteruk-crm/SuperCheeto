# M08 acceptance — 26 October 2026

M08-T01–T09 COMPLETE within synthetic/local-service scope. This does not close M09 native controls or M10 live audio/model/integrated acceptance. [Plan](../plans/live-helper-cockpit-execution-plan.md#m08-implement-full-auto-scheduling), [current ledger](../plans/live-helper-cockpit-progress.md), [ADR 0019](../adr/0019-owned-full-auto-scheduling.md), [v6 API](../API.md#protocol-v6-owned-full-auto).

## Task evidence

| Task | Implementation and gate | Result |
| --- | --- | --- |
| T01 independent states/shared execution | Pure `AutoScheduler` in `assistance.py`; `auto_service.py` coordinates existing AnswerService under the controller command lock. Independent listening/owner/candidate/interaction/arm/generation/publication state. Frozen settings, SSE, cancellation and timing reused. | PASS |
| T02 explicit session arming | v6-only capability, controller/listening/detector/source/config readiness, no persisted arming, no inbox backfill. Reconnect/claim stay Assist. | PASS |
| T03 bounded queue | One manual/AUTO active request, newest pending only. Replaced questions remain inspectable and active streams continue. | PASS |
| T04 review exclusions | Explicit structured review flags; incomplete/conflicting/negated/unsupported/ambiguous and unclassified proposals do not auto-execute. Human wording remains manual. Every AUTO card unreviewed. | PASS |
| T05 manual holds/priority | Raw selection, targets, question/profile/note/Settings editors and pending configuration hold starts/publication. Sound alone does not. Manual sends supersede matching AUTO and retain partials/source. | PASS |
| T06 deferred output | Buffer remaining AUTO output on protected bounded request; completed computation and deferred publication separate. Release validates epoch/candidate revision; stale results supersede without exposing hidden text. | PASS |
| T07 lifecycle transitions | Fake-clock/event-gated tests cover Pause vs Stop, source/clear/listening/owner loss, candidate mutation and delayed acceptance/completion. Source/card retention and no same-revision retry covered. | PASS |
| T08 rendered controls | Assist/FULL AUTO, readiness/errors/holds/newest pending/deferred labels, unreviewed badge, manual takeover and source-linked correction. v6 advertised; older manual contracts retained. | PASS |
| T09 races/flood/docs | Actual two-client WS ownership/duplicate receipt/reconciliation, 81-question flood, existing reading-anchor tests, rendered new-draft notice/retained cards and final suites/build. Documentation updated. | PASS |

## Automated checks

| Command | Result |
| --- | --- |
| `cd backend && .venv/bin/python -m unittest discover -s tests -q` | PASS — 226 tests, 6.605 s; includes 28 M08 tests, two actual local two-client WS cases |
| `cd frontend && npm test -- --run` | PASS — 186 tests across 11 files; includes 8 M08 component/transport-harness cases and 32 new shared v6 fixtures |
| `cd frontend && npm run build` | PASS — 304 modules, repeated after final listening reconciliation fix |
| `cd frontend && npx tsc --noEmit` | BASELINE FAIL — exactly the same three TS2339 ImportMeta.env errors at App.tsx:56/62/68; no new type errors |
| `git diff --check` | PASS |
| `git status --short backend/data` | PASS — empty; user RAG persistence untouched |

`backend/tests/test_auto.py` injects clocks and event-gated generation, with temporary SQLite and no real client construction. Tests cover configuration revisions/idempotency/reconciliation, frozen explicit screenshots/human notes, review/human exclusions, active/live/deferred holds, stale deferred supersession, manual priority, Stop/listening/clear/source/owner/candidate transitions, late acceptance ownership loss, capacity, no automatic retry, private execution-field injection, correction of a false eligible AUTO interpretation and queue flooding. The flood leaves one generation active after 81 proposals, all 81 questions visible and only the latest pending. Shared contracts cover valid/invalid configuration/holds/state/review flags and stale version/epoch identities; existing v2–v5 fixtures still pass.

A16/A17 scheduler/ownership race coverage includes two windows racing arming, duplicate command/status reconciliation without replay, observer cancellation/arming rejection, owner disconnect and new controller remaining Assist. Generation completion during holds, stale revisions and source clear are separately deterministic. Existing reading-anchor/stream-buffer tests remain green.

## Rendered synthetic acceptance

Actual App + local WebSocket service, Vite on 5188, isolated harness `/tmp/cockpit-m08/run.py`, temporary SQLite, synthetic finalized transcript/telemetry and injected catalog/detector/generation. No actual device/STT/Gateway calls. The generator emits an actual first delta before a six-second delayed remainder; it does not simulate typing from a complete response.

Observed on the rendered service:
- Initial/reconnected session stays Assist. Explicit FULL AUTO starts a new eligible answer without an Answer click. Existing inbox is not backfilled.
- Guide opened after the first delta holds remaining publication. Generation completes; the card retains its original partial and shows generation finished/publication held. Inbox correctly changes active to deferred. Further speech replaces newest pending only; earlier unanswered questions remain.
- Closing Guide flushes retained output and starts the newest pending question. Answer now supersedes that AUTO, retains its partial card and starts one manual answer through the normal builder. The new-draft notice preserves the reader's position.
- Wrong question on the completed AUTO creates human wording and an explicit linked corrected draft. Original card/source and interrupted AUTO card remain visible. Pause leaves the manual answer/capture running.
- Reload while armed returns to Assist without re-arming or replaying a paid request. Listening header/Sound reconcile from authoritative v6 state after reload. A stale initial session-epoch bootstrap error clears only after configuration is accepted.
- Final cycle repeats first-delta/hold/completed defer/release on the last code; Pause followed by Stop transcription disarms, cancels stale active work and retains completed/partial cards. Meter remains independent.

Across the final isolated harness run: **6 synthetic answer starts, 10 synthetic detector starts, maximum concurrent answers 1, final active count 0**. Four answer starts were the first AUTO, next AUTO/manual takeover and linked manual correction; two were the final hold/release cycle. Detector starts include bootstrap/reconnect; these totals are not paid-model usage or latency measurements.

| Viewport | Horizontal overflow | Action footer |
| --- | --- | --- |
| Desktop 1440×900 | None | Bottom 892.36 px, visible |
| Compact 1000×720 | None | Bottom 712.00 px, visible |

- [Held generation screenshot](assets/2026-10-26-m08-held.png): final code, explicit armed mode, Guide interaction hold and deferred state.
- [Desktop retained-card screenshot](assets/2026-10-26-m08-desktop.png): original/cancelled/manual/corrected drafts retained, AUTO paused.
- [Compact screenshot](assets/2026-10-26-m08-compact.png): two-by-two layout, retained cards and visible manual controls.

## Corrections during acceptance

Outdated negotiated-version expectations and two ambiguous test selectors were corrected. Configuration parsing now whitelists exactly the public settings fields, preventing private rerun fields from entering AUTO execution. Completed deferred cards now refresh inbox labels, and generation outcome remains completed even if later publication is superseded. Reload acceptance exposed stale Sound/header listening state; authoritative scheduler state now reconciles it, with regression and rendered recheck. All affected suites/build ran after the final change.

## Boundaries and handoff

- NOT RUN: paid detector/answer inference, embeddings, microphone/system capture, local STT, semantic detector quality, real model access/usage/latency, native Electron shortcuts/window controls. These remain M09/M10; mock timing is not a real latency result.
- No new dependencies, provider audio session, automatic screenshot capture, direct-provider endpoint, secret/config edits, persistence schema or committed/deployed changes.
- User help is not needed for remaining implementation prerequisites. Actual native/device checks may need user help in M09/M10. Do not claim full end-to-end completion until those gates pass.
- Next M09-T01: read INDEX/STATUS/ledger, then `sed -n '455,471p' docs/plans/live-helper-cockpit-execution-plan.md` and inventory installed Electron/display/compositor before choosing native options.
- Cleanup: isolated backend/Vite stopped, temporary SQLite removed, viewport reset and acceptance tab closed; original RAG data and unrelated dirty files/backups preserved.
