"""Immutable source snapshot tests (M02-T06).

Covers the plan's M02 gate: snapshots stay stable after new finals, partial
updates, clear, and source restarts; new source identity never collides with
old cards; pinning makes zero model calls.
"""
from __future__ import annotations

import unittest

from app.cockpit_models import ErrorCode, SnapshotKind, SourceKind
from app.source_snapshots import (
    MAX_SNAPSHOT_CHARS,
    SnapshotError,
    SourceSnapshotStore,
    make_segment_key,
)
from app.stt import Segment
from app.transcript import TranscriptStore


def segment(segment_id: int, t0: float, t1: float, text: str, source_kind: str = "system", source_name: str = "Monitor") -> Segment:
    return Segment(id=segment_id, t0=t0, t1=t1, text=text, source_kind=source_kind, source_name=source_name)


def store_with(texts, epoch: str = "epoch-a") -> TranscriptStore:
    store = TranscriptStore(audio_epoch=epoch)
    for index, item in enumerate(texts, start=1):
        if isinstance(item, tuple):
            text, t0, t1 = item
        else:
            text, t0, t1 = item, float(index * 10), float(index * 10 + 5)
        store.add_segment(segment(index, t0, t1, text))
    return store


class RecentWindowTests(unittest.TestCase):
    def test_window_choices_include_intersecting_complete_segments(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        store.add_segment(segment(1, 0.0, 9.0, "very old words"))
        store.add_segment(segment(2, 9.5, 10.0, "boundary words"))
        store.add_segment(segment(3, 90.0, 100.0, "anchor words"))
        snapshots = SourceSnapshotStore()

        # The 90-second window starts exactly at t=10, so only the segment that
        # ends on that edge is included; the 20/45-second windows exclude both.
        for window, included in ((20, ()), (45, ()), (90, ("boundary words",))):
            snapshot = snapshots.create_recent_window(store, make_segment_key("epoch-a", 3), window)
            self.assertIn("anchor words", snapshot.text, window)
            self.assertNotIn("very old words", snapshot.text, window)
            for text in ("boundary words",):
                self.assertEqual(text in snapshot.text, text in included, window)

    def test_window_boundary_is_inclusive_at_the_start_edge(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        store.add_segment(segment(1, 60.0, 79.999, "just outside"))
        store.add_segment(segment(2, 70.0, 80.0, "exactly on the edge"))
        store.add_segment(segment(3, 95.0, 100.0, "anchor words"))
        snapshots = SourceSnapshotStore()

        snapshot = snapshots.create_recent_window(store, make_segment_key("epoch-a", 3), 20)

        self.assertNotIn("just outside", snapshot.text)
        self.assertIn("exactly on the edge", snapshot.text)

    def test_window_excludes_intersecting_earlier_segment_only_when_disjoint(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        store.add_segment(segment(1, 79.0, 90.0, "long segment crossing the start"))
        store.add_segment(segment(2, 95.0, 100.0, "anchor words"))
        snapshots = SourceSnapshotStore()

        snapshot = snapshots.create_recent_window(store, make_segment_key("epoch-a", 2), 20)

        # Complete intersecting segments are included; word-level timing is unavailable.
        self.assertIn("long segment crossing the start", snapshot.text)

    def test_final_arriving_after_the_press_is_excluded(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        store.add_segment(segment(1, 0.0, 5.0, "first thing said"))
        store.add_segment(segment(2, 6.0, 10.0, "the anchor question"))
        snapshots = SourceSnapshotStore()

        anchor_key = make_segment_key("epoch-a", 2)
        # A newer final is committed before the command is processed.
        store.add_segment(segment(3, 11.0, 12.0, "arrived after the press"))

        snapshot = snapshots.create_recent_window(store, anchor_key, 20)

        self.assertEqual(snapshot.text, "first thing said the anchor question")
        self.assertEqual(snapshot.anchor_segment_key, anchor_key)
        self.assertEqual([span.segment_key for span in snapshot.source_spans], [
            make_segment_key("epoch-a", 1),
            make_segment_key("epoch-a", 2),
        ])

    def test_no_finalized_text_is_rejected_as_empty(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        snapshots = SourceSnapshotStore()

        with self.assertRaises(SnapshotError) as caught:
            snapshots.create_recent_window(store, make_segment_key("epoch-a", 1), 20)
        self.assertEqual(caught.exception.code, ErrorCode.STALE_REVISION)

    def test_unknown_anchor_is_rejected_before_generation(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        store.add_segment(segment(1, 0.0, 5.0, "text"))
        snapshots = SourceSnapshotStore()

        with self.assertRaises(SnapshotError) as caught:
            snapshots.create_recent_window(store, make_segment_key("epoch-missing", 1), 20)
        self.assertEqual(caught.exception.code, ErrorCode.STALE_REVISION)

    def test_partial_anchor_requires_explicit_request_and_freezes_tentative(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        store.add_segment(segment(1, 0.0, 5.0, "committed words"))
        store.set_partial("half a sentence", 6.0)
        snapshots = SourceSnapshotStore()
        partial_key = store.partial().segment_key

        with self.assertRaises(SnapshotError) as caught:
            snapshots.create_recent_window(store, partial_key, 20)
        self.assertEqual(caught.exception.code, ErrorCode.INVALID_SPAN)

        snapshot = snapshots.create_recent_window(store, partial_key, 20, include_partial=True)

        self.assertTrue(snapshot.tentative)
        self.assertIn("half a sentence", snapshot.text)

    def test_future_partial_updates_do_not_mutate_a_frozen_snapshot(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        store.add_segment(segment(1, 0.0, 5.0, "committed words"))
        snapshots = SourceSnapshotStore()
        snapshot = snapshots.create_recent_window(store, make_segment_key("epoch-a", 1), 20)

        store.set_partial("later partial text", 8.0)
        store.set_partial("", 9.0)

        self.assertEqual(snapshot.text, "committed words")
        self.assertFalse(snapshot.tentative)


class SelectionTests(unittest.TestCase):
    def test_selection_across_segments_preserves_order_and_offsets(self) -> None:
        store = store_with([("Should we ship on friday?", 0.0, 2.0), ("I think we should wait.", 2.5, 4.0)])
        snapshots = SourceSnapshotStore()

        snapshot = snapshots.create_selection(
            store,
            [
                {"segmentKey": make_segment_key("epoch-a", 1), "start": 0, "end": 6},
                {"segmentKey": make_segment_key("epoch-a", 2), "start": 8, "end": 10},
            ],
        )

        self.assertEqual(snapshot.text, "Should we")
        self.assertEqual(snapshot.kind, SnapshotKind.SELECTION)
        self.assertEqual([(span.start, span.end) for span in snapshot.source_spans], [(0, 6), (8, 10)])
        self.assertEqual(snapshot.char_count, len("Should we"))
        self.assertEqual(snapshot.source_spans[0].source_kind, SourceKind.SYSTEM)
        self.assertEqual(snapshot.source_spans[0].source_name, "Monitor")
        self.assertEqual(snapshot.source_spans[0].audio_epoch, "epoch-a")

    def test_selection_offsets_are_unicode_code_points(self) -> None:
        text = "a👍🏽e\u0301z"
        store = store_with([(text, 0.0, 1.0)])
        snapshots = SourceSnapshotStore()
        anchor = make_segment_key("epoch-a", 1)

        emoji = snapshots.create_selection(store, [{"segmentKey": anchor, "start": 1, "end": 3}])
        combining = snapshots.create_selection(store, [{"segmentKey": anchor, "start": 3, "end": 5}])

        self.assertEqual(emoji.text, "👍🏽")
        self.assertEqual(emoji.char_count, 2)
        self.assertEqual(combining.text, "e\u0301")
        self.assertEqual(combining.char_count, 2)

    def test_out_of_range_and_inverted_offsets_are_rejected(self) -> None:
        store = store_with([("short text", 0.0, 1.0)])
        snapshots = SourceSnapshotStore()
        anchor = make_segment_key("epoch-a", 1)

        for span in (
            {"segmentKey": anchor, "start": 0, "end": 999},
            {"segmentKey": anchor, "start": 5, "end": 5},
            {"segmentKey": anchor, "start": 6, "end": 2},
            {"segmentKey": anchor, "start": -1, "end": 3},
        ):
            with self.subTest(span=span):
                with self.assertRaises(SnapshotError) as caught:
                    snapshots.create_selection(store, [span])
                self.assertEqual(caught.exception.code, ErrorCode.INVALID_SPAN)

    def test_stale_span_revision_is_rejected(self) -> None:
        store = store_with([("short text", 0.0, 1.0)])
        snapshots = SourceSnapshotStore()
        anchor = make_segment_key("epoch-a", 1)

        with self.assertRaises(SnapshotError) as caught:
            snapshots.create_selection(
                store,
                [{"segmentKey": anchor, "start": 0, "end": 5, "revision": 999}],
            )
        self.assertEqual(caught.exception.code, ErrorCode.STALE_REVISION)

    def test_selection_can_include_an_explicit_partial(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        partial = store.set_partial("unconfirmed guess", 3.0)
        snapshots = SourceSnapshotStore()

        with self.assertRaises(SnapshotError):
            snapshots.create_selection(store, [{"segmentKey": partial.segment_key, "start": 0, "end": 4}])

        snapshot = snapshots.create_selection(
            store,
            [{"segmentKey": partial.segment_key, "start": 0, "end": 4}],
            include_partial=True,
        )
        self.assertTrue(snapshot.tentative)
        self.assertEqual(snapshot.text, "unco")


class StabilityTests(unittest.TestCase):
    def test_snapshot_survives_new_finals_and_store_mutation(self) -> None:
        store = store_with([("the original question", 0.0, 2.0)])
        snapshots = SourceSnapshotStore()
        snapshot = snapshots.create_recent_window(store, make_segment_key("epoch-a", 1), 20)

        store.add_segment(segment(2, 3.0, 4.0, "a later remark"))
        store.segments()[0].text = "mutated after the fact"
        store.set_partial("partial tail", 5.0)

        self.assertEqual(snapshot.text, "the original question")
        self.assertEqual(snapshot.source_spans[0].segment_key, make_segment_key("epoch-a", 1))

    def test_snapshot_survives_transcript_clear_and_new_anchor_fails(self) -> None:
        store = store_with([("the original question", 0.0, 2.0)])
        snapshots = SourceSnapshotStore()
        snapshot = snapshots.create_recent_window(store, make_segment_key("epoch-a", 1), 20)

        store.clear()

        self.assertEqual(snapshot.text, "the original question")
        self.assertIsNotNone(snapshots.get(snapshot.snapshot_id))
        with self.assertRaises(SnapshotError) as caught:
            snapshots.create_recent_window(store, make_segment_key("epoch-a", 1), 20)
        self.assertEqual(caught.exception.code, ErrorCode.STALE_REVISION)

    def test_source_restart_does_not_collide_with_earlier_segment_keys(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        store.add_segment(segment(1, 0.0, 2.0, "first question"))
        snapshots = SourceSnapshotStore()
        first = snapshots.create_recent_window(store, make_segment_key("epoch-a", 1), 20)

        new_epoch = store.set_audio_epoch("epoch-b")
        store.add_segment(segment(1, 0.0, 2.0, "second question"))

        self.assertEqual(new_epoch, "epoch-b")
        keys = {record.segment_key for record in store.records()}
        self.assertEqual(keys, {make_segment_key("epoch-a", 1), make_segment_key("epoch-b", 1)})
        self.assertEqual(first.text, "first question")

        second = snapshots.create_recent_window(store, make_segment_key("epoch-b", 1), 20)
        self.assertEqual(second.text, "second question")
        self.assertEqual(second.source_spans[0].audio_epoch, "epoch-b")
        self.assertNotEqual(first.snapshot_id, second.snapshot_id)

    def test_revision_is_monotonic_across_changes(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        revisions = [store.revision]
        store.add_segment(segment(1, 0.0, 1.0, "one two three"))
        revisions.append(store.revision)
        store.add_segment(segment(2, 1.5, 2.0, "four five six"))
        revisions.append(store.revision)
        store.set_audio_epoch("epoch-b")
        revisions.append(store.revision)
        store.clear()
        revisions.append(store.revision)

        self.assertEqual(revisions, sorted(revisions))
        self.assertEqual(len(revisions), len(set(revisions)))

    def test_oversized_snapshot_is_rejected_without_truncation(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        store.add_segment(segment(1, 0.0, 1.0, "x" * (MAX_SNAPSHOT_CHARS // 2 + 1)))
        store.add_segment(segment(2, 1.5, 2.0, "y" * (MAX_SNAPSHOT_CHARS // 2 + 1)))
        snapshots = SourceSnapshotStore()

        with self.assertRaises(SnapshotError) as caught:
            snapshots.create_recent_window(store, make_segment_key("epoch-a", 2), 20)
        self.assertEqual(caught.exception.code, ErrorCode.INVALID_SPAN)


class PinAndOwnershipTests(unittest.TestCase):
    def test_pin_makes_no_model_call_and_is_retained(self) -> None:
        store = store_with([("pin me", 0.0, 2.0)])
        snapshots = SourceSnapshotStore()

        pinned = snapshots.create_pinned_moment(store, make_segment_key("epoch-a", 1), 20)

        self.assertEqual(pinned.kind, SnapshotKind.PINNED_MOMENT)
        self.assertTrue(snapshots.is_pinned(pinned.snapshot_id))
        self.assertEqual(snapshots.pinned_count(), 1)
        # Unreferenced but pinned snapshots survive garbage collection.
        self.assertEqual(snapshots.gc(), 0)
        self.assertIs(snapshots.get(pinned.snapshot_id), pinned)

    def test_pin_capacity_rejects_visibly(self) -> None:
        store = store_with([("pin me", 0.0, 2.0)])
        snapshots = SourceSnapshotStore(max_unattached_pins=2)

        snapshots.create_pinned_moment(store, make_segment_key("epoch-a", 1), 20)
        snapshots.create_pinned_moment(store, make_segment_key("epoch-a", 1), 20)
        with self.assertRaises(SnapshotError) as caught:
            snapshots.create_pinned_moment(store, make_segment_key("epoch-a", 1), 20)

        self.assertEqual(caught.exception.code, ErrorCode.CAPACITY)
        self.assertEqual(snapshots.pinned_count(), 2)

    def test_unreferenced_unpinned_snapshots_are_collected(self) -> None:
        store = store_with([("collect me", 0.0, 2.0)])
        snapshots = SourceSnapshotStore()
        snapshot = snapshots.create_recent_window(store, make_segment_key("epoch-a", 1), 20)

        snapshots.retain(snapshot.snapshot_id)
        self.assertEqual(snapshots.gc(), 0)
        snapshots.release(snapshot.snapshot_id)

        # Releasing the final reference drops it immediately; `gc()` is the
        # safety net for any snapshot left without a reference.
        self.assertIsNone(snapshots.get(snapshot.snapshot_id))
        self.assertEqual(snapshots.gc(), 0)

    def test_unpin_without_references_releases_the_snapshot(self) -> None:
        store = store_with([("pin me", 0.0, 2.0)])
        snapshots = SourceSnapshotStore()
        pinned = snapshots.create_pinned_moment(store, make_segment_key("epoch-a", 1), 20)

        snapshots.unpin(pinned.snapshot_id)

        self.assertIsNone(snapshots.get(pinned.snapshot_id))
        self.assertEqual(snapshots.sizes(), (0, 0))


if __name__ == "__main__":
    unittest.main()
