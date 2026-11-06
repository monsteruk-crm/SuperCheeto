from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional


@dataclass(frozen=True)
class ModelPricing:
    input_usd_per_1m: float
    output_usd_per_1m: float


# Source: https://openai.com/api/pricing/ (captured in this repo on 2026-02-22).
# Source: Vercel AI Gateway model catalog (2026-08-06) for Gateway slugs.
# Override/extend via AI_GATEWAY_MODEL_PRICING_JSON for newer or custom model ids.
# Note: uses base-tier pricing; tiered or newly added models may require overrides.
DEFAULT_MODEL_PRICING: dict[str, ModelPricing] = {
    "openai/gpt-5.6-sol": ModelPricing(input_usd_per_1m=5.0, output_usd_per_1m=30.0),
    "openai/gpt-5.2": ModelPricing(input_usd_per_1m=1.75, output_usd_per_1m=14.0),
    "openai/gpt-5.2-pro": ModelPricing(input_usd_per_1m=21.0, output_usd_per_1m=168.0),
    "openai/gpt-5-mini": ModelPricing(input_usd_per_1m=0.25, output_usd_per_1m=2.0),
    "openai/gpt-5": ModelPricing(input_usd_per_1m=1.25, output_usd_per_1m=10.0),
    "openai/gpt-5-pro": ModelPricing(input_usd_per_1m=15.0, output_usd_per_1m=120.0),
    "openai/gpt-5-nano": ModelPricing(input_usd_per_1m=0.05, output_usd_per_1m=0.4),
}


def _normalize_model_id(model: str) -> str:
    normalized = (model or "").strip().lower()
    # Strip dated suffixes like gpt-4.1-2025-04-14.
    normalized = re.sub(r"-20\d{2}-\d{2}-\d{2}$", "", normalized)
    return normalized


@lru_cache(maxsize=1)
def _load_pricing_overrides() -> dict[str, ModelPricing]:
    raw = (os.getenv("AI_GATEWAY_MODEL_PRICING_JSON") or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}

    parsed: dict[str, ModelPricing] = {}
    for model_id, row in data.items():
        if not isinstance(model_id, str) or not isinstance(row, dict):
            continue
        input_price = row.get("input")
        output_price = row.get("output")
        try:
            input_value = float(input_price)
            output_value = float(output_price)
        except (TypeError, ValueError):
            continue
        if input_value < 0 or output_value < 0:
            continue
        parsed[_normalize_model_id(model_id)] = ModelPricing(
            input_usd_per_1m=input_value,
            output_usd_per_1m=output_value,
        )
    return parsed


def get_model_pricing(model: str) -> Optional[ModelPricing]:
    model_id = _normalize_model_id(model)
    if not model_id:
        return None
    overrides = _load_pricing_overrides()
    if model_id in overrides:
        return overrides[model_id]
    if model_id in DEFAULT_MODEL_PRICING:
        return DEFAULT_MODEL_PRICING[model_id]
    # Support bare OpenAI IDs by treating them as openai/<id>
    if "/" not in model_id:
        prefixed = f"openai/{model_id}"
        if prefixed in overrides:
            return overrides[prefixed]
        if prefixed in DEFAULT_MODEL_PRICING:
            return DEFAULT_MODEL_PRICING[prefixed]
    return None


def estimate_cost_usd(model: str, input_tokens: Optional[int], output_tokens: Optional[int]) -> Optional[float]:
    if input_tokens is None or output_tokens is None:
        return None
    pricing = get_model_pricing(model)
    if not pricing:
        return None
    input_cost = (input_tokens / 1_000_000.0) * pricing.input_usd_per_1m
    output_cost = (output_tokens / 1_000_000.0) * pricing.output_usd_per_1m
    return input_cost + output_cost
