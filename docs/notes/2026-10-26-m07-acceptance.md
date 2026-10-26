# M07 acceptance — 26 October 2026

## Scope and current checkpoint
M07 COMPLETE for its synthetic/local-service gate. Next: M08-T01.
M07-T01–T09 implementation and Gateway routing audit. Synthetic/local-service acceptance; real detector quality/account access, audio/STT and native acceptance remain M09/M10. No paid inference or hardware capture is used here. [ADR 0018](../adr/0018-bounded-question-proposals-and-gateway-routing.md) records the decision; [progress ledger](../plans/live-helper-cockpit-progress.md) is the resumption authority.

## Task mapping
| Task | Implementation / evidence |
| --- | --- |
| T01 | `question_detector.py`, `question_service.py`, Gateway structured-output method and role preflight. Default enabled only for a negotiated v5 controller; disable/retry controls. Public catalog checked 26 October for the provisional detector. |
| T02 | Named debounce/lookback/input/output/timeout/start-interval bounds, one in-flight call and latest dirty flag. Explicit unchanged-revision retry. |
| T03 | Complete JSON only; source IDs/revisions/code point ranges, concrete review reasons, malformed/oversized output checks. Empty success differs from failure. |
| T04 | Immutable source/interpretation revisions, exact-span suppression, overlaps and genuinely later repeated source identities. |
| T05 | Atomic expected-revision create/edit/split/merge/dismiss/undo; bounded history and retained source leases. Reconciliation reconstructs current state from compact command receipts. |
| T06 | QuestionInbox workflow labels, source excerpts/View raw, revision history, target selection, raw/manual creation and explicit failure/empty/disabled states. |
| T07 | Wrong question on every available card; original evidence/card retained, linked corrected target/draft, stale interpretation rejection and newer human wording protected. Existing future-context notes stay labelled human claims. |
| T08 | Backend scheduler/provenance/ownership/correction/real-WS tests and frontend inbox/editor/correction tests; A14/A15/A26/A28 integration scope. Messy speech fixture checks prove validation/integration, not real semantic quality. |
| T09 | API v5, shared fixtures, configuration/docs/ADR/index, status/changelog and ledger. |

## Gateway audit
- Active Python AI call sites use `AIGatewayClient`: manual/legacy answers, reruns, screenshots, benchmarks, RAG embeddings, model discovery and detector.
- No direct OpenAI client source/import/SDK dependency or direct-provider credential lookup remains in active backend/frontend/scripts. Provider model slugs, OpenAI-compatible wire formats and provider pricing attribution are valid Gateway use.
- Gateway/detector/embedding settings now read at construction after dotenv loading; a late-loaded local-config regression verifies model/debounce/timeout overrides and rejects a configured direct-provider URL.
- Shared client rejects an alternative host/scheme/path/userinfo/query before credentials enter an HTTP client. Mock transports assert actual `/v1/` request URLs. Same-model pre-content Responses 404 fallback stays on Gateway; no direct-provider fallback exists.
- Removed `backend/app/__pycache__/openai_client.cpython-{312,313,314}.pyc` artifacts. Historical migration notes and unrelated backups retained.
- Operator removed `OPENAI_API_KEY` and `OPENAI_MODEL` from private `backend/.env.local`. Name-only verification confirmed no `OPENAI_*` keys and Gateway credential presence; no credential values printed or changed.

## Checks
| Command / check | Result |
| --- | --- |
| `cd backend && .venv/bin/python -m unittest discover -s tests` | PASS — 198 tests, 4.057 s; includes 23 new M07 tests and two actual local WebSocket cases |
| `cd frontend && npm run test -- --run` | PASS — 146 tests across 10 files; includes 8 inbox/correction tests and 23 new shared v5 fixtures |
| `cd frontend && npm run build` | PASS — 303 modules; final build repeated after checkbox CSS correction |
| `cd frontend && npx tsc --noEmit` | BASELINE FAIL — exactly the 3 existing TS2339 ImportMeta.env errors, now App.tsx:56/62/68; no new type errors |
| `git diff --check` | PASS |
| Active source/config name scan | PASS — no direct-provider client/endpoint/auth lookup in app/frontend/scripts/env example; no old compiled client artifacts |
| Private config name-only check | PASS — no OPENAI_* variable names; Gateway credential still present |
| User RAG persistence | PASS — `git status --short backend/data` empty; only temporary SQLite used |

The early full sweeps exposed outdated version expectations, an answer-role reasoning regression, and a UI assertion matching multiple status/error locations; these were corrected and the final suites passed. Focused checks additionally caught/protected correction snapshot leases at capacity and newer human interpretation retention. Synthetic messy-speech fixtures establish parsing/provenance/recovery behavior, not semantic model quality.

## Rendered acceptance
Isolated temporary backend/Vite harness in `/tmp/cockpit-m07/`; actual App, protocol and WebSocket service, synthetic finalized transcript/telemetry and injected model/catalog responses; temporary SQLite. No user RAG data used. Human edit/save, candidate selection, genuine incremental synthetic answer before terminal, Wrong question, linked corrected draft and retained original source/card observed. Desktop and compact footer/no-horizontal-overflow checks passed. Final-service rendered checks also passed split → merge → dismiss → undo, source highlighting, candidate answer then Wrong question → corrected draft, and acknowledged detection disable. Human mutations caused zero answer calls before explicit draft submission. The final harness recorded two synthetic answer calls and two synthetic detector calls across reconnect/bootstrap (not two calls per mutation); no live-model timing claim is made. Pre-terminal answer text was observed while the card was still running.

| Viewport | Horizontal overflow | Action footer |
| --- | --- | --- |
| Desktop 1440×900 | None | Bottom 892.36 px; visible |
| Compact 1000×720 | None | Bottom 712.00 px; visible |

- [Desktop screenshot](assets/2026-10-26-m07-desktop.png): detector state, retained original answer and linked corrected draft.
- [Compact screenshot](assets/2026-10-26-m07-compact.png): source highlight, independent panels and accessible action footer.
- A rendered checkbox label wrapping issue was corrected with local checkbox/layout CSS; screenshots above show the final styles.
- The synthetic meter truthfully shows stale microphone input because the harness only emits system telemetry. This is not hardware acceptance.

## Boundaries and handoff
- NOT RUN: paid detector/answer inference, real embeddings, microphone/system capture, local STT, native Electron/shortcuts, real model quality/access/latency. Public Gateway catalog and official structured/reasoning docs were read; these do not establish account access or semantic accuracy.
- M08 AUTO scheduler/call/race limits remain unimplemented and unadvertised. The wrong apparently eligible AUTO card case is a synthetic fixture proving correction recovery only.
- No user assistance is needed before M09/M10 real hardware/native acceptance.
- No commit/deployment. Unrelated dirty files/backups and private configuration preserved. The operator independently removed obsolete OpenAI variables.
- Cleanup complete: backend/Vite stopped, ports 8765/5188 free, temporary SQLite removed, browser viewport restored and acceptance tab closed. Evidence images remain in this note's assets folder.
