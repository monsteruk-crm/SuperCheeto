# ADR 0013: Stream answers from transcript text

## Status
Accepted for text-generation transport and the initial answer-model default (23 October 2026). Detector/model evaluation and cockpit display work remain in M04/M05/M07/M10; this ADR does not mark those milestones complete.

## Context
The user requested realtime responses, suggested Gemini 3.8 Live Extended Thinking as an example, then clarified that the application parses an existing transcript and must use a suitable model and streaming method. The bootstrap requires local audio capture and local STT. We need early useful answer text, accurate completion/failure states, and a model choice that can be changed without losing Settings, RAG, presets or benchmarks.

The public Gateway catalog was fetched in full on 23 October 2026 (480 models). `google/gemini-3.8-live-extended-thinking` is `type: realtime`, with text/audio input/output and `websocket-realtime`. It can accept text, but adopting its live-session lifecycle brings no demonstrated benefit for our frozen-text requests. `google/gemini-3.8-flash` is `type: language`, with text input/output, vision and structured-output support, and supported reasoning efforts `low`/`high`. Public capability discovery is not a team-access, latency or accuracy test.

## Decision
- Keep the flow: local capture → local STT → immutable text snapshot plus explicit RAG/image context → backend Gateway text request → streamed text → the matching answer card. No cloud audio, synthesized speech or continuous provider voice session is introduced.
- Use `google/gemini-3.8-flash` as the initial answer default. Set supported low reasoning using Responses `reasoning.effort` or Chat Completions `reasoning_effort`. Apply this preference only to that verified model; do not copy it to arbitrary selections. Preserve `VERCEL_MODEL` and saved/user-selected models. Existing installations with overrides will keep them; never edit private environment files or reset preferences to force a migration.
- Reuse the existing asynchronous Python `httpx.AsyncClient` and documented `/v1/responses` HTTP SSE API with `stream: true`. Preserve the same-model `/v1/chat/completions` fallback only for HTTP 404 before any answer text is emitted. This is API-format compatibility, not an automatic model retry. Do not retry a partial, malformed, timed-out, rate-limited or failed generation, and do not introduce a frontend provider credential or a JavaScript SDK migration.
- Parse SSE event boundaries across arbitrary network/UTF-8 chunks, comments and multiline data. Forward answer-content deltas as they arrive; ignore reasoning text. Require `response.completed`, or a successful Chat Completions `finish_reason: stop`. Treat failed/incomplete events, malformed data, premature EOF, length limits and content filtering as failures. Preserve already delivered partial text through the existing request lifecycle. Cancellation closes the upstream stream. Keep genuine empty output empty so v2 can report `empty`.
- Request streaming usage on the Chat Completions path; keep final Responses usage. TTFT measures the first nonempty answer-content delta, including any API-format fallback overhead; total generation latency includes both attempts. These do not include STT/RAG/display time and are not a speech-to-answer measurement.
- One model call creates one answer card. Continuous FULL AUTO schedules bounded text requests when eligible finalized candidates arrive; it never starts a generation per word/partial/meter tick and never cancels a current stream merely because new text arrived.

### Follow-through still required
- M04/M05 must preserve this adapter while extracting the answer service and rendering content immediately into stable identified cards. Lead with a concise useful answer, then optional detail; do not wait for a full answer JSON object before displaying prose. Keep incomplete/failed/cancelled text visibly unreviewed.
- M07 should initially evaluate `google/gemini-3.5-flash-lite` with supported low reasoning for bounded structured question proposals. It is a provisional detector choice, not implemented detection or proven semantic accuracy. Validate complete structured output and source offsets before using it; an answer must not wait for this detector.
- Recheck catalog capabilities before enabling a changed model: language text input/output, vision for attached screenshots, structured output for the detector. Preserve manual choices; report unavailable/incompatible models rather than silently swapping one mid-answer. Future role settings must be included in frozen generation/rerun inputs.
- M10 must record the selected model/profile, sample size, accuracy/correction cases, request TTFT, full generation time, RAG delay, STT finalization delay and speech-end-to-first-useful-visible-text. Compare using the existing bounded benchmark/smoke workflow. Public listings or a synthetic stream test cannot establish latency/quality. No live inference was run for this ADR.

## Alternatives considered
- **Native Gemini Live session:** valid for voice interaction; adds provider-session, turn-taking and reconnection semantics without an established need for a text-snapshot helper. Revisit only with a separate requirement and ADR.
- **Persistent Responses WebSocket mode:** potentially useful for many sequential agent turns. The application already reuses HTTP connections; use SSE first, and adopt another transport only after measured benefit and verified provider support.
- **Keep a large reasoning model as the fresh-install default:** preserves the previous default, but offers no measured speed advantage for short live assistance. It remains selectable; this change is an initial choice to evaluate, not a claim that Flash is always fastest or most accurate.
- **Buffer a full answer or fake word-by-word animation:** delays useful text and disguises transport behavior; rejected.

## Consequences
The backend default and example environment change; existing configured/saved choices and all Settings features remain. The Gateway adapter now refuses false success on incomplete streams and returns honest empty output. No local WebSocket schema or protocol version changes in this iteration. ADR 0010's Gateway decision and ADR 0012's ownership/lifecycle remain in force; this supersedes only ADR 0010's original language-model default. M04–M11 remain open.

## Primary sources checked
- [Gateway public model catalog](https://ai-gateway.vercel.sh/v1/models)
- [Gemini 3.8 Live Extended Thinking](https://vercel.com/ai-gateway/models/gemini-3.8-live-extended-thinking)
- [Gemini 3.8 Flash](https://vercel.com/ai-gateway/models/gemini-3.8-flash)
- [Responses streaming](https://vercel.com/docs/ai-gateway/sdks-and-apis/responses/streaming)
- [Chat Completions streaming and usage](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/streaming)
- [Responses reasoning fields](https://vercel.com/docs/ai-gateway/sdks-and-apis/responses/reasoning)
- [Reasoning fields across API formats](https://vercel.com/docs/ai-gateway/models-and-providers/reasoning)
