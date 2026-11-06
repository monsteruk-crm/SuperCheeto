# ADR 0017: Sound monitoring and source reconciliation

## Status
Accepted for M06

## Context
Audio levels currently update App state and backend meters stop with transcription. Discovery responses can trigger client source commands repeatedly. Sound must preserve the manual workbench and existing Settings/data workflows.

## Decision
Use an isolated client telemetry store with source-specific subscriptions and browser monotonic receive freshness (two seconds). Retain backend sample timestamps only as diagnostics. Quiet requires RMS below 0.001 and peak below 0.005; peak at least 0.98 holds clipping for 500ms. Missing devices/failures are unavailable; socket loss is disconnected.

Monitor both configured inputs independently of transcription; shutdown closes monitoring. Backend source acknowledgements/fallbacks are authoritative after one saved-preference restoration per connection/control claim. Inactive device changes update preference/monitoring only. Actual active mode/device changes invalidate the source session and restart transcription only if running; no-op selections do neither. Preserve answer cards and their original provenance. Sound open/close performs no capture mutation.

Use existing audio/status/error envelopes: source-specific meter failures use `status {state:"audio_meter_unavailable",details:{streamKind,sourceName,message}}`; refresh failures use `audio_sources_error`. These are values within the existing open status contract, not new wire message types or changed required fields. Protocol versions remain unchanged. Legacy errors remain visible.

## Alternatives considered
- Root state for every level: unnecessary transcript/answer rerenders.
- Coupled meter/transcription lifetime: no diagnostics before Start or after Stop.
- Reapply preferences after every discovery: overrides fallback and can restart capture repeatedly.

## Consequences
Sound owns focus while open; background request/capture shortcuts are blocked. The selected-input meter remains in the header. Real hardware/native acceptance remains separately identified; tests inject capture and Gateway. Existing storage keys and RAG database schema remain unchanged.
