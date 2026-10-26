# ADR 0016: Manual Targets, Frozen Reruns and Retained Answer State

## Status
Accepted for M04/M05

## Context
Client replay cannot preserve edited notes, deleted document evidence, attachments or accepted model settings. Manual wording needs its own identity without rewriting raw speech. Card eviction and lost acknowledgements must remain authoritative and visible.

## Decision
Negotiate protocol v4 before v3/v2. Add `rerun_answer {sourceAnswerId}`, `snapshot_action {snapshotId, action:"release"}`, optional `manualTarget {targetId, sourceSnapshotId, wording}` on snapshot queries, and scoped `answer_state` events. A v4 created snapshot has an owner draft reference. Releasing that reference never releases references held by answers. Reruns use server-owned accepted input copies and captured retrieval; they do not search again. Command-status results replay recorded acceptance/state events without executing generation.

Answer-state events carry an independent `stateSeq`, request/answer identity, placement, removed/source-availability flags and reason. Kept/active/selected/inspected material cannot be evicted. Working cards are bounded at 50; kept cards and notes at 50 each; unattached pins at 50. Request/command history retains its existing bounds. Source/attachment copies are released on safe removal or eviction. Human note copies include a SHA-256 content hash. All stores remain ephemeral; no transcript database is introduced.

## Alternatives considered
- Client replay: cannot guarantee unchanged evidence or note/image inputs and requires retaining sensitive duplicate payloads.
- Reuse candidate actions: would couple the manual workbench to M07 detection and lineage.
- Change v3 in place: would invalidate documented payload expectations.

## Consequences
v2/v3 clients keep their recorded contracts. New UI features require v4 and fail visibly on older backends. The backend owns rerun availability and eviction notices. The client presents cards in stable append order; new-draft notices overlay the scroll region so they do not move its reading anchor. A selected target is consumed only after acceptance. Provider API compatibility fallback remains same-model/pre-content 404 only.
