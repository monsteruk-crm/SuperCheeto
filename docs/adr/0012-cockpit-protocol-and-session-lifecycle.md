# ADR 0012: Cockpit protocol v2, single-controller ownership and scoped lifecycle

## Status
Accepted (M03) for the transport, control lease, command/request lifecycle, scoping and legacy migration described below; validated by `backend/tests/test_cockpit_transport.py`, `frontend/src/cockpit/__tests__/transport.test.ts` and `frontend/src/cockpit/__tests__/reducer.test.ts`. **Amended by [ADR 0014](0014-protocol-v3-timing-and-model-readiness.md) (M3bis):** protocol v3 adds role/capability metadata and the C08 timing contract. The v2 payloads and rules recorded in this ADR are unchanged, and the legacy manual adapter still applies. Detector, candidate and AUTO surfaces remain specified but unwired; see the execution plan M07/M08.

## Context
The current runtime has no protocol version, no connection identity, and one global `_query_task`. Every reply is broadcast to all sockets, the handler receives no sender identity, and `WSClient.send` silently drops messages while offline. AUTO drafting requires that one owning UI session — not whichever window happens to send — controls generation, that completion/error payloads are scoped to the request/answer/snapshot they belong to, and that a reconnect or a second window cannot double-generate or cancel another owner's work. This ADR specifies the contract before any v2 code is wired, per the [execution plan](../plans/live-helper-cockpit-execution-plan.md) M01 and the [implementation brief](../prompts/live-helper-cockpit-implementation.md).

## Decision
- **Protocol version.** Keep the top-level `type` envelope. Add `protocolVersion: 2` to all v2 traffic. Preserve legacy manual envelopes through an adapter so existing clients keep working when no v2 controller holds the lease.
- **Identity.** Define `backendInstanceId` (new UUID at backend startup), `connectionId` (server-assigned per socket; never trust a claimed owner ID from a payload), `sessionEpoch` (server-owned assistance generation; incremented on owner loss, transcript clear, and source/capture invalidation), `audioEpoch` (new identity per capture restart), `segmentKey` (composite of `audioEpoch` + original segment ID), `transcriptRevision` (monotonic committed-source revision), `snapshotId`, `candidateId`/`candidateRevision`, `requestId`/`answerId`, `commandId`, and `eventSeq`. `eventSeq` is monotonic per answer and rejects duplicate/out-of-order chunk application.
- **Single-controller ownership.** The first successful v2 claimant becomes controller; other connections are read-only for assistance and capture-changing commands. An observer cannot submit/cancel owner jobs, arm AUTO, edit candidates, or change the active source. Owner disconnect cancels owned jobs, invalidates pending detection, releases control, and pauses AUTO. A released lease is claimed explicitly by a second window; no silent transfer or auto-arming. Reconnect re-negotiates.
- **Scoped lifecycle.** `WSClient.send` returns a typed success/rejection result and never queues paid commands for replay after reconnect. Commands carry `commandId`; the server acknowledges within five seconds. On expiry the client shows an unknown-acceptance state and reconciles by `commandId` via `get_command_status`; it does not automatically resend. Duplicate `commandId` returns the prior outcome without another paid call. Request records persist until definitive completion; a nonterminal legacy `query_state` cannot discard a request record before `query_response` arrives. Answer events carry request, answer, snapshot, backend/epoch identity, and candidate revision when applicable; `answer_finished` is authoritative even if chunks were missed.
- **Legacy migration.** Legacy manual clients remain usable when no v2 controller holds the lease and are serialized through the same answer slot. A legacy client cannot cancel a different connection's job (scoped busy/not-owner error). Shared transcript/audio/status may remain broadcast; request chunks, completions, and errors use targeted replies.
- **Capabilities.** Advertise only implemented capabilities (`hello_ack`/`control_state`). Do not advertise `full_auto` before M08 passes.
- **Error codes.** Use stable codes for offline/not-ready, incompatible version, not-owner, stale-epoch, stale-revision, invalid-span, capacity, and dependency failures.
- **Test tools.** Frontend deterministic tests use Vitest + jsdom + React Testing Library + user-event; backend tests keep Python `unittest`. Contracts are validated by shared fixtures parsed on both sides (M01-T06). No paid calls, audio, or live service in the harness.

## Alternatives considered
- **Frontend-only AUTO:** rejected — duplicate/cancellation/cost and cross-window ownership risk; lifecycle belongs on the backend.
- **Broadcast everything (status quo):** rejected — cannot scope completions/errors to a request or owner, and cannot prevent one window cancelling another's job.
- **Whole-new transport:** rejected — unnecessary; the `type` envelope is preserved and legacy adapters keep current clients working.
- **Implicit ownership transfer on disconnect:** rejected — silent re-arming risks unattended automation; release and explicit re-claim are required.
- **Automatic replay of unpaid commands on reconnect:** rejected — risks duplicate paid executions; explicit `commandId` reconciliation is used instead.

## Candidate workflow and state machine (M01-T05)

This section specifies the states M08 must implement before the scheduler exists. The M08 milestone turns these tables into `backend/app/assistance.py`.

### Independent state dimensions

These are deliberately separate so no single flag can encode two facts:

| Dimension | Values | Notes |
| --- | --- | --- |
| Candidate workflow | `proposed`, `incomplete`, `needs_review`, `user_set`, `queued`, `answered`, `dismissed`, `superseded` | Workflow only; never a calibrated confidence. |
| Generation status | `idle`, `active`, `pending`, `cancelled`, `failed`, `empty`, `completed` | One active answer plus one newest pending AUTO candidate. |
| Publication | `published`, `deferred`, `suppressed` | A completed result may be held during a human interaction hold. |
| Review | `unreviewed`, `inspected` | Every answer starts `unreviewed`; inspection never implies correctness. |
| Placement | `working`, `kept` | Display column; moving a completed card makes zero generation calls. |
| Supersession | `current`, `superseded_by:<candidateId>` | Editing/split/merge/dismiss supersede parents and retain lineage. |
| Interaction | `idle`, `selection`, `target_open`, `editor_open`, `publication_hold` | Blocks automatic targeting/publication; never capture. |

### Candidate workflow transitions

| From | Event | To | Side effects |
| --- | --- | --- | --- |
| (none) | detector proposes | `proposed` | Store source spans, revision, origin. |
| `proposed` | incomplete/conflict/negation/ambiguity detected | `needs_review` | Keep inspectable; no AUTO. |
| `proposed` | human edits | new revision (`user_set`) | New immutable revision; raw evidence unchanged. |
| `proposed` | human splits | `superseded` + child revisions | Parents superseded; lineage retained. |
| `proposed` | human merges | `superseded` + merged revision | Parents superseded; lineage retained. |
| `proposed` | human dismisses | `dismissed` | Suppress exact span until genuinely new source identity. |
| `dismissed` | human undo | `proposed` | Restore prior revision. |
| `proposed` | AUTO accepts | `queued` | Enters newest-pending slot. |
| `queued` | generation starts | `answered` (streaming) | One active answer. |
| any | candidate corrected / superseded | `superseded` | Old raw evidence and card retained. |

### M08 event transition tables

| Event | Execution effect | Required retained state |
| --- | --- | --- |
| New eligible candidate, idle and armed | Start one AUTO answer | Existing cards and inbox |
| New eligible candidate, answer busy | Replace newest pending slot only | Earlier unanswered candidates remain inspectable |
| Manual selection/editor/target | Hold AUTO targeting/publication | Capture, selection, current cards |
| Manual send | Supersede matching AUTO work; start accepted manual request | Partial old card, original source, revision lineage |
| Pause AUTO | Clear pending execution; allow current answer to finish | Transcription and all cards |
| Stop answer | Cancel matching job; suppress same-revision retry; pause AUTO when automated | Partial answer and source |
| Stop listening | Stop capture/detection; clear pending AUTO; pause AUTO | Prior answers and snapshots |
| Active source/mode change | New audio/assistance epoch; cancel stale automatic work; pause AUTO | Old answer provenance |
| Transcript clear | Clear live raw/candidate execution state; invalidate epoch; pause AUTO | Explicitly kept cards and their source copies |
| Owner loss/disconnect/backend restart | Cancel owned work; invalidate pending; pause AUTO | Usable historical cards in the client |
| Reconnect/control claim | Negotiate capabilities; remain in Assist | Retained historical records; no replay |
| Candidate edit/split/merge/dismiss | Invalidate pending/active old automatic revision | Old raw evidence and superseded records |

### Constraints
- A cancelled candidate never immediately restarts.
- A false eligible answer remains source-linked and correctable.
- Two windows cannot double-generate.
- Pinning does not imply correctness; inspection never implies correctness.

## Consequences
This requires changes in `backend/app/ws_server.py` (sender/owner identity, targeted `send_to`, connect/disconnect hooks), `backend/app/main.py` (owned requests, epochs, scoped lifecycle), `frontend/src/ws.ts` (typed send, acknowledgement deadline, scoped dispatch), and new `backend/app/cockpit_protocol.py` + `frontend/src/cockpit/types.ts`. It supersedes the single global `_query_task` assumption for assistance requests while keeping legacy manual queries working. Statuses are `completed`, `cancelled`, `failed`, `empty`, and `superseded`. Keep this ADR Proposed until M03 validation passes.

See [ADR 0011](0011-question-assistance-cockpit.md), the [execution plan](../plans/live-helper-cockpit-execution-plan.md), and the [API contract](../API.md).
