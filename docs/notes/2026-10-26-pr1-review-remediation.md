# PR #1 review remediation — 26 October 2026

All five review findings are fixed; code and privacy checks pass. The PR branch has been rebuilt without runtime database artifacts. No paid calls, actual audio/STT or browser/native acceptance are required for these offline regressions. [ADR 0020](../adr/0020-review-lifecycle-and-local-data-safety.md) records the choices.

| Finding | Fix | Current evidence |
| --- | --- | --- |
| R1 failed sends strand control | Exactly one shielded cleanup task across failed targeted/broadcast sends, handler finally and connect-hook failure; lease cleanup survives cancelling the sender | Hub3 and real transport failure/replacement-claim tests PASS |
| R2 Stop listening loses manual completion | Cancel all active answers definitively before session epoch invalidation; retain partial/source and suppress later output | Real local WS stopped manual answer has superseded terminal in original epoch; transport71 PASS |
| R3 personal SQLite WAL in PR | Untrack and ignore backend/data; retain local files; rebuild only unmerged PR history without runtime artifacts | PASS: untracked/ignored locally; every PR-introduced tree and object set sanitized; all3 local file hashes unchanged |
| R4 legitimate repeats suppressed | Require actual audio-time overlap in STT and transcript store, matching source/epoch in the store | Real finalization loop keeps sentence at1–2s and31–32s; short/adjacent/unknown-time/reset tests PASS |
| R5 endless reconciliation polling | Acknowledge status-read identity separately; never recursively reconcile a read timeout | Frontend transport14 PASS; backend successful/unknown status reads acknowledge own IDs |

Initial regression runs exposed two test harness mistakes (a misplaced count assertion and looking up an already-pruned finished task); corrected. Existing acceptance-race instrumentation exposed recursive reuse of a patched helper; invalidation now uses the matching cancellation primitive directly. Final checks and data/history audit follow before publication.

## Final code verification

- `cd backend && .venv/bin/python -m unittest discover -s tests -q` — PASS, **238 tests**, 5.973s. Includes3 hub cleanup regressions,4 transport regressions,4 STT regressions and1 transcript-store regression added for review.
- `cd frontend && npm test -- --run` — PASS, **188 tests** across11 files;2 new reconciliation regressions.
- `cd frontend && npx tsc --noEmit` — PASS, zero errors.
- `cd frontend && npm run build` — PASS,304 modules.
- Local RAG preservation: PASS, all3 original runtime files remain byte-for-byte identical after testing. No database contents or document paths were printed or used as fixtures.
- Runtime paths are removed from Git tracking and ignored. All5 rebuilt PR-introduced commit trees contain no runtime database paths. The three original database blob IDs are absent from the PR-introduced object set. The final source tree is identical to the verified pre-rewrite source tree. Publication uses an explicit force-with-lease against the observed PR tip.
- No paid inference, actual capture/STT or native/browser acceptance was run for these fixes; all dependencies were synthetic/offline and RAG tests used temporary storage.

## Privacy and history boundary

The earlier publication scan inspected staging only and missed previously tracked WAL data in an ancestor commit. That exclusion claim was incomplete. This follow-up removes runtime paths from every PR-introduced commit, verifies both trees and introduced blob IDs, and corrects the PR description. The shared master branch is not rewritten, and already published commits/blobs may remain in base history or hosting caches. Repository-level historical/cached-data removal is outside this branch-scoped remediation. No personal document content or absolute document path is reproduced here.

A local recovery ref `local-pr1-before-rag-cleanup-20261026` retains the prior branch for recovery and is not pushed. Historical commit hashes in older milestone/publication notes refer to the pre-review branch. Current code and review evidence are in PR #1.

## Publication

PASS: checked lease update published the sanitized PR branch, and PR #1's description now lists all five fixes, current verification and the historical-data boundary. GitHub's six-commit list and head `266eeb1` were checked against the local branch; every published commit tree omitted runtime data. The final handoff documentation commit follows that audited tip. Local recovery history remains local. All five requested findings are closed within this PR's scope.
