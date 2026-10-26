# M06 acceptance — Sound and Settings preservation

M06-T01–T09 COMPLETE on 26 October 2026, for the synthetic/local-service scope allocated by the plan. No real microphone/system audio, STT model, native window/shortcut acceptance or paid Gateway call was used. The user does not need to assist until M09/M10 hardware/native acceptance. [Progress ledger](../plans/live-helper-cockpit-progress.md) owns continuation; next M07-T01.

## Checks

| Check | Result |
| --- | --- |
| `cd backend && .venv/bin/python -m unittest discover -s tests` | PASS: 175 tests, 4.661s |
| `cd frontend && npm run test -- --run` | PASS: 115 tests across 9 files |
| `cd frontend && npm run build` | PASS: Electron TypeScript + Vite, 302 modules |
| `cd frontend && npx tsc --noEmit` | FAIL: exactly 3 existing TS2339 ImportMeta.env errors, App.tsx:55/61/67; no new errors |
| `git diff --check` / `git status --short backend/data` | PASS / clean |

Tests use synthetic capture, injected Gateway responses and temporary SQLite. The benchmark backend test exercises the real orchestration with 2 models × 2 cases × 2 repeats, including image bytes, failed requests, all progress/log events, actual supplied usage and summary aggregation. The RAG test uses real TXT/Markdown/PDF/DOCX readers, folder/file ingest, skip/update/errors, metadata/search, reopen and clear with deterministic local embeddings.

## Task evidence

| Task | Evidence |
| --- | --- |
| T01 | SoundDialog replaces transitional PromptBar controls; real mode/source/quick switch/refresh/Start/Stop handlers and both telemetry views. Open/close generates no capture mutation. |
| T02 | Header shows selected acknowledged device, signal state and meter while Sound is closed, including compact viewport. Shared AudioMeter is reusable by the later native Focus layout; no native Focus acceptance claimed. |
| T03 | MeterStore receives levels outside App state; only meters subscribe. A 100-event test asserts unchanged RawTranscript and AnswerCard render counts, raw/answer DOM and preference writes. Monitoring survives transcription Stop and releases resources on shutdown. |
| T04 | Browser monotonic receive freshness, 2s stale, immediate disconnect, peak ≥0.98/500ms clip hold and RMS <0.001 plus peak <0.005 quiet. Source matching includes late failure identity. Empty/failing/ended monitors report unavailable, never fresh zero signal. Refresh failure/timeout preserves last acknowledged device. |
| T05 | One preference restoration per connection/control claim; later acknowledgements/fallbacks are authoritative without resends. Same selection no-op; inactive device updates preference/monitor only; active changes cancel against old epoch before invalidation/restart and retain cards. Failed discovery does not commit a mode change. Owner-only capture mutations tested. AUTO/detector remain disabled. |
| T06 | Labelled dialog, initial focus, Tab/Shift+Tab containment, Close/Done/outside/Escape, inert background and focus return. Native screenshot callback blocked while a dialog/editor consumes input. Exact raw range restored after modal focus navigation; target and scroll survive. |
| T07 | Original SettingsPage and handlers retained; both pages stay mounted. Unsaved instruction/test drafts survive navigation; Settings errors are visible. Input labels now associate with their controls. |
| T08 | Settings harness exercises RAG actions/results/errors/catalog, image upload/replace/preview/delete, image-reference validation, test create/edit/delete, model multi-select/repeats/image resolution, benchmark logs/progress/results/tooltips/history/deduplication, persistence and clear. Valid images, tests and history survive remount; screenshot preference and saved Desk choices retain existing keys. Real RAG/backend benchmark tests complement renderer mocks. |
| T09 | Rendered checks below; ADR 0017, API/architecture/READMEs/STATUS/CHANGELOG/index/ledger updated. |

## Rendered acceptance

Chrome CUA operated the actual frontend at isolated origin `http://127.0.0.1:5188`, connected to a local AppController on 8765 with synthetic devices/telemetry, injected catalog/generation/benchmark and temporary RAG SQLite. Capture/STT were stubbed; local document ingestion used the real store with local embedding fixtures. Existing user browser storage and backend data were not used.

- Sound opened during a delayed streamed answer; Escape returned focus to Sound with status still running and partial Markdown intact. The completed card later remained visible.
- Synthetic Start/Stop and inactive microphone selection/active mode switch acknowledged correctly. After Stop the header still displayed active 30% signal from the acknowledged microphone B; both dialog meters showed matching RMS 0.0300/peak 0.2000.
- 1000×720 compact view had no horizontal overflow, header meter visible, footer bottom 712px. At 1440×900 no horizontal overflow, header meter visible, footer bottom 892.36px. At 1680×1000 no overflow; Sound bounds x480/y296.625/720×406.75 fit within the viewport.
- Actual pointer-selected text “Should we preserve this synth” survived Sound → Tab → Escape exactly; raw scroll remained 0, focus returned to Sound, and the Draft answer from selection action remained usable after the selectionchange event.
- Actual Settings ingested `/tmp/cockpit-m06/fixture.txt`, returned +1 new/1 chunk/path metadata; refresh and catalog worked. Created a synthetic benchmark test, ran mocked execution and saw log/summary/history. Unsaved instruction/test prompt survived Desk/Settings navigation. Browser reload retained selected microphone B, created test, history and local indexed document. Clear removed only this isolated index/history and displayed empty states.
- Initial screenshot exposed light text on light Sound buttons; explicit dark backgrounds/light text and label contrast were corrected and visually rechecked. Final screenshot showed readable controls.

The rendered fixture's benchmark response is synthetic; the separate backend test validates real benchmark orchestration. Full image CRUD/reference/persistence and all four ingestion formats were exercised in automated UI/reader tests, not claimed as separate native browser uploads.

## Corrections and boundaries

A new RAG test initially omitted required top_k; corrected and reran. A benchmark test cleared a clamped numeric input before typing, producing 10 rather than intended 3; changed the fixture event to exercise the intended numeric change. A stronger raw-selection test exposed native selection loss on focus; capture-before-focus plus range restoration fixed it, then the complete UI suite and real pointer check passed.

No new API message types/required fields/storage keys/database schema. Existing open status envelope carries source-specific meter failures and refresh failures; [ADR 0017](../adr/0017-sound-monitoring-and-source-reconciliation.md) records semantics. Protocol v2/v3/v4 remain supported. No detector or AUTO capability added; full-cockpit ADR 0011 remains Proposed. Hardware signal quality, routing, actual STT, Focus/native window controls and shortcuts remain M09/M10.

Only the test backend/Vite processes were stopped, viewport reset and isolated tab closed; temporary SQLite removed. User index remains clean; unrelated dirty files/backups preserved. No commit or deployment.
