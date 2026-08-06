import asyncio
import json
import unittest
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock

import httpx

from app.ai_gateway_client import (
    AIGatewayClient,
    DEFAULT_BASE_URL,
    extract_output_text,
    extract_usage,
    filter_supported_language_models,
    normalize_gateway_model_id,
    preset_by_id,
)


class MockTransport(httpx.AsyncBaseTransport):
    """Test transport that records requests and returns scripted responses."""

    def __init__(self, responses: List[httpx.Response]) -> None:
        self._responses = list(responses)
        self.requests: List[httpx.Request] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self._responses:
            return self._responses.pop(0)
        return httpx.Response(500, json={"error": "No more scripted responses"})


class MockStreamTransport(httpx.AsyncBaseTransport):
    """Test transport for streaming responses."""

    def __init__(self, sse_lines: List[str], status_code: int = 200) -> None:
        self._sse_lines = sse_lines
        self._status_code = status_code
        self.requests: List[httpx.Request] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)

        async def stream_content():
            for line in self._sse_lines:
                yield line.encode("utf-8")

        return httpx.Response(
            self._status_code,
            stream=httpx.ByteStream(b""),
            headers={"content-type": "text/event-stream"},
        )


def _make_sse_stream_response(sse_lines: List[str]) -> httpx.Response:
    """Create a streaming response with SSE content."""
    content = "\n".join(sse_lines).encode("utf-8")

    async def content_iterator():
        yield content

    return httpx.Response(
        200,
        content=content,
        headers={"content-type": "text/event-stream"},
    )


class ModelNormalizationTests(unittest.TestCase):
    def test_bare_historical_model_gets_openai_prefix(self) -> None:
        self.assertEqual(normalize_gateway_model_id("gpt-5.1"), "openai/gpt-5.1")

    def test_deprecated_gpt_5_2_chat_latest_maps_to_gateway_slug(self) -> None:
        self.assertEqual(normalize_gateway_model_id("gpt-5.2-chat-latest"), "openai/gpt-5.6-sol")

    def test_deprecated_gpt_5_3_chat_latest_maps_to_gateway_slug(self) -> None:
        self.assertEqual(normalize_gateway_model_id("gpt-5.3-chat-latest"), "openai/gpt-5.6-sol")

    def test_valid_gateway_slug_unchanged(self) -> None:
        self.assertEqual(normalize_gateway_model_id("anthropic/claude-sonnet-4.6"), "anthropic/claude-sonnet-4.6")

    def test_whitespace_trimmed(self) -> None:
        self.assertEqual(normalize_gateway_model_id("  gpt-5.1  "), "openai/gpt-5.1")

    def test_empty_returns_none(self) -> None:
        self.assertIsNone(normalize_gateway_model_id(""))
        self.assertIsNone(normalize_gateway_model_id(None))


class FilterLanguageModelsTests(unittest.TestCase):
    def test_ignores_non_language_rows(self) -> None:
        models = [
            {"id": "openai/gpt-5.6-sol", "type": "language"},
            {"id": "openai/text-embedding-3-small", "type": "embedding"},
            {"id": "openai/dall-e-3", "type": "image"},
            {"id": "openai/sora", "type": "video"},
        ]
        result = filter_supported_language_models(models)
        self.assertEqual(result, ["openai/gpt-5.6-sol"])

    def test_includes_rows_without_type_field(self) -> None:
        models = [
            {"id": "openai/gpt-5.6-sol"},
            {"id": "openai/text-embedding-3-small", "type": "embedding"},
        ]
        result = filter_supported_language_models(models)
        self.assertEqual(result, ["openai/gpt-5.6-sol"])


class NonStreamingQueryTests(unittest.TestCase):
    def test_non_streaming_query_posts_to_responses_with_gateway_slug(self) -> None:
        response_body = {
            "output_text": "Hello world",
            "usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
        }
        transport = MockTransport([httpx.Response(200, json=response_body)])
        client = AIGatewayClient(
            api_key="test-key",
            model="openai/gpt-5.6-sol",
            transport=transport,
        )

        async def run_test():
            result = await client.run_query(
                instruction="Be concise.",
                selected_text="Test input",
                context_text="",
                model="gpt-5.1",
            )
            self.assertEqual(len(transport.requests), 1)
            request = transport.requests[0]
            self.assertEqual(request.url.path, "/v1/responses")
            self.assertEqual(request.headers["authorization"], "Bearer test-key")
            body = json.loads(request.content.decode("utf-8"))
            self.assertEqual(body["model"], "openai/gpt-5.1")
            self.assertEqual(result.text, "Hello world")
            self.assertEqual(result.input_tokens, 10)
            self.assertEqual(result.output_tokens, 5)
            await client.close()

        asyncio.run(run_test())


class StreamingQueryTests(unittest.TestCase):
    def test_streaming_responses_yields_deltas_and_usage(self) -> None:
        sse_events = [
            json.dumps({"type": "response.output_text.delta", "delta": "Hello "}),
            json.dumps({"type": "response.output_text.delta", "delta": "world"}),
            json.dumps({"type": "response.output_text.done", "text": ""}),
            json.dumps({
                "type": "response.completed",
                "response": {"id": "resp_1", "output_text": "Hello world"},
            }),
            json.dumps({"type": "usage", "usage": {"input_tokens": 8, "output_tokens": 2, "total_tokens": 10}}),
        ]
        sse_body = "\n".join(f"data: {line}" for line in sse_events)
        transport = _StreamingTransport(sse_body)
        client = AIGatewayClient(
            api_key="test-key",
            model="openai/gpt-5.6-sol",
            transport=transport,
        )

        deltas: List[str] = []

        async def on_delta(delta: str) -> None:
            deltas.append(delta)

        async def run_test():
            result = await client.run_query(
                instruction="Be concise.",
                selected_text="Test",
                context_text="",
                stream=True,
                on_stream_delta=on_delta,
            )
            self.assertEqual(deltas, ["Hello ", "world"])
            self.assertEqual(result.text, "Hello world")
            self.assertIsNotNone(result.first_token_latency_ms)
            self.assertEqual(result.input_tokens, 8)
            self.assertEqual(result.output_tokens, 2)
            await client.close()

        asyncio.run(run_test())


class FallbackTests(unittest.TestCase):
    def test_responses_404_falls_back_to_chat_completions_on_gateway(self) -> None:
        chat_response = {
            "choices": [{"message": {"content": "Fallback answer"}}],
            "usage": {"input_tokens": 5, "output_tokens": 3, "total_tokens": 8},
        }
        transport = MockTransport([
            httpx.Response(404, json={"error": "Not found"}),
            httpx.Response(200, json=chat_response),
        ])
        client = AIGatewayClient(
            api_key="test-key",
            model="openai/gpt-5.6-sol",
            transport=transport,
        )

        async def run_test():
            result = await client.run_query(
                instruction="Be concise.",
                selected_text="Test",
                context_text="",
            )
            self.assertEqual(len(transport.requests), 2)
            # First request was to /responses
            self.assertEqual(transport.requests[0].url.path, "/v1/responses")
            # Fallback was to /chat/completions on the same gateway host
            self.assertEqual(transport.requests[1].url.path, "/v1/chat/completions")
            self.assertIn("ai-gateway.vercel.sh", transport.requests[1].url.host)
            self.assertEqual(result.text, "Fallback answer")
            await client.close()

        asyncio.run(run_test())


class ModelDiscoveryTests(unittest.TestCase):
    def test_list_models_ignores_non_language_rows(self) -> None:
        models_response = {
            "data": [
                {"id": "openai/gpt-5.6-sol", "type": "language", "object": "model", "owned_by": "openai"},
                {"id": "openai/text-embedding-3-small", "type": "embedding", "object": "model", "owned_by": "openai"},
                {"id": "openai/dall-e-3", "type": "image", "object": "model", "owned_by": "openai"},
                {"id": "openai/sora", "type": "video", "object": "model", "owned_by": "openai"},
            ]
        }
        transport = MockTransport([httpx.Response(200, json=models_response)])
        client = AIGatewayClient(
            api_key="test-key",
            model="openai/gpt-5.6-sol",
            transport=transport,
        )

        async def run_test():
            models = await client.list_models()
            self.assertEqual(models, ["openai/gpt-5.6-sol"])
            await client.close()

        asyncio.run(run_test())

    def test_list_model_details_only_contains_language_rows(self) -> None:
        models_response = {
            "data": [
                {"id": "openai/gpt-5.6-sol", "type": "language", "object": "model", "created": 1700000000, "owned_by": "openai"},
                {"id": "openai/text-embedding-3-small", "type": "embedding", "object": "model", "created": 1700000000, "owned_by": "openai"},
            ]
        }
        transport = MockTransport([httpx.Response(200, json=models_response)])
        client = AIGatewayClient(
            api_key="test-key",
            model="openai/gpt-5.6-sol",
            transport=transport,
        )

        async def run_test():
            details = await client.list_model_details()
            self.assertEqual(len(details), 1)
            self.assertEqual(details[0]["id"], "openai/gpt-5.6-sol")
            self.assertEqual(details[0]["object"], "model")
            self.assertEqual(details[0]["created"], 1700000000)
            self.assertEqual(details[0]["owned_by"], "openai")
            await client.close()

        asyncio.run(run_test())


class EmbeddingTests(unittest.TestCase):
    def test_embeddings_post_to_gateway_with_default_model(self) -> None:
        embedding_response = {
            "data": [
                {"embedding": [0.1, 0.2, 0.3]},
                {"embedding": [0.4, 0.5, 0.6]},
            ]
        }
        transport = MockTransport([httpx.Response(200, json=embedding_response)])
        client = AIGatewayClient(
            api_key="test-key",
            model="openai/gpt-5.6-sol",
            transport=transport,
        )

        async def run_test():
            vectors = await client.embed_texts(["hello", "world"])
            self.assertEqual(len(transport.requests), 1)
            request = transport.requests[0]
            self.assertEqual(request.url.path, "/v1/embeddings")
            body = json.loads(request.content.decode("utf-8"))
            self.assertEqual(body["model"], "openai/text-embedding-3-small")
            self.assertEqual(body["input"], ["hello", "world"])
            self.assertEqual(vectors, [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
            await client.close()

        asyncio.run(run_test())

    def test_embedding_vector_order_preserved(self) -> None:
        embedding_response = {
            "data": [
                {"embedding": [1.0, 0.0]},
                {"embedding": [0.0, 1.0]},
                {"embedding": [0.5, 0.5]},
            ]
        }
        transport = MockTransport([httpx.Response(200, json=embedding_response)])
        client = AIGatewayClient(
            api_key="test-key",
            model="openai/gpt-5.6-sol",
            transport=transport,
        )

        async def run_test():
            vectors = await client.embed_texts(["a", "b", "c"])
            self.assertEqual(vectors[0], [1.0, 0.0])
            self.assertEqual(vectors[1], [0.0, 1.0])
            self.assertEqual(vectors[2], [0.5, 0.5])
            await client.close()

        asyncio.run(run_test())


class ErrorFormattingTests(unittest.TestCase):
    def test_http_error_includes_status_but_not_token(self) -> None:
        transport = MockTransport([
            httpx.Response(401, json={"error": {"message": "Invalid API key"}}),
        ])
        client = AIGatewayClient(
            api_key="secret-token-123",
            model="openai/gpt-5.6-sol",
            transport=transport,
        )

        async def run_test():
            with self.assertRaises(httpx.HTTPStatusError) as ctx:
                await client.run_query(
                    instruction="test",
                    selected_text="test",
                    context_text="",
                )
            exc = ctx.exception
            self.assertEqual(exc.response.status_code, 401)
            # Verify the token is not in the error message
            error_str = str(exc)
            self.assertNotIn("secret-token-123", error_str)
            await client.close()

        asyncio.run(run_test())


class PresetPromptTests(unittest.TestCase):
    def test_preset_by_id_returns_correct_preset(self) -> None:
        preset = preset_by_id("fact_check")
        self.assertIsNotNone(preset)
        self.assertEqual(preset.label, "Fact check (no browsing)")

    def test_preset_by_id_returns_none_for_unknown(self) -> None:
        self.assertIsNone(preset_by_id("nonexistent"))


class ExtractHelpersTests(unittest.TestCase):
    def test_extract_output_text_from_responses(self) -> None:
        data = {"output_text": "  Hello world  "}
        self.assertEqual(extract_output_text(data), "Hello world")

    def test_extract_output_text_from_chat(self) -> None:
        data = {"choices": [{"message": {"content": "  Chat answer  "}}]}
        self.assertEqual(extract_output_text(data), "Chat answer")

    def test_extract_usage_with_all_fields(self) -> None:
        data = {"usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}}
        usage = extract_usage(data)
        self.assertEqual(usage["input_tokens"], 10)
        self.assertEqual(usage["output_tokens"], 5)
        self.assertEqual(usage["total_tokens"], 15)

    def test_extract_usage_computes_total(self) -> None:
        data = {"usage": {"input_tokens": 10, "output_tokens": 5}}
        usage = extract_usage(data)
        self.assertEqual(usage["total_tokens"], 15)

    def test_extract_usage_handles_missing(self) -> None:
        usage = extract_usage({})
        self.assertIsNone(usage["input_tokens"])
        self.assertIsNone(usage["output_tokens"])
        self.assertIsNone(usage["total_tokens"])


class _StreamingTransport(httpx.AsyncBaseTransport):
    """Transport that returns pre-built SSE content for streaming tests."""

    def __init__(self, sse_body: str) -> None:
        self._sse_body = sse_body
        self.requests: List[httpx.Request] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(
            200,
            content=self._sse_body.encode("utf-8"),
            headers={"content-type": "text/event-stream"},
        )


if __name__ == "__main__":
    unittest.main()