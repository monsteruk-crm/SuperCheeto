"""Model role and capability readiness tests (M3bis-T02/T04).

Pure, deterministic checks of `app.model_roles`: no network, no catalog fetch,
no model call. The recorded catalog entries are public-metadata facts; none of
these tests claim account access, latency, or quality.
"""
from __future__ import annotations

import unittest

from app.ai_gateway_client import DEFAULT_TEXT_MODEL
from app.cockpit_models import (
    CapabilityCertainty,
    ErrorCode,
    ModelRole,
    ModelSelectionSource,
)
from app.model_roles import (
    DETECTOR_MODEL,
    MODEL_CATALOG,
    ModelReadinessError,
    capabilities_for_model,
    detector_model_settings,
    resolve_model_settings,
)


class AnswerRoleTests(unittest.TestCase):
    def test_fresh_default_uses_flash_with_applied_low_reasoning(self) -> None:
        settings = resolve_model_settings(
            role=ModelRole.ANSWER,
            requested_model=None,
            default_model=DEFAULT_TEXT_MODEL,
        )
        self.assertEqual(settings.model, DEFAULT_TEXT_MODEL)
        self.assertIsNone(settings.requested_model)
        self.assertEqual(settings.selection_source, ModelSelectionSource.ENVIRONMENT)
        self.assertEqual(settings.capabilities.certainty, CapabilityCertainty.CATALOG)
        self.assertIsNotNone(settings.reasoning)
        self.assertEqual(settings.reasoning.effort, "low")
        self.assertTrue(settings.reasoning.applied)
        self.assertEqual(settings.reasoning.source, "role_default")

    def test_explicit_selection_wins_and_is_recorded(self) -> None:
        settings = resolve_model_settings(
            role=ModelRole.ANSWER,
            requested_model="openai/gpt-5.6-sol",
            default_model=DEFAULT_TEXT_MODEL,
        )
        self.assertEqual(settings.model, "openai/gpt-5.6-sol")
        self.assertEqual(settings.requested_model, "openai/gpt-5.6-sol")
        self.assertEqual(settings.selection_source, ModelSelectionSource.CLIENT)
        # No positive knowledge of this model's capabilities.
        self.assertEqual(settings.capabilities.certainty, CapabilityCertainty.UNKNOWN)
        self.assertIsNone(settings.reasoning)
        self.assertIsNotNone(settings.notice)

    def test_deprecated_alias_is_a_visible_substitution_not_a_silent_swap(self) -> None:
        settings = resolve_model_settings(
            role=ModelRole.ANSWER,
            requested_model="gpt-5.2-chat-latest",
            default_model=DEFAULT_TEXT_MODEL,
        )
        self.assertEqual(settings.selection_source, ModelSelectionSource.DEPRECATED_ALIAS)
        self.assertEqual(settings.requested_model, "gpt-5.2-chat-latest")
        self.assertNotEqual(settings.model, settings.requested_model)
        self.assertEqual(settings.substituted_from, "gpt-5.2-chat-latest")
        self.assertIn("retired snapshot", settings.notice or "")

    def test_unknown_model_rejects_an_attachment_visibly(self) -> None:
        with self.assertRaises(ModelReadinessError) as caught:
            resolve_model_settings(
                role=ModelRole.ANSWER,
                requested_model="openai/gpt-5.6-sol",
                default_model=DEFAULT_TEXT_MODEL,
                require_image_input=True,
            )
        self.assertEqual(caught.exception.code, ErrorCode.UNSUPPORTED_CAPABILITY)
        self.assertIn("image input", caught.exception.message)

    def test_verified_flash_accepts_an_attachment(self) -> None:
        settings = resolve_model_settings(
            role=ModelRole.ANSWER,
            requested_model=DEFAULT_TEXT_MODEL,
            default_model=DEFAULT_TEXT_MODEL,
            require_image_input=True,
        )
        self.assertTrue(settings.capabilities.image_input)

    def test_model_absent_from_a_read_catalog_is_unavailable(self) -> None:
        with self.assertRaises(ModelReadinessError) as caught:
            resolve_model_settings(
                role=ModelRole.ANSWER,
                requested_model="google/gemini-3.8-flash",
                default_model=DEFAULT_TEXT_MODEL,
                known_catalog=("openai/gpt-5.6-sol",),
            )
        self.assertEqual(caught.exception.code, ErrorCode.UNAVAILABLE_MODEL)

    def test_no_catalog_read_means_unknown_not_unavailable(self) -> None:
        settings = resolve_model_settings(
            role=ModelRole.ANSWER,
            requested_model="openai/gpt-5.6-sol",
            default_model=DEFAULT_TEXT_MODEL,
            known_catalog=None,
        )
        self.assertEqual(settings.capabilities.certainty, CapabilityCertainty.UNKNOWN)

    def test_requested_effort_is_validated_not_silently_dropped(self) -> None:
        settings = resolve_model_settings(
            role=ModelRole.ANSWER,
            requested_model=DEFAULT_TEXT_MODEL,
            default_model=DEFAULT_TEXT_MODEL,
            requested_effort="high",
        )
        self.assertEqual(settings.reasoning.effort, "high")
        self.assertEqual(settings.reasoning.source, "client")
        with self.assertRaises(ModelReadinessError) as caught:
            resolve_model_settings(
                role=ModelRole.ANSWER,
                requested_model=DEFAULT_TEXT_MODEL,
                default_model=DEFAULT_TEXT_MODEL,
                requested_effort="extreme",
            )
        self.assertEqual(caught.exception.code, ErrorCode.UNSUPPORTED_CAPABILITY)

    def test_reasoning_is_not_applied_to_an_unverified_model(self) -> None:
        settings = resolve_model_settings(
            role=ModelRole.ANSWER,
            requested_model=DETECTOR_MODEL,
            default_model=DEFAULT_TEXT_MODEL,
            requested_effort="low",
        )
        self.assertEqual(settings.reasoning.effort, "low")
        self.assertFalse(settings.reasoning.applied)


class DetectorRoleTests(unittest.TestCase):
    def test_provisional_detector_entry_has_structured_output(self) -> None:
        settings = detector_model_settings()
        self.assertEqual(settings.role, ModelRole.DETECTOR)
        self.assertEqual(settings.model, DETECTOR_MODEL)
        self.assertTrue(settings.capabilities.structured_output)
        self.assertEqual(ModelSelectionSource.CLIENT, settings.selection_source)

    def test_detector_rejects_a_model_without_verified_structured_output(self) -> None:
        with self.assertRaises(ModelReadinessError) as caught:
            resolve_model_settings(
                role=ModelRole.DETECTOR,
                requested_model="openai/gpt-5.6-sol",
                default_model=DETECTOR_MODEL,
            )
        self.assertEqual(caught.exception.code, ErrorCode.UNSUPPORTED_CAPABILITY)
        self.assertIn("structured output", caught.exception.message)

    def test_detector_catalog_entry_is_documented_as_provisional(self) -> None:
        entry = MODEL_CATALOG[DETECTOR_MODEL]
        self.assertIn("Provisional", entry.note)
        self.assertEqual(capabilities_for_model(DETECTOR_MODEL).certainty, CapabilityCertainty.CATALOG)


if __name__ == "__main__":
    unittest.main()
