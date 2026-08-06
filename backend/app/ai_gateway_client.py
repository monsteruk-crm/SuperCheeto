from __future__ import annotations

import json
import inspect
from dataclasses import dataclass
from time import perf_counter
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence

import httpx


@dataclass(frozen=True)
class PresetPrompt:
    id: str
    label: str
    instruction: str


@dataclass(frozen=True)
class QueryResult:
    text: str
    latency_ms: float
    first_token_latency_ms: Optional[float]
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    total_tokens: Optional[int]


PRESET_PROMPTS: List[PresetPrompt] = [
    PresetPrompt(
        id="fact_check",
        label="Fact check (no browsing)",
        instruction="Identify claims that may be wrong; explain uncertainty; suggest what to verify.",
    ),
    PresetPrompt(
        id="answer_question",
        label="Answer the question",
        instruction="Answer clearly and concisely.",
    ),
    PresetPrompt(
        id="write_js",
        label="Write JavaScript code",
        instruction="Write JavaScript code to satisfy the request; include edge cases.",
    ),
    PresetPrompt(
        id="action_items",
        label="Extract action items",
        instruction="List action items with any owners/dates mentioned.",
    ),
]

DEPRECATED_MODEL_REPLACEMENTS: Dict[str, str] = {
    # Official docs now show this ChatGPT snapshot as deprecated; the durable API model still works.
    "gpt-5.1-chat-latest": "openai/gpt-5.1",
    # Official deprecations page recommends GPT-5.6 Sol for these removed chat snapshots.
    "gpt-5.2-chat-latest": "openai/gpt-5.6-sol",
    "gpt-5.3-chat-latest": "openai/gpt-5.6-sol",
}

DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v1"


def preset_by_id(preset_id: str) -> Optional[PresetPrompt]:
    for preset in PRESET_PROMPTS:
        if preset.id == preset_id:
            return preset
    return None


def normalize_gateway_model_id(model_id: Optional[str]) -> Optional[str]:
    """Normalize a model identifier for use with Vercel AI Gateway.

    Rules (deterministic):
    1. Trim whitespace.
    2. Apply current deprecated snapshot replacements.
    3. If the result already contains '/', leave it unchanged (it's a creator/model slug).
    4. Otherwise prefix it with 'openai/' so old bare model IDs remain usable.
    """
    normalized = (model_id or "").strip()
    if not normalized:
        return None
    # Apply deprecated replacements first
    normalized = DEPRECATED_MODEL_REPLACEMENTS.get(normalized, normalized)
    # If it already has a creator prefix, return as-is
    if "/" in normalized:
        return normalized
    # Otherwise prefix with openai/
    return f"openai/{normalized}"


def filter_supported_language_models(models: Sequence[Dict[str, Any]]) -> List[str]:
    """Filter model list to only include language models, returning normalized IDs."""
    filtered: List[str] = []
    seen: set[str] = set()
    for item in models:
        if not isinstance(item, dict):
            continue
        model_type = item.get("type", "")
        # Only include language models; skip embedding/image/video models
        if model_type and model_type != "language":
            continue
        model_id = item.get("id", "")
        if not model_id:
            continue
        normalized = normalize_gateway_model_id(model_id)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        filtered.append(normalized)
    return filtered


class AIGatewayClient:
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout_seconds: float = 30.0,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ) -> None:
        self.api_key = api_key
        self.default_model = model
        self.base_url = base_url.rstrip("/")
        client_kwargs: Dict[str, Any] = {
            "base_url": self.base_url,
            "timeout": timeout_seconds,
            "headers": {"Authorization": f"Bearer {api_key}"},
        }
        if transport is not None:
            client_kwargs["transport"] = transport
        self._client = httpx.AsyncClient(**client_kwargs)

    async def close(self) -> None:
        await self._client.aclose()

    async def run_query(
        self,
        instruction: str,
        selected_text: str,
        context_text: str,
        model: Optional[str] = None,
        screenshot_data_url: Optional[str] = None,
        stream: bool = False,
        on_stream_delta: Optional[Callable[[str], Awaitable[None] | None]] = None,
    ) -> QueryResult:
        prompt = self._build_prompt(selected_text, context_text)
        model_id = normalize_gateway_model_id(model) or normalize_gateway_model_id(self.default_model) or self.default_model
        if stream:
            try:
                data, first_token_latency_ms = await self._run_responses_streaming(
                    model_id=model_id,
                    instruction=instruction,
                    prompt=prompt,
                    screenshot_data_url=screenshot_data_url,
                    on_stream_delta=on_stream_delta,
                )
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 404:
                    raise
                data, first_token_latency_ms = await self._run_chat_completions_streaming(
                    model_id=model_id,
                    instruction=instruction,
                    prompt=prompt,
                    screenshot_data_url=screenshot_data_url,
                    on_stream_delta=on_stream_delta,
                )
        else:
            try:
                data = await self._run_responses_non_streaming(
                    model_id=model_id,
                    instruction=instruction,
                    prompt=prompt,
                    screenshot_data_url=screenshot_data_url,
                )
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code != 404:
                    raise
                data = await self._run_chat_completions_non_streaming(
                    model_id=model_id,
                    instruction=instruction,
                    prompt=prompt,
                    screenshot_data_url=screenshot_data_url,
                )
            first_token_latency_ms = None
        latency_ms = float(data.get("_latency_ms", 0.0))
        usage = extract_usage(data)
        return QueryResult(
            text=extract_output_text(data) or "(No response text returned.)",
            latency_ms=latency_ms,
            first_token_latency_ms=first_token_latency_ms,
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
            total_tokens=usage.get("total_tokens"),
        )

    async def _run_responses_non_streaming(
        self,
        model_id: str,
        instruction: str,
        prompt: str,
        screenshot_data_url: Optional[str],
    ) -> Dict[str, Any]:
        payload = self._build_responses_payload(
            model_id=model_id,
            instruction=instruction,
            prompt=prompt,
            screenshot_data_url=screenshot_data_url,
            stream=False,
        )
        started = perf_counter()
        response = await self._client.post("/responses", json=payload)
        latency_ms = (perf_counter() - started) * 1000.0
        response.raise_for_status()
        data = response.json()
        data["_latency_ms"] = latency_ms
        return data

    async def _run_responses_streaming(
        self,
        model_id: str,
        instruction: str,
        prompt: str,
        screenshot_data_url: Optional[str],
        on_stream_delta: Optional[Callable[[str], Awaitable[None] | None]] = None,
    ) -> tuple[Dict[str, Any], Optional[float]]:
        payload = self._build_responses_payload(
            model_id=model_id,
            instruction=instruction,
            prompt=prompt,
            screenshot_data_url=screenshot_data_url,
            stream=True,
        )
        started = perf_counter()
        first_token_latency_ms: Optional[float] = None
        final_response: Dict[str, Any] = {}
        output_chunks: List[str] = []
        latest_usage: Dict[str, Any] = {}
        saw_delta = False

        async with self._client.stream("POST", "/responses", json=payload) as response:
            response.raise_for_status()
            async for raw_line in response.aiter_lines():
                if not raw_line:
                    continue
                line = raw_line.strip()
                if not line.startswith("data:"):
                    continue
                data_line = line[5:].strip()
                if not data_line or data_line == "[DONE]":
                    continue
                try:
                    event = json.loads(data_line)
                except json.JSONDecodeError:
                    continue
                event_type = str(event.get("type") or "")
                if event_type == "response.output_text.delta":
                    if first_token_latency_ms is None:
                        first_token_latency_ms = (perf_counter() - started) * 1000.0
                    delta = event.get("delta")
                    if isinstance(delta, str) and delta:
                        saw_delta = True
                        output_chunks.append(delta)
                        await _maybe_await(on_stream_delta, delta)
                elif event_type == "response.output_text.done":
                    if first_token_latency_ms is None:
                        first_token_latency_ms = (perf_counter() - started) * 1000.0
                    text = event.get("text")
                    if isinstance(text, str) and text and not saw_delta:
                        output_chunks.append(text)
                        await _maybe_await(on_stream_delta, text)
                elif event_type == "response.completed":
                    response_obj = event.get("response")
                    if isinstance(response_obj, dict):
                        final_response = response_obj
                usage = event.get("usage")
                if isinstance(usage, dict):
                    latest_usage = usage

        latency_ms = (perf_counter() - started) * 1000.0
        if final_response:
            data = dict(final_response)
        else:
            data = {}
        if "output_text" not in data and output_chunks:
            data["output_text"] = "".join(output_chunks).strip()
        if "usage" not in data and latest_usage:
            data["usage"] = latest_usage
        data["_latency_ms"] = latency_ms
        return data, first_token_latency_ms

    async def _run_chat_completions_non_streaming(
        self,
        model_id: str,
        instruction: str,
        prompt: str,
        screenshot_data_url: Optional[str],
    ) -> Dict[str, Any]:
        payload = self._build_chat_completions_payload(
            model_id=model_id,
            instruction=instruction,
            prompt=prompt,
            screenshot_data_url=screenshot_data_url,
            stream=False,
        )
        started = perf_counter()
        response = await self._client.post("/chat/completions", json=payload)
        latency_ms = (perf_counter() - started) * 1000.0
        response.raise_for_status()
        data = response.json()
        data["_latency_ms"] = latency_ms
        return data

    async def _run_chat_completions_streaming(
        self,
        model_id: str,
        instruction: str,
        prompt: str,
        screenshot_data_url: Optional[str],
        on_stream_delta: Optional[Callable[[str], Awaitable[None] | None]] = None,
    ) -> tuple[Dict[str, Any], Optional[float]]:
        payload = self._build_chat_completions_payload(
            model_id=model_id,
            instruction=instruction,
            prompt=prompt,
            screenshot_data_url=screenshot_data_url,
            stream=True,
        )
        started = perf_counter()
        first_token_latency_ms: Optional[float] = None
        final_response: Dict[str, Any] = {}
        output_chunks: List[str] = []
        latest_usage: Dict[str, Any] = {}

        async with self._client.stream("POST", "/chat/completions", json=payload) as response:
            response.raise_for_status()
            async for raw_line in response.aiter_lines():
                if not raw_line:
                    continue
                line = raw_line.strip()
                if not line.startswith("data:"):
                    continue
                data_line = line[5:].strip()
                if not data_line or data_line == "[DONE]":
                    continue
                try:
                    event = json.loads(data_line)
                except json.JSONDecodeError:
                    continue
                choices = event.get("choices", [])
                if isinstance(choices, list) and choices:
                    choice = choices[0] if isinstance(choices[0], dict) else None
                    if choice:
                        delta = choice.get("delta", {})
                        if isinstance(delta, dict):
                            content = delta.get("content")
                            if isinstance(content, str) and content:
                                if first_token_latency_ms is None:
                                    first_token_latency_ms = (perf_counter() - started) * 1000.0
                                output_chunks.append(content)
                                await _maybe_await(on_stream_delta, content)
                        message = choice.get("message", {})
                        if isinstance(message, dict) and message.get("content") and not output_chunks:
                            content = message.get("content")
                            if isinstance(content, str) and content:
                                if first_token_latency_ms is None:
                                    first_token_latency_ms = (perf_counter() - started) * 1000.0
                                output_chunks.append(content)
                                await _maybe_await(on_stream_delta, content)
                usage = event.get("usage")
                if isinstance(usage, dict):
                    latest_usage = usage
                if event.get("id") or event.get("object"):
                    final_response = event

        latency_ms = (perf_counter() - started) * 1000.0
        data = dict(final_response) if final_response else {}
        if "output_text" not in data and output_chunks:
            data["output_text"] = "".join(output_chunks).strip()
        if "usage" not in data and latest_usage:
            data["usage"] = latest_usage
        data["_latency_ms"] = latency_ms
        return data, first_token_latency_ms

    @staticmethod
    def _build_responses_payload(
        model_id: str,
        instruction: str,
        prompt: str,
        screenshot_data_url: Optional[str],
        stream: bool = False,
    ) -> Dict[str, Any]:
        if screenshot_data_url:
            input_payload = [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image", "image_url": screenshot_data_url},
                    ],
                }
            ]
        else:
            input_payload = prompt
        return {
            "model": model_id,
            "instructions": instruction,
            "input": input_payload,
            "stream": stream,
        }

    @staticmethod
    def _build_chat_completions_payload(
        model_id: str,
        instruction: str,
        prompt: str,
        screenshot_data_url: Optional[str],
        stream: bool,
    ) -> Dict[str, Any]:
        if screenshot_data_url:
            user_content: Any = [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": screenshot_data_url}},
            ]
        else:
            user_content = prompt
        payload: Dict[str, Any] = {
            "model": model_id,
            "messages": [
                {"role": "developer", "content": instruction},
                {"role": "user", "content": user_content},
            ],
            "stream": stream,
        }
        return payload

    async def list_models(self) -> List[str]:
        response = await self._client.get("/models")
        response.raise_for_status()
        data = response.json()
        items = data.get("data", [])
        return filter_supported_language_models(items)

    async def list_model_details(self) -> List[Dict[str, Any]]:
        response = await self._client.get("/models")
        response.raise_for_status()
        data = response.json()
        items = data.get("data", [])
        details: List[Dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            # Only include language models
            model_type = item.get("type", "")
            if model_type and model_type != "language":
                continue
            model_id = item.get("id")
            if not model_id:
                continue
            details.append(
                {
                    "id": str(model_id),
                    "object": str(item.get("object", "model")),
                    "created": item.get("created"),
                    "owned_by": str(item.get("owned_by", "")),
                }
            )
        details.sort(key=lambda row: row["id"])
        return details

    async def embed_texts(
        self,
        texts: Sequence[str],
        model: str = "openai/text-embedding-3-small",
    ) -> List[List[float]]:
        cleaned = [str(text or "").strip() for text in texts if str(text or "").strip()]
        if not cleaned:
            return []
        response = await self._client.post(
            "/embeddings",
            json={
                "model": model,
                "input": cleaned,
            },
        )
        response.raise_for_status()
        payload = response.json()
        rows = payload.get("data", [])
        vectors: List[List[float]] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            embedding = row.get("embedding")
            if isinstance(embedding, list) and embedding:
                vectors.append([float(item) for item in embedding])
        return vectors

    @staticmethod
    def _build_prompt(selected_text: str, context_text: str) -> str:
        sections = ["Selected text:\n" + selected_text.strip()]
        if context_text:
            sections.append("Context:\n" + context_text.strip())
        return "\n\n".join(sections).strip()


def extract_output_text(data: Dict) -> str:
    if "output_text" in data and data["output_text"]:
        return str(data["output_text"]).strip()
    choices = data.get("choices", [])
    if isinstance(choices, list) and choices:
        first_choice = choices[0] if isinstance(choices[0], dict) else None
        if first_choice:
            message = first_choice.get("message")
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()
                if isinstance(content, list):
                    parts: List[str] = []
                    for item in content:
                        if not isinstance(item, dict):
                            continue
                        if item.get("type") in {"text", "output_text"}:
                            text = item.get("text", "")
                            if text:
                                parts.append(text)
                    if parts:
                        return "".join(parts).strip()
    output = data.get("output", [])
    parts: List[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "message":
            for content in item.get("content", []):
                if content.get("type") in {"output_text", "text"}:
                    text = content.get("text", "")
                    if text:
                        parts.append(text)
        elif item.get("type") in {"output_text", "text"}:
            text = item.get("text", "")
            if text:
                parts.append(text)
    return "\n".join(parts).strip()


def extract_usage(data: Dict[str, Any]) -> Dict[str, Optional[int]]:
    usage = data.get("usage")
    if not isinstance(usage, dict):
        return {"input_tokens": None, "output_tokens": None, "total_tokens": None}
    input_tokens = _safe_int(usage.get("input_tokens"))
    output_tokens = _safe_int(usage.get("output_tokens"))
    total_tokens = _safe_int(usage.get("total_tokens"))
    if total_tokens is None and input_tokens is not None and output_tokens is not None:
        total_tokens = input_tokens + output_tokens
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def _safe_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


async def _maybe_await(
    callback: Optional[Callable[[str], Awaitable[None] | None]],
    delta: str,
) -> None:
    if not callback:
        return
    result = callback(delta)
    if inspect.isawaitable(result):
        await result