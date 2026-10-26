# Execution Plan: Port Cloud AI Calls to Vercel AI Gateway

## Mission

Port this repository's cloud AI traffic from direct OpenAI HTTP calls to Vercel AI Gateway while preserving the existing application behavior.

The intended runtime configuration already exists locally:

- `AI_GATEWAY_API_KEY` for local authentication
- `VERCEL_MODEL=openai/gpt-5.6-sol` for the default language model

Do not print, copy, commit, or otherwise expose the value of `AI_GATEWAY_API_KEY`.

## Hard boundary: local speech-to-text stays local

Do not change any of the following:

- `backend/app/audio_capture.py`
- `backend/app/stt.py`
- faster-whisper configuration or dependencies
- PulseAudio/PipeWire capture and PCM flow
- STT language, VAD, silence-gate, window, interval, device, or compute settings
- transcript generation or WebSocket transcript/audio messages

Audio must continue to be captured locally and transcribed locally with faster-whisper. No audio, PCM, or STT request may be sent to Vercel, OpenAI, or any other remote service. Only the existing text/image query payloads and RAG text embedding inputs are in migration scope.

Before and after the change, confirm that `git diff -- backend/app/audio_capture.py backend/app/stt.py backend/requirements.txt` is empty. `backend/requirements.txt` should remain unchanged because the current `httpx` client is sufficient.

## Verified starting point

- The worktree was clean when this plan was written.
- `backend/app/openai_client.py` uses `httpx.AsyncClient` with `https://api.openai.com/v1` and calls `/responses`, `/chat/completions`, `/models`, and `/embeddings`.
- `backend/app/main.py` directly reads `OPENAI_API_KEY` in two paths and stores an `OpenAIClient`.
- `backend/app/settings.py` defaults to `OPENAI_MODEL=gpt-4o`.
- The frontend expects model IDs as strings and persists the selected value.
- Existing unit tests do not cover the cloud AI client.
- Vercel's current Python/OpenAI-compatible API uses `https://ai-gateway.vercel.sh/v1`, bearer authentication, and `creator/model` IDs.
- The public Gateway model catalog currently reports `openai/gpt-5.6-sol` as a language model and `openai/text-embedding-3-small` as an embedding model.

Official references to re-check immediately before implementation:

- https://vercel.com/docs/ai-gateway/sdks-and-apis/python
- https://vercel.com/docs/ai-gateway/openai-compat/rest-api
- https://vercel.com/docs/ai-gateway/models-and-providers
- https://vercel.com/docs/ai-gateway/authentication-and-byok

## Architectural decision

Keep the existing asynchronous `httpx` implementation and use Vercel's OpenAI-compatible REST surface. Do not add the OpenAI Python SDK or a JavaScript/TypeScript AI SDK to the backend.

This is the smallest safe port: it preserves the current Responses SSE parser, Chat Completions compatibility fallback, image inputs, cancellation behavior, token telemetry, and embedding vector parsing. Both the primary Responses request and the compatibility fallback must point to AI Gateway. Nothing may fall back to `api.openai.com`.

Document this decision in ADR 0010 because it changes the cloud inference boundary and authentication/model-ID contract.

## Implementation order

### 1. Add focused tests first

Create `backend/tests/test_ai_gateway_client.py` using `unittest` and `httpx.MockTransport`. Tests must not use a real key or make network calls.

To make the client testable, allow an optional `httpx.AsyncBaseTransport` in its constructor and pass it to `httpx.AsyncClient` only when supplied.

Cover these cases:

1. A bare historical OpenAI model such as `gpt-5.1` normalizes to `openai/gpt-5.1`.
2. `gpt-5.2-chat-latest` normalizes to `openai/gpt-5.6-sol`.
3. A valid Gateway slug such as `anthropic/claude-sonnet-4.6` is unchanged.
4. A non-streaming query posts to `https://ai-gateway.vercel.sh/v1/responses`, uses bearer auth, and sends the configured `creator/model` slug.
5. A streaming Responses fixture yields `response.output_text.delta`, produces final text, and records TTFT/usage.
6. A Responses 404 retries `/chat/completions` on the same Gateway host, never on `api.openai.com`.
7. Model discovery ignores non-language rows (`embedding`, `image`, `video`) and returns only language model IDs.
8. Model details also contain only language rows while preserving the existing frontend fields: `id`, `object`, `created`, and `owned_by`.
9. Embeddings post to the Gateway `/embeddings` endpoint with `openai/text-embedding-3-small` and preserve returned vector order.
10. HTTP error formatting includes the status and a short provider message but never includes the bearer token.

Also add or extend `backend/tests/test_model_pricing.py` to cover the `openai/gpt-5.6-sol` slug and the renamed pricing override variable described below.

Run the tests once before implementation and record the expected failures. Do not weaken assertions to make the implementation pass.

### 2. Replace the provider client without rewriting proven parsers

Create `backend/app/ai_gateway_client.py` from the relevant contents of `backend/app/openai_client.py`, then update it as follows:

- Rename `OpenAIClient` to `AIGatewayClient`.
- Set the default base URL to `https://ai-gateway.vercel.sh/v1`.
- Accept a configurable `base_url` constructor argument; normalize it with `rstrip('/')`.
- Keep bearer authentication through the existing `Authorization` header.
- Keep the existing `/responses`, `/chat/completions`, `/models`, and `/embeddings` paths.
- Keep the current Responses-first behavior and Chat Completions-on-404 fallback. The fallback is compatibility within Gateway, not a direct-provider fallback.
- Keep `_build_responses_payload`, `_build_chat_completions_payload`, streaming event parsing, screenshot handling, output extraction, usage extraction, preset prompts, and cancellation behavior functionally unchanged except for names and model normalization.
- Rename provider-specific helpers where useful, for example `normalize_gateway_model_id` and `filter_supported_language_models`.
- Do not add routing, model fallbacks, tags, caching, or provider options in this iteration.

Model normalization rules must be deterministic:

1. Trim whitespace.
2. Apply the current deprecated snapshot replacements.
3. If the result already contains `/`, leave it unchanged.
4. Otherwise prefix it with `openai/` so old persisted frontend selections and old bare model IDs remain usable.

Update deprecated aliases so their final results are Gateway slugs. In particular, the existing `gpt-5.2-chat-latest` and `gpt-5.3-chat-latest` compatibility paths must resolve to `openai/gpt-5.6-sol`.

For `/models`, parse the public Gateway response and keep only rows where `type == "language"`. Do not feed embedding/image/video models into the query selector or benchmark checklist. If a fixture or older response lacks `type`, ignore that row unless its ID exactly equals the configured default; `backend/app/main.py` already inserts the configured default when discovery omits it.

For embeddings, default to `openai/text-embedding-3-small`. The vectors remain stored locally in SQLite; only text chunks are sent for embedding, exactly as before.

Once imports and tests use the new module, delete `backend/app/openai_client.py`. Do not leave a second direct-provider client behind.

### 3. Make Gateway settings canonical

Edit `backend/app/settings.py`:

- Replace `openai_model` with `ai_gateway_model`, sourced from `VERCEL_MODEL`, defaulting to `openai/gpt-5.6-sol`.
- Replace `openai_timeout_seconds` with `ai_gateway_timeout_seconds`, sourced from `AI_GATEWAY_TIMEOUT`, default `30`.
- Add `ai_gateway_base_url`, sourced from `AI_GATEWAY_BASE_URL`, default `https://ai-gateway.vercel.sh/v1`.
- Change `rag_embedding_model` default to `openai/text-embedding-3-small`.
- Do not add any STT-related setting and do not rename any existing STT setting.

Do not fall back to `OPENAI_MODEL` or a direct OpenAI base URL. This avoids a partially migrated runtime that silently uses the old provider path.

Edit `backend/.env.example` so the cloud section becomes:

```dotenv
AI_GATEWAY_API_KEY=your-gateway-key-here
VERCEL_MODEL=openai/gpt-5.6-sol
# AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
# AI_GATEWAY_TIMEOUT=30
```

Set the documented RAG default to:

```dotenv
# RAG_EMBEDDING_MODEL=openai/text-embedding-3-small
```

Do not edit or commit `backend/.env.local`. It already contains the intended Gateway variables. Never include its values in logs, patches, tests, or documentation.

### 4. Route every cloud call through one Gateway client

Edit `backend/app/main.py`:

- Import `AIGatewayClient` and the renamed helpers from `ai_gateway_client.py`.
- Rename `_openai_client` to `_ai_gateway_client`.
- Rename `_ensure_openai_client` to `_ensure_ai_gateway_client`.
- Read authentication in this order: `AI_GATEWAY_API_KEY`, then `VERCEL_OIDC_TOKEN` as the deployment-compatible fallback documented by Vercel.
- Do not read `OPENAI_API_KEY` anywhere in runtime code.
- Construct the client with `settings.ai_gateway_model`, `settings.ai_gateway_base_url`, and `settings.ai_gateway_timeout_seconds`.
- Make query, model list, model detail, embedding, and benchmark paths all call `_ensure_ai_gateway_client()`. Remove the duplicated benchmark-only client construction at the current `run_benchmark` key check.
- Rename log/error text from `OpenAI request failed` to `AI Gateway request failed`.
- Missing-auth UI errors should say: `AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required.`
- Keep errors visible through the existing WebSocket `error` message and logger. For HTTP failures, include status code and a bounded response message (for example, first 500 characters); do not log request headers, authorization tokens, full prompts, screenshot data URLs, or document contents.
- Preserve query streaming events, response payloads, request IDs, cancellation, RAG injection, benchmark loops, and score calculations.

Expected runtime references after this step:

- No `api.openai.com` under `backend/app`.
- No `OPENAI_API_KEY`, `OPENAI_MODEL`, `OpenAIClient`, `_openai_client`, or `_ensure_openai_client` under `backend/app`.
- All four remote endpoint families use the configured Gateway base URL.

### 5. Preserve benchmark cost reporting for Gateway slugs

Edit `backend/app/model_pricing.py` narrowly; do not redesign the benchmark subsystem.

- Rename the canonical override variable to `AI_GATEWAY_MODEL_PRICING_JSON`.
- Store pricing keys in `creator/model` form.
- Ensure lookup supports both current Gateway slugs and old bare OpenAI IDs by treating a bare ID as `openai/<id>`.
- Add the current base-tier catalog entry for `openai/gpt-5.6-sol`: input `$5.00` per million tokens and output `$30.00` per million tokens. Add a dated source comment pointing to the Gateway model catalog. Re-check the live catalog before committing because pricing can change.
- Keep the estimator's existing return type and benchmark call sites unchanged.
- Document that the static estimator uses base-tier pricing and may require `AI_GATEWAY_MODEL_PRICING_JSON` for tiered or newly added models.

Do not attempt to derive billed cost from undocumented response fields.

### 6. Make user-visible labels provider-accurate

No frontend behavior or protocol schema needs to change, but remove inaccurate direct-OpenAI labels:

- Rename the TypeScript type `OpenAIModelInfo` to `GatewayModelInfo` in `frontend/src/types.ts` and its imports/usages.
- In `frontend/src/components/OutputPane.tsx`, say the answer came through AI Gateway rather than directly from OpenAI.
- In `frontend/src/components/SettingsPage.tsx`, describe the model catalog as AI Gateway metadata and change the screenshot privacy copy to say it is not sent to AI Gateway or its selected model provider when disabled.
- Do not change model selection, persistence, benchmark UI behavior, or any audio/transcript UI.

The WebSocket schemas remain unchanged. Model string semantics change from commonly bare IDs to canonical `creator/model` IDs; record this in `docs/API.md`. A protocol version bump is not needed because no field, event name, or type changes.

### 7. Record the decision and synchronize all living docs

Create `docs/adr/0010-vercel-ai-gateway-for-cloud-ai.md` with status `Accepted`:

- Context: the desktop app currently calls OpenAI directly for language, image-aware prompts, model discovery, and embeddings; local STT must remain local.
- Decision: use Vercel AI Gateway's OpenAI-compatible REST API via existing `httpx`, Gateway auth, and `creator/model` slugs; keep local faster-whisper and local SQLite vectors.
- Alternatives: direct OpenAI unchanged; add OpenAI SDK; move backend inference to TypeScript AI SDK.
- Consequences: unified model catalog/observability and one cloud key; Gateway dependency and model-slug migration; text chunks/images still leave the machine when explicitly used, while audio never does.

Update `docs/adr/INDEX.md`. Mark ADR 0008 as `Superseded in part by ADR 0010` only for its direct OpenAI embedding transport/auth statement; do not rewrite its historical decision. ADR 0004 may retain its historical text, while ADR 0010 records the new pricing variable/model namespace.

Update these files in the same iteration:

- `AGENTS.md`: configuration tip must reference `AI_GATEWAY_API_KEY`/`VERCEL_MODEL`, while reiterating local STT.
- `README.md`: architecture, setup, configuration, model default, model IDs, RAG embeddings, screenshot wording, pricing override, and troubleshooting.
- `backend/README.md`: same runtime/auth/API facts and Gateway-local compatibility fallback.
- `docs/prompts/bootstrap.md`: replace direct OpenAI/auth assumptions with Gateway text/image/embedding calls, but explicitly retain local faster-whisper and local audio capture. The new ADR is the authorization for this scope update.
- `docs/ARCHITECTURE.md`: Gateway client/module and cloud boundary; audio/STT remain local.
- `docs/API.md`: query/benchmark model strings use `creator/model`; Gateway Responses and fallback semantics; Gateway pricing override; Gateway embedding default.
- `docs/STATUS.md`: replace direct-OpenAI current-state/known-issue references, add Gateway auth/model/pricing notes, and update verification steps.
- `docs/CHANGELOG.md`: append one dated iteration with user-visible changes, internal changes, and exact test commands/results.

Do not rewrite old changelog entries; historical OpenAI references there are valid history.

### 8. Static verification

Run from repository root:

```bash
cd backend && .venv/bin/python -m unittest discover -s tests
cd ../frontend && npm run build
cd .. && git diff --check
```

Then run scoped drift checks:

```bash
rg -n "api\.openai\.com|OPENAI_API_KEY|OPENAI_MODEL|OpenAIClient|_openai_client|openai_client" backend/app backend/.env.example README.md backend/README.md frontend/src docs/STATUS.md docs/API.md docs/ARCHITECTURE.md docs/prompts/bootstrap.md AGENTS.md
rg -n "AI_GATEWAY_API_KEY|VERCEL_MODEL|ai-gateway\.vercel\.sh|openai/gpt-5\.6-sol|openai/text-embedding-3-small" backend/app backend/.env.example README.md backend/README.md docs AGENTS.md
git diff -- backend/app/audio_capture.py backend/app/stt.py backend/requirements.txt
```

The first `rg` must return no stale runtime/current-doc hits. Historical ADR/changelog content is intentionally outside that check. The STT/audio/dependency diff must be empty.

### 9. Low-cost live verification

Only after unit/static checks pass, use the already configured local Gateway key. Do not paste it into a shell command or log it.

1. Start with `./scripts/dev.sh start` and verify backend/frontend status.
2. Refresh models. Confirm the query selector contains `openai/gpt-5.6-sol`, contains only language models, and does not offer `openai/text-embedding-3-small` as a chat model.
3. Send a tiny text query asking for the single word `OK`. Confirm at least one `query_chunk`, one final `query_response`, the final model slug, and no direct OpenAI URL in logs.
4. Run one screenshot-disabled query and confirm no screenshot payload is sent.
5. Ingest a tiny temporary `.txt` file through Local RAG. Confirm Gateway embedding succeeds, the vector/chunks remain in local SQLite, and a query retrieves the chunk.
6. Run the smallest benchmark: one test, one model (`openai/gpt-5.6-sol`), one repeat. Confirm TTFT, final latency, token counts, and non-null estimated cost.
7. Trigger or mock a 401/402/429 response and confirm the UI/log message is actionable without exposing credentials.
8. Check the Vercel AI Gateway dashboard for the text and embedding calls. This verifies that traffic reached Gateway, not the direct OpenAI endpoint.
9. Exercise transcription for a short local audio sample and confirm transcript messages still arrive. This is a regression check only; do not inspect Gateway for audio because no audio call should exist.
10. Stop with `./scripts/dev.sh stop` and confirm both services stop cleanly.

If the live call fails, capture only status code, Gateway request ID if present, model slug, endpoint path, and the bounded error body. Never capture authorization headers or full user/document/image content.

## Acceptance criteria

The migration is complete only when all of the following are true:

- Every language query, benchmark request, model discovery request, and embedding request uses `https://ai-gateway.vercel.sh/v1` or the explicit `AI_GATEWAY_BASE_URL` override.
- No runtime path can call `https://api.openai.com`.
- Runtime auth uses `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`; it does not use `OPENAI_API_KEY`.
- The default model is `VERCEL_MODEL`, currently `openai/gpt-5.6-sol`.
- Old bare OpenAI selections normalize to `openai/...` rather than breaking persisted UI state.
- The model selector and benchmark list contain language models only.
- Responses streaming, Chat Completions compatibility fallback, screenshot input, cancellation, token usage, RAG embeddings, and benchmark scoring still work.
- The RAG embedding default is `openai/text-embedding-3-small` through Gateway, while vector persistence remains local SQLite.
- Audio capture and faster-whisper transcription are unchanged and remain entirely local.
- Gateway errors are visible in terminal and UI with useful status/context but no secrets or full content.
- Backend unit tests, frontend build, `git diff --check`, scoped drift checks, and the live smoke flow pass.
- ADR 0010 and all required living docs are updated in the same change.

## Out of scope

- Replacing faster-whisper or sending audio to any cloud service
- Changing audio devices, capture strategy, VAD, language hints, or transcript behavior
- Moving the Python backend to Vercel or TypeScript
- Adding Vercel AI SDK packages
- Adding provider/model fallback policy, request tags, per-user rate limits, caching, or budget automation
- Changing the WebSocket schema or frontend state model
- Changing local SQLite persistence or RAG chunking/ranking
- General refactoring unrelated to the provider migration

## Stop conditions for the implementing model

Stop and report instead of guessing if:

- `VERCEL_MODEL` is not present in the live Gateway model catalog.
- The live Gateway docs no longer support one of `/responses`, `/chat/completions`, or `/embeddings` on the OpenAI-compatible base URL.
- The migration would require changing the STT/audio pipeline.
- The working tree contains overlapping user edits in the target files.
- A live test would require exposing or committing a credential.

When reporting a blocker, include the exact file/path, command, status code, and sanitized error. Do not broaden scope.
