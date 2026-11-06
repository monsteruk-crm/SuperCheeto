# ADR 0019: Owned FULL AUTO scheduling

## Status
Accepted for M08 synthetic/local-service scope. See [acceptance evidence](../notes/2026-10-26-m08-acceptance.md); live/native integration remains M09/M10.

## Context
M07 provides fallible question interpretations and source-preserving correction. M08 needs automatic drafts with manual priority, bounded concurrency and independent execution/publication state. Existing v5 holds do not report raw selections, all editing contexts or settings configuration.

## Decision
- Add protocol v6 before runtime wiring; v2–v5 manual clients remain compatible. AUTO requires the v6 `full_auto` capability and explicit controller arming. Armed state is never persisted or restored on reconnect.
- Keep a pure scheduler state in `assistance.py`, wired by an AutoService around the existing AnswerService. One answer job across manual/AUTO, one newest pending candidate, at most one deferred AUTO result. Only proposals published after arming are offered; never backfill the existing inbox.
- Eligibility requires a current finalized source, detector origin, proposed state and explicitly empty `reviewReasons`. Missing classification is unverified/review; incomplete/ambiguous/conflicting/negated/unsupported proposals cannot auto-start. Interpretation remains fallible and every draft stays unreviewed/correctable.
- Acknowledge a server-owned generation configuration with monotonic revision. Freeze profile/instruction, model/reasoning, explicitly included human notes and explicit screenshot at acceptance. No automatic capture, provider audio session, direct-provider route or paid retry is introduced.
- Human selection/target/editors/Settings editing hold AUTO starts/publication; Sound alone does not. Manual sends clear pending execution and supersede active/deferred AUTO work while preserving evidence/partial cards. New speech only replaces the pending slot, never the active stream.
- During a hold, preserve displayed text and buffer remaining AUTO publication on its bounded request record. Report completed generation/deferred publication independently. Revalidate epoch/candidate revision before release; stale deferred results become superseded without publishing hidden text as current. Manual output bypasses automatic publication holds.
- Pause clears pending but permits the active answer to finish. Stop an automated answer pauses AUTO and suppresses its revision. Stop listening/source changes/clear/owner loss invalidate pending/deferred work and disarm. Candidate mutation cancels stale automatic revisions. Gateway/configuration/capacity failures pause visibly; no unchanged-revision automatic retry.
- Existing 200 candidate revisions, 50 working/50 kept cards and snapshot ownership bounds continue. Deferred/active/pending references are protected from eviction and released on lifecycle transitions. Model usage/timing remain truthful; automatic requests have no invented client press timestamp.

## Alternatives considered
- Renderer-owned paid calls: risks duplicate generation across windows and reconnects.
- Cancel on each new question: interrupts useful streaming and loses reading continuity.
- Persist AUTO mode or replay the inbox on arm: creates unexpected calls after restart or mode changes.

## Consequences
AUTO requires active listening, enabled detection, current ownership and validated settings. UI controls explain readiness/hold/failure reasons. Synthetic acceptance covers state/race behavior; real audio/model/native checks remain M09/M10. The plan/progress ledger remains the resumption authority.
