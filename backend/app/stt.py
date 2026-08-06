from __future__ import annotations

import asyncio
import re
from collections import deque
from dataclasses import dataclass
from typing import Callable, Deque, List, Optional

import numpy as np
from faster_whisper import WhisperModel


# This application is intended to transcribe English speech. Keeping the
# fallback here prevents Whisper from auto-detecting another language when a
# caller omits a language hint.
TRANSCRIPTION_LANGUAGE = "en"


@dataclass
class Segment:
    id: int
    t0: float
    t1: float
    text: str
    is_final: bool = True
    source_kind: str = "system"
    source_name: str | None = None


class AudioBuffer:
    def __init__(self, sample_rate: int, max_seconds: float) -> None:
        self.sample_rate = sample_rate
        self.max_samples = int(max_seconds * sample_rate)
        self._chunks: Deque[np.ndarray] = deque()
        self._samples_in_buffer = 0
        self._total_samples_seen = 0

    def append(self, samples: np.ndarray) -> None:
        if samples.size == 0:
            return
        self._chunks.append(samples)
        self._samples_in_buffer += samples.size
        self._total_samples_seen += samples.size
        while self._samples_in_buffer > self.max_samples and self._chunks:
            removed = self._chunks.popleft()
            self._samples_in_buffer -= removed.size

    def get_last_seconds(self, seconds: float) -> np.ndarray:
        if self._samples_in_buffer == 0:
            return np.array([], dtype=np.float32)
        need_samples = min(int(seconds * self.sample_rate), self._samples_in_buffer)
        if need_samples <= 0:
            return np.array([], dtype=np.float32)
        collected: List[np.ndarray] = []
        remaining = need_samples
        for chunk in reversed(self._chunks):
            if remaining <= 0:
                break
            if chunk.size <= remaining:
                collected.append(chunk)
                remaining -= chunk.size
            else:
                collected.append(chunk[-remaining:])
                remaining = 0
        if not collected:
            return np.array([], dtype=np.float32)
        return np.concatenate(list(reversed(collected)))

    @property
    def current_time(self) -> float:
        return self._total_samples_seen / self.sample_rate

    @property
    def buffered_seconds(self) -> float:
        return self._samples_in_buffer / self.sample_rate


class StreamingTranscriber:
    def __init__(
        self,
        sample_rate: int,
        model_name: str,
        device: str,
        compute_type: str,
        vad_filter: bool,
        language: Optional[str],
        min_decode_rms: float,
        no_vad_fallback_min_rms: float,
        partial_window: float,
        partial_interval: float,
        final_window: float,
        final_interval: float,
        final_lag: float,
        on_live: Callable[[str, float], asyncio.Future],
        on_segment: Callable[[Segment], asyncio.Future],
    ) -> None:
        self.sample_rate = sample_rate
        self.model_name = model_name
        self.device = device
        self.compute_type = compute_type
        self.vad_filter = vad_filter
        self.language = self._normalize_language(language) or TRANSCRIPTION_LANGUAGE
        self.min_decode_rms = max(0.0, min_decode_rms)
        self.no_vad_fallback_min_rms = max(0.0, no_vad_fallback_min_rms)
        self.partial_window = partial_window
        self.partial_interval = partial_interval
        self.final_window = final_window
        self.final_interval = final_interval
        self.final_lag = final_lag
        self.on_live = on_live
        self.on_segment = on_segment

        self._max_buffer_seconds = max(partial_window, final_window) + 5
        self._buffer = AudioBuffer(sample_rate, max_seconds=self._max_buffer_seconds)
        self._model: Optional[WhisperModel] = None
        self._running = False
        self._segment_id = 0
        self._last_final_time = 0.0
        self._last_live_text = ""
        self._last_final_words: List[str] = []
        self._lock = asyncio.Lock()

    @staticmethod
    def _normalize_language(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip().lower()
        return normalized or None

    def set_language(self, language: Optional[str]) -> None:
        self.language = self._normalize_language(language) or TRANSCRIPTION_LANGUAGE

    @staticmethod
    def _audio_rms(audio: np.ndarray) -> float:
        if audio.size == 0:
            return 0.0
        return float(np.sqrt(np.mean(np.square(audio))))

    @staticmethod
    def _normalized_words(text: str) -> List[str]:
        return [match.group(0).lower() for match in re.finditer(r"[A-Za-z0-9']+", text)]

    @staticmethod
    def _word_start_offset(text: str, word_count: int) -> int:
        if word_count <= 0:
            return 0
        seen = 0
        for match in re.finditer(r"[A-Za-z0-9']+", text):
            if seen == word_count:
                return match.start()
            seen += 1
        return len(text)

    def _new_final_text(self, text: str) -> str:
        normalized_words = self._normalized_words(text)
        if not normalized_words:
            return ""
        if len(normalized_words) < 3:
            return text.strip()

        previous_words = self._last_final_words
        overlap = 0
        max_overlap = min(len(previous_words), len(normalized_words))
        for candidate in range(max_overlap, 0, -1):
            if previous_words[-candidate:] == normalized_words[:candidate]:
                overlap = candidate
                break

        if overlap >= len(normalized_words):
            return ""

        start_offset = self._word_start_offset(text, overlap)
        new_text = text[start_offset:].lstrip()
        self._last_final_words = normalized_words
        return new_text

    def reset_state(self) -> None:
        self._buffer = AudioBuffer(self.sample_rate, max_seconds=self._max_buffer_seconds)
        self._segment_id = 0
        self._last_final_time = 0.0
        self._last_live_text = ""
        self._last_final_words = []

    async def load_model(self) -> None:
        def _load() -> WhisperModel:
            return WhisperModel(self.model_name, device=self.device, compute_type=self.compute_type)

        try:
            self._model = await asyncio.to_thread(_load)
        except Exception:
            if self.device != "cuda":
                raise
            # Fallback to CPU when CUDA isn't available on this host.
            self.device = "cpu"
            if self.compute_type == "float16":
                self.compute_type = "int8"
            self._model = await asyncio.to_thread(_load)

    async def add_audio(self, samples: np.ndarray) -> None:
        async with self._lock:
            self._buffer.append(samples)

    async def run(self, stop_event: asyncio.Event) -> None:
        if not self._model:
            raise RuntimeError("Whisper model not loaded")
        self._running = True
        try:
            last_partial = 0.0
            last_final = 0.0
            loop = asyncio.get_event_loop()
            while not stop_event.is_set():
                await asyncio.sleep(0.1)
                now = loop.time()
                if now - last_partial >= self.partial_interval:
                    last_partial = now
                    await self._transcribe_partial()
                if now - last_final >= self.final_interval:
                    last_final = now
                    await self._transcribe_final()
        finally:
            self._running = False

    async def _transcribe_partial(self) -> None:
        async with self._lock:
            audio = self._buffer.get_last_seconds(self.partial_window)
            current_time = self._buffer.current_time
        if audio.size == 0:
            return
        if self._audio_rms(audio) < self.min_decode_rms:
            if self._last_live_text:
                self._last_live_text = ""
                await self.on_live("", current_time)
            return
        text = await asyncio.to_thread(self._decode_text, audio)
        if text and text != self._last_live_text:
            self._last_live_text = text
            await self.on_live(text, current_time)

    async def _transcribe_final(self) -> None:
        async with self._lock:
            audio = self._buffer.get_last_seconds(self.final_window)
            current_time = self._buffer.current_time
        if audio.size == 0:
            return
        if self._audio_rms(audio) < self.min_decode_rms:
            return
        segments = await asyncio.to_thread(self._decode_segments, audio)
        if not segments:
            return
        window_duration = audio.size / self.sample_rate
        window_start = current_time - window_duration
        cutoff = current_time - self.final_lag
        for seg in segments:
            if seg.end <= 0:
                continue
            t0 = window_start + seg.start
            t1 = window_start + seg.end
            if t1 <= self._last_final_time + 0.05:
                continue
            if t1 > cutoff:
                continue
            text = self._new_final_text(seg.text.strip())
            if not text:
                continue
            self._segment_id += 1
            self._last_final_time = max(self._last_final_time, t1)
            await self.on_segment(Segment(id=self._segment_id, t0=t0, t1=t1, text=text, is_final=True))

    def _decode_text(self, audio: np.ndarray) -> str:
        segments = self._decode_segments(audio)
        return " ".join(seg.text.strip() for seg in segments if seg.text.strip()).strip()

    def _decode_segments(self, audio: np.ndarray):
        assert self._model is not None
        audio_rms = self._audio_rms(audio)
        transcribe_kwargs = {
            "beam_size": 1,
            "vad_filter": self.vad_filter,
            # Reduces repetition/hallucination loops on low-information windows.
            "condition_on_previous_text": False,
        }
        if self.language:
            transcribe_kwargs["language"] = self.language
        try:
            segments, _info = self._model.transcribe(audio, **transcribe_kwargs)
        except Exception:
            if self.device != "cuda":
                raise
            # Runtime CUDA failures can happen on some drivers/setups. Recover on CPU.
            self.device = "cpu"
            if self.compute_type == "float16":
                self.compute_type = "int8"
            self._model = WhisperModel(self.model_name, device=self.device, compute_type=self.compute_type)
            segments, _info = self._model.transcribe(audio, **transcribe_kwargs)
        parsed = list(segments)
        if parsed or not self.vad_filter:
            return parsed
        if audio_rms < self.no_vad_fallback_min_rms:
            return parsed
        # Fallback for low-volume or compressed system audio where VAD is overly aggressive.
        fallback_kwargs = dict(transcribe_kwargs)
        fallback_kwargs["vad_filter"] = False
        segments_no_vad, _info = self._model.transcribe(audio, **fallback_kwargs)
        return list(segments_no_vad)
