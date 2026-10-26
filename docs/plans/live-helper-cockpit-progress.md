# Live Helper cockpit progress

Last updated: 26 October 2026. M00–M08 (including RT01/M3bis) COMPLETE within their recorded scopes. M08 COMPLETE (synthetic/local-service): owned FULL AUTO, explicit arm, newest pending, manual priority/holds, deferred publication, review gates and lifecycle races. Backend 226/226; frontend 186/186; production build PASS (304 modules); standalone TypeScript PASS after the Vite typing follow-up. No paid inference/audio/native acceptance in M08. Next M09-T01.

Plan: [execution plan](live-helper-cockpit-execution-plan.md). Requirements: [implementation brief](../prompts/live-helper-cockpit-implementation.md).

**Keep this second Markdown current after every task, check, failure, interruption, and handoff.** This file is the implementation working memory. Do not rely on chat history.

## Resume here

- Active follow-up: [PR #1 review remediation](../notes/2026-10-26-pr1-review-remediation.md), R1–R5 implemented; backend238/frontend188/typecheck/build304 PASS. Runtime-data history sanitization/audit PASS; checked PR publication pending. M09 remains next implementation milestone after review closure.

- Publication follow-up: [PR #1](https://github.com/monsteruk-crm/SuperCheeto/pull/1) is open against `master`; the original implementation was published on `vercel-ai` (commit hashes changed during PR data sanitization). Standalone TypeScript errors are resolved; all final checks pass. Next implementation milestone remains M09-T01.

- M08-T01–T09 COMPLETE. [M08 acceptance](../notes/2026-10-26-m08-acceptance.md) maps tasks, 32 shared v6 fixtures, deterministic races/flood, actual two-client WS and rendered evidence. [ADR 0019](../adr/0019-owned-full-auto-scheduling.md) accepted for this scope. Historical M00–M07 entries remain intact.
- Next **M09-T01**: INDEX → STATUS → this ledger → `sed -n '455,471p' docs/plans/live-helper-cockpit-execution-plan.md`. Inventory installed Electron/display/compositor and official version-specific native support before IPC/shortcut/window changes. No silent Electron upgrade.
- Latest gates: backend 226 PASS; frontend 186 PASS (11 files); build304 PASS; diff PASS; user data clean. Standalone TypeScript now passes after adding the Vite client type reference; the three historical baseline errors are resolved.
- v6 advertises `full_auto`; v2–v5 preserve manual contracts. Server owns explicit arming and revisioned configuration. One active answer/newest pending/deferred result; holds never stop capture. Every AUTO draft unreviewed/source-linked. Human targets remain manual. No inbox backfill or reconnect replay.
- Final rendered synthetic run proved automatic start, completed held publication/release, manual takeover/partial retention, Wrong question/linked correction, Pause, Stop listening and reload to Assist. Maximum concurrent answers 1. Listening state/header/Sound now reconcile on reload; final frontend suite/build/rendered check repeated after that fix.
- Gateway-only routing from M07 preserved; no private config edits or new paid request/audio session/retry path. No paid inference, actual capture/STT, real latency or native acceptance attempted. User help may be needed for native/device checks in M09/M10.
- Cleanup complete: isolated backend/Vite stopped; temporary SQLite removed; viewport reset/tab closed. User RAG data and unrelated dirty files/backups preserved. No commit/deployment. ADR 0011 remains Proposed until full M11 handoff.
- Historical checkpoints below describe their own iteration; this section supersedes their next-task pointers.

## Status conventions

Task/milestone status: `NOT STARTED`, `IN PROGRESS`, `BLOCKED`, or `COMPLETE`.

Check result: `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`.

- COMPLETE requires the plan's gate and documentation updates.
- BLOCKED identifies the missing prerequisite and exact unblock action.
- NOT RUN never counts as evidence of a working feature.
- Keep synthetic, live-service, real audio, and native results separate.
- Optional native transparency can have a documented limit. Required acceptance cannot be waived by a passing build.

## Milestones

| ID | Task range | Status | Gate/evidence | Next task |
| --- | --- | --- | --- | --- |
| M00 | T01 to T07 | COMPLETE | Baseline recorded; deterministic harness 7/7 PASS; `npx tsc --noEmit` baseline failure identified and kept | M01-T01 |
| M01 | T01 to T07 | COMPLETE | ADR 0011 C01-C06; ADR 0012; API v2 payloads; shared `contracts/v2/` fixtures parsed identically by backend + frontend | M02-T01 |
| M02 | T01 to T07 | COMPLETE | Audio epochs + segment keys; immutable recent/selection/pinned snapshots; capacity + GC; 22/22 snapshot tests PASS; pinning makes no model call | M03-T01 |
| M03 | T01 to T07 | COMPLETE | Connection identity + `send_to` + lifecycle hooks; hello/capabilities (`assist`, `snapshots`); control lease; command idempotency/reconciliation; scoped request lifecycle; legacy scoping; reducer. 18/18 two-client backend tests, 44/44 frontend tests PASS | M3bis-T01 |
| M3bis | T01 to T07 | COMPLETE | Audit recorded; protocol v3 (model readiness + C08 timing) specified in API/ADR 0014, modelled, parsed on both sides, transported and reduced; `contracts/v3/` shared fixtures; 118 backend + 72 frontend tests PASS; no detector/AUTO capability advertised | M04-T01 |
| M04 | T01 to T08 | COMPLETE | 160 backend tests; acceptance/rollback, frozen exact rerun, reasoning, evidence/security/empty/failure/cancellation matrix; v4 contracts and docs. See final acceptance note. | M05 complete |
| M05 | T01 to T10 | COMPLETE | 106 frontend tests/build; delayed real-WS stream; required sizes, pointer/keyboard/reload/anchors, modes/targets/notes, Markdown and screenshot bridge harness; one live inference. See final acceptance note. | M06-T01 |
| M06 | T01 to T09 | COMPLETE | 175 backend + 115 frontend tests/build; synthetic monitoring/source/focus checks, real temporary RAG readers, backend benchmark orchestration and rendered Sound/Settings/persistence. ADR 0017 and final evidence. | M07-T01 |
| M07 | T01 to T09 | COMPLETE | 198 backend + 146 frontend tests/build; v5 shared fixtures; rendered edit/split/merge/dismiss/undo/correction; Gateway guard/audit; ADR 0018 and final evidence | M08-T01 |
| M08 | T01 to T09 | COMPLETE | 226 backend/186 frontend/build304; v6 fixtures, two-client races, 81-question flood, rendered holds/manual correction/reload; ADR 0019 and acceptance note | M09-T01 |
| M09 | T01 to T08 | NOT STARTED | Native controls not implemented | M09-T01 |
| M10 | T01 to T08 | NOT STARTED | Integrated acceptance not run | M10-T01 |
| M11 | T01 to T05 | NOT STARTED | Final documentation/acceptance handoff pending | M11-T01 |

## Environment and worktree baseline

Refreshed during M00-T01/T03/T04. Repository root `/home/lisophorm/PycharmProjects/PythonProject`.

- Branch: `vercel-ai`. HEAD: `00690a5`.
- Dirty tracked paths before M00: `.gitignore`, `docs/CHANGELOG.md`, `docs/INDEX.md`, `docs/STATUS.md`, `docs/adr/INDEX.md` (pre-existing edits preserved).
- Untracked before M00: `.mcp_memory/`, `docs/adr/0011-question-assistance-cockpit.md`, `docs/design/`, `docs/plans/`, `docs/prompts/live-helper-cockpit-implementation.md` (pre-existing, preserved).
- M00-added paths: `frontend/vitest.config.ts`, `frontend/src/cockpit/__tests__/` (setup, helpers, fixtures, tests), plus edits to `frontend/package.json`, `README.md`, `frontend/README.md`, `docs/CHANGELOG.md`, `docs/STATUS.md`, this ledger.
- Interpreter: `backend/.venv/bin/python` -> `python3.14`; Python `3.14.4 (main, Aug 20 2026) [GCC 15.2.0]`. Also present: `python3.12 -> /usr/bin/python3.12`.
- Imported dependency paths: `faster_whisper` at `backend/.venv/lib/python3.14/site-packages/faster_whisper/__init__.py`; `websockets` at `backend/.venv/lib/python3.14/site-packages/websockets/__init__.py`.
- Node `v24.21.0`; npm `11.19.0`; Electron `31.7.7` (via `require('electron/package.json').version`).
- Existing running services/processes: none owned by this project at the end of M02/M03. No `app.main`, `vite`, `electron`, or `scripts/dev` process running. Ports `8765` (backend WS) and `5173` (Vite) not listening.
- M02/M03 test isolation: every transport test binds an ephemeral port (`127.0.0.1:0`), uses the real hub and controller handlers, a mocked generation runner, a stub RAG store, and fake frontend timers. No audio capture, no RAG SQLite write, no native window.
- `git diff --check`: PASS (no whitespace errors).
- Persistence boundaries (M00-T03, existence/shape only):
  - `ui-preferences.v1` (frontend `App.tsx`): `audioMode`, `selectedSystemAudioSource`, `selectedMicAudioSource`, `customInstruction`, `selectedModel`, `selectedPresetId`, `includeScreenshotInQuery`.
  - `benchmark-history.v1` (frontend `App.tsx`): `BenchmarkRun[]`, de-duplicated by `benchmarkId`, capped at 40.
  - `benchmark-images.v1` (frontend `App.tsx`): `BenchmarkImageAsset[]` (`refId`, `dataUrl`, `filename`, `createdAt`).
  - `benchmark-tests.v1` (frontend `SettingsPage.tsx`): `{rowId, testId, imageRef, userPrompt}[]`.
  - RAG SQLite: effective default `backend/data/rag.sqlite` (env override `RAG_DB_PATH`). Present on disk: tables `documents` (`doc_id,file_path,title,sha256,file_size,file_mtime,chunk_count,updated_at`; 1 row) and `chunks` (`chunk_id,doc_id,chunk_index,text,vector,dim,norm`; 10 rows). Contents not printed.
  - Browser localStorage lives in the Electron user-data profile (`audio-transcriber-ui`), which does not currently exist on disk; keys are defined in source and recreated on first launch. No private contents inspected.
- Credentials/private files: not inspected. No paid calls, recording, or RAG ingestion performed.

## M3bis delta audit (T01)

Audited on 25 October 2026 against the brief's "Realtime text responses" contract and plan C07/C08, using the current code, API.md, ADR 0012/0013 and the M03/RT01 tests. Classifications: **satisfied** (kept as is), **missing** (required, absent), **conflict** (existing behavior violates the new requirement), **partial** (exists but too weak for the gate). No RT01 streaming regression was found; the adapter's terminal/partial/empty/cancel behaviour and `test_gateway_streaming.py` were left untouched.

| # | Requirement (brief / C07 / C08) | State before M3bis | Class | Resolution |
| --- | --- | --- | --- | --- |
| 1 | Local capture/STT → frozen text → async Gateway SSE → scoped chunks → card; no cloud audio or provider voice session | Implemented by RT01; `test_gateway_streaming.py` covers framed SSE, cancellation, empty/partial | satisfied | Preserved unchanged; no provider audio path added |
| 2 | Fragment/UTF-8/SSE framing, reasoning exclusion, terminal validation, no retry, usage | Adapter + 23 `test_ai_gateway_client` cases | satisfied | Re-ran focused suite (52 tests with the new modules); no adapter edit |
| 3 | Initial default `google/gemini-3.8-flash` with supported low reasoning; preserve explicit env/saved selection | `ai_gateway_client.DEFAULT_TEXT_MODEL` + model-specific `reasoning`/`reasoning_effort`; `settings.ai_gateway_model` | satisfied (behaviour) / **missing** (no record of the accepted setting) | Added `ModelSettings.reasoning{effort, applied, supportedEfforts, source}`; `applied` only for the verified default |
| 4 | Freeze effective model/role/profile/reasoning/screenshot with the request (C08) | `RequestRecord.metadata` held instruction/notes/screenshot boolean only; no model provenance | **partial** | Added `frozen_inputs` + `model_settings` on the record and `answer_accepted.frozenInputs.{model,screenshot}` (v3) |
| 5 | No silent model swap | `normalize_gateway_model_id` remapped deprecated aliases invisibly | **conflict** | Mapping kept for compatibility but now reported as `selectionSource: deprecated_alias` + `substitutedFrom` + `notice` |
| 6 | Never drop an explicit screenshot; reject unsupported image input visibly | `_accept_v2_answer` set `screenshot_data_url=None` when the URL was unusable and never checked model image support | **conflict** | Preflight `require_image_input` → `unsupported_capability`; attachment `{requested, included, reason}` recorded; no paid call, target retained |
| 7 | Required role validated (answer vs detector), structured output for proposals | No role concept at all | **missing** | `ModelRole` + registry (`model_roles.py`); detector requires verified `structured_output` (execution stays M07) |
| 8 | Catalog uncertainty honest; unavailable model surfaced | No catalog was retained after `models_list`; nothing could be called unavailable | **missing** | `_known_language_models` caches the catalog actually read; `unavailable_model` only when a read catalog lacks the model, otherwise `certainty: unknown` |
| 9 | Preflight failure retains the target and avoids a paid call | Instruction/mode validated, but the snapshot was frozen before any model check | **partial** | Model preflight moved ahead of snapshot consumption in both run handlers; transport tests assert no `snapshot_created`/generation on rejection |
| 10 | Timing fields, units, clock origin, nullable values, event placement (C08) | One `latencyMs`; no clock, stage or nullability semantics | **missing** | `answer_timing` (independent `timingSeq`) + `answer_finished.timing`; `server_monotonic` ms from acceptance; `unavailable[]`; documented in API "Protocol v3" + ADR 0014 |
| 11 | Press → first-visible on one client clock; receive ≠ display | No press instant on the wire and no display checkpoint | **missing** | Optional `clientPressedAtMs` (echoed only) + reducer `local_first_visible`/`pressToVisibleMs` (M05 supplies the checkpoint) |
| 12 | Never subtract client from backend time; never substitute zero | Nothing existed to misuse, but no contract forbade it | **missing** | Separate `timing.backend`/`timing.client` blocks with fixed clock labels; parser rejects cross-labelled and out-of-order values; reducer keeps the fields apart |
| 13 | Timing follows scoping/stale rules and cannot revive a terminal record | No timing events | **missing** | Scoped `answer_timing` + `timingSeq`; reducer ignores terminal records and older sequences; transport test asserts no post-cancel update |
| 14 | Wire change is versioned (AGENTS.md) and v2/legacy preserved | Only v2 existed; no negotiation | **missing** | `protocolVersion 3` with highest-common negotiation; v2 payloads unchanged; `contracts/v2/` untouched; `invalid_v2_payload_at_v3` documents strictness |
| 15 | Legacy manual adapter + definitive response before nonterminal state | Implemented in M03 | satisfied | Regression test unchanged and still green |
| 16 | Tests cannot construct a live external client | Only the RAG path was stubbed; nothing asserted no HTTP client | **partial** | Added a transport test that patches `httpx.AsyncClient` to raise while a full v3 answer completes |
| 17 | Metadata after cancellation (partial text retained, real outcome kept) | Cancellation path returned `answer_finished` with no timing/metadata assertions | **partial** | Added a v3 test: partial text, `cancelled`, `completedMs` present, no later `answer_timing` |

Outcome: items 1, 2, 15 are preserved as-is; the rest were implemented in M3bis-T02 to T05. Detector/AUTO execution, first-visible display and live measurement remain M04/M05/M07/M10 and are **not** claimed.

## Decisions and implementation pointers

- **M3bis (25 October 2026): protocol v3.** [ADR 0014](../adr/0014-protocol-v3-timing-and-model-readiness.md) accepts the amended contract; ADR 0012 is amended (not replaced) and keeps the v2/ownership/lifecycle authority. The server accepts and negotiates versions 2 and 3 (`SUPPORTED_WIRE_VERSIONS`), returns `hello_ack.protocolVersion` + `supportedProtocolVersions`, and uses the negotiated version in every later envelope. v3-only capabilities: `model_readiness`, `timing`. `candidates`/`answer_records`/`full_auto` stay unadvertised.
- M3bis runtime paths: `backend/app/model_roles.py` (new: role/capability registry + preflight), `backend/app/cockpit_models.py` (v3 constants, model/timing dataclasses, `unsupported_capability`/`unavailable_model`), `backend/app/cockpit_protocol.py` (v3 parsing: model settings, backend/client timing, `answer_accepted`, `answer_timing`), `backend/app/assistance.py` (`capabilities_for`, `negotiate_protocol_version`, request-record frozen/timing fields), `backend/app/main.py` (negotiation, preflight before snapshot, frozen inputs, `answer_timing` at acceptance, final `timing`/`modelSettings`), `backend/app/ws_server.py` (`ConnectionInfo.protocol_version`).
- M3bis frontend paths: `frontend/src/ws.ts` (advertises `[3,2]`, adopts the negotiated version, dispatches `answer_timing`), `frontend/src/cockpit/types.ts`, `frontend/src/cockpit/protocol.ts` (`parseModelSettings`, `parseBackendTiming`, `parseClientTiming`, `parseAnswerTiming`, `parseScreenshotAttachment`, `parseAnswerAcceptedEvent`, `parseAnswerTimingEvent`), `frontend/src/cockpit/reducer.ts` (separate `backendTiming`/`clientTiming`, `timingSeq`, `frozenInputs`, `modelSettings`, `local_first_visible`, `pressToVisibleMs`).
- Shared fixtures: **`contracts/v3/`** (6 valid, 9 invalid) read by both harnesses. **`contracts/v2/` is unchanged** — a v2 payload offered to a v3 context is `incompatible_version` by design.
- Timing reality check (do not overclaim): only the **acceptance anchor** and **`completedMs`** are produced today. `rag`, `generation` and first-delta stay `null` and are listed in `timing.backend.unavailable`; `client.firstVisibleMs`/`terminalReceivedMs` are client facts (M05). `latencyMs` is retained for the benchmark/legacy path and is **not** a substitute for `timing.generation`.
- Model-readiness policy applies to v2 requests too (runtime policy, not a payload change); only the *reporting* block is v3-only.
- Known limitation recorded for M04: `_freeze_inputs` runs before snapshot creation, so a rejected press does not consume the target; a successful freeze followed by a superseded request still releases its snapshot through normal GC.

- Plan revision 3 (25 October 2026) aligns the revised brief with explicit C07/C08 tasks and A25–A28 acceptance cases. M3bis contains follow-up contract/type/transport work for completed milestones. M04/M05 own actual backend timing and first-visible display; M07 owns detector evaluation; M10 owns bounded live measurements. No runtime/API/ADR status changed in this planning iteration. M3bis must document/version any wire changes before implementing them.
- RT01 (23 October 2026 user clarification): the model receives transcript text. [ADR 0013](../adr/0013-stream-transcript-text-answers.md) accepts async Gateway SSE text answers and the initial `google/gemini-3.8-flash`/low-reasoning default. Existing environment/saved model selections remain; no private `.env` or preferences changed. `google/gemini-3.5-flash-lite` is a provisional detector choice for M07, not implemented detection. Public catalog checked (480 models); live access/latency/quality NOT RUN. Plan C07 and the brief govern continuation. No WS payload/version change.
- RT01 runtime paths: `backend/app/ai_gateway_client.py` (framed SSE, terminal/error/cancellation/empty handling, usage/timing, model-specific reasoning), `backend/app/settings.py`, `backend/.env.example`; tests `test_gateway_streaming.py` (new), `test_ai_gateway_client.py` (valid SSE/terminal usage/realtime filtering), `test_cockpit_transport.py` (Gateway→owned failed/empty regression). Full backend suite 92/92 PASS, focused suite 51/51 PASS. No runtime service, audio capture, paid inference, ingest or persistence mutation was performed in RT01.
- Existing ADR 0011 remains Proposed. Planning does not accept its implementation decisions.
- Execution defaults and contracts are C01 to C06 in the plan; ADR 0011 now records C01-C06 in full.
- Protocol ADR created in M01-T02: **`docs/adr/0012-cockpit-protocol-and-session-lifecycle.md`** (Proposed). It covers protocol v2, single-controller ownership, scoped lifecycle, legacy migration, the M01-T05 state machine, and test-tool choices.
- Frozen constants (C06, recorded in ADR 0011 and to be encoded as named constants in code): recent-context 20/45/90 s (default 20); detector lookback 90 s of finalized text from the current audio epoch; detector debounce 1.0 s (configurable 0.8-1.2 s); detector concurrency one active + one latest-revision dirty flag; detector output ≤ 8 proposals, 1,500 output tokens, 15 s timeout; detector context ≤ 12,000 chars with a visible truncation notice; ≥ 2 s between detection starts; generation concurrency one active + one newest pending AUTO candidate; candidate working set 200; working answers 50; kept answers/human notes 50; unattached pinned moments 50; source snapshot size 24,000 chars.
- Shared contract fixtures live at **`contracts/v2/`** (new top-level path; justified because both harnesses read the same files). Index: `contracts/v2/index.json`.
- New v2 code paths added in M01: `backend/app/cockpit_models.py`, `backend/app/cockpit_protocol.py`, `frontend/src/cockpit/types.ts`, `frontend/src/cockpit/protocol.ts`. They are specification-only; no v2 message is emitted or accepted by the runtime.
- M02-added paths: `backend/app/source_snapshots.py` (new), plus rewrites of `backend/app/transcript.py`, `backend/app/main.py` (epoch rotation, partial tracking), and `backend/tests/test_cockpit_snapshots.py` (new). `Snapshot` gained `tentative`.
- M03-added paths: `backend/app/assistance.py` (new), rewritten `backend/app/ws_server.py`, extended `backend/app/main.py`, `backend/tests/test_cockpit_transport.py` (new), rewritten `frontend/src/ws.ts`, new `frontend/src/cockpit/reducer.ts`, new `frontend/src/cockpit/__tests__/transport.test.ts` and `reducer.test.ts`, extended `frontend/src/cockpit/__tests__/app_harness.test.tsx` and `helpers/fakeTransport.ts`.
- Runtime contract decisions taken in M02/M03 (documented in API.md and ARCHITECTURE.md):
  - `segmentKey` is `<audioEpoch>#<segmentId>`; the live tail is `<audioEpoch>#partial`.
  - Recent-window snapshots are restricted to the anchor's audio epoch, because capture-relative timestamps restart on every capture.
  - `create_snapshot` accepts `sourceSpans` when `kind` is `selection` (the M01 payload had no way to create a selection snapshot).
  - `command_ack` carries optional `code`/`message` for rejections (the M01 payload had no error channel for rejected commands).
  - API.md's `stale_anchor` was replaced by the stable codes `stale_revision` (unknown key) and `stale_epoch` (superseded epoch); `stale_anchor` was never in `ErrorCode`.
  - The legacy worker now emits `query_response` before the nonterminal `query_state {running:false}`.
  - Implemented v2 commands are rejected with `not_ready` only when unimplemented; capabilities advertise `assist` and `snapshots` only.
- ADR 0012 status changed Proposed → **Accepted (M03)** for the transport/lease/lifecycle/legacy scope. ADR 0011 remains Proposed.
- Protocol/runtime compatibility and native behavior must still be verified during execution.
- No implementation deviation recorded.

## Feature parity inventory

Expand this table in M00-T02 to enumerate individual actions and handlers. Keep the required groups below.

| ID | Existing capability group | Destination/check | Result | Evidence |
| --- | --- | --- | --- | --- |
| P01 | System/mic mode, quick switch, selectors, refresh, Start/Stop and meters | Sound + header selected-input meter | PASS (synthetic) | M06 automated + CUA; actual devices/STT M09/M10 |
| P02 | Exact selection/time range, edit/reset/clear, following/jump, transcript clear | Raw panel and conditional target editor | PASS | M05 harness + rendered CUA; final acceptance note |
| P03 | Model selection/refresh, all presets, Run preset/custom, custom instruction | Guide controls; original Settings retained | PASS (Desk) | M05 harness + CUA; full Settings parity remains M06 |
| P04 | Streaming, Stop, frozen server rerun, selected-text Answer, truthful request metadata | Identified answer cards/details | PASS | M04/M05 automated + mock WS + one live inference |
| P05 | Screenshot capture/shortcut, preview/removal, inclusion preference | Existing bridge wired to Desk | PASS (renderer); native NOT RUN | M05 mocked IPC harness; actual capture/shortcut M09/M10 |
| P06 | RAG file/folder TXT/MD/PDF/DOCX, list/metadata/refresh/clear/notices | Original Settings; real temporary SQLite | PASS (isolated) | M06 UI actions/results + actual reader/store test; rendered TXT ingestion/clear |
| P07 | Query Settings and Model Catalog metadata/refresh | Original Settings | PASS (synthetic) | M06 Settings harness + rendered catalog; screenshot preference existing harness |
| P08 | Benchmark model multi-select/repeats/test CRUD/image refs | Original Settings | PASS (synthetic) | M06 Settings harness + real backend benchmark orchestration with injected Gateway |
| P09 | Image upload/replace/delete/stable refs/preview | Original Settings | PASS (synthetic) | M06 UI upload/replace/preview/delete/reference validation and remount persistence |
| P10 | Benchmark logs/results/latest/tooltips/history/clear/deduplication | Original Settings and handlers | PASS (synthetic) | M06 harness/backend + rendered log/history/clear; live paid benchmark M10 |
| P11 | Desk prefs/tests/history/images/RAG persistence | Existing keys and isolated DB | PASS (isolated) | M06 remount/reopen and browser reload; real user data untouched |
| P12 | Settings navigation and unsaved state | Mounted original pages | PASS | M06 harness + CUA; Desk drafts/raw anchors retain M05 evidence |

Stored keys reconfirmed from source in M00-T03: `ui-preferences.v1`, `benchmark-history.v1`, `benchmark-images.v1`, `benchmark-tests.v1`, plus the RAG SQLite at `RAG_DB_PATH`.

### Action-level parity inventory (M00-T02)

Each row is an existing, currently implemented action with its source handler, destination, stored key, and how it is verified. Groups P01-P12 above remain the summary; this table expands them.

| ID | Existing action | Handler (source) | Destination / wire | Stored key | Verification method |
| --- | --- | --- | --- | --- | --- |
| D01 | Input mode select (system/mic) | `PromptBar` select -> `App.changeAudioMode` | `set_audio_mode` | `ui-preferences.v1.audioMode` | Harness fake transport |
| D02 | Quick `Switch to ...` | `App.toggleAudioMode` | `set_audio_mode` | `ui-preferences.v1.audioMode` | Harness |
| D03 | System source select | `App.changeSystemAudioSource` | `set_audio_source` | `ui-preferences.v1.selectedSystemAudioSource` | Harness |
| D04 | Mic source select | `App.changeMicAudioSource` | `set_mic_source` | `ui-preferences.v1.selectedMicAudioSource` | Harness |
| D05 | Refresh sources | `App.refreshAudioSources` | `get_audio_sources` | none | Harness |
| D06 | Start | `App.startTranscription` | `set_audio_mode` + `set_audio_source`/`set_mic_source` + `start_transcription` | none | Harness |
| D07 | Stop | `App.stopTranscription` | `stop_transcription` | none | Harness |
| D08 | System/Mic meters (always-on) | `App.onAudioLevel` | local state (no wire) | none | Harness/fixture |
| D09 | Model select | `App.setSelectedModel` | local state (refresh via `get_models`) | `ui-preferences.v1.selectedModel` | Harness |
| D10 | Capture Screen | `App.captureScreen` / shortcut | Electron `capture-screen` IPC | auto-sets `includeScreenshotInQuery` | Native (M09/M10) |
| D11 | Preset select | `App.setSelectedPresetId` | local state | `ui-preferences.v1.selectedPresetId` | Harness |
| D12 | Run preset | `App.runPreset` -> `executeQuery` | `run_query` | in-memory `lastQueryPayload` | Harness |
| D13 | Custom instruction edit | `App.setCustomInstruction` | local state | `ui-preferences.v1.customInstruction` | Harness |
| D14 | Run custom | `App.runCustom` -> `executeQuery` | `run_query` | in-memory `lastQueryPayload` | Harness |
| D15 | Status pill / backend error banner | `App.onStatus` / `onError` | local state | none | Harness |
| D16 | Transcript selection (sticky) | `TranscriptPane` `selectionchange` -> `App.onSelectionChange` | local state | in-memory `selectedText` | Harness/M05 |
| D17 | Pause/Resume auto scroll | `TranscriptPane` local state | none | none | Harness |
| D18 | Scroll to Latest | `TranscriptPane.scrollToLatest` | none | none | Harness |
| D19 | Clear Selection | `TranscriptPane.clearSelection` | `onSelectionChange('', null)` | none | Harness (M00-T06) |
| D20 | Clear transcript | `App.clearTranscript` | `clear_transcript` | none | Harness (M00-T06) |
| D21 | Stop query | `App.stopQuery` | `cancel_query` | none | Harness |
| D22 | Do it again | `App.runLastQueryAgain` | `run_query` (reuses `lastQueryPayload`) | none | Harness |
| D23 | Answer (selected text) | `App.runAnswer` | `run_query` | none | Harness |
| D24 | Reset to selection | `App` reset handler | local state | none | Harness |
| D25 | Selected-text editor | `OutputPane` textarea | local state | in-memory `selectedTextDraft` | Harness |
| D26 | Screenshot preview/trash | `App` clear handlers | local state | none | Harness |
| D27 | Response metadata (latency/model/screenshot) | `App.onQueryResponse` | local state | none | Harness |
| D28 | Desk/Settings tabs | `App.setActivePage` | local state | none | Harness (M00-T06) |
| D29 | "Selected text" footer | `App` render only | display only | none | Harness |
| S01 | Include screenshot toggle | `SettingsPage` -> `onToggleIncludeScreenshot` | local state | `ui-preferences.v1.includeScreenshotInQuery` | Harness (M00-T06) |
| S02 | RAG ingest | `SettingsPage` -> `onRagIngest(paths)` | `rag_ingest` | RAG SQLite | Harness/M06 |
| S03 | RAG refresh list | `SettingsPage` -> `onRagRefresh` | `rag_list` | RAG SQLite | Harness/M06 |
| S04 | RAG clear | `SettingsPage` -> `onRagClear` | `rag_clear` | RAG SQLite | Harness/M06 |
| S05 | RAG document list render | `App.onRagDocuments` | local state | RAG SQLite | Harness/M06 |
| S06 | RAG ingest notice | `App.onRagIngestResult` | local state | none | Harness/M06 |
| S07 | Model catalog refresh | `SettingsPage` -> `onRefreshModelDetails` | `get_model_details` | none | Harness/M06 |
| S08 | Harness instruction edit | `SettingsPage` local state | none | none | Harness/M06 |
| S09 | Image upload/replace | `SettingsPage.uploadBenchmarkImage` -> `onUpsertBenchmarkImage` | local state | `benchmark-images.v1` | Harness/M06 |
| S10 | Image delete | `SettingsPage` -> `onDeleteBenchmarkImage` | local state | `benchmark-images.v1` | Harness/M06 |
| S11 | Image full-size preview modal | `SettingsPage` local state | none | none | Harness/M06 |
| S12 | Test create | `SettingsPage.createTest` | local state | `benchmark-tests.v1` | Harness/M06 |
| S13 | Test update | `SettingsPage.updateSelectedTest` | local state | `benchmark-tests.v1` | Harness/M06 |
| S14 | Test delete | `SettingsPage.deleteSelectedTest` | local state | `benchmark-tests.v1` | Harness/M06 |
| S15 | Test select/edit | `SettingsPage.selectTest` | local state | none | Harness/M06 |
| S16 | Missing image-ref warning | `SettingsPage` computed | display only | none | Harness/M06 |
| S17 | Repeats per model | `SettingsPage` local state | none | none | Harness/M06 |
| S18 | Benchmark model multi-select | `SettingsPage.toggleModel` | local state | none | Harness/M06 |
| S19 | Run benchmark | `SettingsPage` -> `App.runBenchmark` | `run_benchmark` | `benchmark-history.v1` | Harness/M06 |
| S20 | Benchmark progress | `App.onBenchmarkProgress` | local state | none | Harness/M06 |
| S21 | Live runner log | `App.onBenchmarkLog` | local state | none | Harness/M06 |
| S22 | Latest result per model | `SettingsPage` computed | display only | none | Harness/M06 |
| S23 | Benchmark history render | `App.onBenchmarkComplete` | local state | `benchmark-history.v1` | Harness/M06 |
| S24 | Clear benchmark history | `SettingsPage` -> `onClearBenchmarkHistory` | local state | `benchmark-history.v1` | Harness/M06 |

## Acceptance matrix

Current scope is M04/M05. [Final evidence](../notes/2026-10-25-m04-m05-acceptance.md) maps all tasks and records exact commands, geometry and timings. Earlier command/journal entries below are historical.

| Cases | Automated / rendered result | Remaining live/native boundary |
| --- | --- | --- |
| A01/A02/A17 ownership, lifecycle, frozen sources | PASS: offline transports/snapshots and real local WS with mock provider | AUTO holds remain M08; hardware invalidation M10 |
| A03 manual selection/target | PASS: Unicode keyboard spans, actual pointer selection during incoming final, edit/reset/clear/Pin/View raw | Candidate lineage/correction M07 |
| A04 answer outcomes/rerun | PASS: success/cancel before+after display/partial/empty/failure, exact server rerun including deleted note/evidence/image; adversarial late result ignored | One live completed answer; live cancellation not inferred |
| A05 evidence/outcomes | PASS: used/no_documents/no_matches/failed, false citation rejected, frozen provenance | Live empty temporary index only; live indexed-document case remains M10 |
| A06 profiles/models/attachments | PASS: explicit modes, preserved saved custom, Preset reload, model refresh/all presets, screenshot preview/removal/inclusion via existing mocked preload bridge | Actual native capture/shortcut M09/M10 |
| A07 layout/dividers | PASS: 1680×1000, 1440×900, 1000×720, pointer desktop/compact, all keyboard dividers, persistent reload, Transcript + and reset | Zoom/native resize matrix M10 |
| A08 stable bounded cards | PASS: protected limits/rejection/eviction, stable append/anchor/new-draft notice and selection | AUTO publication/flood M08/M10 |
| A09–A13 Sound/Settings/persistence; A14–A16 detector/AUTO | PASS for synthetic M06 Sound/Settings/data workflows; actual RAG readers/backend benchmark and CUA | Hardware/native and full E2E M09/M10; detector/AUTO M07/M08 |
| A18–A20 native controls/transparency | NOT RUN | M09/M10 |
| A21 untrusted content/IPC | PASS (M04 source/renderer scope): untrusted data labels, false citations, raw HTML/remote image suppression, narrow existing capture bridge; HTTP(S) external navigation source hardening | Actual Electron navigation/IPC mutation acceptance M09/M10 |
| A22–A24 flood/launch/full E2E | NOT RUN | M08–M10 |
| A25 streaming/reliability | PASS: Gateway split/Unicode/SSE/cancel/error/empty suite, delayed real-WS nonempty HTML before terminal, 40ms batch fallback, stale/late guards | One live answer completed; that short sample displayed after terminal, so pre-terminal proof comes from delayed mock |
| A26 readiness/overrides | PASS: default/explicit/env/alias/image/structured/reasoning/unavailable tests and visible rejection; reasoning reaches both request formats | Detector evaluation M07 |
| A27 timings | PASS: independent clocks, null/absent/stale/terminal tests, committed visible-frame timing; one live sample with actual usage | No STT or repeated latency claim; M10 |
| A28 detector-independent flow | PASS (manual): detector disabled, recent/selection/target answer service works, one active generation | Malformed/stalled detector and AUTO scheduler M07/M08 |

## Command and evidence log

| 2026-10-25 M05 selection handoff | `frontend/` | `npx vitest run src/cockpit/__tests__/app_harness.test.tsx --reporter=dot`; `npm run test -- --run`; `npm run build`; `npx tsc --noEmit` | PASS / FAIL | Exact selected offsets now reach `create_snapshot`; final frontend suite 75/75 and production build PASS (39 modules). Standalone type check retains only the three known `ImportMeta.env` TS2339 errors. Initial harness attempt exposed duplicate action labels and a typed-event dispatch regression; both were corrected before the passing run. |
| 2026-10-25 final hygiene | Repository root | `git diff --check` | PASS | No whitespace errors; unrelated dirty and untracked files remain preserved. |
| 2026-10-25 M04-T01/T03 | `backend/` | `.venv/bin/python -m unittest tests.test_cockpit_transport tests.test_cockpit_contracts tests.test_gateway_streaming` | FAIL, then PASS | First run: 46/47, one stale M3bis timing expectation (updated); subsequent 51/51 PASS including new service and retrieval identity cases. Initial service-test run also found three test harness mistakes (sync callback, missing fake file_path, terminal-event counting) and the legacy empty-index expectation; corrected and reran successfully |
| 2026-10-25 M04-T02 partial | `backend/` | `.venv/bin/python -m unittest tests.test_cockpit_transport.ProtocolV3TransportTests` | PASS | Latest run: 23 transport tests; malformed timing/reasoning/instruction/source/model/screenshot/note fields reject before snapshot/answer/generation; invalid second request leaves first running; request-history capacity rejects before snapshot creation; mismatched snapshot/target IDs reject while retaining both sources; unpinned context snapshot survives GC during acceptance handoff; empty/missing targets reject rather than falling back. Concurrent duplicate command IDs yield one accepted request/generation, and distinct concurrent commands leave one active request (superseded task never reaches runner). Explicit target survives unsupported-image preflight failure. Registry tests additionally prove oldest command outcomes and terminal request history are pruned while live capacity rejects. |
| 2026-10-25 M04-T01/T03/T04/T05/T02-partial | `backend/` | `.venv/bin/python -m unittest discover -s tests` | PASS | Previous checkpoint: 127 tests OK; synthetic runner/store, isolated temp DB + ephemeral WebSocket port |
| 2026-10-25 M04-T02 command/request capacity | `backend/` | `.venv/bin/python -m unittest tests.test_cockpit_transport.RegistryCapacityTests tests.test_cockpit_transport.ProtocolV3TransportTests` | PASS | 25 tests; oldest command outcome pruned, terminal request history pruned, all-live registry capacity rejected, and protocol acceptance cases passed |
| 2026-10-25 M04-T02 checkpoint | `backend/` | `.venv/bin/python -m unittest tests.test_cockpit_transport tests.test_answer_service` | PASS | 50 tests before epoch-race addition; recent and explicit unpinned snapshots survive GC during acceptance handoff; status reconciliation returns the captured accepted result when its lookup is pruned by the status query; missing Gateway credentials yield scoped `dependency` + definitive `failed`, with no paid generation; mocked generation/RAG and temp SQLite |
| 2026-10-25 M04-T02 partial (earlier run retained) | `backend/` | `.venv/bin/python -m unittest tests.test_cockpit_transport.ProtocolV3TransportTests` | PASS | Earlier 14/14 v3 transport run; malformed timing/effort fields reject before snapshot/answer/generation; explicit pinned target survives capability preflight failure |
| 2026-10-25 M04-T07 subset | `frontend/` | `npx vitest run`; `npm run build` | PASS | 72 tests; production build transformed 36 modules. No frontend wire type regression |
| 2026-10-25 M04 check | Repository root | `git diff --check`; `git status --short backend/data`; `.bak` scan | PASS / clean | `diff --check` emitted no errors, backend data was clean, and all editor-created `.bak` files were deleted |
| 2026-10-25 M04-T02 partial | `backend/` | `.venv/bin/python -m unittest tests.test_cockpit_transport.ProtocolV3TransportTests tests.test_cockpit_transport.RegistryCapacityTests` | PASS | 25/25 combined tests (23 transport + 2 registry); strict preflight, snapshot target retention/GC safety, request-history rejection before snapshot, source/target mismatch retention, request non-supersession, concurrent duplicate suppression, one-active-answer race, oldest command and terminal request-history pruning verified |
| 2026-10-25 M04-T02 partial | `backend/` | `.venv/bin/python -m unittest tests.test_cockpit_transport.RequestLifecycleTests.test_duplicate_command_id_executes_once` | PASS | Duplicate command remains idempotent: one generation execution and matching repeated acknowledgements |
| 2026-10-25 M04 checks | `backend/` | `.venv/bin/python -m unittest discover -s tests` | PASS | Latest full suite 141 tests; includes session-epoch invalidation/owner-disconnect acceptance rejection, retained-source release, and fail-closed supersession teardown; injected runner/store, temporary SQLite, ephemeral local WebSocket ports |
| 2026-10-25 M04 checks | `frontend/` | `npm run test -- --run`; `npm run build`; `npx tsc --noEmit` | PASS / PASS / FAIL (baseline) | Vitest 72/72; production build PASS; standalone tsc remains exactly three pre-existing `ImportMeta.env` TS2339 errors at App.tsx 47, 53, 59 |
| 2026-10-25 M04 checks | Repository root | `git diff --check`; `git status --short backend/data`; `.bak` scan | PASS / clean | No whitespace issues; backend data untouched; no editor backup artifacts at cleanup
| 2026-10-25 M04 checks | `frontend/` | `npm run test -- --run`; `npm run build`; `npx tsc --noEmit` | PASS / PASS / FAIL (baseline) | Vitest 72/72; production build PASS; standalone tsc remains exactly three pre-existing `ImportMeta.env` TS2339 errors at App.tsx 47, 53, 59 |
| 2026-10-25 M04 checks | Repository root | `git diff --check`; `git status --short backend/data`; `.bak` cleanup | PASS / clean | No whitespace issues; backend data untouched; editor backup artifacts removed |
| 2026-10-25 M04-T02 acceptance races | `backend/` | `.venv/bin/python -m unittest tests.test_cockpit_transport.ProtocolV3TransportTests.test_v3_epoch_change_during_acceptance_releases_snapshot_and_rejects tests.test_cockpit_transport.ProtocolV3TransportTests.test_v3_context_snapshot_survives_gc_during_acceptance_handoff tests.test_cockpit_transport.ProtocolV3TransportTests.test_v3_explicit_target_snapshot_survives_gc_during_acceptance_handoff tests.test_cockpit_transport.ProtocolV3TransportTests.test_v3_owner_disconnect_during_acceptance_releases_snapshot_and_rejects tests.test_cockpit_transport.ProtocolV3TransportTests.test_v3_supersession_failure_releases_source_and_rejects` | PASS | 5 acceptance race/failure tests; invalidation and owner disconnect return `stale_epoch`, release retained source, create no request and make no generation call; supersession failure rejects with `dependency` and releases source; valid context/explicit sources still survive forced GC |
| 2026-10-25 M04-T02 partial documentation | `docs/` | API/ARCHITECTURE/STATUS/CHANGELOG/ledger updates | PASS (partial scope) | Updated M3bis/M04 plan state, acceptance evidence, test counts and next handoff. `git diff --check` PASS; no backup artifacts or backend/data changes |


| 2026-10-25 M04/M05 interrupted handoff | `backend/` | `.venv/bin/python -m unittest discover -s tests` | PASS | Latest run: 143 tests in 3.108s, OK. Synthetic tests; injected Gateway runner/RAG store, isolated temporary SQLite and local ephemeral WebSocket ports. Includes acceptance rollback test, keep/remove answer test, and updated source-retention expectations. Does not establish live Gateway/audio/UI behavior. |
| 2026-10-25 M05 scaffold | `frontend/` | `npm run test -- --run` | PASS | 5 files / 74 tests pass. Includes a single fake-transport cockpit test for recent-snapshot command and rendered streaming draft. Does not cover selection offsets, visual/responsive/native UI, true delayed terminal timing, or full M05 requirements. |
| 2026-10-25 M05 scaffold | `frontend/` | `npm run build` | PASS | TypeScript Electron project build and Vite production bundle pass; 39 modules transformed. |
| 2026-10-25 handoff | `frontend/` | `npx tsc --noEmit` | FAIL | 8 errors: three existing `ImportMeta.env` TS2339 errors and five TS2783 duplicate-property `type` errors in `App.tsx` at lines 344–349, introduced by `{ ...query, type: ... }` in snapshot callback. This is not the historical 3-error-only baseline. |
| 2026-10-25 handoff | Repository root | `git diff --check`; `git status --short backend/data` | PASS / clean | No whitespace errors; no backend data paths reported. `git status --short` had 58 entries; existing dirty/untracked scope was not cleaned or attributed wholesale. Thirteen editor `.bak` files were present and remain. `.run/*.pid` files exist; last PID probe found no matching live processes. |
| 2026-10-25 interrupted-work failures | backend/frontend | Earlier test runs during edits, then corrected | FAIL, then PASS | Backend initially had two GC/snapshot expectation failures after source-retention changes; tests were updated to expect accepted snapshots retained for rerun, and latest full backend run is green. Frontend harness initially had four failures (duplicate UI text/Settings selectors and missing selection/segment fixtures); most were corrected, and latest full Vitest is green. A later TypeScript check exposed the five new duplicate-`type` errors; still open. |

Append one row per meaningful check. Include working directory and whether dependencies were mocked. Link larger evidence under `docs/notes/` and update indexes when adding a note.

| Date/task | Directory | Command or interaction | Result | Evidence/interpretation |
| --- | --- | --- | --- | --- |
| 2026-10-23 planning | Repository root | Read authority docs and inspect relevant controller/client/component source | PASS | Plan grounded in existing paths, request behavior, and stored keys; no runtime claim |
| 2026-10-23 planning | Repository root | `python3` inline document validator: task order/counts, acceptance IDs, local links/anchors, code fences | PASS | 94 tasks across 12 milestones; all 24 cases in both files; 53 local links/anchors valid |
| 2026-10-23 planning | Repository root | `git diff --check` | PASS | No whitespace errors in tracked changes; new plan documents also reviewed locally |
| 2026-10-23 planning | Repository root | Local prose/requirement review of plan and ledger | PASS | Contracts, lifecycle transitions, feature parity, data preservation, and clean-context next task covered |
| 2026-10-23 planning | Repository root | Application build/tests, audio, Gateway, native windows | NOT RUN | Documentation-only scope; baseline belongs to M00 |
| 2026-10-23 M00-T01 | Repository root | `git status --short`, `git rev-parse --abbrev-ref HEAD`, `git rev-parse --short HEAD`, `git diff --check`, `pgrep`/`ss` for services | PASS | Branch `vercel-ai`, HEAD `00690a5`; no project services on 8765/5173; only unrelated listeners |
| 2026-10-23 M00-T01 | Repository root | `backend/.venv/bin/python -c "import sys..."`; `import faster_whisper, websockets`; `node --version`; `npm --version`; `node -p "require('electron/package.json').version"` | PASS | Python 3.14.4; node v24.21.0; npm 11.19.0; electron 31.7.7 |
| 2026-10-23 M00-T03 | Repository root | `ls backend/data/`; read-only `sqlite3` table/row introspection; Electron profile lookup | PASS | `rag.sqlite` present (documents=1, chunks=10); localStorage profile not on disk; no contents printed |
| 2026-10-23 M00-T04 | `frontend/` | `npx tsc --noEmit` | FAIL (baseline, unrelated) | Missing `@types/react`/`@types/react-dom` (TS7016/TS7026). Kept as the identified baseline failure |
| 2026-10-23 M00-T04 | `frontend/` | `npm run build` | PASS | `tsc -p tsconfig.electron.json && vite build` succeeded; dist assets emitted |
| 2026-10-23 M00-T04 | `backend/` | `.venv/bin/python -m unittest discover -s tests` | PASS | Ran 37 tests, OK |
| 2026-10-23 M00-T04 | Repository root | `git diff --check` | PASS | No whitespace errors |
| 2026-10-23 M00-T05 | `frontend/` | `npm install --save-dev vitest@^2.1.9 jsdom@^25.0.1 @testing-library/react@^16.1.0 @testing-library/dom@^10.4.0 @testing-library/user-event@^14.5.2 @testing-library/jest-dom@^6.6.3 @types/react@^18.3.12 @types/react-dom@^18.3.1` | PASS | Added 92 packages; no app-stack upgrade; esbuild 0.21.5 binary present |
| 2026-10-23 M00-T05 | `frontend/` | `npx tsc --noEmit` (after types install) | FAIL (baseline, unrelated) | Now 3x `TS2339: Property 'env' does not exist on type 'ImportMeta'` in `App.tsx`; React/JSX errors gone. Not repaired (unrelated type config) |
| 2026-10-23 M00-T05/T06 | `frontend/` | `npm run test -- --run` | PASS | 2 files, 7 tests passed (App harness + helpers/fixtures) |
| 2026-10-23 M00-T07 | Repository root | `git diff --check`; prose review of README/STATUS/CHANGELOG/ledger | PASS | Docs updated; no application behavior changed |
| 2026-10-23 M01-T01 | Repository root | Expanded ADR 0011 with C01-C06, the authorized bootstrap extension, and the M00 test-tool note | PASS | ADR 0011 still Proposed; contracts recorded before wiring |
| 2026-10-23 M01-T02 | `docs/adr/` | Created `0012-cockpit-protocol-and-session-lifecycle.md`; updated `docs/adr/INDEX.md` | PASS | Number 0012 was free; ADR 0012 Proposed |
| 2026-10-23 M01-T03 | `docs/API.md` | Appended the full "Protocol v2 (proposed)" section: envelope/identity, capability rollout, all command/event payloads, ownership/epoch rules, ack timeout/idempotency, error codes, legacy examples | PASS | Examples match `cockpit_models.py` / `cockpit/types.ts` field names |
| 2026-10-23 M01-T04 | `backend/`, `frontend/` | Added `cockpit_models.py` + `cockpit/types.ts`; verified models import | PASS | Python models import cleanly; snake_case internal, camelCase wire |
| 2026-10-23 M01-T05 | `docs/adr/0012` | Added candidate workflow + independent state dimensions + M08 transition tables | PASS | Tables recorded before any scheduler code |
| 2026-10-23 M01-T06 | `contracts/v2/`, `backend/`, `frontend/` | Added 11 shared fixtures + backend parser/test + frontend parser/test | PASS | Backend 5/5 OK; frontend 22/22 PASS; both sides agree on every fixture |
| 2026-10-23 M01-T07 | Repository root | Updated ARCHITECTURE, INDEX, ADR index, ledger, CHANGELOG, STATUS | PASS | `git diff --check` PASS |
| 2026-10-23 M02-T01/T02 | `backend/` | `.venv/bin/python -m unittest tests.test_cockpit_snapshots` | PASS | 22 tests; audio epochs, `segmentKey`, record revisions, partial tracking |
| 2026-10-23 M02-T03/T04/T05 | `backend/` | Same suite (window/anchor/selection/pin/GC cases) | PASS | 20/45/90 boundaries, post-press finals, selection across segments, Unicode offsets, tentative partials, pin capacity, GC |
| 2026-10-23 M02-T06 | `backend/` | `.venv/bin/python -m unittest discover -s tests` | PASS | 64 tests, OK (42 pre-existing + 22 new) |
| 2026-10-23 M03-T01/T02 | `backend/` | `tests.test_cockpit_transport.NegotiationTests` + `OwnershipTests` | PASS | hello_ack identity/capabilities, stale instance rejection, owner/observer, disconnect release, renegotiation |
| 2026-10-23 M03-T03/T06 | `backend/` | `tests.test_cockpit_transport` (18 tests, two real local WebSocket clients, mocked generation) | PASS | Scoped streaming, duplicate commandId executed once, command-status reconciliation, matching cancellation, legacy compatibility and ordering |
| 2026-10-23 M03-T04/T05/T07 | `frontend/` | `npx vitest run` | PASS | 44 tests across 5 files; offline-send rejection, ack timeout plus reconciliation, reconnect without replay, dispose cleanup, reducer identity/epoch/seq rules |
| 2026-10-23 M02/M03 check | `frontend/` | `npm run build` | PASS | `tsc -p tsconfig.electron.json && vite build`; 36 modules, dist emitted |
| 2026-10-23 M02/M03 check | `frontend/` | `npx tsc --noEmit` | FAIL (baseline, unrelated) | Unchanged: exactly 3× `TS2339: Property 'env' does not exist on type 'ImportMeta'` in `App.tsx`; no new type errors |
| 2026-10-23 M02/M03 check | `backend/` | `.venv/bin/python -m unittest discover -s tests` (final) | PASS | 82 tests, OK; `backend/data/` clean in `git status` (tests use a temp RAG DB) |
| 2026-10-23 M02/M03 check | Repository root | `git diff --check` | PASS | No whitespace errors; no stray `.bak` files |
| 2026-10-23 M03-T07 | `docs/` | Doc review: API.md v2 status/payloads, ARCHITECTURE modules + flow, ADR 0012 status, STATUS, CHANGELOG, this ledger | PASS | No claim of live/hardware/native acceptance; capabilities listed as advertised |
| 2026-10-23 RT01 | Public Gateway/docs | Fetch full `/v1/models`; inspect official model, streaming and reasoning references in ADR 0013 | PASS (discovery only) | 480 catalog rows; Flash language/text/vision/structured-output and low effort verified; Live example is type realtime. No inference/account-access claim |
| 2026-10-23 RT01 | `backend/` | `.venv/bin/python -m unittest tests.test_ai_gateway_client` before editing | PASS | 23-test baseline |
| 2026-10-23 RT01 | `backend/` | `.venv/bin/python -m unittest tests.test_ai_gateway_client tests.test_gateway_streaming tests.test_cockpit_transport` | PASS | 51 tests; progressive pre-terminal delivery, cancellation closes provider stream, fragmented Unicode/multiline SSE, errors/EOF, no retry, usage, explicit model preserved, failed/empty v2 states |
| 2026-10-23 RT01 | `backend/` | `.venv/bin/python -m unittest discover -s tests` | PASS | 92 tests, synthetic dependencies; ephemeral local WS only |
| 2026-10-23 RT01 | Repository root | `git diff --check`; `git status --short backend/data` | PASS | No whitespace errors; backend data remains clean |
| 2026-10-23 RT01 | Repository root | Targeted Markdown validator (links, heading anchors, fences) | PASS | 14 touched Markdown files, 93 local links/anchors; no missing files/anchors or unbalanced fences |
| 2026-10-23 RT01 | Runtime/UI | Paid Gateway inference, real audio, native/rendered UI, frontend checks | NOT RUN | Backend/model foundation and documentation scope; no latency/quality claim; earlier frontend baseline failure remains open |
| 2026-10-25 PLAN03 | Repository root | `python /tmp/cockpit-plan-review-39l9kll7/validate_docs.py` (local documentation validator) | PASS | Six changed Markdown files; 55 local links/anchors; 101 unique task definitions; M00–M03 sections/gates and prior task-journal rows preserved; A01–A28 align; brief unchanged byte-for-byte |
| 2026-10-25 PLAN03 | Repository root | `git diff --check` | PASS | No whitespace errors in tracked changes; local validator also checks the six touched Markdown files, including untracked plan/ledger |
| 2026-10-25 PLAN03 | Runtime/UI | Runtime suites, catalog/model inference, latency/quality, rendered UI, audio/native checks | NOT RUN | Documentation-only revision; M3bis/M04–M11 remain NOT STARTED; recorded baseline `tsc` failure not rerun |
| 2026-10-25 M3bis-T01 | Repository root | Audit: brief C07/C08 vs `API.md`, ADR 0012/0013, `cockpit_models.py`, `cockpit_protocol.py`, `assistance.py`, `main.py`, `ai_gateway_client.py`, `types.ts`, `protocol.ts`, `reducer.ts`, `ws.ts`, `contracts/v2/`, M03/RT01 tests | PASS | 17 deltas classified: 3 satisfied, 9 missing, 2 conflicts (silent deprecated-alias substitution; silently dropped screenshot), 3 partial. Table in "M3bis delta audit" |
| 2026-10-25 M3bis-T02/T03 | `docs/` | Wrote ADR 0014, amended ADR 0012 status, added API.md "Protocol v3" (negotiation, model readiness, timing units/origins/nullability/placements, new error codes, fixture map), updated ARCHITECTURE/INDEX/ADR index | PASS | Version bump documented before implementation; the recorded "Protocol v2" section was not edited |
| 2026-10-25 M3bis-T04 | `backend/`, `frontend/`, `contracts/v3/` | Added v3 models/enums/dataclasses, `model_roles.py`, v3 parser functions, matching TS types/parsers, and 15 shared v3 fixtures (6 valid, 9 invalid) | PASS | Backend contract tests 8/8; frontend protocol tests 33/33; both harnesses accept/reject the same 30 fixtures with the same codes |
| 2026-10-25 M3bis-T05 | `backend/`, `frontend/` | Request-record frozen/timing fields, `answer_accepted`/`answer_timing`/`answer_finished` serialization, negotiation in `hello`, preflight before snapshot, reducer/ws reduction | PASS | `test_cockpit_transport` 30/30; `transport.test.ts` 11/11; `reducer.test.ts` 20/20 |
| 2026-10-25 M3bis-T06 | `backend/` | `.venv/bin/python -m unittest discover -s tests` | PASS | 118 tests OK; injected generation + stub RAG + temp RAG SQLite + ephemeral local WS ports; test asserts `httpx.AsyncClient` is never constructed during an answer |
| 2026-10-25 M3bis-T06 | `frontend/` | `npm run test -- --run`; `npm run build`; `npx tsc --noEmit` | PASS / PASS / FAIL (baseline) | 72 tests in 5 files; build 36 modules; `tsc` unchanged 3× `TS2339` `import.meta.env` (pre-existing) |
| 2026-10-25 M3bis-T06 | Repository root | `git diff --check`; `git status --short backend/data`; removed editor `.bak` artifacts | PASS | No whitespace errors; `backend/data/` clean; no stray backups |
| 2026-10-25 M3bis-T07 | Runtime/UI | Live Gateway/catalog access, real audio/STT, rendered UI/display checkpoints, latency measurement, native Electron | NOT RUN | M3bis scope is the contract + synthetic transport; no latency, quality, account-access or first-visible claim |


| 2026-10-25 M04/M05 closeout checkpoint | `backend/` | `.venv/bin/python -m unittest discover -s tests` | PASS | 150 tests; injected Gateway/RAG seams and temporary DB. Acceptance failure injection, retrieval/citation/note cases included. |
| 2026-10-25 M05 Markdown, delayed status and transcript follow | `frontend/` | `npm run test -- --run`; `npm run build` | PASS | 78/78 Vitest; production build PASS (296 modules). Harness confirms Markdown emphasis renders to `<strong>` and delayed `command_status` applies Keep. |
| 2026-10-25 M04/M05 live UI | `frontend/` + `backend/` | Isolated Vite + temporary backend; two Gateway calls via Chrome CUA tab | PASS | Synthetic “What is two plus two?” only. `google/gemini-3.8-flash`; visible answer streamed and rendered as Markdown; `no_documents`; first delta 1.82 s and first display 1.85 s after press. No audio or persistent RAG database touched. Both processes stopped and temporary DB removed. |
| 2026-10-25 final checks | Repository root / `frontend/` | `git diff --check`; `npx tsc --noEmit` | PASS / FAIL (baseline) | No whitespace errors; TypeScript still reports only 3 `ImportMeta.env` TS2339 errors at `App.tsx` 50/56/62. Backend data working tree clean. |

| 2026-10-25 M05-T03 responsive/keyboard check | `frontend/` + Chrome CUA | Viewport 1680x1000, 1440x900, 1000x720; keyboard divider ArrowRight/ArrowLeft | PASS (scoped) | At desktop sizes four panel columns rendered without horizontal overflow; 1000x720 rendered two-by-two without horizontal overflow; keyboard changed raw width 424→438px and restored 424px. Pointer divider, zoom and persistence reload not run. Viewport reset to default and initial `cockpit-layout.v1` remained null. |

## Task journal

Append a row after each task. Do not replace earlier evidence with a summary that loses failures.

| Task | Status | Files/decision/result | Checks | Exact next action |
| --- | --- | --- | --- | --- |
| M04-T01 | COMPLETE | Added `backend/app/answer_service.py`; moved one-request RAG+generation orchestration out of main, retaining injected runner, actual chosen model/screenshot, immediate deltas, partial/empty/failure/cancellation lifecycle and acceptance-relative timing. Gateway SSE framing/fallback/terminal/cancel remains in `AIGatewayClient`. | Focused 51/51 PASS; latest full suite 135 PASS; frontend 72 PASS/build PASS | M04-T02 atomic acceptance/preflight and snapshot retention |
| M04-T02 (continued) | IN PROGRESS | Strictly validates mode/instruction/preset, target/anchor/window/partial/snapshot IDs, model, screenshot fields, human note IDs, reasoning effort and press timestamp before source acceptance; rejected inputs do not supersede existing work. Request capacity rejects before snapshot creation. Recent and explicit unpinned targets survive forced GC during async handoff and release after terminal completion. Command status returns the outcome captured before a bounded registry prune. Missing Gateway credentials produce a scoped dependency failure and authoritative failed terminal event; no model call occurs. Acceptance captures/rechecks session epoch after supersession and releases/rejects if transcript invalidation or owner disconnect races the handoff. Supersession teardown failure rejects closed and releases the source. Existing concurrent duplicate/supersession locks retained. | Focused transport/service 50/50 PASS before race additions; acceptance race/failure checks 5/5 PASS; full backend 141/141 PASS; frontend 72/72 PASS/build; `git diff --check` PASS; `tsc` unchanged baseline FAIL | Add post-supersession record/command/ack failure injection in M04-T02 |
| M04-T03/T04/T05 (foundation only) | IN PROGRESS | Service writes RAG/generation/first-delta windows; scoped v3 timing snapshots follow RAG, first delta, and generation terminal; v3 retrieval provenance includes path + `docId:chunkIndex`; distinguishes empty index/no matches/search failure, and retrieval-failure prompt warns not to claim document review. v2 retrieval wire stays unchanged. | Transport evidence identity/timing; cancellation retains partial; integration tests inject runner and forbid live HTTP client | Finish lifecycle/outcome/strict wire contract tests; do not mark tasks complete |

| M04-T02 acceptance rollback (continued) | IN PROGRESS | Added registry `discard` for an uncommitted request and a test injecting `CommandRegistry.accept` failure; acceptance now stages request/command outcomes after supersession, releases snapshot and rejects on that commit failure. Accepted answer snapshots are retained for rerun; tests now assert retention after terminal completion. `RequestRegistry` pruning releases retained snapshots once. | New failure injection and full suite covered by latest backend 143/143 PASS. Additional outbound ack/send boundary failures and exact frozen rerun remain unverified. | Continue M04-T02 failure-injection matrix; do not claim atomic gate complete |
| M05 workbench scaffold (continued) | IN PROGRESS | Integrated four panels and answer cards into App; added basic keep/remove/cancel/rerun/copy handlers, recent-context control, fake answer-flow test, and layout state/pointer/keyboard handle. App callback currently ignores `SourceSpan[]`; exact selection offsets are therefore not proven or consumed. M05 has not passed parity, layout, scroll/anchor, delayed-terminal, visual or native checks. | Vitest 74/74 PASS; build PASS; standalone `tsc` FAIL (8 errors, including five introduced duplicate `type` errors). | Finish M04 before completing M05; then wire exact selection offsets and verify all M05-T01…T10 gates |
| Handoff update 2026-10-25 | RECORDED | Reconciled this ledger after interrupted edits; no implementation change in this ledger update. Branch `vercel-ai`, HEAD `00690a5`; worktree 58 status entries; 13 `.bak` files present; backend data status clean; `.run` PID files appear stale based on last process probe. | Backend 143 PASS; frontend 74 PASS; build PASS; diff-check PASS; standalone tsc 8 errors (3 historical + 5 new). Live Gateway, audio, visual/native acceptance NOT RUN. | Resume M04-T02 acceptance boundary; current inspection command is in “Resume here” |
| M04 check/failure | RECORDED | Initial capacity-boundary test did not deterministically prune the queried outcome because registry timestamps tied; made the fixture explicitly oldest, then confirmed reconciliation still returns the captured accepted result. Missing-access test initially printed the expected exception log; patched only the logger in that test. A first test command used a root-relative venv path while already in `backend/` and did not run; reran with `.venv/bin/python`. Multi-file docs edits with stale anchors failed atomically, then succeeded after rereading current text. No implementation failure remained. | Focused transport/service 50 PASS; acceptance race/failure checks 5 PASS; full backend 141 PASS; frontend 72/build PASS; `git diff --check` PASS. `tsc` remains baseline FAIL. | Continue M04-T02 commit-boundary failure injection |

| M04-T03/T04/T05 (foundation only) | IN PROGRESS | Service writes RAG/generation/first-delta windows; scoped v3 timing snapshots follow RAG, first delta, and generation terminal; v3 retrieval provenance includes path + `docId:chunkIndex`; distinguishes empty index/no matches/search failure, and retrieval-failure prompt warns not to claim document review. v2 retrieval wire stays unchanged. | Transport evidence identity/timing; cancellation retains partial; integration tests inject runner and forbid live HTTP client | Finish lifecycle/outcome/strict wire contract tests; do not mark tasks complete |
| M04 check/failure | RECORDED | Initial focused suite failed on stale timing assertion. Service tests exposed sync callback, missing fake path, no-document expectation and timing-event count assumptions. Corrected and re-ran. Exact-text multi-edits with guessed docs anchors failed before changing files and were retried using current text. Latest `npx tsc --noEmit` remains the pre-existing 3-error `ImportMeta.env` failure; no scope creep fix attempted. | Focused 51 PASS; backend full 127 PASS; v3 transport 17 PASS; frontend 72/build PASS; `tsc` unchanged baseline FAIL | Continue M04-T02 |



| Planning | COMPLETE | Added plan and initial progress ledger; indexed both; implementation not started | Source review, task/case/link validation, prose review, and whitespace check PASS | M00-T01 |
| M00-T01 | COMPLETE | Recorded branch `vercel-ai`, HEAD `00690a5`, dirty paths, runtimes, Electron/Node versions, and that no project services run | `git status`/`rev-parse`/`diff --check`; interpreter/import/node/electron probes PASS | M00-T02 |
| M00-T02 | COMPLETE | Expanded the parity inventory to 53 action-level rows (D01-D29, S01-S24) with handler/destination/stored-key/verification | Source review PASS | M00-T03 |
| M00-T03 | COMPLETE | Recorded the four browser storage keys plus the effective RAG SQLite path and table shapes | Read-only introspection PASS; no contents printed | M00-T04 |
| M00-T04 | COMPLETE | Ran the four baseline commands | build PASS, 37 unittest PASS, `git diff --check` PASS; `npx tsc --noEmit` FAIL (baseline, unrelated) | M00-T05 |
| M00-T05 | COMPLETE | Added Vitest/jsdom/RTL/user-event, `test`/`test:watch` scripts, `vitest.config.ts`, setup, and the ADR 0011 test-tool note | `npm install` PASS; harness config loads | M00-T06 |
| M00-T06 | COMPLETE | Added fake clock, fake WebSocket transport, mocked Gateway/detector, and messy-speech fixtures; proved one selection/transcript action and one Settings action through the real App seam | `npm run test -- --run` 7/7 PASS | M00-T07 |
| M00-T07 | COMPLETE | Recorded the baseline gate; updated STATUS, CHANGELOG, README, frontend README, and this ledger | `git diff --check` PASS; docs review PASS | M01-T01 |
| M01-T01 | COMPLETE | Expanded ADR 0011 with C01-C06 + bootstrap extension + test-tool note (still Proposed) | Prose review PASS | M01-T02 |
| M01-T02 | COMPLETE | Created ADR 0012 (protocol v2/ownership/lifecycle/legacy/test tools) and indexed it | `docs/adr/INDEX.md` updated | M01-T03 |
| M01-T03 | COMPLETE | Documented all v2 command/event payloads, capability rollout, claim/release, epochs, ack timeout, idempotency, error codes, legacy examples in API.md | Examples cross-checked against models/types | M01-T04 |
| M01-T04 | COMPLETE | Added backend `cockpit_models.py` and frontend `cockpit/types.ts` (snake_case internal / camelCase wire) | Python import check PASS | M01-T05 |
| M01-T05 | COMPLETE | Added candidate workflow states + independent state dimensions + M08 transition tables to ADR 0012 | Prose review PASS | M01-T06 |
| M01-T06 | COMPLETE | Added shared `contracts/v2/` fixtures, `cockpit_protocol.py`, `cockpit/protocol.ts`, and both harness tests | Backend 5/5 OK; frontend 22/22 PASS; fixtures agree | M01-T07 |
| M01-T07 | COMPLETE | Updated ARCHITECTURE, INDEX, ADR index, ledger, CHANGELOG, STATUS; recorded protocol ADR path + frozen constants | `git diff --check` PASS | M02-T01 |
| M02-T01 | COMPLETE | `TranscriptStore` now records `SourceRecord`s with `segmentKey` (`audioEpoch#segmentId`) + monotonic revision, tracks the live partial tail, rotates epochs, and clears without replacing the instance; controller assigns a new audio epoch per capture | Snapshot suite PASS | M02-T02 |
| M02-T02 | COMPLETE | Added `backend/app/source_snapshots.py` (immutable `Snapshot` creation, `SnapshotError` with stable codes, capacity, ref-counting, GC) integrated with `TranscriptStore`; `Snapshot` gained `tentative` | Snapshot suite PASS | M02-T03 |
| M02-T03 | COMPLETE | Recent-window freezing at the press-time anchor: only complete finalized segments from the anchor's audio epoch at or before the anchor revision; unknown anchor → `stale_revision`; empty → `empty` | Boundary/post-press tests PASS | M02-T04 |
| M02-T04 | COMPLETE | Selection freezing with code-point offset validation, revision matching, and tentative explicit partials | Unicode/selection/stale-revision tests PASS | M02-T05 |
| M02-T05 | COMPLETE | Pinned moments with zero model calls, 50-pin capacity rejection, reference-counted release and GC | Pin/ownership tests PASS | M02-T06 |
| M02-T06 | COMPLETE | Added 22 snapshot tests covering the M02 gate cases | `unittest discover` 64/64 PASS | M02-T07 |
| M02-T07 | COMPLETE | Updated API.md source semantics + snapshot/ack/status payloads, ARCHITECTURE, STATUS, CHANGELOG, ledger | Docs review PASS | M03-T01 |
| M03-T01 | COMPLETE | `ws_server.py` rewritten: `ConnectionInfo` with server-assigned `connectionId`, `send_to`, `connections`, connect/disconnect hooks, safe failed-send cleanup; broadcast retained for shared events | Transport suite PASS | M03-T02 |
| M03-T02 | COMPLETE | `hello`/`hello_ack`, capability advertisement (`assist`, `snapshots`), single control lease, explicit claim, scoped `not_owner`/`stale_epoch`/`incompatible_version` rejection | Negotiation/ownership tests PASS | M03-T03 |
| M03-T03 | COMPLETE | `commandId` acknowledgement, duplicate suppression, retained outcomes, request records with one answer slot, event identity, matching cancellation; legacy `run_query`/`cancel_query` connection-scoped | Lifecycle tests PASS | M03-T04 |
| M03-T04 | COMPLETE | `ws.ts` rewritten: v2 negotiation, typed send results, five-second ack deadline, `get_command_status` reconciliation, identity/epoch adoption, `dispose()`; App disposes the client and shows an unknown-status notice on disconnect | `transport.test.ts` 8/8 PASS | M03-T05 |
| M03-T05 | COMPLETE | Added `frontend/src/cockpit/reducer.ts` with the T05 ignore rules and terminal retention | `reducer.test.ts` 13/13 PASS | M03-T06 |
| M03-T06 | COMPLETE | Added 18 two-client backend transport tests covering the required scenarios | `test_cockpit_transport.py` 18/18 PASS | M03-T07 |
| M03-T07 | COMPLETE | Offline-send/lost-ack/no-replay/no-spinner tests; updated API.md, ADR 0012 status, ARCHITECTURE, STATUS, CHANGELOG, ledger | `vitest run` 44/44 PASS; `npm run build` PASS | M04-T01 |
| RT01 | COMPLETE | User requested suitable realtime response from transcript text: verified catalog; default Flash/low reasoning; strict SSE/terminal/empty/cancel behavior; ADR 0013, brief and plan C07 | Focused 51/51 and full backend 92/92 PASS; discovery PASS; live inference/quality NOT RUN | M04-T01 (preserve RT01 while extracting) |
| PLAN03 | COMPLETE (documentation only) | Aligned execution plan version 3 with revised realtime/model/flow/reliability brief; inserted NOT STARTED M3bis without reopening M00–M03/RT01; expanded downstream tasks/C08/A25–A28; synchronized resume and indexes | Documentation validation recorded in command log; runtime tests/live calls NOT RUN in this revision | M3bis-T01 |
| M3bis-T01 | COMPLETE | Audited the revised brief against C07/C08, ADR 0012/0013, API.md, current types/parsers and the M03/RT01 tests; recorded 17 classified deltas (3 satisfied, 9 missing, 2 conflicts, 3 partial) in the new "M3bis delta audit" section | Source review against file:line evidence; no runtime check claimed | M3bis-T02 |
| M3bis-T02 | COMPLETE | Added `backend/app/model_roles.py`: answer/detector roles, dated static catalog (certainty verified/catalog/unknown), positively-known image/structured capabilities, deprecated-alias provenance, reasoning applied only for the verified default, `unsupported_capability`/`unavailable_model` rules. No detector execution | `test_cockpit_model_roles.py` 12/12 PASS (pure, no IO) | M3bis-T03 |
| M3bis-T03 | COMPLETE | Wrote ADR 0014 (protocol v3 + C08 timing) and amended ADR 0012; documented negotiation, `reasoningEffort`, `clientPressedAtMs`, model-readiness rules/error codes, `answer_accepted.frozenInputs`, timing units/origins/nullability/ordering, `answer_timing` placement, and the fixture map in API.md | Docs written before wiring; indexes updated (`docs/INDEX.md`, `docs/adr/INDEX.md`, ARCHITECTURE) | M3bis-T04 |
| M3bis-T04 | COMPLETE | Extended backend models/parsers and frontend types/parsers for v3 (model settings, backend/client timing, `answer_accepted`, `answer_timing`); added `contracts/v3/` (6 valid, 9 invalid) leaving `contracts/v2/` untouched | Backend contract tests 8/8; frontend protocol tests 33/33; identical outcomes on all 30 fixtures | M3bis-T05 |
| M3bis-T05 | COMPLETE | Request records carry frozen inputs, model settings, timing + `timingSeq` and the echoed press instant; `answer_accepted`/`answer_timing`/`answer_finished` serialize them for v3 only; `hello` negotiates the version; preflight runs before snapshot consumption; reducer keeps clocks separate, applies only newer `timingSeq`, refuses terminal records, and records first-visible | `test_cockpit_transport` 30/30; `transport.test.ts` 11/11; `reducer.test.ts` 20/20 PASS | M3bis-T06 |
| M3bis-T06 | COMPLETE | Ran shared-contract, Gateway streaming, two-client transport and reducer regressions with injected generation/RAG and temporary storage; added metadata-after-cancellation, failed/empty v3 streams, duplicate-command, owner-scoping, unsupported-version and no-live-client cases | Full backend 118/118; focused backend 52/52; frontend 72/72; build PASS; `tsc` baseline unchanged (3 pre-existing errors) | M3bis-T07 |
| M3bis-T07 | COMPLETE | Updated API/ARCHITECTURE/ADRs/indexes/STATUS/CHANGELOG for what was actually implemented; recorded commands and the unproduced measurements; handed off to M04-T01 with the remaining producer/display work named. READMEs needed no change (setup/run/test commands and app behavior unchanged); also repaired three pre-existing broken relative links in ADR 0012 | `git diff --check` PASS; `backend/data/` clean; local link/fence check over all touched Markdown PASS; no live/latency/native claim | M04-T01 |

## Blockers and unresolved failures

- Task: M00-T04 baseline command `cd frontend && npx tsc --noEmit`.
- Observed error: `TS2339: Property 'env' does not exist on type 'ImportMeta'` at `frontend/src/App.tsx` lines 47/53/59 (missing `vite/client` types). Before M00-T05 it additionally failed with `TS7016`/`TS7026` from missing `@types/react`/`@types/react-dom`.
- Smallest reproduction: `cd frontend && npx tsc --noEmit` (uses `tsconfig.json`, which includes `src`).
- Effect on gates: none. The production build (`tsconfig.electron.json`) and the Vitest harness pass; the failure is unrelated type configuration and is out of scope to repair in M00.
- Attempted remedy: installed `@types/react`/`@types/react-dom` for React Testing Library, which removed the React/JSX errors. Did not add `vite/client` types.
- Exact unblock action (optional, later): add a `frontend/src/vite-env.d.ts` with `/// <reference types="vite/client" />` and confirm `npx tsc --noEmit` passes. Record the change in the ledger if performed.

No other execution blockers. Interpreter/dependencies and one synthetic live Gateway inference are verified; real audio/STT and native controls remain unverified for later milestones.

### Resolved during M03 (recorded because it touched a live service)

- Task: M03-T06 (first transport-test run).
- Observed: the legacy `run_query` worker did not use the injectable generation seam, so the first transport test made a real HTTPS call to `https://ai-gateway.vercel.sh/v1` using whatever key `.env.local` provides. Both the Responses and Chat Completions endpoints returned `404`, so no answer content was produced.
- Data involved: only the synthetic fixture sentence and the local system instruction; no audio, private document, or user data left the machine.
- Effect on gates: none. The test failed visibly and was fixed before any gate was recorded.
- Fix: the legacy worker now resolves `_generation_runner` first and only falls back to `AIGatewayClient`; transport tests also substitute a stub RAG store so embeddings cannot be called. Re-verified with a full green run.
- Follow-up for M04: keep every new generation path behind the same injectable seam, and assert in tests that no network client is constructed.

### Resolved during M03 (RAG database touch)

- Task: M03-T06 (first transport-test run).
- Observed: constructing `AppController()` opened the real `backend/data/rag.sqlite`; on clean close SQLite checkpointed the WAL, which rewrote the main database file and removed `rag.sqlite-shm`/`rag.sqlite-wal`. No rows were added, changed, or deleted by the tests (the stub store performed no writes).
- Effect on gates: none; the logical content was unchanged.
- Fix and restoration: the tracked files were restored byte-for-byte with `git checkout -- backend/data/rag.sqlite backend/data/rag.sqlite-shm backend/data/rag.sqlite-wal`, and the transport tests now construct the controller with `RAG_DB_PATH` pointed at a temporary directory before substituting the stub store. A full re-run leaves `backend/data/` clean in `git status`.

For each execution blocker, record: task, observed error, smallest reproduction, effect on gates, attempted remedy, and exact unblock action. Continue only work whose prerequisites do not depend on it.

## Handoff checkpoint

M06 COMPLETE (synthetic/local-service scope): Sound dialog, persistent selected-input meter, isolated telemetry, monitoring after Stop, acknowledged source reconciliation and original Settings behavioral parity. Backend 175/175; frontend 115/115; production build PASS (302 modules); only the 3 known standalone ImportMeta.env errors remain. No real audio or paid inference used. Next M07-T01.

See [M06 acceptance](../notes/2026-10-26-m06-acceptance.md). Begin M07-T01 from INDEX/STATUS/plan. Persistent data clean, isolated processes stopped, viewport/tab cleaned. Historical journals follow.

## M04/M05 completion implementation started

Implementing the approved completion plan. ADR 0016/API v4 documented before wiring. Active work: frozen backend reruns, model reasoning propagation, snapshot leases and authoritative retained-card state; then manual editor/layout/render gates. Existing dirty files preserved.

### Completion checkpoint: backend and workbench wiring

Protocol v4, frozen reruns, snapshot leases, protected retention/state events, explicit target editor/modes, stable raw rows, keyboard selection, frame buffering and all dividers are wired. Focused backend run: 82 tests with one stale fixture-directory assertion (fixed); new v4 scenarios passed. First frontend run: 74/78 passed, four assertions still expected the old two-step recent query/client rerun; updating those to the approved atomic/backend-owned flows. Standalone tsc has only the three historical ImportMeta.env errors after the rewrite. No live calls in this implementation stage.

### Completion checkpoint: automated workbench gates

Backend full suite passed 158 tests before the final handoff-recovery scenario; frontend now passes 99 tests, including reading-anchor geometry preservation and bounded stream buffering. The production build passes (300 modules). Exact Preset/Custom mode, server rerun, target rejection/consumption/newer-edit protection, pin zero-call behavior, source-node/keyboard selection stability, retained partial cancellation, note rejection recovery and mounted Settings/editor state are covered. Finishing v4 shared fixtures and final automated gate before isolated rendered testing. Screenshot/Markdown security keeps external navigation outside the Electron preload renderer and suppresses remote Markdown image loads.

### Rendered acceptance correction

At 1680x1000, 1440x900 and 1000x720, page overflow is absent and the primary footer remains visible. Desktop/compact pointer resizing, all desktop keyboard separators, Transcript + and exact layout reload restoration passed. Pin produced zero calls. Human target survived new speech; note inclusion/Keep/removal/rerun/cancelled partial all passed through real WS. Selection text and raw scroll position remained identical after injected finals. Reading check exposed newest-first `requestList` and a notice that shifted the viewport; corrected to append order with an overlay notice. Actual empty SQLite also exposed embedding-before-index-check; corrected to skip retrieval/embedding with no documents. These corrections require affected regressions and a rendered rerun before closure. No paid calls yet in this completion pass.

### Final completion checkpoint

M04 and M05 COMPLETE: protocol v4 frozen reruns/targets/retention, four-panel manual workbench, safe streamed Markdown, persistent resizing and reading anchors. Backend 160/160, frontend 106/106 and production build PASS. Standalone TypeScript retains exactly the 3 M00 ImportMeta.env errors. One completion-pass synthetic live Gateway inference PASS; native/audio acceptance remains later milestones. Corrected rendered reruns passed after append-order/notice fixes. Explicit saved Preset survives reload. [Final acceptance evidence](../notes/2026-10-25-m04-m05-acceptance.md) maps every M04/M05 task, closes Desk parity P02–P04, and records P05 native limits. Next task M06-T01.

## M06 execution journal — 26 October 2026

- Started approved plan. Preserving dirty workspace and existing data. Found root-state high-rate meter updates, transcription-coupled monitoring and discovery feedback loops; addressing those before UI acceptance.

- M06 automated checkpoint: 113 frontend tests/build PASS; standalone TypeScript has only baseline 3 ImportMeta.env errors. Audio lifecycle 11 focused cases; real local RAG readers cover four formats with temporary SQLite. Initial full backend run found a test fixture missing required top_k (corrected; focused RAG PASS). Rendered Sound Escape preserved a running answer; 1000/1440 geometry and stopped monitoring passed. Screenshot exposed low-contrast Sound buttons; corrected explicit colors before final rendered acceptance.

- Final M06 closure: M06 COMPLETE (synthetic/local-service scope): Sound dialog, persistent selected-input meter, isolated telemetry, monitoring after Stop, acknowledged source reconciliation and original Settings behavioral parity. Backend 175/175; frontend 115/115; production build PASS (302 modules); only the 3 known standalone ImportMeta.env errors remain. No real audio or paid inference used. Next M07-T01. Exact raw selection restored after modal keyboard navigation in harness and actual pointer acceptance. Fixed meter EOF cleanup and failed-discovery mode rollback; final backend suite 175 PASS. Valid benchmark images/tests/history persist across remount and browser reload; original data remains untouched.


## M07 checkpoint — 26 October 2026
- T01–T07 implemented; T08/T09 final validation/documentation in progress. Backend focused M07 checks: 20 PASS (including two actual local WebSocket cases). Shared v5 fixtures parse identically: backend fixture harness PASS; frontend 68 protocol checks PASS.
- First full backend sweep passed 193 tests before two additional correction ownership/lease regressions were added. First frontend sweep exposed a legacy assertion matching two error locations; corrected to inspect the action bar. The existing three ImportMeta.env errors remain the only type errors.
- Rendered actual App/local service: model proposal → human immutable edit → selected target → pre-terminal synthetic streamed answer → Wrong question → linked corrected draft; original card/source preserved. Desktop/compact footer and overflow checked. A post-save editor bug was found and fixed, with a new regression.
- Additional review fixed source lease rollback at capacity, correction of an older answer alongside newer human intent, compact command reconciliation receipts and Gateway endpoint enforcement. Re-run focused/full checks after these changes; final result belongs in the acceptance note.
- User removed obsolete local OPENAI_API_KEY/OPENAI_MODEL entries. Name-only verification: no OPENAI_* keys; Gateway credential present. No secret values shown.
- Temporary acceptance harness is still running until final cleanup. No hardware capture or paid inference. Next: final rendered workflows, suites/build, docs and stop isolated processes.


## M07 final handoff — 26 October 2026
- T01–T09 COMPLETE. Backend suite 198 PASS; frontend 146 PASS; build PASS (303 modules); diff PASS. Exactly 3 baseline standalone ImportMeta.env errors remain, no new type errors.
- Latest rendered service checked split/merge/dismiss/undo, original-source highlight, streamed candidate answer before terminal, Wrong question and linked corrected draft with both cards retained, then explicit detection disable. Desktop1440×900/compact1000×720 have no horizontal overflow and visible footers. Checkbox styles were visually corrected; final build includes them.
- Added an apparently eligible but wrong AUTO-card fixture to prove correction recovery without implementing AUTO. Source leases survive failed correction/capacity; correcting older cards preserves newer human intent. Late detector/human revisions, ownership and Gateway URLs are covered.
- Source/config scan and old-client artifact scan passed. Operator's OPENAI_* removal verified without values. Shared client enforces Gateway HTTPS origin/path before credentials.
- Completion note: [M07 acceptance](../notes/2026-10-26-m07-acceptance.md). Next **M08-T01**. Exact next read: `sed -n '421,435p' docs/plans/live-helper-cockpit-execution-plan.md` after INDEX/STATUS. No user help needed for synthetic M08; hardware/native assistance later M09/M10.
- All isolated acceptance processes stopped, temp DB removed, viewport reset/tab closed; user data clean and unrelated worktree changes preserved. No commit/deployment.

- Final Gateway config follow-up: changed cloud Settings fields to construction-time reads after dotenv. Regression covers late local model/debounce/timeout/embedding overrides and rejection of a direct-provider endpoint. Final backend suite **198 PASS**; frontend 146/build303 unchanged. No private config edits by the agent.


## M08 implementation checkpoint — 26 October 2026
- Backend scheduler/lifecycle and v6 contract wiring implemented. First focused scheduler run: 18 PASS, covering manual priority, hold/deferred release, stale revisions, source/owner invalidation, config receipts, capacity and an 81-question flood. Fake source/request clocks and event-gated generation keep these deterministic.
- Shared v6 fixtures added; backend fixture harness PASS and frontend protocol harness 99 PASS (31 new fixtures). Older manual contracts remain parsed.
- Assist/FULL AUTO controls, server-acknowledged configuration, raw/target/question/profile/note/Settings/configuration holds and deferred card labels wired. Sound alone remains independent. React review skill applied.
- Early broad regressions found only changed version/error expectations; updated those explicitly. First new frontend run: 7/8 PASS; one assertion matched the same deferred message in both controls and card, now scoped to the card. Test-only role option typing corrected; standalone check will be rerun against its 3 baseline errors.
- Next: real two-client socket/race checks, focused UI rerun, final rendered synthetic AUTO flow and full checks/build. No live inference/audio/native acceptance attempted.


## M08 final handoff — 26 October 2026
- T01–T09 COMPLETE. Backend 226 PASS; frontend 186 PASS; build304 PASS; exactly 3 unchanged standalone TypeScript baseline errors. Shared v6 fixtures32; older manual contracts pass.
- Fake-clock/event-gated scheduler tests and actual two-client WS prove bounded concurrency, manual priority, no replay, deferred/stale publication, lifecycle/candidate invalidation, capacity and correction. Sustained81-question flood keeps one active/newest pending without deleting earlier questions.
- Rendered final service: explicit AUTO/new eligible start, held completed output/release, manual takeover with partial retained, linked correction, Pause/Stop listening, reload stays Assist. Desktop1440×900/compact1000×720 overflow/footer pass. Harness max concurrency1, 6 synthetic answers/10 synthetic detections; no paid requests/audio/STT.
- Acceptance caught stale deferred inbox labels, generation/publication conflation and stale listening state on reload; fixed with regressions and affected full checks. Config whitelist blocks private execution fields.
- [Complete evidence/screenshots](../notes/2026-10-26-m08-acceptance.md). Docs/API/runbooks/architecture/accepted ADR/indexes current. Next M09-T01. Native/hardware/live acceptance remains open; no full-E2E claim. Cleanup complete; private config/data/dirty files preserved; no commit/deployment.


## Vite typing and publication follow-up — 26 October 2026
- Added `frontend/src/vite-env.d.ts` referencing `vite/client`. All three standalone ImportMeta.env errors are resolved; runtime environment parsing is unchanged.
- `cd frontend && npx tsc --noEmit` PASS; `npm run build` PASS (304 modules). Current STATUS/frontend runbook corrected; historical milestone acceptance records retain their original results.
- Published the accumulated cockpit source, contracts, tests, docs and acceptance screenshots from `vercel-ai` to [PR #1](https://github.com/monsteruk-crm/SuperCheeto/pull/1), targeting `master`. Implementation commit `c760df1` is pushed. Local memory databases/editor backups are ignored and remain local. User RAG files and private configuration remain outside the change.
- Final pre-publication suites: backend 226 PASS; frontend 186 PASS; standalone TypeScript PASS; build304 PASS. Staged scan excludes memory databases, backups, private environment and RAG data. Two whitespace findings in newly staged files corrected. Remote master/vercel-ai tips verified directly; normal fetch hit a pre-existing broken local Codex checkpoint ref, which was left intact.


## PR #1 review checkpoint — 26 October 2026
- R1–R5 implemented: exactly-once shielded disconnect cleanup; all-answer cancellation before epoch advance; ignored/untracked runtime RAG artifacts with local bytes preserved; audio-overlap-only STT/transcript deduplication; separately acknowledged status reads with no recursive polling.
- Focused tests PASS: hub3, STT9, transcript7, transport71 (real local sockets), frontend transport14. No paid inference/audio/native checks. Two test harness assertions corrected; acceptance-race instrumentation now uses direct cancellation primitives without helper recursion.
- PR publication audit previously checked staged paths only and missed already committed ancestor WAL changes. Correcting description and rebuilding only this PR's unmerged history without runtime database paths; preserve a local recovery ref and use a checked branch lease. Shared master history is outside this scoped cleanup. Full regression/data/history checks pending.
- Final code gate PASS: backend238, frontend188, standalone TypeScript zero errors, build304. Local RAG hashes: all3 files unchanged. Next: commit fixes, rebuild only introduced PR commits without runtime data paths, verify trees/objects and publish with an explicit branch lease; update PR description/results.
- Privacy gate PASS: rebuilt5 introduced commits without backend/data paths; original database blob IDs absent from introduced objects; final source tree identical; all3 local runtime file hashes unchanged and files untracked/ignored. Local recovery ref retained only locally. Shared master history/hosting caches are outside this scoped cleanup. Current rewritten fix commit `a1f6f10`; checked publication and final PR metadata verification next.
