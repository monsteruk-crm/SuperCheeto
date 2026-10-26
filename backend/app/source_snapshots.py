"""Immutable source snapshots (M02).

`TranscriptStore` owns the committed (finalized) source records. This module
freezes copies of them so later transcript mutations, partial updates, clears,
and source restarts cannot change what an answer was asked about.

Rules encoded here (plan contract C01/C02/C05/C06):

- A snapshot owns copies of text and source metadata. It is never a view over
  the live store.
- Recent-window snapshots end at an explicit press-time anchor and only include
  complete finalized segments that were committed at or before that anchor.
- Selection snapshots validate every half-open `[start, end)` offset against the
  actual stored segment text, measured in Unicode code points.
- Partials are excluded unless explicitly requested, and an explicitly
  requested partial freezes as `tentative` and is never usable for AUTO.
- Pinning never calls a model and is bounded by an explicit capacity limit.
- Unreferenced, unpinned snapshots are garbage collected.

See docs/API.md ("Protocol v2") and ADR 0011/0012.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, Optional, Sequence, Tuple

from .cockpit_models import ErrorCode, Snapshot, SnapshotKind, SourceKind, SourceSpan

#: Named bound from plan contract C06.
MAX_SNAPSHOT_CHARS = 24_000
#: Named bound from plan contract C06.
MAX_UNATTACHED_PINNED_SNAPSHOTS = 50
#: Visible recent-context choices; 20 is the default (plan contract C06).
RECENT_WINDOW_CHOICES: Tuple[int, ...] = (20, 45, 90)
DEFAULT_RECENT_WINDOW_SECONDS = 20


class SnapshotError(Exception):
    """A snapshot request was rejected. `code` is a stable contract `ErrorCode`."""

    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def make_audio_epoch() -> str:
    """A new identity for one capture incarnation."""
    return str(uuid.uuid4())


def make_segment_key(audio_epoch: str, segment_id: int) -> str:
    """Globally unambiguous composite of the audio epoch and the STT segment ID."""
    return f"{audio_epoch}#{segment_id}"


def make_partial_key(audio_epoch: str) -> str:
    return f"{audio_epoch}#partial"


def _coerce_source_kind(value: object) -> SourceKind:
    text = str(value or "").strip().lower()
    if text in {"mic", "microphone"}:
        return SourceKind.MIC
    return SourceKind.SYSTEM


@dataclass(frozen=True)
class SourceRecord:
    """One immutable committed (or explicitly requested partial) source record."""

    segment_key: str
    segment_id: int
    audio_epoch: str
    t0: float
    t1: float
    text: str
    source_kind: str = "system"
    source_name: Optional[str] = None
    revision: int = 0
    is_partial: bool = False

    def span(self, start: int = 0, end: Optional[int] = None) -> SourceSpan:
        stop = len(self.text) if end is None else end
        return SourceSpan(
            segment_key=self.segment_key,
            start=start,
            end=stop,
            t0=self.t0,
            t1=self.t1,
            source_kind=_coerce_source_kind(self.source_kind),
            source_name=self.source_name,
            audio_epoch=self.audio_epoch,
            revision=self.revision,
        )


@dataclass
class SnapshotRef:
    """Ownership bookkeeping for one frozen snapshot."""

    snapshot: Snapshot
    pinned: bool = False
    ref_count: int = 0
    pinned_at: float = 0.0


class SourceSnapshotStore:
    """Creates and retains immutable snapshots.

    `create_*` never mutates the source store and never calls a model.
    """

    def __init__(
        self,
        clock: Callable[[], float] = time.time,
        max_unattached_pins: int = MAX_UNATTACHED_PINNED_SNAPSHOTS,
    ) -> None:
        self._clock = clock
        self._max_unattached_pins = max_unattached_pins
        self._entries: Dict[str, SnapshotRef] = {}

    # -- creation ---------------------------------------------------------

    def create_recent_window(
        self,
        source,
        anchor_segment_key: str,
        window_seconds: int = DEFAULT_RECENT_WINDOW_SECONDS,
        include_partial: bool = False,
        pin: bool = False,
        kind: SnapshotKind = SnapshotKind.RECENT_WINDOW,
    ) -> Snapshot:
        """Freeze the window ending at `anchor_segment_key`.

        Only records from the anchor's audio epoch and committed at or before
        the anchor (by transcript revision) are included, so text received
        after the press cannot leak in. Capture-relative timestamps restart on
        every capture, so a previous capture's text is never mixed into this
        window.
        """
        if window_seconds not in RECENT_WINDOW_CHOICES:
            raise SnapshotError(
                ErrorCode.INVALID_PAYLOAD,
                f"Unsupported windowSeconds: {window_seconds!r}",
            )
        anchor = self._resolve_anchor(source, anchor_segment_key, include_partial=include_partial)
        window_start = max(0.0, anchor.t1 - float(window_seconds))

        selected: list[SourceRecord] = []
        for record in source.records():
            if record.revision > anchor.revision:
                continue
            if record.audio_epoch != anchor.audio_epoch:
                continue
            if record.is_partial and not include_partial:
                continue
            if record.t1 >= window_start and record.t0 <= anchor.t1:
                selected.append(record)

        if anchor.is_partial and anchor not in selected:
            selected.append(anchor)
        # Committed-source order is revision order; the explicit partial anchor
        # sorts last because it belongs to the live tail.
        selected.sort(key=lambda record: (record.revision, record.is_partial))

        if not selected:
            raise SnapshotError(ErrorCode.EMPTY, "No finalized text in the requested window.")

        spans = tuple(record.span() for record in selected)
        texts = [record.text for record in selected]
        return self._store(
            kind=kind,
            texts=texts,
            spans=spans,
            anchor_segment_key=anchor.segment_key,
            tentative=any(record.is_partial for record in selected),
            pin=pin,
        )

    def create_selection(
        self,
        source,
        raw_spans: Iterable[dict],
        include_partial: bool = False,
        pin: bool = False,
    ) -> Snapshot:
        """Freeze exact `[start, end)` selections over committed source records."""
        validated: list[Tuple[SourceRecord, int, int]] = []
        for raw in raw_spans:
            if not isinstance(raw, dict):
                raise SnapshotError(ErrorCode.INVALID_SPAN, "Each selection span must be an object.")
            segment_key = str(raw.get("segmentKey") or "").strip()
            if not segment_key:
                raise SnapshotError(ErrorCode.INVALID_SPAN, "Selection span is missing segmentKey.")
            record = source.record(segment_key)
            if record is None:
                raise SnapshotError(
                    ErrorCode.STALE_REVISION,
                    f"Unknown segmentKey: {segment_key}",
                )
            if record.is_partial and not include_partial:
                raise SnapshotError(
                    ErrorCode.INVALID_SPAN,
                    "Partial text must be requested explicitly with includePartial.",
                )
            start = raw.get("start")
            end = raw.get("end")
            if isinstance(start, bool) or isinstance(end, bool) or not isinstance(start, int) or not isinstance(end, int):
                raise SnapshotError(ErrorCode.INVALID_SPAN, "Selection offsets must be integers.")
            if start < 0 or end <= start or end > len(record.text):
                raise SnapshotError(
                    ErrorCode.INVALID_SPAN,
                    f"Selection offsets [{start}, {end}) are outside the stored text "
                    f"({len(record.text)} code points).",
                )
            expected_revision = raw.get("revision")
            if isinstance(expected_revision, int) and not isinstance(expected_revision, bool):
                if expected_revision != record.revision:
                    raise SnapshotError(
                        ErrorCode.STALE_REVISION,
                        f"Span revision {expected_revision} != stored revision {record.revision}.",
                    )
            validated.append((record, start, end))

        if not validated:
            raise SnapshotError(ErrorCode.EMPTY, "No selection spans provided.")

        texts = [record.text[start:end] for record, start, end in validated]
        spans = tuple(record.span(start, end) for record, start, end in validated)
        return self._store(
            kind=SnapshotKind.SELECTION,
            texts=texts,
            spans=spans,
            anchor_segment_key=validated[-1][0].segment_key,
            tentative=any(record.is_partial for record, _, _ in validated),
            pin=pin,
        )

    def create_pinned_moment(
        self,
        source,
        anchor_segment_key: str,
        window_seconds: int = DEFAULT_RECENT_WINDOW_SECONDS,
        include_partial: bool = False,
    ) -> Snapshot:
        """Pin the moment at the anchor. Makes no model call."""
        return self.create_recent_window(
            source,
            anchor_segment_key,
            window_seconds=window_seconds,
            include_partial=include_partial,
            pin=True,
            kind=SnapshotKind.PINNED_MOMENT,
        )

    def _store(
        self,
        *,
        kind: SnapshotKind,
        texts: Sequence[str],
        spans: Tuple[SourceSpan, ...],
        anchor_segment_key: Optional[str],
        tentative: bool,
        pin: bool,
    ) -> Snapshot:
        text = " ".join(part for part in texts if part).strip()
        if not text:
            raise SnapshotError(ErrorCode.EMPTY, "No finalized text available for this snapshot.")
        if len(text) > MAX_SNAPSHOT_CHARS:
            raise SnapshotError(
                ErrorCode.INVALID_SPAN,
                f"Snapshot text is {len(text)} characters; the limit is {MAX_SNAPSHOT_CHARS}.",
            )
        if pin:
            self._check_pin_capacity()
        snapshot = Snapshot(
            snapshot_id=str(uuid.uuid4()),
            kind=kind,
            text=text,
            char_count=len(text),
            truncated=False,
            source_spans=spans,
            anchor_segment_key=anchor_segment_key,
            created_at=self._clock(),
            tentative=tentative,
        )
        self._entries[snapshot.snapshot_id] = SnapshotRef(
            snapshot=snapshot,
            pinned=pin,
            ref_count=0,
            pinned_at=self._clock() if pin else 0.0,
        )
        return snapshot

    @staticmethod
    def _resolve_anchor(source, anchor_segment_key: str, include_partial: bool) -> SourceRecord:
        key = (anchor_segment_key or "").strip()
        if not key:
            raise SnapshotError(ErrorCode.INVALID_SPAN, "A snapshot needs an anchor segmentKey.")
        anchor = source.record(key)
        if anchor is None:
            raise SnapshotError(ErrorCode.STALE_REVISION, f"Unknown anchor segmentKey: {key}")
        if anchor.is_partial and not include_partial:
            raise SnapshotError(
                ErrorCode.INVALID_SPAN,
                "The anchor is partial text; request includePartial explicitly.",
            )
        return anchor

    # -- ownership/bookkeeping -------------------------------------------

    def _check_pin_capacity(self) -> None:
        unattached = sum(
            1 for entry in self._entries.values() if entry.pinned and entry.ref_count == 0
        )
        if unattached >= self._max_unattached_pins:
            raise SnapshotError(
                ErrorCode.CAPACITY,
                f"At most {self._max_unattached_pins} pinned moments can be kept.",
            )

    def retain(self, snapshot_id: str) -> Optional[Snapshot]:
        entry = self._entries.get(snapshot_id)
        if entry is None:
            return None
        entry.ref_count += 1
        return entry.snapshot

    def release(self, snapshot_id: str) -> None:
        entry = self._entries.get(snapshot_id)
        if entry is None:
            return
        entry.ref_count = max(0, entry.ref_count - 1)
        if entry.ref_count == 0 and not entry.pinned:
            self._entries.pop(snapshot_id, None)

    def pin(self, snapshot_id: str) -> Snapshot:
        entry = self._entries.get(snapshot_id)
        if entry is None:
            raise SnapshotError(ErrorCode.STALE_REVISION, f"Unknown snapshotId: {snapshot_id}")
        if entry.pinned:
            return entry.snapshot
        self._check_pin_capacity()
        entry.pinned = True
        entry.pinned_at = self._clock()
        return entry.snapshot

    def unpin(self, snapshot_id: str) -> None:
        entry = self._entries.get(snapshot_id)
        if entry is None:
            return
        entry.pinned = False
        entry.pinned_at = 0.0
        if entry.ref_count == 0:
            self._entries.pop(snapshot_id, None)

    def get(self, snapshot_id: str) -> Optional[Snapshot]:
        entry = self._entries.get(snapshot_id)
        return entry.snapshot if entry else None

    def is_pinned(self, snapshot_id: str) -> bool:
        entry = self._entries.get(snapshot_id)
        return bool(entry and entry.pinned)

    def gc(self) -> int:
        """Drop unreferenced, unpinned snapshots. Returns the number removed."""
        stale = [
            snapshot_id
            for snapshot_id, entry in self._entries.items()
            if entry.ref_count == 0 and not entry.pinned
        ]
        for snapshot_id in stale:
            self._entries.pop(snapshot_id, None)
        return len(stale)

    def pinned_count(self) -> int:
        return sum(
            1 for entry in self._entries.values() if entry.pinned and entry.ref_count == 0
        )

    def sizes(self) -> Tuple[int, int]:
        """`(retained_snapshots, unattached_pinned_snapshots)` for tests/metrics."""
        return len(self._entries), self.pinned_count()
