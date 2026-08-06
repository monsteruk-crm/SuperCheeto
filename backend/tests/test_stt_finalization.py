import unittest

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

        self.assertEqual(stt._new_final_text("Your mother is a hash map."), "Your mother is a hash map.")

    def test_emits_only_new_suffix_for_overlapping_rolling_window(self) -> None:
        stt = transcriber()

        self.assertEqual(stt._new_final_text("Your mother is a hash map."), "Your mother is a hash map.")
        self.assertEqual(
            stt._new_final_text("is a hash map and your father is a linked list."),
            "and your father is a linked list.",
        )

    def test_suppresses_fully_committed_rolling_window(self) -> None:
        stt = transcriber()

        self.assertEqual(stt._new_final_text("How many child processes do they initiate?"), "How many child processes do they initiate?")
        self.assertEqual(stt._new_final_text("How many child processes do they initiate?"), "")

    def test_keeps_short_repeated_utterances(self) -> None:
        stt = transcriber()

        self.assertEqual(stt._new_final_text("What?"), "What?")
        self.assertEqual(stt._new_final_text("What?"), "What?")


if __name__ == "__main__":
    unittest.main()
