import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import numpy as np

from app.stt import StreamingTranscriber


def transcriber(language="en") -> StreamingTranscriber:
    async def on_live(_text: str, _timestamp: float) -> None:
        return None

    async def on_segment(_segment) -> None:
        return None

    return StreamingTranscriber(
        sample_rate=16000,
        model_name="base",
        device="cpu",
        compute_type="int8",
        vad_filter=False,
        language=language,
        min_decode_rms=0.0,
        no_vad_fallback_min_rms=0.0,
        partial_window=2.0,
        partial_interval=0.25,
        final_window=6.0,
        final_interval=1.2,
        final_lag=0.35,
        on_live=on_live,
        on_segment=on_segment,
    )


class FinalTextDiffTests(unittest.TestCase):
    def test_language_defaults_to_english_when_hint_is_missing(self) -> None:
        stt = transcriber(language=None)

        self.assertEqual(stt.language, "en")

        stt.set_language(None)

        self.assertEqual(stt.language, "en")

    def test_emits_full_text_for_first_final_window(self) -> None:
        stt = transcriber()

        self.assertEqual(stt._new_final_text("Your mother is a hash map.", t0=1, t1=3), "Your mother is a hash map.")

    def test_emits_only_new_suffix_for_overlapping_rolling_window(self) -> None:
        stt = transcriber()

        self.assertEqual(stt._new_final_text("Your mother is a hash map.", t0=1, t1=3), "Your mother is a hash map.")
        self.assertEqual(
            stt._new_final_text("is a hash map and your father is a linked list.", t0=2, t1=5),
            "and your father is a linked list.",
        )

    def test_suppresses_fully_committed_rolling_window(self) -> None:
        stt = transcriber()

        self.assertEqual(stt._new_final_text("How many child processes do they initiate?", t0=1, t1=2), "How many child processes do they initiate?")
        self.assertEqual(stt._new_final_text("How many child processes do they initiate?", t0=1.1, t1=2.1), "")

    def test_repeated_sentences_without_audio_overlap_are_kept(self) -> None:
        for start in (2, 31):
            with self.subTest(start=start):
                stt = transcriber()
                text = "How many child processes do they initiate?"
                self.assertEqual(stt._new_final_text(text, t0=1, t1=2), text)
                self.assertEqual(stt._new_final_text(text, t0=start, t1=start+1), text)

    def test_missing_timing_never_assumes_audio_overlap(self) -> None:
        stt = transcriber()
        text = "Please repeat that sentence."
        self.assertEqual(stt._new_final_text(text), text)
        self.assertEqual(stt._new_final_text(text), text)

    def test_reset_clears_overlap_history(self) -> None:
        stt = transcriber()
        text = "Please repeat that sentence."
        stt._new_final_text(text, t0=1, t1=2)
        stt.reset_state()
        self.assertEqual(stt._new_final_text(text, t0=1.1, t1=2.1), text)

    def test_keeps_short_repeated_utterances(self) -> None:
        stt = transcriber()

        self.assertEqual(stt._new_final_text("What?"), "What?")
        self.assertEqual(stt._new_final_text("What?"), "What?")


class FinalAudioTimingTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_finalization_path_keeps_a_later_repeated_sentence(self):
        stt = transcriber()
        text = "Please explain the rollback plan."
        stt.on_segment = AsyncMock()
        stt._buffer = SimpleNamespace(
            get_last_seconds=Mock(return_value=np.ones(6*16000, dtype=np.float32)),
            current_time=6,
        )
        stt._decode_segments = Mock(return_value=[SimpleNamespace(start=1, end=2, text=text)])
        await stt._transcribe_final()
        stt._buffer.current_time = 36
        await stt._transcribe_final()
        self.assertEqual([call.args[0].text for call in stt.on_segment.call_args_list], [text, text])
        self.assertEqual([call.args[0].t0 for call in stt.on_segment.call_args_list], [1, 31])


if __name__ == "__main__":
    unittest.main()
