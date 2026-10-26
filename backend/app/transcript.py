from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional

from .source_snapshots import (
    SourceRecord,
    make_audio_epoch,
    make_partial_key,
    make_segment_key,
)
from .stt import Segment


@dataclass
class SelectionRange:
    start: float
    end: float


class TranscriptStore:
    """Committed transcript text plus immutable, addressable source records.

    The duplicate-suppression and legacy `segments()`/`build_context()` behavior
    is unchanged. On top of it, every committed segment is recorded as an
    immutable `SourceRecord` with a `segmentKey` (`audioEpoch#segmentId`) and a
    monotonic transcript revision, so a later clear, restart, or mutation cannot
    rewrite history an answer was produced from.
    """

    def __init__(self, audio_epoch: Optional[str] = None) -> None:
        self._segments: List[Segment] = []
        self._records: List[SourceRecord] = []
        self._by_key: dict[str, SourceRecord] = {}
        self._partial: Optional[SourceRecord] = None
        self._audio_epoch = audio_epoch or make_audio_epoch()
        self._revision = 0

    # -- identity ---------------------------------------------------------

    @property
    def audio_epoch(self) -> str:
        return self._audio_epoch

    @property
    def revision(self) -> int:
        """Monotonic revision of committed-source changes."""
        return self._revision

    def set_audio_epoch(self, audio_epoch: str) -> str:
        """Start a new capture incarnation without discarding earlier text.

        Earlier records keep their own `audioEpoch`, so reused STT segment IDs
        in the new incarnation cannot collide with them.
        """
        epoch = (audio_epoch or "").strip() or make_audio_epoch()
        if epoch == self._audio_epoch:
            return self._audio_epoch
        self._audio_epoch = epoch
        # Partial text belongs to the capture that produced it.
        self._partial = None
        self._revision += 1
        return self._audio_epoch

    # -- committed source -------------------------------------------------

    @staticmethod
    def _normalized_text(text: str) -> str:
        words = re.findall(r"[a-z0-9']+", text.lower())
        return " ".join(words)

    @staticmethod
    def _word_count(normalized_text: str) -> int:
        if not normalized_text:
            return 0
        return len(normalized_text.split())

    def _is_recent_duplicate(self, segment: Segment, recent_seconds: float = 3.0) -> bool:
        normalized = self._normalized_text(segment.text)
        if not normalized:
            return False
        word_count = self._word_count(normalized)
        if word_count < 3:
            return False

        for previous in reversed(self._segments):
            if segment.t0 - previous.t1 > recent_seconds:
                break
            if previous.source_kind != segment.source_kind:
                continue
            previous_normalized = self._normalized_text(previous.text)
            if not previous_normalized:
                continue
            if normalized == previous_normalized:
                return True
            if (
                word_count >= 5
                and len(normalized) < len(previous_normalized)
                and normalized in previous_normalized
            ):
                return True
        return False

    def add_segment(self, segment: Segment) -> bool:
        if self._is_recent_duplicate(segment):
            return False
        self._revision += 1
        record = SourceRecord(
            segment_key=make_segment_key(self._audio_epoch, segment.id),
            segment_id=segment.id,
            audio_epoch=self._audio_epoch,
            t0=segment.t0,
            t1=segment.t1,
            text=segment.text,
            source_kind=segment.source_kind,
            source_name=segment.source_name,
            revision=self._revision,
            is_partial=False,
        )
        self._segments.append(segment)
        self._records.append(record)
        self._by_key[record.segment_key] = record
        return True

    def set_partial(
        self,
        text: str,
        t: float,
        source_kind: str = "system",
        source_name: Optional[str] = None,
    ) -> Optional[SourceRecord]:
        """Track the live partial tail for explicit, tentative freezing only."""
        cleaned = (text or "").strip()
        if not cleaned:
            self._partial = None
            return None
        self._partial = SourceRecord(
            segment_key=make_partial_key(self._audio_epoch),
            segment_id=-1,
            audio_epoch=self._audio_epoch,
            t0=max(0.0, float(t)),
            t1=float(t),
            text=cleaned,
            source_kind=source_kind,
            source_name=source_name,
            revision=self._revision,
            is_partial=True,
        )
        return self._partial

    def clear(self) -> None:
        self._segments = []
        self._records = []
        self._by_key = {}
        self._partial = None
        self._revision += 1

    def records(self) -> tuple[SourceRecord, ...]:
        return tuple(self._records)

    def record(self, segment_key: str) -> Optional[SourceRecord]:
        found = self._by_key.get(segment_key)
        if found is not None:
            return found
        if self._partial is not None and self._partial.segment_key == segment_key:
            return self._partial
        return None

    def partial(self) -> Optional[SourceRecord]:
        return self._partial

    # -- legacy behavior --------------------------------------------------

    def segments(self) -> List[Segment]:
        return list(self._segments)

    def build_context(
        self,
        selection_range: Optional[SelectionRange],
        before_seconds: float,
        after_seconds: float,
    ) -> str:
        if not self._segments:
            return ""
        if selection_range:
            start = max(0.0, selection_range.start - before_seconds)
            end = selection_range.end + after_seconds
        else:
            last_t1 = self._segments[-1].t1
            start = max(0.0, last_t1 - before_seconds)
            end = last_t1 + after_seconds
        context_segments = [
            seg.text for seg in self._segments if seg.t1 >= start and seg.t0 <= end
        ]
        return " ".join(context_segments).strip()
