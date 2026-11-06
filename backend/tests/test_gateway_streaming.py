"""Real HTTP stream parsing with synthetic provider frames; no cloud calls."""

import asyncio
import json
import unittest

import httpx

from app.ai_gateway_client import AIGatewayClient, DEFAULT_TEXT_MODEL, GatewayStreamError


def frame(event):
    data = event if isinstance(event, str) else json.dumps(event, ensure_ascii=False)
    return f"data: {data}\n\n".encode()


class EventStream(httpx.AsyncByteStream):
    def __init__(self, chunks, gate=None):
        self.chunks = chunks
        self.gate = gate
        self.closed = False

    async def __aiter__(self):
        for index, chunk in enumerate(self.chunks):
            yield chunk
            if index == 0 and self.gate is not None:
                await self.gate.wait()

    async def aclose(self):
        self.closed = True


class GatewayStreamingTests(unittest.IsolatedAsyncioTestCase):
    async def make_client(self, stream, fallback=False):
        requests = []

        def handler(request):
            requests.append(request)
            if fallback and len(requests) == 1:
                return httpx.Response(404, json={"error": "unsupported endpoint"})
            return httpx.Response(200, stream=stream, headers={"content-type": "text/event-stream"})

        client = AIGatewayClient("not-a-real-key", DEFAULT_TEXT_MODEL, transport=httpx.MockTransport(handler))
        self.addAsyncCleanup(client.close)
        return client, requests

    async def query(self, client, **kwargs):
        return await client.run_query("Be concise", "messy transcript", "", stream=True, **kwargs)

    async def test_deltas_arrive_before_completion_and_cancellation_closes_stream(self):
        gate = asyncio.Event()
        received = asyncio.Event()
        stream = EventStream([
            frame({"type": "response.output_text.delta", "delta": "First useful words"}),
            frame({"type": "response.completed", "response": {"output_text": "First useful words"}}),
        ], gate)
        client, requests = await self.make_client(stream)
        deltas = []

        def on_delta(delta):
            deltas.append(delta)
            received.set()

        task = asyncio.create_task(self.query(client, on_stream_delta=on_delta))
        try:
            await asyncio.wait_for(received.wait(), timeout=1)
            self.assertFalse(task.done(), "Generation must still be waiting for its terminal event")
            self.assertEqual(deltas, ["First useful words"])
        finally:
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        self.assertTrue(stream.closed)
        self.assertEqual(len(requests), 1)

    async def test_fragmented_utf8_and_multiline_sse_frame(self):
        body = '\ufeff: heartbeat\r\ndata:\r\n\r\nevent: response.output_text.delta\r\n'.encode()
        body += 'data: {"type": "response.output_text.delta",\r\ndata: "delta": "café 日本"}\r\n\r\n'.encode()
        body += frame({"type": "response.output_text.done", "text": "café 日本"})
        body += frame({"type": "response.completed", "response": {"output_text": "café 日本"}})
        stream = EventStream([body[i:i + 1] for i in range(len(body))])
        client, _ = await self.make_client(stream)
        deltas = []
        result = await self.query(client, on_stream_delta=deltas.append)
        self.assertEqual(deltas, ["café 日本"])
        self.assertEqual(result.text, "café 日本")

    async def test_errors_and_truncated_streams_do_not_complete_or_retry(self):
        delta = frame({"type": "response.output_text.delta", "delta": "Partial"})
        bad_tails = [
            b"", frame("[DONE]"), frame("{bad JSON}"), frame("[]"),
            frame({"type": "error", "error": {"message": "private prompt"}}),
            frame({"type": "response.failed", "response": {"status": "failed"}}),
            frame({"type": "response.incomplete", "response": {"status": "incomplete"}}),
        ]
        for tail in bad_tails:
            with self.subTest(tail=tail):
                client, requests = await self.make_client(EventStream([delta, tail]))
                deltas = []
                with self.assertRaises(GatewayStreamError) as error:
                    await self.query(client, on_stream_delta=deltas.append)
                self.assertEqual(deltas, ["Partial"])
                self.assertEqual(len(requests), 1)
                self.assertNotIn("private prompt", str(error.exception))

    async def test_reasoning_is_not_answer_text_or_first_answer_token(self):
        stream = EventStream([
            frame({"type": "response.reasoning_summary_text.delta", "delta": "private reasoning"}),
            frame({"type": "response.output_text.delta", "delta": ""}),
            frame({"type": "response.completed", "response": {"output_text": ""}}),
        ])
        client, _ = await self.make_client(stream)
        deltas = []
        result = await self.query(client, on_stream_delta=deltas.append)
        self.assertEqual(result.text, "")
        self.assertEqual(deltas, [])
        self.assertIsNone(result.first_token_latency_ms)

    async def test_content_parts_are_not_duplicated_or_dropped(self):
        client, _ = await self.make_client(EventStream([
            frame({"type": "response.output_text.delta", "delta": "A", "content_index": 0}),
            frame({"type": "response.output_text.done", "text": "A", "content_index": 0}),
            frame({"type": "response.output_text.done", "text": "B", "content_index": 1}),
            frame({"type": "response.completed", "response": {}}),
        ]))
        deltas = []
        result = await self.query(client, on_stream_delta=deltas.append)
        self.assertEqual(deltas, ["A", "B"])
        self.assertEqual(result.text, "AB")

    async def test_chat_fallback_handles_empty_choices_usage_and_stop(self):
        stream = EventStream([
            frame({"choices": [{"delta": {"role": "assistant"}, "finish_reason": None}]}),
            frame({"choices": [{"delta": {"content": "Answer"}, "finish_reason": None}]}),
            frame({"choices": [{"delta": {}, "finish_reason": "stop"}]}),
            frame({"choices": [], "usage": {"prompt_tokens": 4, "completion_tokens": 2, "total_tokens": 6}}),
            frame("[DONE]"),
        ])
        client, requests = await self.make_client(stream, fallback=True)
        result = await self.query(client)
        self.assertEqual([r.url.path for r in requests], ["/v1/responses", "/v1/chat/completions"])
        self.assertEqual(result.text, "Answer")
        self.assertEqual(result.total_tokens, 6)
        self.assertIsNotNone(result.first_token_latency_ms)
        responses_payload = json.loads(requests[0].content)
        chat_payload = json.loads(requests[1].content)
        self.assertEqual(responses_payload["reasoning"], {"effort": "low"})
        self.assertEqual(chat_payload["reasoning_effort"], "low")
        self.assertEqual(chat_payload["stream_options"], {"include_usage": True})

    async def test_chat_failure_length_filter_and_missing_terminal_are_failures(self):
        for reason in [None, "length", "content_filter", "tool_calls"]:
            with self.subTest(reason=reason):
                client, requests = await self.make_client(EventStream([
                    frame({"choices": [{"delta": {"content": "Partial"}, "finish_reason": None}]}),
                    frame({"choices": [{"delta": {}, "finish_reason": reason}]}),
                    frame("[DONE]"),
                ]), fallback=True)
                with self.assertRaises(GatewayStreamError):
                    await self.query(client)
                self.assertEqual(len(requests), 2)

    async def test_no_fallback_for_http_errors_other_than_404(self):
        for status in [401, 429, 500]:
            requests = []

            def handler(request):
                requests.append(request)
                return httpx.Response(status, json={"error": "failure"})

            client = AIGatewayClient("test", DEFAULT_TEXT_MODEL, transport=httpx.MockTransport(handler))
            self.addAsyncCleanup(client.close)
            with self.assertRaises(httpx.HTTPStatusError):
                await self.query(client)
            self.assertEqual(len(requests), 1)

    async def test_explicit_high_reasoning_reaches_both_api_formats(self):
        stream = EventStream([frame({"choices":[{"delta":{"content":"Answer"},"finish_reason":None}]}),frame({"choices":[{"delta":{},"finish_reason":"stop"}]}),frame("[DONE]")])
        client, requests = await self.make_client(stream, fallback=True)
        try:
            await client.run_query("answer", "question", "", stream=True, reasoning_effort="high")
            self.assertEqual(json.loads(requests[0].content)["reasoning"], {"effort":"high"})
            self.assertEqual(json.loads(requests[1].content)["reasoning_effort"], "high")
        finally:
            await client.close()

    async def test_user_selected_model_does_not_inherit_gemini_reasoning(self):
        client, requests = await self.make_client(EventStream([
            frame({"type": "response.completed", "response": {"output_text": "Explicit choice"}}),
        ]))
        result = await self.query(client, model="openai/gpt-5.6-sol")
        payload = json.loads(requests[0].content)
        self.assertEqual(payload["model"], "openai/gpt-5.6-sol")
        self.assertNotIn("reasoning", payload)
        self.assertEqual(result.text, "Explicit choice")
