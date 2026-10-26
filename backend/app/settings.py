from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from .ai_gateway_client import DEFAULT_TEXT_MODEL


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _default_compute_type() -> str:
    configured_device = os.getenv("STT_DEVICE", "cpu").strip().lower()
    return "float16" if configured_device == "cuda" else "int8"


def _env_str_or_none(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None:
        value = default
    if value is None:
        return None
    normalized = value.strip()
    return normalized if normalized else None


@dataclass(frozen=True)
class Settings:
    ws_host: str = os.getenv("WS_HOST", "127.0.0.1")
    ws_port: int = int(os.getenv("WS_PORT", "8765"))
    audio_source: str | None = os.getenv("AUDIO_SOURCE")
    audio_mic_source: str | None = os.getenv("AUDIO_MIC_SOURCE")
    audio_mode: str = os.getenv("AUDIO_MODE", "system")

    sample_rate: int = int(os.getenv("SAMPLE_RATE", "16000"))
    channels: int = int(os.getenv("CHANNELS", "1"))
    chunk_bytes: int = int(os.getenv("CHUNK_BYTES", "1600"))
    audio_level_interval_seconds: float = float(os.getenv("AUDIO_LEVEL_INTERVAL", "0.04"))
    audio_level_rms_reference: float = float(os.getenv("AUDIO_LEVEL_RMS_REF", "0.06"))
    audio_level_peak_reference: float = float(os.getenv("AUDIO_LEVEL_PEAK_REF", "0.22"))

    stt_model: str = os.getenv("STT_MODEL", "tiny")
    stt_device: str = os.getenv("STT_DEVICE", "cpu")
    stt_compute_type: str = os.getenv("STT_COMPUTE_TYPE", _default_compute_type())
    stt_vad_filter: bool = _env_bool("STT_VAD_FILTER", False)
    stt_language: str | None = _env_str_or_none("STT_LANGUAGE")
    stt_system_language: str | None = _env_str_or_none("STT_SYSTEM_LANGUAGE")
    stt_mic_language: str | None = _env_str_or_none("STT_MIC_LANGUAGE", "en")
    stt_min_decode_rms: float = float(os.getenv("STT_MIN_DECODE_RMS", "0.0010"))
    stt_no_vad_fallback_min_rms: float = float(os.getenv("STT_NO_VAD_FALLBACK_MIN_RMS", "0.0025"))

    partial_window_seconds: float = float(os.getenv("STT_PARTIAL_WINDOW", "2.0"))
    partial_interval_seconds: float = float(os.getenv("STT_PARTIAL_INTERVAL", "0.25"))
    final_window_seconds: float = float(os.getenv("STT_FINAL_WINDOW", "6.0"))
    final_interval_seconds: float = float(os.getenv("STT_FINAL_INTERVAL", "1.2"))
    final_lag_seconds: float = float(os.getenv("STT_FINAL_LAG", "0.35"))

    context_before_seconds: float = float(os.getenv("CONTEXT_BEFORE", "30"))
    context_after_seconds: float = float(os.getenv("CONTEXT_AFTER", "15"))

    # AppController loads local dotenv files before constructing Settings.
    # Read cloud settings at construction so those overrides are effective.
    ai_gateway_model: str = field(default_factory=lambda: os.getenv("VERCEL_MODEL", DEFAULT_TEXT_MODEL))
    ai_gateway_base_url: str = field(default_factory=lambda: os.getenv("AI_GATEWAY_BASE_URL", "https://ai-gateway.vercel.sh/v1"))
    ai_gateway_timeout_seconds: float = field(default_factory=lambda: float(os.getenv("AI_GATEWAY_TIMEOUT", "30")))
    detector_model: str = field(default_factory=lambda: os.getenv("DETECTOR_MODEL", "google/gemini-3.5-flash-lite"))
    detector_debounce_seconds: float = field(default_factory=lambda: float(os.getenv("DETECTOR_DEBOUNCE", "1.0")))
    rag_db_path: str = os.getenv(
        "RAG_DB_PATH",
        str(Path(__file__).resolve().parents[1] / "data" / "rag.sqlite"),
    )
    rag_embedding_model: str = field(default_factory=lambda: os.getenv("RAG_EMBEDDING_MODEL", "openai/text-embedding-3-small"))
    rag_top_k: int = int(os.getenv("RAG_TOP_K", "6"))
    rag_chunk_size_chars: int = int(os.getenv("RAG_CHUNK_SIZE_CHARS", "1200"))
    rag_chunk_overlap_chars: int = int(os.getenv("RAG_CHUNK_OVERLAP_CHARS", "180"))
