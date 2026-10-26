# ADR 0018: Bounded question proposals and Gateway routing

## Status
Accepted for M07's synthetic acceptance scope. Real detector access/quality remains M10.

## Context
M07 adds fallible interpretations of finalized local transcript text without delaying manual answers or rewriting evidence. Protocol v4 has candidate placeholders but cannot represent split/merge/correction or recovery. The cloud client already routes through Gateway, but its arbitrary base URL could bypass that policy.

## Decision
- Negotiate protocol v5 and advertise `candidates` only to v5 clients. Preserve v2–v4 manual contracts and the legacy manual adapter. AUTO stays unadvertised until M08.
- Run one cancellable detector task over frozen finalized records, independent of AnswerService. Default `google/gemini-3.5-flash-lite`; public Gateway catalog checked 26 October 2026 for text, structured output and low/high reasoning. Apply low reasoning to this detector role; preserve answer-role reasoning behavior and explicit model choices.
- Use 90-second lookback, latest 12,000 text characters with original code point offsets and a truncation notice, 1-second debounce (configured within 0.8–1.2), 2 seconds between call starts, 8 proposals, 1,500 output tokens, 15-second timeout and a 64,000-byte response cap. One active call plus one latest dirty revision; failed unchanged revisions require explicit retry. No partial/meter-driven calls, outer retry or model substitution.
- Parse completed structured output only. Validate source identities, revisions, original offsets and review reasons. Treat transcript text as untrusted evidence. Provenance checks never establish semantic correctness or identify speakers.
- Keep immutable candidate revision history, capped at 200 revisions without silent eviction. Reject additions at capacity; manual recent-context/selection answering remains available. Clear/source invalidation releases candidate references; cards retain their own source leases. Exact span/audio epoch/revision fingerprints suppress re-proposals; overlapping spans and later identities remain independent.
- `candidate_action` provides create/edit/split/merge/dismiss/undo/correct with expected revisions, parent identities and child drafts. Undo restores a dismissed interpretation; split/merge preserve superseded parents. Human mutation invalidates in-flight detector interpretation. State receipts reconcile against the authoritative bounded store rather than retaining repeated copies of every snapshot.
- Wrong question retains the original source and answer, creates a linked human interpretation and explicitly submits a corrected draft. Correcting an older card preserves newer human inbox wording. Optional future context uses the existing explicitly included human-note workflow.
- Read Gateway/detector/embedding model settings at Settings construction, after AppController loads local dotenv files, so explicit local configuration is honored and an invalid configured endpoint is rejected.
- Enforce the HTTPS Gateway origin/path before constructing the shared HTTP client; redirects are not followed. Responses, Chat, embeddings, catalog, benchmarks and detector use this client. Preserve Gateway `openai/...` model slugs and model-name compatibility. Remove obsolete compiled direct-provider client files. The operator removed the unused private OpenAI environment entries; credentials were not displayed or edited by the agent.

## Alternatives considered
- Gate all answers on detector JSON: delays direct assistance and makes detector failure a primary-path failure.
- Regex-only detection or confidence percentages: cannot satisfy messy-speech interpretation and imply unjustified certainty.
- Overwrite candidates or discard history at capacity: loses correction lineage or protected evidence.
- Migrate to another AI SDK: adds dependencies without improving this existing pooled Python HTTP integration.

## Consequences
Question proposals can be incorrect or absent. The UI distinguishes disabled, waiting, running, empty and failed detection, offers explicit retry and always retains manual recovery. Candidate content is session-only; no new database or armed AUTO preference is introduced. Restart the backend after configuration/code updates. See [M07 evidence](../notes/2026-10-26-m07-acceptance.md) and [API v5](../API.md#protocol-v5-question-proposals-and-correction).

Current references: [Gateway structured outputs](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/structured-outputs), [Gateway reasoning](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/reasoning), [public catalog](https://ai-gateway.vercel.sh/v1/models). Catalog facts are not live semantic/access acceptance.
