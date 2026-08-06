from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from time import time
from typing import Optional

import numpy as np
from dotenv import load_dotenv

from .audio_capture import AudioCapture, discover_audio_sources
from .benchmark_harness import BENCHMARK_HARNESS_PROMPT, build_benchmark_case_input
from .model_pricing import estimate_cost_usd
from .ai_gateway_client import AIGatewayClient, filter_supported_language_models, normalize_gateway_model_id, preset_by_id
from .rag_store import LocalRagStore
from .settings import Settings
from .stt import TRANSCRIPTION_LANGUAGE, Segment, StreamingTranscriber
from .transcript import SelectionRange, TranscriptStore
from .ws_server import WebSocketHub

logger = logging.getLogger(__name__)


@dataclass
class AppState:
    monitor_source: Optional[str] = None
    mic_source: Optional[str] = None
    audio_mode: str = "system"
    running: bool = False


class AppController:
    def __init__(self) -> None:
        backend_dir = Path(__file__).resolve().parents[1]
        load_dotenv(backend_dir / ".env", override=False)
        load_dotenv(backend_dir / ".env.local", override=True)
        self.settings = Settings()
        self.state = AppState(audio_mode=self._normalize_audio_mode(self.settings.audio_mode))
        self.transcript = TranscriptStore()
        self.hub = WebSocketHub(self.settings.ws_host, self.settings.ws_port, self._handle_message)
        self._capture: Optional[AudioCapture] = None
        self._transcriber: Optional[StreamingTranscriber] = None
        self._audio_task: Optional[asyncio.Task] = None
        self._stt_task: Optional[asyncio.Task] = None
        self._system_meter_capture: Optional[AudioCapture] = None
        self._mic_meter_capture: Optional[AudioCapture] = None
        self._system_meter_task: Optional[asyncio.Task] = None
        self._mic_meter_task: Optional[asyncio.Task] = None
        self._query_task: Optional[asyncio.Task] = None
        self._query_request_id: Optional[str] = None
        self._stop_event = asyncio.Event()
        self._ai_gateway_client: Optional[AIGatewayClient] = None
        self._rag_store = LocalRagStore(
            db_path=self.settings.rag_db_path,
            chunk_size_chars=self.settings.rag_chunk_size_chars,
            chunk_overlap_chars=self.settings.rag_chunk_overlap_chars,
        )
        self._active_stream_kind = "system"
        self._active_source_name: Optional[str] = None

    @staticmethod
    def _normalize_audio_mode(value: Optional[str]) -> str:
        mode = (value or "").strip().lower()
        if mode in {"mic", "microphone"}:
            return "mic"
        return "system"

    @staticmethod
    def _normalize_language(value: Optional[str]) -> Optional[str]:
        normalized = (value or "").strip().lower()
        return normalized or None

    def _language_for_mode(self, mode: str) -> Optional[str]:
        # Do not allow Whisper to auto-detect language: transient detections
        # can briefly emit non-English text in the live transcript.
        return TRANSCRIPTION_LANGUAGE

    @staticmethod
    def _resolve_source(
        current_value: Optional[str],
        available_sources: list[str],
        *fallbacks: Optional[str],
    ) -> Optional[str]:
        if current_value and current_value in available_sources:
            return current_value
        for candidate in fallbacks:
            if candidate and candidate in available_sources:
                return candidate
        return available_sources[0] if available_sources else None

    async def _restart_transcription_if_running(self) -> None:
        if not self.state.running:
            return
        await self.stop_transcription(emit_status=False)
        await self.start_transcription()

    async def start(self) -> None:
        logger.info("Starting backend WebSocket hub on %s:%s", self.settings.ws_host, self.settings.ws_port)
        await self.hub.start()
        await self._broadcast_audio_sources()
        await self._broadcast_rag_documents()
        await self.hub.broadcast("status", {"state": "ready", "details": "WebSocket ready"})

    async def stop(self) -> None:
        logger.info("Stopping backend controller")
        await self.cancel_query({})
        await self.stop_transcription()
        await self._stop_meter_loop("system")
        await self._stop_meter_loop("mic")
        await self.hub.stop()
        if self._ai_gateway_client:
            await self._ai_gateway_client.close()
        self._rag_store.close()

    async def _handle_message(self, data: dict) -> None:
        msg_type = data.get("type")
        if msg_type == "set_audio_source":
            self.state.monitor_source = data.get("sourceName")
            await self.hub.broadcast("status", {"state": "source_set", "details": self.state.monitor_source})
            if self.state.running and self._active_stream_kind == "system":
                await self._restart_transcription_if_running()
            await self._broadcast_audio_sources()
        elif msg_type == "set_mic_source":
            self.state.mic_source = data.get("sourceName")
            await self.hub.broadcast("status", {"state": "mic_source_set", "details": self.state.mic_source})
            if self.state.running and self._active_stream_kind == "mic":
                await self._restart_transcription_if_running()
            await self._broadcast_audio_sources()
        elif msg_type == "set_audio_mode":
            self.state.audio_mode = self._normalize_audio_mode(data.get("mode"))
            await self.hub.broadcast("status", {"state": "mode_set", "details": self.state.audio_mode})
            if self.state.running:
                await self._restart_transcription_if_running()
            await self._broadcast_audio_sources()
        elif msg_type == "get_audio_sources":
            await self._broadcast_audio_sources()
        elif msg_type == "get_models":
            await self._broadcast_models()
        elif msg_type == "get_model_details":
            await self._broadcast_model_details()
        elif msg_type == "start_transcription":
            await self.start_transcription()
        elif msg_type == "stop_transcription":
            await self.stop_transcription()
        elif msg_type == "run_query":
            await self.run_query(data)
        elif msg_type == "cancel_query":
            await self.cancel_query(data)
        elif msg_type == "run_benchmark":
            await self.run_benchmark(data)
        elif msg_type == "clear_transcript":
            self.transcript = TranscriptStore()
            await self.hub.broadcast("status", {"state": "cleared", "details": "Transcript cleared"})
        elif msg_type == "rag_ingest":
            await self.rag_ingest(data)
        elif msg_type == "rag_list":
            await self._broadcast_rag_documents()
        elif msg_type == "rag_clear":
            await self.rag_clear()

    async def _ensure_ai_gateway_client(self) -> Optional[AIGatewayClient]:
        api_key = os.getenv("AI_GATEWAY_API_KEY") or os.getenv("VERCEL_OIDC_TOKEN")
        if not api_key:
            return None
        if not self._ai_gateway_client:
            self._ai_gateway_client = AIGatewayClient(
                api_key=api_key,
                model=self.settings.ai_gateway_model,
                base_url=self.settings.ai_gateway_base_url,
                timeout_seconds=self.settings.ai_gateway_timeout_seconds,
            )
        return self._ai_gateway_client

    async def _embed_texts(self, texts: list[str]) -> list[list[float]]:
        client = await self._ensure_ai_gateway_client()
        if not client:
            raise RuntimeError("AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required for RAG embeddings.")
        return await client.embed_texts(texts, model=self.settings.rag_embedding_model)

    async def _broadcast_rag_documents(self) -> None:
        docs = self._rag_store.list_documents()
        await self.hub.broadcast(
            "rag_documents",
            {
                "documents": [
                    {
                        "docId": doc.doc_id,
                        "filePath": doc.file_path,
                        "title": doc.title,
                        "chunkCount": doc.chunk_count,
                        "updatedAt": doc.updated_at,
                    }
                    for doc in docs
                ]
            },
        )

    async def rag_ingest(self, data: dict) -> None:
        raw_paths = data.get("paths")
        if not isinstance(raw_paths, list):
            logger.warning("rag_ingest rejected: paths payload was not a list")
            await self.hub.broadcast("error", {"message": "rag_ingest requires a paths array."})
            return
        if not raw_paths:
            logger.warning("rag_ingest rejected: paths payload was empty")
            await self.hub.broadcast("error", {"message": "rag_ingest received an empty paths array."})
            return
        try:
            report = await self._rag_store.ingest_paths(raw_paths, embed_texts=self._embed_texts)
        except Exception as exc:
            logger.exception("RAG ingestion failed for paths=%s", raw_paths)
            await self.hub.broadcast("error", {"message": f"RAG ingestion failed: {exc}"})
            return
        await self.hub.broadcast(
            "rag_ingest_result",
            {
                "ingested": report.ingested,
                "updated": report.updated,
                "skipped": report.skipped,
                "failed": report.failed,
                "errors": report.errors,
            },
        )
        await self._broadcast_rag_documents()

    async def rag_clear(self) -> None:
        self._rag_store.clear()
        await self.hub.broadcast("rag_ingest_result", {"ingested": 0, "updated": 0, "skipped": 0, "failed": 0, "errors": []})
        await self._broadcast_rag_documents()

    async def _broadcast_audio_sources(self) -> None:
        sources = discover_audio_sources()
        selected_monitor_source = self._resolve_source(
            self.state.monitor_source,
            sources.monitor_sources,
            self.settings.audio_source,
            sources.preferred_monitor,
            sources.default_monitor,
        )
        selected_mic_source = self._resolve_source(
            self.state.mic_source,
            sources.mic_sources,
            self.settings.audio_mic_source,
            sources.preferred_mic,
            sources.default_source,
        )
        self.state.monitor_source = selected_monitor_source
        self.state.mic_source = selected_mic_source
        selected_mode = self._normalize_audio_mode(self.state.audio_mode or self.settings.audio_mode)
        if self.state.running:
            await self._ensure_meter_loop("system", selected_monitor_source)
            await self._ensure_meter_loop("mic", selected_mic_source)
        else:
            await self._stop_meter_loop("system")
            await self._stop_meter_loop("mic")
        await self.hub.broadcast(
            "audio_sources",
            {
                # Legacy monitor-only fields for backward compatibility.
                "sources": sources.monitor_sources,
                "defaultSource": sources.default_monitor,
                "selectedSource": selected_monitor_source,
                # New dual-source fields.
                "monitorSources": sources.monitor_sources,
                "defaultMonitorSource": sources.default_monitor,
                "selectedMonitorSource": selected_monitor_source,
                "micSources": sources.mic_sources,
                "defaultMicSource": sources.default_source,
                "selectedMicSource": selected_mic_source,
                "selectedMode": selected_mode,
            },
        )

    @staticmethod
    def _meter_attrs(stream_kind: str) -> tuple[str, str]:
        if stream_kind == "mic":
            return ("_mic_meter_capture", "_mic_meter_task")
        return ("_system_meter_capture", "_system_meter_task")

    @staticmethod
    def _compute_level(samples: np.ndarray, rms_reference: float, peak_reference: float) -> tuple[float, float, float]:
        rms = float(np.sqrt(np.mean(np.square(samples)))) if samples.size else 0.0
        peak = float(np.max(np.abs(samples))) if samples.size else 0.0
        rms_level = rms / rms_reference
        peak_level = peak / peak_reference
        level = min(1.0, max(0.0, max(rms_level, peak_level * 0.9)))
        return rms, peak, level

    async def _emit_audio_level(self, stream_kind: str, source_name: Optional[str], rms: float, peak: float, level: float, t: float) -> None:
        await self.hub.broadcast(
            "audio_level",
            {
                "rms": rms,
                "peak": peak,
                "level": level,
                "t": t,
                "streamKind": stream_kind,
                "sourceName": source_name,
            },
        )

    async def _ensure_meter_loop(self, stream_kind: str, source_name: Optional[str]) -> None:
        capture_attr, task_attr = self._meter_attrs(stream_kind)
        capture = getattr(self, capture_attr)
        task = getattr(self, task_attr)
        if (
            source_name
            and capture
            and task
            and not task.done()
            and capture.source_name == source_name
        ):
            return
        await self._stop_meter_loop(stream_kind)
        if not source_name:
            await self._emit_audio_level(
                stream_kind=stream_kind,
                source_name=None,
                rms=0.0,
                peak=0.0,
                level=0.0,
                t=asyncio.get_event_loop().time(),
            )
            return
        next_capture = AudioCapture(source_name, self.settings.chunk_bytes)
        try:
            await next_capture.start()
        except Exception as exc:
            await self.hub.broadcast("error", {"message": f"Audio meter ({stream_kind}) failed: {exc}"})
            return
        next_task = asyncio.create_task(self._meter_loop(stream_kind, next_capture))
        setattr(self, capture_attr, next_capture)
        setattr(self, task_attr, next_task)

    async def _stop_meter_loop(self, stream_kind: str) -> None:
        capture_attr, task_attr = self._meter_attrs(stream_kind)
        capture = getattr(self, capture_attr)
        task = getattr(self, task_attr)
        source_name = capture.source_name if capture else None
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if capture:
            await capture.stop()
        setattr(self, capture_attr, None)
        setattr(self, task_attr, None)
        await self._emit_audio_level(
            stream_kind=stream_kind,
            source_name=source_name,
            rms=0.0,
            peak=0.0,
            level=0.0,
            t=asyncio.get_event_loop().time(),
        )

    async def _meter_loop(self, stream_kind: str, capture: AudioCapture) -> None:
        loop = asyncio.get_event_loop()
        last_level_broadcast_at = 0.0
        last_level_sent = -1.0
        level_interval = max(0.01, self.settings.audio_level_interval_seconds)
        rms_reference = max(1e-4, self.settings.audio_level_rms_reference)
        peak_reference = max(1e-4, self.settings.audio_level_peak_reference)
        try:
            async for chunk in capture.stream():
                samples = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0
                now = loop.time()
                rms, peak, level = self._compute_level(
                    samples=samples,
                    rms_reference=rms_reference,
                    peak_reference=peak_reference,
                )
                level_jump = abs(level - last_level_sent)
                should_emit_level = (now - last_level_broadcast_at >= level_interval) or level_jump >= 0.08
                if not should_emit_level:
                    continue
                await self._emit_audio_level(
                    stream_kind=stream_kind,
                    source_name=capture.source_name,
                    rms=rms,
                    peak=peak,
                    level=level,
                    t=now,
                )
                last_level_broadcast_at = now
                last_level_sent = level
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self.hub.broadcast("error", {"message": f"Audio meter loop ({stream_kind}) error: {exc}"})

    async def _broadcast_models(self) -> None:
        client = await self._ensure_ai_gateway_client()
        normalized_default_model = normalize_gateway_model_id(self.settings.ai_gateway_model) or self.settings.ai_gateway_model
        if not client:
            await self.hub.broadcast("models_list", {"models": [], "selectedModel": normalized_default_model})
            return
        try:
            models = await client.list_models()
        except Exception:
            models = [normalized_default_model]
        if normalized_default_model and normalized_default_model not in models:
            models.insert(0, normalized_default_model)
        await self.hub.broadcast("models_list", {"models": models, "selectedModel": normalized_default_model})

    async def _broadcast_model_details(self) -> None:
        client = await self._ensure_ai_gateway_client()
        if not client:
            await self.hub.broadcast("models_details", {"models": []})
            return
        try:
            models = await client.list_model_details()
        except Exception:
            models = []
        await self.hub.broadcast("models_details", {"models": models})

    async def start_transcription(self) -> None:
        if self.state.running:
            return
        self.state.running = True
        sources = discover_audio_sources()
        mode = self._normalize_audio_mode(self.state.audio_mode or self.settings.audio_mode)
        monitor_source = self._resolve_source(
            self.state.monitor_source,
            sources.monitor_sources,
            self.settings.audio_source,
            sources.preferred_monitor,
            sources.default_monitor,
        )
        mic_source = self._resolve_source(
            self.state.mic_source,
            sources.mic_sources,
            self.settings.audio_mic_source,
            sources.preferred_mic,
            sources.default_source,
        )
        self.state.monitor_source = monitor_source
        self.state.mic_source = mic_source
        chosen = mic_source if mode == "mic" else monitor_source
        if not chosen:
            available_sources = sources.mic_sources if mode == "mic" else sources.monitor_sources
            kind_label = "microphone" if mode == "mic" else "monitor"
            await self.hub.broadcast(
                "error",
                {
                    "message": (
                        f"No {kind_label} sources found. Ensure Pulse/PipeWire is running, "
                        "or set source manually."
                    ),
                    "sources": available_sources,
                },
            )
            self.state.running = False
            return
        self.state.audio_mode = mode
        language_hint = self._language_for_mode(mode)
        self._capture = AudioCapture(chosen, self.settings.chunk_bytes)
        try:
            await self._capture.start()
        except Exception as exc:
            self.state.running = False
            await self.hub.broadcast("error", {"message": str(exc)})
            return
        if not self._transcriber:
            self._transcriber = StreamingTranscriber(
                sample_rate=self.settings.sample_rate,
                model_name=self.settings.stt_model,
                device=self.settings.stt_device,
                compute_type=self.settings.stt_compute_type,
                vad_filter=self.settings.stt_vad_filter,
                language=language_hint,
                min_decode_rms=self.settings.stt_min_decode_rms,
                no_vad_fallback_min_rms=self.settings.stt_no_vad_fallback_min_rms,
                partial_window=self.settings.partial_window_seconds,
                partial_interval=self.settings.partial_interval_seconds,
                final_window=self.settings.final_window_seconds,
                final_interval=self.settings.final_interval_seconds,
                final_lag=self.settings.final_lag_seconds,
                on_live=self._on_live_text,
                on_segment=self._on_segment,
            )
            try:
                await self._transcriber.load_model()
            except Exception as exc:
                if self._capture:
                    await self._capture.stop()
                    self._capture = None
                self.state.running = False
                await self.hub.broadcast("error", {"message": f"Failed to load model: {exc}"})
                return
        self._transcriber.set_language(language_hint)
        self._transcriber.reset_state()
        self._active_stream_kind = mode
        self._active_source_name = chosen
        self._stop_event.clear()
        self._audio_task = asyncio.create_task(self._audio_loop())
        self._stt_task = asyncio.create_task(self._stt_loop())
        source_kind = "microphone" if mode == "mic" else "system audio"
        language_details = language_hint or "auto"
        await self.hub.broadcast(
            "status",
            {"state": "transcribing", "details": f"Using {source_kind}: {chosen} (language: {language_details})"},
        )
        await self._broadcast_audio_sources()

    async def stop_transcription(self, emit_status: bool = True) -> None:
        if not self.state.running:
            return
        self._stop_event.set()
        tasks = [task for task in (self._audio_task, self._stt_task) if task]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        if self._capture:
            await self._capture.stop()
        self._audio_task = None
        self._stt_task = None
        self._capture = None
        self._active_source_name = None
        self.state.running = False
        await self._stop_meter_loop("system")
        await self._stop_meter_loop("mic")
        if emit_status:
            await self.hub.broadcast("status", {"state": "stopped", "details": "Transcription stopped"})

    async def _audio_loop(self) -> None:
        assert self._capture is not None
        assert self._transcriber is not None
        try:
            async for chunk in self._capture.stream():
                samples = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0
                await self._transcriber.add_audio(samples)
        except Exception as exc:
            await self.hub.broadcast("error", {"message": f"Audio capture error: {exc}"})

    async def _stt_loop(self) -> None:
        assert self._transcriber is not None
        try:
            await self._transcriber.run(self._stop_event)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await self.hub.broadcast("error", {"message": f"STT processing error: {exc}"})

    async def _on_live_text(self, text: str, timestamp: float) -> None:
        if not self.state.running:
            return
        await self.hub.broadcast(
            "transcript_live",
            {
                "text": text,
                "t": timestamp,
                "streamKind": self._active_stream_kind,
                "sourceName": self._active_source_name,
            },
        )

    async def _on_segment(self, segment: Segment) -> None:
        if not self.state.running:
            return
        segment.source_kind = self._active_stream_kind
        segment.source_name = self._active_source_name
        if not self.transcript.add_segment(segment):
            return
        await self.hub.broadcast("transcript_segment", {"segment": segment.__dict__})

    async def run_query(self, data: dict) -> None:
        request_id = str(data.get("requestId") or "").strip() or f"query_{int(time() * 1000)}"
        if self._query_task and not self._query_task.done():
            await self.cancel_query({"requestId": self._query_request_id or request_id})
        payload = {**data, "requestId": request_id}
        logger.info(
            "Queued query %s preset=%s model=%s selected_chars=%s",
            request_id,
            payload.get("presetId") or "custom",
            (payload.get("model") or self.settings.ai_gateway_model),
            len(str(payload.get("selectedText") or "")),
        )
        self._query_request_id = request_id
        self._query_task = asyncio.create_task(self._run_query_worker(payload))

    async def cancel_query(self, data: dict) -> None:
        task = self._query_task
        request_id = str(data.get("requestId") or self._query_request_id or "").strip()
        if not task or task.done():
            if request_id:
                await self.hub.broadcast("query_state", {"running": False, "requestId": request_id, "cancelled": True})
            return
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    async def _run_query_worker(self, data: dict) -> None:
        request_id = str(data.get("requestId") or "").strip()
        query_started = False
        try:
            selected_text = (data.get("selectedText") or "").strip()
            if not selected_text:
                logger.warning("Query %s rejected: no selected text provided", request_id)
                await self.hub.broadcast("error", {"message": "No selected text provided."})
                return
            preset_id = data.get("presetId")
            custom_instruction = (data.get("customInstruction") or "").strip()
            instruction = custom_instruction
            if preset_id:
                preset = preset_by_id(preset_id)
                if not preset:
                    logger.warning("Query %s rejected: unknown preset %s", request_id, preset_id)
                    await self.hub.broadcast("error", {"message": f"Unknown preset {preset_id}."})
                    return
                instruction = preset.instruction
            if not instruction:
                logger.warning("Query %s rejected: instruction missing", request_id)
                await self.hub.broadcast("error", {"message": "Instruction missing."})
                return
            requested_model = normalize_gateway_model_id((data.get("model") or "").strip()) or normalize_gateway_model_id(self.settings.ai_gateway_model) or self.settings.ai_gateway_model
            include_screenshot = bool(data.get("includeScreenshot"))
            screenshot_data_url = (data.get("screenshotDataUrl") or "").strip() or None
            if screenshot_data_url and not screenshot_data_url.startswith("data:image/"):
                screenshot_data_url = None
            if not include_screenshot:
                screenshot_data_url = None

            selection_range = None
            selection_payload = data.get("selectionTimeRange")
            if selection_payload and "start" in selection_payload and "end" in selection_payload:
                selection_range = SelectionRange(
                    start=float(selection_payload["start"]),
                    end=float(selection_payload["end"]),
                )

            context_text = self.transcript.build_context(
                selection_range,
                before_seconds=self.settings.context_before_seconds,
                after_seconds=self.settings.context_after_seconds,
            )
            rag_query_text = "\n".join(
                item for item in [selected_text, custom_instruction, context_text] if item
            ).strip()
            rag_chunks = []
            if rag_query_text:
                try:
                    rag_chunks = await self._rag_store.search(
                        rag_query_text,
                        top_k=self.settings.rag_top_k,
                        embed_texts=self._embed_texts,
                    )
                except Exception as exc:
                    logger.warning("Query %s RAG retrieval skipped: %s", request_id, exc)
                    await self.hub.broadcast("error", {"message": f"RAG retrieval skipped: {exc}"})
                    rag_chunks = []
            rag_context = "\n\n".join(
                f"[{index + 1}] {chunk.title} (score={chunk.score:.3f})\n{chunk.text}"
                for index, chunk in enumerate(rag_chunks)
            )
            if rag_context:
                context_text = (
                    f"{context_text}\n\n"
                    f"Document context (retrieved from local RAG store):\n{rag_context}"
                ).strip()

            client = await self._ensure_ai_gateway_client()
            if not client:
                logger.warning("Query %s rejected: AI_GATEWAY_API_KEY missing", request_id)
                await self.hub.broadcast("error", {"message": "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required."})
                return

            query_started = True
            logger.info("Query %s started", request_id)
            await self.hub.broadcast("query_state", {"running": True, "requestId": request_id})
            try:
                result = await client.run_query(
                    instruction=instruction,
                    selected_text=selected_text,
                    context_text=context_text,
                    model=requested_model,
                    screenshot_data_url=screenshot_data_url,
                    stream=True,
                    on_stream_delta=lambda delta: self.hub.broadcast(
                        "query_chunk",
                        {"requestId": request_id, "delta": delta},
                    ),
                )
            except Exception as exc:
                logger.exception("AI Gateway request failed for query %s", request_id)
                await self.hub.broadcast("query_state", {"running": False, "requestId": request_id})
                await self.hub.broadcast("error", {"message": f"AI Gateway request failed: {exc}"})
                return

            await self.hub.broadcast("query_state", {"running": False, "requestId": request_id})
            logger.info(
                "Query %s completed latency_ms=%.1f tokens_in=%s tokens_out=%s rag_chunks=%s screenshot=%s",
                request_id,
                result.latency_ms,
                result.input_tokens,
                result.output_tokens,
                len(rag_chunks),
                bool(screenshot_data_url),
            )
            await self.hub.broadcast(
                "query_response",
                {
                    "requestId": request_id,
                    "text": result.text,
                    "latencyMs": result.latency_ms,
                    "model": requested_model,
                    "screenshotUsed": bool(screenshot_data_url),
                    "ragChunksUsed": len(rag_chunks),
                    "ragSources": sorted({chunk.file_path for chunk in rag_chunks}),
                },
            )
        except asyncio.CancelledError:
            if query_started:
                logger.info("Query %s cancelled", request_id)
                await self.hub.broadcast("query_state", {"running": False, "requestId": request_id, "cancelled": True})
            return
        finally:
            if self._query_task is asyncio.current_task():
                self._query_task = None
                self._query_request_id = None


    @staticmethod
    def _normalize_benchmark_tests(data: dict) -> list[dict]:
        raw_tests = data.get("tests")
        normalized: list[dict] = []
        if isinstance(raw_tests, list):
            for index, item in enumerate(raw_tests, start=1):
                if not isinstance(item, dict):
                    continue
                test_id = str(item.get("testId") or f"test_{index}").strip()
                user_prompt = str(item.get("userPrompt") or "").strip()
                image_ref = str(item.get("imageRef") or "").strip() or None
                image_data_url = str(item.get("imageDataUrl") or "").strip() or None
                if image_data_url and not image_data_url.startswith("data:image/"):
                    image_data_url = None
                if not user_prompt:
                    continue
                normalized.append(
                    {
                        "testId": test_id,
                        "userPrompt": user_prompt,
                        "imageRef": image_ref,
                        "imageDataUrl": image_data_url,
                    }
                )

        # Backward compatibility for the old single-input benchmark payload.
        if not normalized:
            selected_text = str(data.get("selectedText") or "").strip()
            if selected_text:
                normalized = [
                    {
                        "testId": "test_1",
                        "userPrompt": selected_text,
                        "imageRef": None,
                        "imageDataUrl": None,
                    }
                ]
        if not normalized:
            return []

        # Ensure unique test ids in case callers submit duplicates.
        seen_ids: set[str] = set()
        for test in normalized:
            base_id = test["testId"]
            candidate = base_id
            suffix = 2
            while candidate in seen_ids:
                candidate = f"{base_id}_{suffix}"
                suffix += 1
            test["testId"] = candidate
            seen_ids.add(candidate)
        return normalized

    async def run_benchmark(self, data: dict) -> None:
        benchmark_id = str(data.get("benchmarkId") or "")
        models = [str(model).strip() for model in data.get("models", []) if str(model).strip()]
        instruction = str(data.get("instruction") or "").strip() or BENCHMARK_HARNESS_PROMPT
        tests = self._normalize_benchmark_tests(data)
        repeats_raw = data.get("repeats", 1)
        try:
            repeats = int(repeats_raw)
        except (TypeError, ValueError):
            repeats = 1
        repeats = max(1, min(repeats, 10))

        if not benchmark_id:
            await self.hub.broadcast("error", {"message": "Benchmark id is required."})
            return
        if not models:
            await self.hub.broadcast("error", {"message": "Select at least one model for benchmark."})
            return
        if not instruction:
            await self.hub.broadcast("error", {"message": "Benchmark instruction is required."})
            return
        if not tests:
            await self.hub.broadcast("error", {"message": "At least one benchmark test is required."})
            return

        client = await self._ensure_ai_gateway_client()
        if not client:
            await self.hub.broadcast("error", {"message": "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required."})
            return

        total = len(tests) * len(models) * repeats
        completed = 0
        success_count = 0
        failure_count = 0
        aggregate: dict[tuple[str, str], dict] = {}
        attempts: list[dict] = []

        for test in tests:
            test_id = test["testId"]
            user_prompt = test["userPrompt"]
            image_data_url = test["imageDataUrl"]
            image_ref = test["imageRef"]
            for model in models:
                key = (test_id, model)
                row = aggregate.setdefault(
                    key,
                    {
                        "testId": test_id,
                        "model": model,
                        "runs": 0,
                        "failures": 0,
                        "jsonValidRuns": 0,
                        "latencies": [],
                        "firstTokenLatencies": [],
                        "inputTokens": 0,
                        "outputTokens": 0,
                        "costUsd": 0.0,
                        "costKnownRuns": 0,
                        "qualityScores": [],
                        "qualityPassRuns": 0,
                        "imageRuns": 0,
                        "imageWorkedRuns": 0,
                    },
                )
                for run_index in range(1, repeats + 1):
                    try:
                        selected_text = build_benchmark_case_input(
                            test_id=test_id,
                            user_prompt=user_prompt,
                            image_ref_id=image_ref if image_data_url else None,
                        )
                        result = await self._ai_gateway_client.run_query(
                            instruction=instruction,
                            selected_text=selected_text,
                            context_text="",
                            model=model,
                            screenshot_data_url=image_data_url,
                            stream=True,
                        )
                        row["runs"] += 1
                        row["latencies"].append(result.latency_ms)
                        if result.first_token_latency_ms is not None:
                            row["firstTokenLatencies"].append(result.first_token_latency_ms)
                        if result.input_tokens is not None:
                            row["inputTokens"] += result.input_tokens
                        if result.output_tokens is not None:
                            row["outputTokens"] += result.output_tokens
                        response_text = result.text.strip()
                        json_valid = False
                        parse_error = None
                        parsed_json: Optional[dict] = None
                        try:
                            parsed = json.loads(response_text)
                            json_valid = isinstance(parsed, dict)
                            if json_valid:
                                parsed_json = parsed
                            if not json_valid:
                                parse_error = "Response was valid JSON but not an object."
                        except json.JSONDecodeError as exc:
                            parse_error = f"{exc.msg} (pos {exc.pos})"
                        if json_valid:
                            row["jsonValidRuns"] += 1
                        quality_report = self._evaluate_quality(
                            parsed_json=parsed_json,
                            user_prompt=user_prompt,
                            image_required=bool(image_data_url),
                        )
                        row["qualityScores"].append(quality_report["score"])
                        if quality_report["passed"]:
                            row["qualityPassRuns"] += 1
                        image_claim = quality_report["imageCapabilityClaim"]
                        image_worked = quality_report["imageWorked"]
                        if image_data_url:
                            row["imageRuns"] += 1
                            if image_worked:
                                row["imageWorkedRuns"] += 1
                        estimated_cost_usd = estimate_cost_usd(
                            model=model,
                            input_tokens=result.input_tokens,
                            output_tokens=result.output_tokens,
                        )
                        if estimated_cost_usd is not None:
                            row["costUsd"] += estimated_cost_usd
                            row["costKnownRuns"] += 1
                        attempts.append(
                            {
                                "testId": test_id,
                                "model": model,
                                "run": run_index,
                                "success": True,
                                "jsonValid": json_valid,
                                "timeToFirstTokenMs": result.first_token_latency_ms,
                                "ttcMs": result.latency_ms,
                                "latencyMs": result.latency_ms,
                                "inputTokens": result.input_tokens,
                                "outputTokens": result.output_tokens,
                                "totalTokens": result.total_tokens,
                                "costUsd": estimated_cost_usd,
                                "qualityScore": quality_report["score"],
                                "qualityPassed": quality_report["passed"],
                                "qualityChecks": quality_report["checks"],
                                "imageCapabilityClaim": image_claim,
                                "imageWorked": image_worked,
                                "responsePreview": response_text[:500],
                                "error": parse_error,
                                "imageRef": image_ref,
                            }
                        )
                    except Exception as exc:
                        row["failures"] += 1
                        failure_count += 1
                        attempts.append(
                            {
                                "testId": test_id,
                                "model": model,
                                "run": run_index,
                                "success": False,
                                "jsonValid": False,
                                "timeToFirstTokenMs": None,
                                "ttcMs": None,
                                "latencyMs": None,
                                "inputTokens": None,
                                "outputTokens": None,
                                "totalTokens": None,
                                "costUsd": None,
                                "qualityScore": 0.0,
                                "qualityPassed": False,
                                "qualityChecks": [],
                                "imageCapabilityClaim": None,
                                "imageWorked": None,
                                "responsePreview": "",
                                "error": str(exc),
                                "imageRef": image_ref,
                            }
                        )
                    else:
                        success_count += 1
                    await self.hub.broadcast(
                        "benchmark_log",
                        {
                            "benchmarkId": benchmark_id,
                            **attempts[-1],
                        },
                    )
                    completed += 1
                    await self.hub.broadcast(
                        "benchmark_progress",
                        {
                            "benchmarkId": benchmark_id,
                            "completed": completed,
                            "total": total,
                            "testId": test_id,
                            "model": model,
                            "run": run_index,
                            "successes": success_count,
                            "failures": failure_count,
                        },
                    )

        rows: list[dict] = []
        for row in aggregate.values():
            latencies = row["latencies"]
            avg_first_token_ms = mean(row["firstTokenLatencies"]) if row["firstTokenLatencies"] else None
            avg_ttc_ms = mean(latencies) if latencies else None
            min_ttc_ms = min(latencies) if latencies else None
            max_ttc_ms = max(latencies) if latencies else None
            aggregate_score = self._aggregate_benchmark_score(
                runs=row["runs"],
                failures=row["failures"],
                json_valid_runs=row["jsonValidRuns"],
                avg_ttc_ms=avg_ttc_ms,
                avg_first_token_ms=avg_first_token_ms,
                avg_quality_score=mean(row["qualityScores"]) if row["qualityScores"] else None,
                image_runs=row["imageRuns"],
                image_worked_runs=row["imageWorkedRuns"],
            )
            rows.append(
                {
                    "testId": row["testId"],
                    "model": row["model"],
                    "runs": row["runs"],
                    "failures": row["failures"],
                    "jsonValidRuns": row["jsonValidRuns"],
                    "avgFirstTokenMs": avg_first_token_ms,
                    "avgTtcMs": avg_ttc_ms,
                    "minTtcMs": min_ttc_ms,
                    "maxTtcMs": max_ttc_ms,
                    "avgLatencyMs": avg_ttc_ms,
                    "minLatencyMs": min_ttc_ms,
                    "maxLatencyMs": max_ttc_ms,
                    "totalInputTokens": row["inputTokens"],
                    "totalOutputTokens": row["outputTokens"],
                    "totalCostUsd": row["costUsd"] if row["costKnownRuns"] > 0 else None,
                    "costKnownRuns": row["costKnownRuns"],
                    "avgQualityScore": mean(row["qualityScores"]) if row["qualityScores"] else None,
                    "qualityPassRuns": row["qualityPassRuns"],
                    "imageRuns": row["imageRuns"],
                    "imageWorkedRuns": row["imageWorkedRuns"],
                    "aggregateScore": aggregate_score,
                }
            )

        rows.sort(
            key=lambda row: (
                row["testId"],
                row["avgLatencyMs"] if row["avgLatencyMs"] is not None else float("inf"),
            )
        )
        await self.hub.broadcast(
            "benchmark_complete",
            {
                "benchmarkId": benchmark_id,
                "createdAt": int(time()),
                "instruction": instruction,
                "tests": [
                    {
                        "testId": test["testId"],
                        "userPrompt": test["userPrompt"],
                        "imageRef": test["imageRef"],
                        "hasImage": bool(test["imageDataUrl"]),
                    }
                    for test in tests
                ],
                "results": rows,
                "attempts": attempts,
            },
        )

    @staticmethod
    def _evaluate_quality(parsed_json: Optional[dict], user_prompt: str, image_required: bool) -> dict:
        checks: list[dict] = []
        if not parsed_json:
            checks.append({"name": "valid_json_object", "passed": False, "details": "Response is not a JSON object."})
            return {
                "score": 0.0,
                "passed": False,
                "checks": checks,
                "imageCapabilityClaim": None,
                "imageWorked": None,
            }

        required_keys = {
            "test_id",
            "image_used",
            "image_capability_claim",
            "answer",
            "confidence",
            "self_check",
            "failure_modes",
        }
        missing = [key for key in sorted(required_keys) if key not in parsed_json]
        checks.append(
            {
                "name": "required_keys",
                "passed": len(missing) == 0,
                "details": "all keys present" if not missing else f"missing: {', '.join(missing)}",
            }
        )

        answer = str(parsed_json.get("answer") or "").strip()
        checks.append(
            {
                "name": "answer_non_empty",
                "passed": bool(answer),
                "details": "answer present" if answer else "answer empty",
            }
        )

        image_claim_raw = str(parsed_json.get("image_capability_claim") or "").strip().lower() or None
        image_worked = image_claim_raw == "worked" if image_required else None
        if image_required:
            checks.append(
                {
                    "name": "image_capability_worked",
                    "passed": bool(image_worked),
                    "details": f"claim={image_claim_raw or 'missing'}",
                }
            )

        identifiers_required = "identifier" in user_prompt.lower()
        if identifiers_required:
            matches = re.findall(r"\b[A-Z][A-Z0-9_\-]{2,}\b", answer)
            checks.append(
                {
                    "name": "mentions_2_identifiers",
                    "passed": len(matches) >= 2,
                    "details": f"found={len(matches)}",
                }
            )

        passed_count = sum(1 for item in checks if item["passed"])
        score = passed_count / len(checks) if checks else 0.0
        return {
            "score": score,
            "passed": passed_count == len(checks),
            "checks": checks,
            "imageCapabilityClaim": image_claim_raw,
            "imageWorked": image_worked,
        }

    @staticmethod
    def _speed_score_from_ms(value_ms: Optional[float], pivot_ms: float) -> float:
        """Convert a latency metric into [0,1], where lower latency scores higher."""
        if value_ms is None or value_ms <= 0:
            return 0.0
        return 1.0 / (1.0 + (value_ms / pivot_ms))

    @classmethod
    def _aggregate_benchmark_score(
        cls,
        runs: int,
        failures: int,
        json_valid_runs: int,
        avg_ttc_ms: Optional[float],
        avg_first_token_ms: Optional[float],
        avg_quality_score: Optional[float],
        image_runs: int,
        image_worked_runs: int,
    ) -> float:
        """
        Produce a speed-first aggregate score (0-100).
        Weights:
        - 82% speed (TTC + TTFT)
        - 13% reliability (success + JSON validity)
        - 5% quality/image behavior
        """
        total_attempts = runs + failures
        success_rate = (runs / total_attempts) if total_attempts > 0 else 0.0
        json_rate = (json_valid_runs / runs) if runs > 0 else 0.0
        quality_rate = max(0.0, min(1.0, avg_quality_score if avg_quality_score is not None else 0.0))
        image_rate = (image_worked_runs / image_runs) if image_runs > 0 else 1.0

        # Speed is the primary objective: tighter pivots and heavier TTC weighting.
        ttc_score = cls._speed_score_from_ms(avg_ttc_ms, pivot_ms=900.0)
        ttft_score = cls._speed_score_from_ms(avg_first_token_ms, pivot_ms=260.0)
        speed_score = (0.84 * ttc_score) + (0.16 * ttft_score)

        reliability_score = (0.72 * success_rate) + (0.28 * json_rate)
        quality_score = (0.75 * quality_rate) + (0.25 * image_rate)

        raw_score = (0.82 * speed_score) + (0.13 * reliability_score) + (0.05 * quality_score)
        # Hard penalty on unstable models so fast failures cannot rank high.
        penalty = 0.20 + (0.80 * success_rate)
        final = max(0.0, min(1.0, raw_score * penalty))
        return round(final * 100.0, 2)


async def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    controller = AppController()
    await controller.start()
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        await controller.stop()


if __name__ == "__main__":
    asyncio.run(main())
