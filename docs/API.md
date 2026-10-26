# API

Current client negotiates `[5,4,3,2]`. Protocol v5 adds M07 question proposals/correction; see its section below and ADR 0018. Older version sections retain their recorded contracts.

## Transport
- Protocol: WebSocket
- Endpoint: `ws://127.0.0.1:8765`
- Reconnect: frontend client retries connection; backend accepts reconnects and repeated start/stop cycles.

## Backend -> Frontend messages
- `transcript_live`
  - Payload: `{ "text": string, "t": number, "streamKind"?: "system"|"mic", "sourceName"?: string|null }`
- `transcript_segment`
  - Payload: `{ "segment": { "id": string|number, "t0": number, "t1": number, "text": string, "is_final": boolean, "source_kind"?: "system"|"mic", "source_name"?: string|null } }`
- `audio_level`
  - Payload: `{ "rms": number, "peak"?: number, "level": number, "t": number, "streamKind"?: "system"|"mic", "sourceName"?: string|null }`
- `audio_sources`
  - Payload:
    - `{ "sources": string[], "defaultSource"?: string, "selectedSource"?: string, "monitorSources"?: string[], "defaultMonitorSource"?: string, "selectedMonitorSource"?: string, "micSources"?: string[], "defaultMicSource"?: string, "selectedMicSource"?: string, "selectedMode"?: "system"|"mic" }`
- `status`
  - Payload: `{ "state": string, "details": object|string|null }`
- `query_state`
  - Payload: `{ "running": boolean, "requestId"?: string, "cancelled"?: boolean }`
- `query_chunk`
  - Payload: `{ "requestId"?: string, "delta": string }`
- `query_response`
  - Payload: `{ "requestId": string, "text": string, "latencyMs"?: number, "model"?: string, "screenshotUsed"?: boolean, "ragChunksUsed"?: number, "ragSources"?: string[] }`
- `rag_documents`
  - Payload: `{ "documents": Array<{ "docId": string, "filePath": string, "title": string, "chunkCount": number, "updatedAt": number }> }`
- `rag_ingest_result`
  - Payload: `{ "ingested": number, "updated": number, "skipped": number, "failed": number, "errors"?: string[] }`
- `error`
  - Payload: `{ "message": string }`

## Frontend -> Backend messages
- `set_audio_source`
  - Payload: `{ "sourceName": string }`
- `set_mic_source`
  - Payload: `{ "sourceName": string }`
- `set_audio_mode`
  - Payload: `{ "mode": "system"|"mic" }`
- `start_transcription`
  - Payload: none
- `stop_transcription`
  - Payload: none
- `run_query`
  - Payload:
    - `{ "requestId": string, "presetId": string|null, "customInstruction": string|null, "selectedText": string, "selectionTimeRange": { "start": number, "end": number }|null, "model"?: string|null, "includeScreenshot"?: boolean, "screenshotDataUrl"?: string|null }`
- `cancel_query`
  - Payload:
    - `{ "requestId"?: string }`
- `rag_ingest`
  - Payload:
    - `{ "paths": string[] }` (absolute file paths and/or directories)
- `rag_list`
  - Payload: none
- `rag_clear`
  - Payload: none
- `run_benchmark`
  - Payload:
    - `{ "benchmarkId": string, "models": string[], "instruction": string, "tests": Array<{ "testId": string, "userPrompt": string, "imageRef"?: string|null, "imageDataUrl"?: string|null }>, "repeats": number }`
  - Backward compatibility:
    - Legacy single-test payload with `selectedText` is still accepted.

## Benchmark backend -> frontend messages
- `benchmark_progress`
  - Payload:
    - `{ "benchmarkId": string, "completed": number, "total": number, "testId": string, "model": string, "run": number, "successes": number, "failures": number }`
- `benchmark_log`
  - Payload:
    - `{ "benchmarkId": string, "testId": string, "model": string, "run": number, "success": boolean, "jsonValid": boolean, "timeToFirstTokenMs": number|null, "ttcMs": number|null, "latencyMs": number|null, "inputTokens": number|null, "outputTokens": number|null, "totalTokens": number|null, "costUsd": number|null, "qualityScore": number, "qualityPassed": boolean, "qualityChecks": Array<{ "name": string, "passed": boolean, "details": string }>, "imageCapabilityClaim": string|null, "imageWorked": boolean|null, "responsePreview": string, "error": string|null, "imageRef": string|null }`
- `benchmark_complete`
  - Payload:
    - `{ "benchmarkId": string, "createdAt": number, "instruction": string, "tests": Array<{ "testId": string, "userPrompt": string, "imageRef": string|null, "hasImage": boolean }>, "results": Array<{ "testId": string, "model": string, "runs": number, "failures": number, "jsonValidRuns": number, "avgFirstTokenMs": number|null, "avgTtcMs": number|null, "minTtcMs": number|null, "maxTtcMs": number|null, "avgLatencyMs": number|null, "minLatencyMs": number|null, "maxLatencyMs": number|null, "totalInputTokens": number, "totalOutputTokens": number, "totalCostUsd": number|null, "costKnownRuns": number, "avgQualityScore": number|null, "qualityPassRuns": number, "imageRuns": number, "imageWorkedRuns": number, "aggregateScore": number }>, "attempts": Array<benchmark_log_payload_without_benchmarkId> }`

## Benchmark scoring notes
- Benchmarks are executed through AI Gateway `Responses` API (with Chat Completions fallback on 404) and can include both text and image input in one request.
- Cost is estimated when model pricing is known in backend pricing catalog or `AI_GATEWAY_MODEL_PRICING_JSON`.
- Quality score is rubric-based (required keys, answer presence, image claim check for image tests, and identifier check when requested).
- `ttcMs` (time to complete) is the full request duration from send to final response.
- Aggregate score is speed-first (0-100) and weights TTC/TTFT heavily, then reliability and quality:
  - 82% speed (`ttcMs`, `timeToFirstTokenMs`)
  - 13% reliability (success rate + JSON validity)
  - 5% quality/image behavior

## Query streaming notes
- Interactive `run_query` now uses Responses API streaming by default through AI Gateway.
- This is text generation from a transcript snapshot, not an audio realtime session. The default answer model is `google/gemini-3.8-flash` with supported low reasoning; configured/saved model choices remain authoritative. See [ADR 0013](adr/0013-stream-transcript-text-answers.md).
- Gateway SSE is parsed by event boundary. Only answer text is forwarded; reasoning is excluded. Responses must finish with `response.completed`; Chat Completions must have `finish_reason: stop`. Malformed/error/incomplete events and premature EOF fail the request, preserving emitted partial text; empty output stays empty. Chat `length`/`content_filter`/tool-only endings are not completed text answers.
- The same-model Chat Completions fallback is limited to a Responses HTTP 404 before any answer text. There is no automatic retry after partial output or on 401/429/5xx/timeout. Cancellation closes the provider stream.
- Chat streaming includes `stream_options.include_usage`; Responses reads terminal usage. The client's TTFT is first nonempty answer text (including compatibility-fallback overhead), and generation latency covers the full Gateway operation. Existing benchmark fields retain their shape. STT/RAG/UI delays are separate; no local WS payload/version changes in this iteration.
- Frontend receives incremental text via `query_chunk` and then a final `query_response`.
- `cancel_query` stops an in-flight query; frontend receives `query_state` with `running=false` and `cancelled=true`.
- When indexed documents exist, backend injects top-K retrieved chunks from local RAG store into query context before Gateway call.
- Model strings use `creator/model` format (e.g. `openai/gpt-5.6-sol`); old bare IDs are normalized automatically.

## RAG notes
- RAG vectors are persisted in local SQLite (`RAG_DB_PATH`), not browser storage.
- Default embedding model is `openai/text-embedding-3-small` through AI Gateway (`RAG_EMBEDDING_MODEL`).
- Supported ingestion file types: `.txt`, `.md`, `.pdf`, `.docx`.

## Audio mode notes
- Backend discovers and broadcasts monitor (system-output) sources and microphone sources separately.
- Source discovery prefers `pactl` when it is installed, and falls back to PipeWire-native `pw-dump` metadata when it is not.
- Switching source or mode while running triggers an automatic capture restart that reuses the already-loaded Whisper model.
- Backward compatibility is preserved for legacy clients that only consume `sources/defaultSource/selectedSource`.
- `audio_level` events are emitted by always-on meter loops, so meters can update even when transcription is not running.
- Audio meter responsiveness can be tuned with:
  - `AUDIO_LEVEL_INTERVAL` (default `0.04`)
  - `AUDIO_LEVEL_RMS_REF` (default `0.06`)
  - `AUDIO_LEVEL_PEAK_REF` (default `0.22`)

## Versioning notes
- No explicit protocol version field is currently enforced.
- Any schema or event-name change should add a protocol version and a new ADR.

---

# Protocol v2 (partially wired — M02/M03)

> **Status:** the transport contract below is implemented for `hello`, `claim_control`, `get_command_status`, `create_snapshot`, `run_context_query`, `run_snapshot_query`, `cancel_answer`, `answer_action`, `context_note_action`, and `interaction_state`. `candidate_action`, `set_detection`, and `set_auto` are specified but still rejected with `not_ready`, and their capabilities are not advertised. See [ADR 0012](adr/0012-cockpit-protocol-and-session-lifecycle.md) and the [execution plan](plans/live-helper-cockpit-execution-plan.md).

## Envelope and identity

Every v2 message keeps the top-level `type` field and adds `protocolVersion: 2`.

Client → server envelope:
```json
{ "type": "<command>", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>", "...": "command-specific fields" }
```

Server → client envelope:
```json
{ "type": "<event>", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3, "...": "event-specific fields" }
```

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `backendInstanceId` | string (uuid) | yes | New UUID per backend process; a message from an earlier incarnation is rejected with `incompatible_version`/`stale_epoch`. |
| `connectionId` | string (uuid) | server-assigned | Identity of one socket. Clients never claim an owner ID in a payload. |
| `sessionEpoch` | integer | yes | Server-owned assistance generation; incremented on owner loss, transcript clear, and source/capture invalidation. |
| `audioEpoch` | string (uuid) | per-span | New identity for every capture restart; prevents collisions between reused STT IDs/times. |
| `segmentKey` | string | per-span | Composite of `audioEpoch` and the original segment ID. |
| `transcriptRevision` | integer | per-span | Monotonic revision within the backend instance for committed-source changes. |
| `snapshotId` | string (uuid) | per-snapshot | Server-assigned identity of a frozen source copy. |
| `candidateId` / `candidateRevision` | string / integer | per-candidate | Candidate lineage and immutable interpretation version. |
| `requestId` / `answerId` | string (uuid) | per-request | One execution attempt and its answer card; a rerun gets new IDs. |
| `commandId` | string (uuid) | yes (commands) | Client command identity for acknowledgement and duplicate-send suppression. |
| `eventSeq` | integer | per-answer | Monotonic answer-event sequence; rejects duplicate/out-of-order chunk application. |

Character offsets are half-open `[start, end)` measured in **Unicode code points** (Python slicing convention). Browser UTF-16 DOM offsets are converted explicitly. Source spans include `segmentKey`, revision, offsets, `t0`, `t1`, source kind, source name, and `audioEpoch`.

### Source semantics (M02)

- `segmentKey` is `<audioEpoch>#<sttSegmentId>` for committed text and `<audioEpoch>#partial` for the live tail. Every capture restart (start, stop, source switch, mode switch) creates a new `audioEpoch`, so reused STT segment IDs and capture-relative times can never collide with earlier text.
- `transcriptRevision` increments on every committed segment, transcript clear, and capture restart. A committed segment's revision never changes.
- A recent-window snapshot ends at the explicit press-time anchor and includes only complete finalized segments from the **anchor's audio epoch** whose revision is at or before the anchor. Text committed after the press, and text from a previous capture, is excluded. Word-level timing is unavailable, so complete intersecting segments are included as a whole.
- Span offsets are validated against the stored segment text, not against the concatenated snapshot text. An out-of-range, inverted, or non-integer offset is rejected with `invalid_span`; an unknown `segmentKey` or a mismatched span revision is rejected with `stale_revision`.
- Partials are excluded by default. An explicitly requested partial (`includePartial`) freezes as `tentative: true` and is never usable for AUTO.
- A snapshot owns copies of the text and its spans. Later finals, partial updates, `clear_transcript`, and source restarts cannot change it.
- Snapshot text over 24,000 characters is rejected with `invalid_span`; snapshots are never silently truncated.
- Unreferenced, unpinned snapshots are garbage collected; pinned moments are bounded at 50 unattached snapshots (`capacity`).

## Capability rollout

Capabilities are advertised in `hello_ack` and `control_state`. Only implemented capabilities are advertised; `full_auto` must not appear before M08 passes.

```json
{ "capabilities": ["assist", "snapshots", "model_readiness", "timing", "answer_records", "manual_targets", "answer_rerun", "answer_state"] }
```

| Capability | Meaning | Status |
| --- | --- | --- |
| `assist` | Negotiated v2 session, manual/context answering, snapshot creation. | Advertised since M03 |
| `snapshots` | `create_snapshot` / `run_context_query` / `run_snapshot_query`. | Advertised since M03 |
| `candidates` | Detector proposals and candidate operations. | Not advertised until M07 |
| `answer_records` | Immutable answer cards and evidence. | Advertised in v4 (M04/M05) |
| `manual_targets` | Human wording separate from raw source. | Advertised in v4 |
| `answer_rerun` | Exact rerun from retained server record. | Advertised in v4 |
| `answer_state` | Authoritative placement/retention and state replay. | Advertised in v4 |
| `full_auto` | Backend-owned AUTO scheduling. | Not advertised until M08 |

## Client → server commands

### `hello`
Payload:
```json
{ "type": "hello", "protocolVersion": 2, "backendInstanceId": "<uuid>|null", "sessionEpoch": 0, "commandId": "<uuid>", "client": { "appId": "audio-transcriber-ui", "clientVersion": "0.1.0" } }
```
- `backendInstanceId`: nullable on first contact; echoed on reconnect.
- Validation: missing/invalid `protocolVersion` → `incompatible_version`; unknown client shape → `invalid_payload`.
- Response: `hello_ack`.

### `claim_control`
Payload:
```json
{ "type": "claim_control", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>" }
```
- Validation: no current owner or owner released → owner granted; otherwise `not_owner` (read-only). A stale epoch → `stale_epoch`.
- Response: `command_ack` then `control_state`.

### `get_command_status`
Payload:
```json
{ "type": "get_command_status", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>", "queryCommandId": "<uuid>" }
```
- Purpose: reconcile an unacknowledged command without repeating execution.
- Response: `command_status` keyed by `queryCommandId`, then `command_ack` keyed by this status request's own `commandId`. A status read has its own acknowledgement deadline; expiry is final/unknown and never recursively requests another status read.

### `create_snapshot`
Payload:
```json
{
  "type": "create_snapshot", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>",
  "kind": "recent_window", "anchorSegmentKey": "<segmentKey>", "windowSeconds": 20,
  "includePartial": false
}
```
- `kind`: `recent_window` (press-time anchor) | `selection` | `pinned_moment`.
- `windowSeconds`: `20` | `45` | `90` (default 20).
- `selection` additionally requires `sourceSpans` (half-open offsets over stored segments). `anchorSegmentKey` is ignored for selections.
- `pinned_moment` creates the same window as `recent_window` and pins it; it makes no model call.
- Requires the control lease; an observer is rejected with `not_owner`.
- Validation: unknown anchor or unknown span `segmentKey` → `stale_revision`; anchor from a superseded epoch → `stale_epoch`; out-of-range offsets, a partial without `includePartial`, or text over 24,000 characters → `invalid_span`; no finalized text → `empty`; pinned-moment capacity → `capacity`. No model call is made.
- Response: `command_ack` then `snapshot_created`.

### `run_context_query`
Payload:
```json
{
  "type": "run_context_query", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>",
  "anchorSegmentKey": "<segmentKey>", "windowSeconds": 20,
  "targetId": "<targetId>|null", "mode": "Preset", "presetId": "answer_question", "customInstruction": null,
  "model": "openai/gpt-5.6-sol", "includeScreenshot": false, "screenshotDataUrl": null,
  "humanNoteIds": []
}
```
- Atomically freezes the press-time window and accepts one manual request. An explicit `targetId` wins over the recent window.
- `targetId` is accepted from M03 but a target store only arrives with the workbench (M05/M07); until then an unresolvable `targetId` is rejected with `stale_revision`.
- Preflight strictly checks string/null identities (`targetId`, `anchorSegmentKey`, `snapshotId`, `model`, `presetId`), mode and instruction types, boolean `includeScreenshot`, string/null screenshot data, and an array of non-empty `humanNoteIds`; each included note must still exist. Malformed values reject with `invalid_payload` before creating/consuming a snapshot or acknowledging an answer; a missing included note rejects with `stale_revision`. Empty custom instruction or unknown preset also rejects with `invalid_payload`; no finalized text → `empty`; unknown source → `stale_revision`; not owner → `not_owner`. A rejected request does not supersede an already-running answer. On acceptance, the source snapshot is retained synchronously before asynchronous supersession/GC can run. The acceptance epoch is captured before awaiting supersession and rechecked afterward; if transcript clear/capture invalidation or owner disconnect changes the epoch mid-handoff, the command is rejected with `stale_epoch` and the retained snapshot is released. Supersession teardown failure is fail-closed (`dependency`) and also releases the snapshot. Command validation through outcome recording is serialized so simultaneous duplicate `commandId`s cannot create two answer records; distinct simultaneous accepted commands still preserve the single-active-answer slot by terminally superseding the older request. If the bounded request-record registry is full of nonterminal work, a new run is rejected with `capacity` before a snapshot is frozen or an existing answer is superseded. Terminal request history is pruned oldest-first to make room; live records are never evicted.
- Response: `command_ack`, `snapshot_created`, `answer_accepted`, `answer_chunk`*, `answer_finished`.

### `run_snapshot_query`
Payload:
```json
{
  "type": "run_snapshot_query", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>",
  "snapshotId": "<uuid>", "targetId": "<targetId>|null", "mode": "Custom", "presetId": null,
  "customInstruction": "Focus on the rollback plan.", "model": "openai/gpt-5.6-sol",
  "includeScreenshot": false, "screenshotDataUrl": null, "humanNoteIds": []
}
```
- Submits a frozen selection, pinned moment, candidate, or corrected target.
- Validation: unknown `snapshotId` → `stale_revision`; mismatched candidate/snapshot identity → `invalid_span`.
- Response: `command_ack`, `answer_accepted`, `answer_chunk`*, `answer_finished`.

### `cancel_answer`
Payload:
```json
{ "type": "cancel_answer", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>", "requestId": "<uuid>", "answerId": "<uuid>" }
```
- Cancels only the matching owned request/answer. A non-matching or unknown ID → `not_owner`/`invalid_span`.
- Response: `command_ack` then `answer_finished` with `status: "cancelled"`.

### `candidate_action`
Payload:
```json
{
  "type": "candidate_action", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>",
  "action": "edit", "candidateId": "<uuid>", "expectedRevision": 4,
  "wording": "Should we roll back first?", "sourceSpans": [{ "segmentKey": "<segmentKey>", "start": 0, "end": 12, "t0": 1.0, "t1": 2.0, "sourceKind": "system", "sourceName": "Monitor of Built-in Audio" }]
}
```
- `action`: `create` | `edit` | `split` | `merge` | `dismiss` | `undo` | `correct`.
- Editing creates a new immutable revision; split/merge supersede their parents and retain lineage. A stale `expectedRevision` → `stale_revision`.
- Response: `candidate_update`.

### `answer_action`
Payload:
```json
{ "type": "answer_action", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>", "answerId": "<uuid>", "action": "keep" }
```
- `action`: `keep` | `unkeep` | `remove`.
- Capacity: keeping beyond 50 items → `capacity` (reject visibly, never discard a kept item).
- Response: `command_ack` (plus a state event when relevant).

### `context_note_action`
Payload:
```json
{
  "type": "context_note_action", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>",
  "action": "create", "noteId": "<uuid>", "text": "We never ship on Fridays.", "includeInFutureContext": false
}
```
- `action`: `create` | `edit` | `remove`. `noteId` is a stable, non-empty client-generated ID for every action. `includeInFutureContext` defaults `false`; only IDs explicitly sent in `humanNoteIds` enter an answer.
- The backend keeps at most 50 notes and 4,000 characters per note. Create/edit/remove require the control owner. The frontend persists the note text in `cockpit-human-notes.v1` and resends the same IDs to a new owner connection; backend note state is in-memory. Acceptance copies included note text into frozen request metadata, so later edits/removal do not change an accepted answer or its rerun. Notes are passed as user-provided context and never presented as verified RAG evidence.
- Response: `command_ack`; rejected edits/removals and capacity overflow keep the UI note unchanged and return a visible error.

### `set_detection`
Payload:
```json
{ "type": "set_detection", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>", "enabled": true }
```
- Explicit detector control. No call occurs for a partial or meter update.
- Response: `detector_state`.

### `set_auto`
Payload:
```json
{ "type": "set_auto", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>", "armed": true, "mode": "full_auto" }
```
- Explicit per-session AUTO arm/pause. Never persisted. Gated on the `full_auto` capability, current controller, and a usable source epoch.
- Response: `assistance_state`.

### `interaction_state`
Payload:
```json
{ "type": "interaction_state", "protocolVersion": 2, "backendInstanceId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>", "selectedSnapshotIds": [], "openEditors": [], "inspectedAnswerIds": [], "publicationHold": false }
```
- Identifies selected snapshots, open editors, inspected answer IDs, and publication holds. Backend capacity checks respect these protections.

## Server → client events

### `hello_ack`
Payload:
```json
{ "type": "hello_ack", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3, "capabilities": ["assist", "snapshots"], "serverTime": 1760000000.0, "commandId": "<uuid>", "ownerConnectionId": null, "readOnly": true }
```
- `capabilities` advertises only what this build implements. After M03 that is `assist` and `snapshots`.
- `ownerConnectionId`/`readOnly` report the current control lease at negotiation time; `control_state` follows whenever it changes.
- A `hello` that names a different `backendInstanceId` is rebinding, not a rejection: the ack always carries the current instance.

### `control_state`
Payload:
```json
{ "type": "control_state", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3, "isOwner": true, "ownerConnectionId": "<uuid>", "readOnly": false, "capabilities": ["assist", "snapshots"] }
```

### `command_ack`
Payload:
```json
{ "type": "command_ack", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>", "accepted": false, "requestId": null, "answerId": null, "code": "not_owner", "message": "Another connection controls assistance." }
```
- `code`/`message` are `null` for accepted commands and describe the rejection otherwise.
- A duplicate `commandId` from the same connection returns the retained outcome without re-executing.

### `command_status`
Payload:
```json
{ "type": "command_status", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3, "commandId": "<queryCommandId>", "status": "accepted", "requestId": "<uuid>|null", "answerId": "<uuid>|null", "code": null, "message": null }
```
- `status`: `accepted` | `rejected` | `unknown`.
- `commandId` echoes the **queried** `queryCommandId`, so reconciliation is unambiguous.
- Reconciles without repeating execution: the retained outcome is returned, never a second paid call.

### `snapshot_created`
Payload:
```json
{
  "type": "snapshot_created", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>",
  "snapshot": { "snapshotId": "<uuid>", "kind": "recent_window", "text": "...", "charCount": 1234, "truncated": false, "tentative": false, "sourceSpans": [{ "segmentKey": "<segmentKey>", "start": 0, "end": 42, "t0": 0.0, "t1": 2.0, "sourceKind": "system", "sourceName": "Monitor of Built-in Audio", "audioEpoch": "<uuid>", "revision": 7 }], "anchorSegmentKey": "<segmentKey>", "createdAt": 1760000000.0 }
}
```
- `tentative: true` means the frozen text includes explicitly requested partial speech. It may be used for a manual answer, never for AUTO.
- Spans carry the segment's committed `revision`; a snapshot never references a later revision.
- `run_context_query` also sends `snapshot_created` before `answer_accepted` so the client can inspect the exact frozen source.

### `candidate_update`
Payload:
```json
{
  "type": "candidate_update", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3,
  "candidate": { "candidateId": "<uuid>", "candidateRevision": 4, "state": "needs_review", "wording": "Should we roll back first?", "reason": "missing referent", "origin": "detector", "sourceSpans": [{ "segmentKey": "<segmentKey>", "start": 0, "end": 12, "t0": 1.0, "t1": 2.0, "sourceKind": "system", "sourceName": "Monitor of Built-in Audio", "audioEpoch": "<uuid>", "revision": 7 }], "supersedes": [] }
}
```
- `state`: `proposed` | `incomplete` | `needs_review` | `user_set` | `queued` | `answered` | `dismissed` | `superseded`.

### `detector_state`
Payload:
```json
{ "type": "detector_state", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3, "enabled": true, "inFlight": false, "lastError": null, "dirty": false }
```

### `assistance_state`
Payload:
```json
{ "type": "assistance_state", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3, "autoArmed": false, "pauseReason": "not_armed", "activeAnswerId": null, "pendingCandidateId": null, "generationBusy": false }
```
- `pauseReason`: `not_armed` | `no_capability` | `no_owner` | `no_source_epoch` | `hold` | `capacity` | `owner_lost`.

### `answer_accepted`
Payload:
```json
{ "type": "answer_accepted", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3, "commandId": "<uuid>", "requestId": "<uuid>", "answerId": "<uuid>", "snapshotId": "<uuid>", "candidateRevision": null, "mode": "Preset", "model": "openai/gpt-5.6-sol", "frozenInputs": { "instruction": "Answer clearly and concisely.", "humanNoteIds": [], "includeScreenshot": false } }
```

### `answer_chunk`
Payload:
```json
{ "type": "answer_chunk", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3, "requestId": "<uuid>", "answerId": "<uuid>", "snapshotId": "<uuid>", "candidateRevision": null, "eventSeq": 1, "delta": "First " }
```

### `answer_finished`
Payload:
```json
{
  "type": "answer_finished", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3,
  "requestId": "<uuid>", "answerId": "<uuid>", "snapshotId": "<uuid>", "candidateRevision": null,
  "status": "completed", "text": "...", "eventSeq": 42, "latencyMs": 812, "model": "openai/gpt-5.6-sol",
  "screenshotUsed": false, "retrieval": { "outcome": "used", "chunks": [{ "docId": "doc_1", "chunkIndex": 3, "title": "CV", "excerpt": "..." }] },
  "metadata": { "inferredIntent": "..." }
}
```
- `status`: `completed` | `cancelled` | `failed` | `empty` | `superseded`.
- `retrieval.outcome`: `used` | `no_documents` | `no_matches` | `failed`. `no_documents` means the local index is empty; `no_matches` means an index exists but search returned no chunks; `failed` means retrieval errored, is timed, and generation may continue only with a notice not to imply the documents were checked.
- v3 retrieval chunks include `filePath` and `chunkId` (`docId:chunkIndex`); v2 chunk objects remain as recorded.
- Authoritative even if chunks were missed; includes the final sequence number.

### `request_error`
Payload:
```json
{ "type": "request_error", "protocolVersion": 2, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3, "requestId": "<uuid>", "answerId": "<uuid>|null", "code": "not_owner", "message": "Another connection controls assistance." }
```

## Ownership, claim/release, and epochs

- The first successful v2 claimant becomes controller. Other connections are read-only for assistance and capture-changing commands.
- Owner disconnect cancels owned jobs, invalidates pending detection, releases control, and pauses AUTO. The session epoch is incremented on release, so the next claimant must renegotiate (`hello`) before sending commands.
- A second window claims released control explicitly; control is never transferred or armed silently.
- Reconnect re-negotiates. Retained client cards become historical records; stale events cannot mutate new jobs.
- Before `sessionEpoch` increments on transcript clear or capture start/stop, active manual and AUTO answers are definitively superseded in their original epoch; partial text and frozen evidence remain. Failed sends/broadcasts invoke the same exactly-once disconnect cleanup as normal socket close, releasing control.
- `sessionEpoch` increments on owner release, transcript clear, and capture start/stop. `audioEpoch` is new for every capture restart.
- A legacy client cannot cancel a different connection's job; it receives a scoped `not_owner` error. Legacy `run_query` is also rejected while another connection holds the lease.
- Shared `status`, `transcript_live`, `transcript_segment`, `audio_level`, `audio_sources`, `models_*`, `rag_*`, and `benchmark_*` events remain broadcast. Request chunks, completions, and errors are sent only to the owning connection.

## Acknowledgement timeout and idempotency

- The client sets a **five-second** send-acknowledgement deadline. On expiry it shows an unknown-acceptance state and reconciles by `commandId` via `get_command_status`; it does not automatically resend.
- Commands carry a `commandId`. Duplicate `commandId` returns the prior outcome without another paid call.
- Request records persist until definitive completion. A nonterminal legacy `query_state` cannot discard a request record before `query_response` arrives.

## Error codes

| Code | Meaning |
| --- | --- |
| `offline` | Socket not open; send rejected. |
| `not_ready` | Backend not ready to accept the command. |
| `incompatible_version` | `protocolVersion` unsupported or stale backend instance. |
| `not_owner` | Command requires the control lease. |
| `stale_epoch` | `sessionEpoch`/`audioEpoch` no longer current. |
| `stale_revision` | Transcript/snapshot/candidate revision no longer current. |
| `invalid_span` | Offsets out of range or mismatched identity. |
| `capacity` | Working-set limit reached. |
| `dependency` | Gateway/embedding/RAG dependency failure. |
| `empty` | No finalized text to snapshot. |
| `invalid_payload` | Schema/enum validation failure. |

## Legacy compatibility examples

Legacy `run_query` continues to work when no v2 controller holds the lease, and is serialized through the same answer slot:
```json
{ "type": "run_query", "requestId": "r-1", "presetId": "answer_question", "customInstruction": null, "selectedText": "should we ship on friday", "selectionTimeRange": null, "model": "openai/gpt-5.6-sol", "includeScreenshot": false, "screenshotDataUrl": null }
```
The server replies with the existing `query_state` / `query_chunk` / `query_response` events. Since M03 the definitive `query_response` is emitted **before** the nonterminal `query_state {running: false}`, so a client cannot discard the request record before its final text arrives. A legacy client that tries to cancel another connection's job receives a scoped `not_owner` error. Shared `status`, `transcript_live`, `transcript_segment`, `audio_level`, and `audio_sources` broadcasts remain available to all connections.

---

# Protocol v3 (partially wired — M3bis)

> **Status:** the amended contract below is implemented for negotiation/model-readiness (M3bis), backend RAG/generation/first-delta timing and retrieval evidence (M04), and client first-visible timing on Markdown-rendered answer cards (M05). Full M04/M05 acceptance matrices remain open; detector proposals and AUTO remain unwired and unadvertised. See [ADR 0014](adr/0014-protocol-v3-timing-and-model-readiness.md); the recorded v2 contract above is unchanged and still accepted.

## Version negotiation

- The server accepts `protocolVersion` **2** and **3** (`SUPPORTED_WIRE_VERSIONS`). Any other value is rejected with `incompatible_version`, and the error lists the supported versions.
- A v3 client sends `hello` with `protocolVersion: 3` and may add `supportedProtocolVersions: [3, 2]`. The server picks the highest common version and returns it in `hello_ack.protocolVersion` (plus `supportedProtocolVersions`). **Every later envelope for that connection uses the negotiated version.**
- A v2 client keeps receiving the exact v2 payloads: v3-only members (`frozenInputs.model`, `frozenInputs.screenshot`, `timing`, `modelSettings`, `answer_timing`) are omitted. A v2 payload is never reinterpreted as v3: parsing a `protocolVersion: 2` command in a v3 context is `incompatible_version`, and `contracts/v2/` is unchanged.
- Capabilities added in v3: `model_readiness` (preflight role/capability validation) and `timing` (the fields below, with honest nulls for unmeasured stages). `candidates`, `answer_records` and `full_auto` remain unadvertised.

## Client → server v3 additions

Optional members on `run_context_query` and `run_snapshot_query`:

| Field | Type | Meaning |
| --- | --- | --- |
| `reasoningEffort` | `"low"` \| `"medium"` \| `"high"` \| `null` | Requested reasoning effort. Validated against the selected model's known efforts; an unsupported or unknown effort is rejected with `unsupported_capability` (never applied silently). An unknown label is `invalid_payload`. |
| `clientPressedAtMs` | number \| `null` | The client's press instant on its own monotonic clock. Echoed back for display correlation only; the backend never computes with it. A boolean, negative, non-finite, or non-numeric value is `invalid_payload`. |

`hello` (v3) additionally accepts `supportedProtocolVersions: number[]`. An array with no version this build supports is `incompatible_version`; a malformed array is `invalid_payload`.

## Model readiness (v3)

Every accepted request freezes one role/model/capability decision. Preflight runs **before** the snapshot is consumed and before any paid call, so a rejected request keeps its target and creates no answer. The accepted snapshot is synchronously retained before asynchronous supersession can run, preventing collection during the handoff. The preflight applies to v2 and v3 requests alike (it is runtime policy, not a payload change); only the *reporting* of the decision is v3-only.

Submission-time rejections:

| Code | When |
| --- | --- |
| `unsupported_capability` | The role or the request needs a capability that is not positively known for the selected model (e.g. a screenshot on an unverified model, or a detector request on a model without verified structured output), or the requested `reasoningEffort` is not supported. |
| `unavailable_model` | The selected model is absent from the Gateway language catalog **this backend actually read**. With no catalog read, the selection is `unknown`, not unavailable. |
| `invalid_payload` | Malformed model/effort payload. |

A deprecated snapshot alias is a `selection_source: "deprecated_alias"` with `substitutedFrom` and a `notice`; the original selection is preserved. No model is ever swapped silently. Provider access failures discovered after acceptance become a scoped `failed` result — no retry and no model replacement.

### `answer_accepted` (v3)

```json
{
  "type": "answer_accepted", "protocolVersion": 3, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3,
  "commandId": "<uuid>", "requestId": "<uuid>", "answerId": "<uuid>", "snapshotId": "<uuid>", "candidateRevision": null,
  "mode": "Preset", "model": "google/gemini-3.8-flash",
  "frozenInputs": {
    "instruction": "Answer clearly and concisely.",
    "mode": "Preset", "presetId": "answer_question", "humanNoteIds": [], "includeScreenshot": false,
    "model": {
      "role": "answer", "model": "google/gemini-3.8-flash", "requestedModel": null,
      "selectionSource": "environment", "substitutedFrom": null, "notice": null,
      "reasoning": { "effort": "low", "applied": true, "supportedEfforts": ["low", "high"], "source": "role_default" },
      "capabilities": { "textInput": true, "textOutput": true, "imageInput": true, "structuredOutput": true,
                        "reasoningEfforts": ["low", "high"], "certainty": "catalog" }
    },
    "screenshot": { "requested": false, "included": false, "reason": null }
  },
  "timing": { "backend": { "clock": "server_monotonic", "acceptedMs": 0, "rag": null, "generation": null, "completedMs": null, "unavailable": ["rag", "generation", "completed"] },
              "client": { "clock": "client_monotonic", "pressedMs": 81234.5, "firstVisibleMs": null, "terminalReceivedMs": null } }
}
```

- `model.role`: `answer` | `detector`.
- `model.selectionSource`: `client` | `environment` | `default` | `deprecated_alias`.
- `capabilities.certainty`: `verified` (observed on this account — none yet) | `catalog` (public metadata checked 2026-10-23) | `unknown`.
- `capabilities.imageInput` / `structuredOutput` are `true` only when positively known; `false` means "not verified", which is why an attachment-bearing request is rejected instead of silently dropping the image.
- `reasoning.applied` is `true` only when this build actually sends the provider parameter (the verified Flash default). Another model's accepted effort is recorded with `applied: false`.
- `screenshot.requested` is what the client asked for; `included` is what the request carries; `reason: "no_image_data"` means a capture was requested but no usable image arrived.
- The whole block is frozen: a rerun re-freezes it rather than reading current preferences.

## Timing contract (v3, C08)

Two clock domains are kept strictly apart. **Never subtract a client value from a backend value.**

| Block | Unit and origin | `null` when |
| --- | --- | --- |
| `timing.backend` | milliseconds from request acceptance, `clock: "server_monotonic"`, `acceptedMs: 0` | — |
| `backend.rag` | `{startMs, endMs, durationMs, outcome}`; `outcome` is `used` \| `no_documents` \| `no_matches` \| `failed` | retrieval was not run (producer wired in M04) |
| `backend.generation` | `{startMs, firstDeltaMs, endMs, durationMs}`; `firstDeltaMs` is the first **nonempty answer-content** delta (reasoning/heartbeat/usage-only frames excluded, API-format fallback overhead included) | generation did not start, or no nonempty delta arrived (producer wired in M04) |
| `backend.completedMs` | terminal instant for this answer, including `cancelled`/`failed`/`empty` | before the terminal event |
| `backend.unavailable` | names of the stages above that this backend did not produce | — (use this instead of reading a null as zero) |
| `timing.client.pressedMs` | client monotonic, echoed from `clientPressedAtMs` | the client did not send one |
| `timing.client.firstVisibleMs` | client monotonic, set by the **rendering** layer when the card first shows nonempty text | not yet displayed (receive ≠ display) |
| `timing.client.terminalReceivedMs` | client monotonic receipt of the terminal event | before the terminal event |
| press-to-visible | derived on the client only, from `firstVisibleMs - pressedMs` | either value missing |

The server always emits `null` for `firstVisibleMs` and `terminalReceivedMs`: those are client facts (M05). Gateway TTFT, STT finalization lag, and speech-end-to-visible-answer are separate measurements and are not derivable from this block.

Ordering is enforced: `acceptedMs <= rag.startMs <= rag.endMs`, `acceptedMs <= generation.startMs <= firstDeltaMs <= generation.endMs`, `completedMs >= acceptedMs`. A cross-clock label (`client_monotonic` in a backend block or vice versa) or a first-visible value before the press instant is `invalid_payload`.

### `answer_timing` (v3)

```json
{
  "type": "answer_timing", "protocolVersion": 3, "backendInstanceId": "<uuid>", "connectionId": "<uuid>", "sessionEpoch": 3,
  "requestId": "<uuid>", "answerId": "<uuid>", "snapshotId": "<uuid>", "candidateRevision": null,
  "timingSeq": 1,
  "timing": { "backend": { "clock": "server_monotonic", "acceptedMs": 0, "rag": null, "generation": null, "completedMs": null, "unavailable": ["rag", "generation", "completed"] }, "client": null }
}
```

- `timingSeq` is monotonic per answer and **independent of `eventSeq`**, so a timing update never displaces or duplicates answer content. A receiver keeps only the newest `timingSeq` per request.
- Scoped like content: owner/connection, `requestId`, `answerId`, `snapshotId`, `sessionEpoch`, backend instance. It follows the same stale-event rules.
- A timing update **cannot revive a terminal record** or clear a newer job. The final object travels in `answer_finished.timing`.
- M04 emits scoped timing snapshots after retrieval, at the first nonempty answer delta, after the Gateway attempt, and at terminal completion. Each uses `timingSeq`, independently of content `eventSeq`; when generation never starts its timing remains null and is listed in `unavailable`.

### `answer_finished` (v3 additions)

```json
{
  "type": "answer_finished", "protocolVersion": 3, "sessionEpoch": 3, "requestId": "<uuid>", "answerId": "<uuid>",
  "status": "completed", "text": "Roll back first.", "eventSeq": 42, "latencyMs": 812,
  "modelSettings": { "role": "answer", "model": "google/gemini-3.8-flash", "...": "as in answer_accepted.frozenInputs.model" },
  "timing": { "backend": { "clock": "server_monotonic", "acceptedMs": 0, "rag": { "startMs": 0.4, "endMs": 28.6, "durationMs": 28.2, "outcome": "used" },
                            "generation": { "startMs": 29.1, "firstDeltaMs": 380.4, "endMs": 1203.1, "durationMs": 1174 },
                            "completedMs": 1210.9, "unavailable": [] },
              "client": null }
}
```

- `timing` here is authoritative even if timing events were missed (same rule as `text` vs chunks).
- Retrieval evidence contains only real chunks; v3 adds `filePath` and stable `chunkId` (`docId:chunkIndex`). Retrieved excerpts are untrusted data, not instructions; retrieval failure is stated rather than described as a document check.
- If final streamed text cites a bracketed local chunk ID that is absent from that request's retrieved evidence, the request ends `failed`; any already delivered text remains visible and is retained as partial output.
- Included human notes are frozen with the accepted request and passed separately from document evidence. Their text is user-provided context and cannot satisfy or fabricate a RAG citation.
- `latencyMs` is retained for the benchmark/legacy path and is **not** a substitute for `timing.generation`.

## Error codes added in v3

| Code | Meaning |
| --- | --- |
| `unsupported_capability` | Known-incompatible or unconfirmed capability for the requested role/attachment/reasoning effort. |
| `unavailable_model` | Selected model absent from a Gateway catalog this backend actually read. |

## Contract fixtures

| Path | Contents |
| --- | --- |
| `contracts/v2/` | The recorded v2 contract. Unchanged; parsed identically by both harnesses. |
| `contracts/v3/` | v3 commands (negotiated hello, reasoning effort, press instant), `answer_accepted`, `answer_timing`, `answer_finished`, and their invalid counterparts (bad effort, negative press instant, unsupported version offer, v2 payload in a v3 context, wrong clock label, broken ordering, zero `timingSeq`, missing model settings). |

Both `backend/tests/test_cockpit_contracts.py` and `frontend/src/cockpit/__tests__/protocol.test.ts` read both directories, so a disagreement between the Python and TypeScript parsers fails the suite.


## Protocol v4: manual targets and frozen reruns

See [ADR 0016](adr/0016-manual-targets-and-frozen-reruns.md). A v4 client offers `[4,3,2]`; the current v5 offer is documented below. v2/v3 contracts remain accepted. v4 advertises `answer_records`, `manual_targets`, `answer_rerun`, and `answer_state`.

- `run_snapshot_query.manualTarget`: optional `{targetId, sourceSnapshotId, wording}`; IDs are nonempty strings, source must match `snapshotId`, wording is nonempty and at most 24,000 characters. Human wording remains separate from immutable raw evidence.
- `rerun_answer`: normal command envelope plus `sourceAnswerId`. Requires an owned, terminal, retained answer. Creates new request/answer identities using original instruction/model/reasoning, copied notes, screenshot and original retrieval result. It performs no fresh retrieval.
- `snapshot_action`: envelope plus `snapshotId`, `action:"release"`. Releases this owner's draft reference and unattached pin, never another answer's reference.
- v4 `create_snapshot` retains an owner draft reference until release, acceptance or disconnect. Pin creates no generation job.
- `answer_state`: scoped envelope plus `requestId`, `answerId`, independent positive `stateSeq`, `placement:"working"|"kept"`, `removed`, `snapshotAvailable`, and `reason`. Sent after placement/removal/eviction changes; terminal content is unaffected.
- `command_status.result`: recorded result event payloads for reconciliation. These replay state/acceptance only and never execute a command twice.
- Frozen input metadata adds `manualTarget`, note text copies with SHA-256 `contentHash`, and original evidence. Image bytes remain server-side. Terminal `metadata.usage` contains reported input/output/total tokens or null; absent inference metadata is explicitly unavailable.

Working answers are bounded at 50. Only terminal, unkept, unselected, uninspected cards may be evicted, oldest first; eviction emits `answer_state`. Kept answers/notes and unattached moments retain their existing 50-item bounds. If every eligible slot is protected, creation fails with `capacity`.

### M04/M05 runtime boundaries

v4 exact rerun uses retained server evidence and copied notes/screenshot/model/reasoning; it never silently re-reads mutable evidence. Empty indexes return `no_documents` without embedding. State updates have an independent `stateSeq`; replayed status results recover state/acceptance/terminal without executing generation again. On owner disconnect the old cards are historical/read-only, with no ownership transfer or automatic paid replay. Missing usage/timing remains unavailable. Markdown rendering is a client presentation boundary, not a payload/schema change; links open externally and remote image URLs do not fetch in the answer renderer.

## M06 audio source and monitoring semantics

No new message type, required field, protocol version or persistence migration. Existing `status.details` accepts object/string/null; these state values identify monitoring/refresh failures:

```json
{"type":"status","state":"audio_meter_unavailable","details":{"streamKind":"mic","sourceName":"Device name","message":"Input monitor stream ended"}}
```

`status {state:"audio_sources_error", details:"Source refresh failed: ..."}` leaves last acknowledged choices intact. `audio_sources` remains authoritative for selected/fallback sources. The client restores saved choices once per owned connection, then adopts acknowledgements without resending on discovery. Changed active mode/device invalidates source work/restarts running transcription; inactive source configuration and no-op selections do not. Source mutation/Start/Stop/clear respect the controller lease.

`audio_level` monitoring continues after transcription Stop and ends at backend shutdown. Its `t` stays a backend timestamp; client freshness uses monotonic receive time. UI stale threshold is 2s, clipping peak ≥0.98 held 500ms, quiet RMS <0.001 and peak <0.005. Missing peak is unavailable; missing devices/failing monitors are not quiet signal. Source mismatches/old-device failures never describe the newly selected input. No signal state implies speech recognition or voice activity detection. See ADR 0017.

## Protocol v5: question proposals and correction

Protocol v5 extends v4. `hello` offers `[5,4,3,2]`; `hello_ack`/`control_state` advertise `candidates` only for v5. Existing v2–v4 manual commands remain usable; `full_auto` is not advertised by M07. Every v5 command/event retains backend/socket identity and session epoch. Commands use the existing command ID, acknowledgement, duplicate suppression and `get_command_status` reconciliation. Candidate/detector replies go only to the controller.

### Detector control and scheduling

```json
{"type":"set_detection","protocolVersion":5,"backendInstanceId":"backend-id","sessionEpoch":1,"commandId":"cmd-id","enabled":true,"retry":false}
```

Detection defaults enabled after a v5 controller claim, never before negotiation. Only finalized source changes schedule it; partial text, meters, Sound opening, inbox editing and answer chunks make no detector call. Disable cancels the current call. Stop/source invalidation cancels old work and clears candidate session references; owner loss additionally disables detection. New source finals can schedule again. Explicit retry is needed for an unchanged failed revision; a new finalized revision can schedule one fresh attempt. No automatic paid retry or model substitution.

Defaults: lookback 90 seconds from the latest final in the current audio epoch; 12,000 text characters, keeping the newest suffix with original Unicode code point offsets; debounce 1 second (`DETECTOR_DEBOUNCE`, clamped 0.8–1.2); at least 2 seconds between starts; one in-flight call plus latest dirty revision; at most 8 proposals, 1,500 output tokens, 15 seconds and 64,000 response bytes. A visible truncation flag distinguishes bounded input. `DETECTOR_MODEL` defaults to `google/gemini-3.5-flash-lite`; catalog/capability readiness and reasoning provenance are reported independently of account access/semantic quality.

`detector_state` adds the normal event envelope and:

```json
{"type":"detector_state","stateSeq":7,"commandId":null,"enabled":true,"inFlight":false,"dirty":false,"lastError":null,"outcome":"no_candidates","truncated":false,"lastRevision":12,"model":null}
```

`model` is the existing frozen role `ModelSettings` object when resolved; null when not resolved. `outcome` is `disabled`, `no_source`, `running`, `proposals`, `no_candidates`, `failed` or `superseded` (the frontend also uses `disconnected` locally). `lastError` is nullable; successful empty output is not an error. `stateSeq` is positive and monotonic within the backend's question service; frontend sequence checks are separate for candidate/detector streams and reset at a new backend/socket/session identity.

### Candidate mutations

All operations use this shape; `sourceAnswerId` is required only for `correct`:

```json
{
  "type":"candidate_action","protocolVersion":5,
  "backendInstanceId":"backend-id","sessionEpoch":1,"commandId":"cmd-id",
  "action":"edit",
  "parents":[{"candidateId":"candidate-id","expectedRevision":1}],
  "drafts":[{"wording":"Explain the rollback risks.","sourceSpans":[
    {"segmentKey":"audio-id#1","audioEpoch":"audio-id","revision":3,
     "start":0,"end":25,"t0":1,"t1":2,"sourceKind":"system","sourceName":null}
  ]}]
}
```

| Action | Parents | Drafts | Result |
| --- | --- | --- | --- |
| `create` | 0 | 1 | New human target from validated raw evidence |
| `edit` | 1 | 1 | Same identity, new immutable revision |
| `split` | 1 | 2–8 | New children; parent superseded |
| `merge` | 2–8 distinct | 1 | New combined candidate; parents superseded |
| `dismiss` | 1 | 0 | New dismissed revision; exact source suppressed |
| `undo` | 1 dismissed | 0 | New revision restoring the previous nondismissed state |
| `correct` | 0–1 | 1 | Link to an owned available `sourceAnswerId`; preserve complete original source and old card |

Wording is 1–2,000 characters after trimming; each draft has 1–64 full source spans. Parent revisions must match current authoritative revisions. Source ranges use original `[start,end)` code points. Edits/splits/merges stay within parent evidence. Split drafts can share the parent's whole excerpt because word timing is unavailable. Undo restores dismissals; split/merge lineage remains inspectable rather than rolling back children silently.

Human mutations invalidate in-flight detector interpretation. Detector candidates must cite actual frozen IDs/revisions/ranges; fabricated, partial, malformed, excessive, stale-epoch or stale-human-generation output is rejected. Exact span/audio epoch/revision fingerprints suppress repeat proposals, including dismissed/superseded interpretations; different overlapping spans and genuinely later source identities are independent. These checks prove provenance, not that the wording is correct.

`candidate_state` is an authoritative bounded list:

```json
{"type":"candidate_state","stateSeq":8,"commandId":"cmd-id","changedCandidateIds":["candidate-id"],"revisionCount":2,"candidates":[]}
```

Every listed candidate has `candidateId`, positive `candidateRevision`, `state`, `wording`, nullable `reason`, `origin` (`detector`/`human`), full `sourceSpans`, the full immutable `snapshot`, `supersedes` (`candidateId:revision` lineage strings), and nullable `sourceAnswerId`. Workflow states remain `proposed`, `incomplete`, `needs_review`, `user_set`, `queued`, `answered`, `dismissed`, `superseded`; `queued` is reserved for M08. Incomplete/review proposals require concrete reasons. A completed candidate answer can add an `answered` revision; a failed/empty/cancelled attempt remains an answer outcome rather than being called answered.

The 200-revision limit covers history as well as current records. Mutations reject atomically at capacity; protected material is not silently discarded. Manual context/selection answers remain available. Clear/source invalidation releases candidate history leases; existing answer cards retain their own snapshots. Candidate content/history is ephemeral and introduces no persistence migration.

Receipts cache mutation identities rather than repeated copies of candidate snapshots. `get_command_status.result` reconstructs fresh sequenced `candidate_state`/`detector_state` events from the authoritative store. The frontend reconciles the result without resending a mutation or generation, and preserves edits made while an earlier operation was pending.

### Answer selection and Wrong question

A v5 `run_snapshot_query` can include `candidateId`/`candidateRevision` plus the existing `manualTarget` and exact candidate `snapshotId`. The server validates current revision, source and wording before accepting; `manualTarget.wordingOrigin` is set by the server to `detector` or `human`. Model interpretation selected by a user is labelled separately from human-authored wording. Candidate lineage is frozen on the answer record and echoed on acceptance/terminal metadata; later inbox changes cannot rewrite the card.

Wrong question submits `candidate_action: correct`. It preserves original text/evidence, marks the answer's interpretation through `answer_state.correctedBy`, creates a linked human target and then explicitly submits a new draft using the current profile/model. The new acceptance/terminal metadata includes `correctsAnswerId`. A running original answer is stopped with retained partial text. An older card can be corrected without replacing newer human inbox wording; the executed historical interpretation remains linked. No screenshot is captured by detection or correction. Optional future-context notes continue using the existing human-note inclusion contract.

Failure codes reuse `invalid_payload`, `invalid_span`, `stale_revision`, `stale_epoch`, `not_owner`, `incompatible_version`, `capacity`, `dependency`, `unavailable_model` and `unsupported_capability`. A detector failure never blocks a direct recent-context, selection or manual-target answer.

Shared fixtures: [contracts/v5](../contracts/v5/index.json). Decision/evidence: [ADR 0018](adr/0018-bounded-question-proposals-and-gateway-routing.md), [M07 acceptance](notes/2026-10-26-m07-acceptance.md).

## Protocol v6: owned FULL AUTO

M08 contract, implemented and verified with synthetic dependencies. Negotiate `[6,5,4,3,2]`; advertise `full_auto` only for v6. Preserve older manual formats. All new commands use existing owner/epoch/command IDs, acknowledgements and reconciliation without command replay.

- `configure_auto`: `expectedConfigRevision` (initial 0), plus `settings` containing the existing query inputs: `mode`, `presetId`, `customInstruction`, `model`, nullable `reasoningEffort`, `humanNoteIds`, `includeScreenshot` and nullable `screenshotDataUrl`. Server validates and owns these settings; returns an incremented `configRevision`. Subsequent job acceptance freezes actual note contents/settings. Configuration updates never change an accepted request. Empty Custom/incompatible model/image settings reject visibly. No automatic screenshot capture.
- `set_auto`: `armed: boolean`, `mode: "full_auto"`, `expectedConfigRevision`. Arm requires an owner with v6 capability, active listening, enabled detection, current source epoch and accepted configuration. Pause is always available to the current controller. Arming offers only newly published eligible detector proposals; existing inbox entries require manual action.
- `interaction_state`: v6 adds `holdReasons: string[]`, with values `raw_selection`, `target`, `question_editor`, `profile_editor`, `note_editor`, `settings`, `configuration_pending`. Holds cover targeting and AUTO publication independently of capture/manual answers. Opening Sound is not a hold.
- `assistance_state`: event envelope, positive `stateSeq`, nullable `commandId`, `autoArmed`, `pauseReason`, nullable `lastError`, `listening`, `detectionEnabled`, `holdReasons`, `configRevision`, `configurationReady`, nullable `activeAnswerId`, nullable `pendingCandidate` (`candidateId`, `candidateRevision`), nullable `deferredAnswerId`, and `generationBusy`. Replies are controller-scoped. Config/arm receipts reconstruct current authoritative state on reconciliation.
- v6 candidates include nullable `reviewReasons` (enum array: `incomplete`, `ambiguous`, `conflicting`, `negated`, `unsupported`) and separate `autoStatus` (`pending`, `active`, `deferred`, `attempted` or null). Only an explicitly empty review array, detector origin and proposed/current finalized source are eligible; missing classification cannot start AUTO. Queued display does not overwrite immutable interpretation revisions. Every answer remains unreviewed.
- v6 answer acceptance/state/terminal metadata identifies `origin: "manual"|"auto"`, nullable `configRevision`, `generationStatus` and `publicationStatus` (`live`, `deferred`, `published`, `superseded`). The generation can finish while publication remains deferred. Existing displayed text remains; remaining AUTO chunks/errors/terminal publication wait during a hold. Release revalidates source/candidate identities, then publishes retained output or supersedes the stale result. Manual sends and explicit Stop can supersede/discard deferred publication without waiting for a hold to end. No invented client press time is reported for AUTO.

One active answer plus one newest pending eligible candidate is enforced by the backend. Replacing pending execution retains the earlier question in the inbox. A deferred result must be resolved before another AUTO answer starts. Attempted identities/revisions never automatically retry; failures pause AUTO visibly. Manual requests take priority through matching cancellation and preserve old partial/source/card state. Pause clears pending while the current answer can finish. Stop listening, source/epoch changes, clear, owner loss/restart disarm and invalidate stale work; reconnect/control claim never re-arm. Candidate mutation invalidates old pending/active automatic interpretation. Existing retained cards and frozen evidence remain available.

Shared v6 fixtures: [contracts/v6](../contracts/v6/index.json). Decisions and verification: [ADR 0019](adr/0019-owned-full-auto-scheduling.md), [M08 acceptance](notes/2026-10-26-m08-acceptance.md). Generation status records the computation outcome even when a completed result is later superseded during deferred publication. Authoritative v6 listening state also reconciles the header/Sound controls after reconnect.
