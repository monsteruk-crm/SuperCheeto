# Docs Index

## Current status
- [PR #1 review remediation](notes/2026-10-26-pr1-review-remediation.md): disconnects, manual cancellation, repeated speech, reconciliation and runtime data cleanup.
- Standalone TypeScript baseline resolved; current checks and publication follow-up are in [STATUS](STATUS.md) and the [progress ledger](plans/live-helper-cockpit-progress.md).
- [M08 FULL AUTO acceptance](notes/2026-10-26-m08-acceptance.md): owned scheduling, holds, deferred publication and synthetic races.
- [M07 acceptance and Gateway routing audit](notes/2026-10-26-m07-acceptance.md).
- [M06 acceptance evidence](notes/2026-10-26-m06-acceptance.md): Sound, isolated meters/source reconciliation and Settings parity.
- [M04/M05 completion evidence](notes/2026-10-25-m04-m05-acceptance.md): task gates, mock/live boundaries and verification.
- [Status snapshot](STATUS.md)

## Architecture
- [Architecture overview](ARCHITECTURE.md)

## API / WebSocket protocol
- [WebSocket and payload contracts](API.md)

## ADR index
- [ADR 0020: review lifecycle cleanup and local runtime data](adr/0020-review-lifecycle-and-local-data-safety.md).
- [ADR 0019: owned FULL AUTO scheduling](adr/0019-owned-full-auto-scheduling.md) — accepted M08.
- [ADR 0018: bounded question proposals and Gateway routing](adr/0018-bounded-question-proposals-and-gateway-routing.md).
- [ADR index](adr/INDEX.md) - includes audio discovery, accepted M03 protocol v2 transport (ADR 0012), [transcript-text model/streaming (ADR 0013)](adr/0013-stream-transcript-text-answers.md), [protocol v3 timing/model-readiness (ADR 0014)](adr/0014-protocol-v3-timing-and-model-readiness.md), and [safe Markdown rendering (ADR 0015)](adr/0015-safe-markdown-answer-rendering.md)

- [Manual targets and frozen reruns (ADR 0016)](adr/0016-manual-targets-and-frozen-reruns.md)

## Shared protocol contracts
- [contracts/v6/](../contracts/v6/index.json) — AUTO configuration, holds and scheduler state.
- [contracts/v5/](../contracts/v5/index.json) — question mutations, detector state and correction.
- [contracts/v2/](../contracts/v2/index.json) - recorded protocol v2 fixtures parsed by both the backend and frontend harnesses (see [API.md](API.md) "Protocol v2")
- [contracts/v3/](../contracts/v3/index.json) - protocol v3 fixtures for model readiness and timing (see [API.md](API.md) "Protocol v3")

- [contracts/v4/](../contracts/v4/index.json) — manual targets, frozen reruns, snapshot leases and retained answer state.

## Data / persistence
- [DB index](db/INDEX.md)

## Release notes
- [Changelog](CHANGELOG.md)

## Canonical scope prompt
- [Bootstrap prompt](prompts/bootstrap.md)

## Proposed UX designs
- [Live Helper four-column workbench design index](design/INDEX.md) — interactive prototype, Sound overlay, source mapping and feature-preserving implementation prompt; application behavior is unchanged.

## Execution plans
- [Execution plan index](plans/INDEX.md)
- [Live Helper cockpit milestone plan](plans/live-helper-cockpit-execution-plan.md), revision 3. M00–M03/RT01/M3bis are complete for their recorded scopes; M04–M08 are complete within their recorded gates; next is M09-T01.
- [Live Helper cockpit progress and clean-context handoff](plans/live-helper-cockpit-progress.md). Keep this second Markdown current during execution.

- [ADR 0017: Sound monitoring and source reconciliation](adr/0017-sound-monitoring-and-source-reconciliation.md)
