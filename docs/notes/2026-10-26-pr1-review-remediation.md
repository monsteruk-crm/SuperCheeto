# PR #1 review remediation — 26 October 2026

All five review findings are fixed; code checks pass. The PR history cleanup is prepared before publication. No paid calls, actual audio/STT or browser/native acceptance are required for these offline regressions. [ADR 0020](../adr/0020-review-lifecycle-and-local-data-safety.md) records the choices.

| Finding | Fix | Current evidence |
| --- | --- | --- |
| R1 failed sends strand control | Exactly one shielded cleanup task across failed targeted/broadcast sends, handler finally and connect-hook failure; lease cleanup survives cancelling the sender | Hub3 and real transport failure/replacement-claim tests PASS |
| R2 Stop listening loses manual completion | Cancel all active answers definitively before session epoch invalidation; retain partial/source and suppress later output | Real local WS stopped manual answer has superseded terminal in original epoch; transport71 PASS |
| R3 personal SQLite WAL in PR | Untrack and ignore backend/data; retain local files; rebuild only unmerged PR history without runtime artifacts | Three local file hashes unchanged after all checks; history audit/push pending |
| R4 legitimate repeats suppressed | Require actual audio-time overlap in STT and transcript store, matching source/epoch in the store | Real finalization loop keeps sentence at1–2s and31–32s; short/adjacent/unknown-time/reset tests PASS |
| R5 endless reconciliation polling | Acknowledge status-read identity separately; never recursively reconcile a read timeout | Frontend transport14 PASS; backend successful/unknown status reads acknowledge own IDs |

Initial regression runs exposed two test harness mistakes (a misplaced count assertion and looking up an already-pruned finished task); corrected. Existing acceptance-race instrumentation exposed recursive reuse of a patched helper; invalidation now uses the matching cancellation primitive directly. Final checks and data/history audit follow before publication.

## Final code verification

- `cd backend && .venv/bin/python -m unittest discover -s tests -q` — PASS, **238 tests**, 5.973s. Includes3 hub cleanup regressions,4 transport regressions,4 STT regressions and1 transcript-store regression added for review.
- `cd frontend && npm test -- --run` — PASS, **188 tests** across11 files;2 new reconciliation regressions.
- `cd frontend && npx tsc --noEmit` — PASS, zero errors.
- `cd frontend && npm run build` — PASS,304 modules.
- Local RAG preservation: PASS, all3 original runtime files remain byte-for-byte identical after testing. No database contents or document paths were printed or used as fixtures.
- Runtime paths are staged for removal from Git tracking and ignored. Unmerged-history audit and checked PR branch publication are the remaining steps.
- No paid inference, actual capture/STT or native/browser acceptance was run for these fixes; all dependencies were synthetic/offline and RAG tests used temporary storage.
