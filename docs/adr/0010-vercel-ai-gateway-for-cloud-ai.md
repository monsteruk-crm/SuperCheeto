# ADR 0010: Use Vercel AI Gateway for Cloud AI Calls

## Status
Accepted

## Context
The desktop app previously called OpenAI's API directly for language queries, model discovery, and embeddings. This required managing an `OPENAI_API_KEY` and using bare model IDs like `gpt-4o` or `gpt-5.1`.

We want to:
- Centralize cloud AI traffic through Vercel AI Gateway for unified observability and rate limiting
- Support multiple model providers through a single endpoint
- Use canonical `creator/model` slugs (e.g., `openai/gpt-5.6-sol`)
- Maintain compatibility with old bare model IDs persisted in frontend state

Local audio capture and faster-whisper transcription must remain unchanged and entirely local.

## Decision
Use Vercel AI Gateway's OpenAI-compatible REST API via the existing `httpx` async client.

**Authentication**: Read `AI_GATEWAY_API_KEY` first, fall back to `VERCEL_OIDC_TOKEN` (for Vercel deployment compatibility).

**Base URL**: `https://ai-gateway.vercel.sh/v1` (configurable via `AI_GATEWAY_BASE_URL`).

**Model IDs**: 
- Default language model: `VERCEL_MODEL` (currently `openai/gpt-5.6-sol`)
- Default embedding model: `openai/text-embedding-3-small`
- Old bare IDs like `gpt-5.1` are normalized to `openai/gpt-5.1`
- Deprecated aliases like `gpt-5.2-chat-latest` map to `openai/gpt-5.6-sol`

**Model Discovery**: Filter `/models` response to only include rows where `type == "language"`, excluding embedding/image/video models from the query selector.

**Pricing**: Static estimator uses base-tier pricing from the Gateway model catalog. Override via `AI_GATEWAY_MODEL_PRICING_JSON` for tiered or newly added models.

**Fallback**: Responses API 404 falls back to Chat Completions on the same Gateway host (not direct OpenAI).

**Local STT**: Audio capture and faster-whisper transcription remain entirely local. No audio, PCM, or STT request is sent to any cloud service.

## Alternatives Considered

### Keep direct OpenAI calls
- **Pros**: No migration effort, no dependency on Gateway
- **Cons**: No unified observability, separate key management, no multi-provider support

### Add OpenAI Python SDK
- **Pros**: Official SDK with built-in retry logic
- **Cons**: Larger dependency, less control over streaming, existing `httpx` implementation works well

### Move backend to TypeScript AI SDK
- **Pros**: Unified language with frontend
- **Cons**: Major rewrite, Python backend has proven STT/transcription pipeline

## Consequences

### Positive
- Unified model catalog and observability through Vercel dashboard
- Single cloud key for multiple providers
- Canonical `creator/model` slugs prevent ambiguity
- Backward compatible with old bare model IDs in persisted UI state

### Negative
- New dependency on Vercel AI Gateway availability
- Model slug migration requires normalization logic
- Text chunks and images still leave the machine when explicitly used (only audio remains local)

### Follow-ups
- Monitor Gateway dashboard for traffic patterns
- Re-check live model catalog pricing periodically (prices can change)
- Consider adding request tags or per-user rate limits in future iterations