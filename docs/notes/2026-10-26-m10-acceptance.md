# M10 integrated acceptance

Status: COMPLETE within the explicitly recorded layers and measurement limits. Synthetic, real Gateway, real capture/STT and native evidence are recorded separately.

Story: actual local speech → local capture/STT → immutable text/context → optional detector/owned AUTO or manual answer → Gateway/RAG → streamed, source-linked React answer.

## Entry and isolation
- M09 final capture preview observed through the actual Electron renderer on26October; permission pending=false. Removed the preview before AI testing. M09 required gates complete; optional translucency remains unsupported.
- Preserve all existing M09 worktree changes. Acceptance storage is separate under a temporary workdir; no personal RAG ingestion or configuration edits.
- M10-T01: backend238 PASS; frontend198 PASS; standalone TypeScript PASS; Electron/Vite build305 PASS. Existing synthetic provider-failure traceback is an expected test fixture.
- T02–T08 subsequently completed; final evidence/matrix below. User authorizes the already-playing YouTube clip as the final real system-audio source. Bound capture to90seconds; leave playback under user control. Do not invent an eligible AUTO question if the clip has none.

## Execution updates
- First rendered run found a harness setup error: production `_on_segment` correctly ignores speech when transcription is stopped; synthetic seeding was changed to populate/broadcast the transcript directly in that state. No production defect or paid call resulted.
- User explicitly requested another actual audio-capture attempt while this work was underway. After the passing full automated gates, switched to real capture/STT/Gateway with separate `/tmp/cockpit-m10-live` storage and a90second watchdog before completing the remaining rendered parity checks. No microphone or playback control; existing YouTube system output only. Remaining synthetic acceptance will resume afterward.

- Actual first smoke: real analog-stereo monitor, CPU/int8 tiny Whisper, active meter and31+ finalized segments. Manual Gateway answer completed (effective saved/environment model `openai/gpt-5.6-sol`,24 deltas,74 input/68 output tokens; first delta1753.6ms, completion2221.0ms). Three real detector attempts returned no proposals; no AUTO question was fabricated.90second watchdog stopped capture. Source speech was fragmentary; semantic STT accuracy requires operator confirmation.
- User clarified normal question detection must keep evaluating new movie dialogue, including after empty passes. The production detector already does; added a five-revision regression proving four empty passes followed by a grounded proposal and no repeat on unchanged audio. The three-call limit belongs only to the temporary acceptance harness. Normal operation will retain continuous detection in Assist mode.
- User requested minimum raw-row interleave: removed vertical row padding, retained15px type, tightened line height1.45→1.2 and LIVE/container padding. Rechecking source/automated gates before further rendered/live checks.

- Normal continuous capture restored at the user's request after the bounded trial. This session has no90second/three-call acceptance cap and remains in Assist with question suggestions enabled. Later observation confirmed59 finalized rows and12 proposals, then98 rows and25 proposals (including review/incomplete classifications). Background movie playback was not controlled.
- Real synthetic-document embedding ingestion and a new eligible AUTO draft subsequently passed in the continuous session: source-linked unreviewed AUTO card, real retrieval outcome `used`, effective saved model `openai/gpt-5.6-sol`,187 input/57 output tokens. Retrieval737.4ms, generation1760.8ms; first delta2140.4ms and terminal2501.9ms after acceptance. Returned to Assist afterward; normal transcription/detection remain running. First30second AUTO observation had no new eligible proposal; no old inbox item was backfilled or model retry forced.
- Rendered harness corrections: benchmark JSON preview is truncated in its cell, so inspect the full response tooltip; retrieval enum is `used`, not `retrieved`; an AUTO-attempted question need not retain `state-proposed`. These were test assumptions, not production failures. Electron native window requests are compositor-clamped; exact responsive screenshots use actual Electron renderer viewport emulation and are explicitly separate from native bounds.
- Original runtime `rag.sqlite`, `rag.sqlite-wal` and `rag.sqlite-shm` SHA256 hashes remain identical to the pre-review preservation record; no original document contents were inspected.

## Final automated and rendered gates

- `cd backend && .venv/bin/python -m unittest discover -s tests -q`: **PASS239** after correcting the new regression's expectation: the detector publishes empty outcomes too, so it correctly publishes five outcomes, with a proposal only on the fifth revision. One intermediate command used the wrong working directory and failed import discovery; the canonical command above passed.
- `cd frontend && npm test -- --run`: **PASS198**,12files.
- `cd frontend && npx tsc --noEmit`: **PASS**, zero errors.
- `cd frontend && npm run build`: **PASS305modules**, including Electron TypeScript.
- `node --check scripts/acceptance/m10_electron.cjs`, `node --check scripts/acceptance/m10_extras.cjs`, `backend/.venv/bin/python -m py_compile scripts/acceptance/m10_backend.py`, `git diff --check`: **PASS**.
- Clean fresh-workdir run (`/tmp/cockpit-m10-final`, real WebSocket8770/control8784): **22 primary rendered checks +6 additional interaction checks PASS**, without harness failures. Actual controller, protocol, file readers, SQLite, scheduler and production Electron/React; synthetic catalog/embeddings/generation/capture only. Same layout/native/security flow also passed with Vite development URL5189. No actual device/Gateway call in these synthetic runs.
- Actual SVG64×32 image decoding checked in full preview, along with upload/replace/delete, missing-reference validation, test CRUD and reload persistence.
- [Rendered receipts](m10/rendered.json), [extra interaction receipts](m10/extras.json), [synthetic call/concurrency summary](m10/synthetic-summary.json), [real AUTO/retrieval receipt](m10/live-auto-rag.json).

Reproduce using [the acceptance tooling README](../../scripts/acceptance/README.md). The clean-run commands used the existing `PLAYWRIGHT_MODULE=/home/lisophorm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core`, `M10_WORKDIR=/tmp/cockpit-m10-final`, `M10_PORT=8770`, and `node scripts/acceptance/m10_electron.cjs` followed by `node scripts/acceptance/m10_extras.cjs`. Backend: `backend/.venv/bin/python scripts/acceptance/m10_backend.py --workdir /tmp/cockpit-m10-final --mode synthetic --port 8770`.

## Acceptance matrix

PASS denotes the specified layer, not an assertion that every failure was provoked against a paid provider. Current full suites and the clean real-service rendered runs are the common base.

| Cases | Result and layer | Evidence |
|---|---|---|
| A01 | PASS deterministic transport/offline/unknown receipt/duplicate/late events | Backend transport + frontend transport/reducer suites; real two-client WebSockets |
| A02 | PASS immutable20/45/90s source and invalidation | Snapshot/answer/transport suites, frozen server rerun in rendered receipts |
| A03 | PASS real pointer/keyboard selection, incoming text stability, target reset/clear and zero-call pin | Rendered receipts; target/source unit regressions |
| A04 | PASS streamed success, partial/pre-stream failure, empty, cancel, retained card, exact rerun | Clean real-service rendered checks and answer/stream suites |
| A05 | PASS no_documents/no_matches/retrieval failure/used and truthful provenance | Answer service suite, four real file readers, rendered no-docs/used; real Gateway embeddings/used receipt |
| A06 | PASS profile/custom/model/attachment precedence and frozen inputs | Workbench/app/role/native suites; real screenshot preview/removal; no screenshot uploaded to Gateway |
| A07 | PASS exact renderer sizes, pointer/keyboard dividers and125/150%zoom | Screenshots and rendered receipts; native compositor clamping explicitly separate |
| A08 | PASS reading anchors, kept cards, store capacity and no silent eviction | Reading-anchor, snapshot, transport and AUTO flood suites; rendered Keep/rerun |
| A09 | PASS Sound focus/Escape/source/stop/monitor behavior | Sound suite, desktop/compact screenshots, real system monitor and continued transcription |
| A10 | PASS original Settings/RAG/catalog handlers and retained drafts | Real SQLite/readers, rendered four-format ingest/list/reload, Settings parity suite |
| A11 | PASS benchmark test/image CRUD, missing refs and full preview | Extras receipts including actual64px image decode and persistence |
| A12 | PASS benchmark orchestration/log/usage/score/history/de-duplication | Rendered mock-provider run, backend benchmark suite, frontend Settings parity suite; no paid benchmark run |
| A13 | PASS stored key values/images/tests/history/RAG across reload | Rendered six-key comparison, extras reload, backend reopen test; original RAG byte hashes unchanged |
| A14 | PASS bounded/fallible detector and source grounding | Detector/Gateway suites; real movie produced grounded proposed/review/incomplete cards; no semantic accuracy score claimed |
| A15 | PASS edit/split/merge/dismiss/undo/correction/stale mutation | Questions/correction suites, extras real edit/dismiss/undo; original sources/cards retained |
| A16 | PASS owned AUTO/holds/manual priority/deferred publication | AUTO and frontend AUTO suites, synthetic rendered AUTO; eligible real AUTO/retrieval receipt |
| A17 | PASS two owners/epochs/reconnect/stop/clear and no replay | Real two-client transport/AUTO suites; rendered Stop disarms |
| A18 | PASS native global delivery/refusal/capture/fallback, no global Escape | M09 OS-delivery/registration-conflict evidence for unchanged native bridge; M10 actual security readback and native regression suite |
| A19 | PASS opaque pin/Focus/minimize/restore/state/meter | M09 native pin/restore evidence; M10 actual Electron Focus retains DOM/cards/meter |
| A20 | Optional native translucency unsupported | ADR0021/Electron31 documented resizable opaque fallback; no native blur claimed |
| A21 | PASS untrusted evidence and narrow IPC/CSP | Answer/Gateway/model/IPC suites and production native readback; no cloud audio |
| A22 | PASS bounded concurrency/flood and actual system sample | AUTO flood81-question/current suites, synthetic max concurrency1, real movie capture |
| A23 | PASS development and production file-loaded Electron | Actual launches, renderer exceptions0, CSP/contextIsolation/Node readback |
| A24 | PASS real capture→local STT→manual and eligible AUTO→real embeddings/RAG→rendered answer | YouTube source, live metadata above and live AUTO receipt; user-directed continuous operation separate from bounded trial |
| A25 | PASS fragmented SSE/Unicode/cancel/failure/real pre-terminal rendering | Gateway streaming/answer suites, delayed real-WS rendered strong/table/code before terminal |
| A26 | PASS model/override/capability/fallback validation | Model role/Gateway/transport suites; actual saved model honored in live answers |
| A27 | PASS scoped nullable timings, separate clocks and missing-metric honesty | Timing/reducer suites; live adapter/acceptance metrics below; unavailable speech clocks explicit |
| A28 | PASS stalled/disabled/empty detector independent of manual streaming | Detector/answer/AUTO suites; real first manual answer with detection disabled; five-revision empty-pass regression |

## Measurement limits and final live state

- Real first manual run: local tiny Whisper CPU/int8 and actual monitor; one manual text answer, three detector starts, no eligible AUTO in that bounded90second sample. The user then asked that normal listening/question detection keep running, so the operator session was restored **without test watchdogs**, in Assist. A later new eligible proposal produced exactly one observed real AUTO answer; returned to Assist immediately. This continued user operation is not presented as staying within the earlier three-call smoke budget.
- Authoritative backend clock metrics and token counts are recorded above. AUTO has no invented client press timestamp. Client speech-end-to-first-useful text and reference-aligned STT finalization lag are **UNAVAILABLE**: ongoing movie audio has no annotated speech-end/reference transcript clock. No cross-clock subtraction or inferred WER/semantic accuracy. Tiny-model fragments can be imperfect; proposals and answers remain unreviewed.
- Cost: actual provider token usage available; answer-provider billed cost not returned by this adapter, so **UNAVAILABLE**, not zero. Real benchmark **NOT RUN**; synthetic benchmark parity passed.
- Last restored-audio observation: meter active and transcription running; final-row/question counts were464/141 before a short recheck. Subsequent counts are recorded in the final handoff. No playback/volume/routing change was made by the agent.
- Required functional cases passed. M10 COMPLETE within the explicit layers/measurement limits above; optional A20 remains unsupported. M11 final documentation/release handoff is next.

## Screenshots (synthetic application content only)

- [Desk1680×1000](m10/desk-1680x1000.png), [Desk1440×900](m10/desk-1440x900.png), [Desk1000×720](m10/desk-1000x720.png).
- [Focus960×800](m10/focus-960x800.png), [Sound desktop](m10/sound-desktop.png), [Sound compact](m10/sound-compact.png).
- [125%zoom](m10/zoom-1.25.png), [150%zoom](m10/zoom-1.5.png).

Final operator recheck: rows464→465 over5.5seconds, meter active, transcription=true, questions141. Continuous service and suggestions remained running. No new capture session or paid smoke was started for this check.

## Cleanup and handoff

Synthetic backends8767/8770 and the owned Vite5189 server stopped after evidence capture. Test Electron windows closed. The user's requested real continuous session remains: backend161828 on8765, Electron159182/controller159168, Assist and suggestions enabled, isolated `/tmp/cockpit-m10-live` profile/RAG. Original private runtime DB files remain byte-identical; no secret/config file changed. Temporary acceptance storage retained for reproducibility; repository evidence contains synthetic screenshots/metrics only, not movie transcript or desktop captures. M11 should preserve this live session and distinguish its temporary data from normal persistent user storage.
