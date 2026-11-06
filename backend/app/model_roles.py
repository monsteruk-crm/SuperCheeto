"""Model role and capability readiness (M3bis-T02).

Answers and detector proposals are different jobs with different requirements.
This module resolves one visible, frozen `ModelSettings` for a role before any
paid request is accepted:

- the effective model id and where it came from (client / environment / default),
- the accepted reasoning preference and whether this build actually sends it,
- the model's text/image/structured capabilities and how certain they are.

Rules (ADR 0014, plan contract C07/C08):

- An explicit client selection wins; a missing selection falls back to the
  environment/default model. Nothing is written back to preferences or `.env`.
- A deprecated alias is recorded as `deprecated_alias` with `substituted_from`
  so a substitution is visible, never silent.
- `image_input` / `structured_output` are only `True` when positively known.
  A request that needs an unconfirmed capability is rejected with
  `unsupported_capability` instead of quietly dropping an image or guessing.
- When this backend has actually read the Gateway language catalog and the
  requested model is absent from it, the selection is `unavailable_model`.
- Answer reasoning retains its verified default behavior. M07 additionally
  applies catalog-supported low reasoning for the separate detector role.

No IO happens here: the catalog and the caller's optional known-model list are
the only inputs, so the rules are deterministic and testable.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

from .ai_gateway_client import (
    DEFAULT_TEXT_MODEL,
    DEPRECATED_MODEL_REPLACEMENTS,
    normalize_gateway_model_id,
)
from .cockpit_models import (
    CapabilityCertainty,
    ErrorCode,
    ModelCapabilities,
    ModelRole,
    ModelSelectionSource,
    ModelSettings,
    ReasoningSetting,
)

#: Date the public Gateway catalog was last read for these two entries.
CATALOG_CHECKED_ON = "2026-10-26"

#: Verified answer-role reasoning default (ADR 0013); detector is separate.
VERIFIED_REASONING_MODEL = DEFAULT_TEXT_MODEL


class ModelReadinessError(Exception):
    """A role/model/attachment combination cannot be used. `code` is stable."""

    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class CatalogEntry:
    """Public-catalog facts for one model. Not a proof of account access."""

    model_id: str
    capabilities: ModelCapabilities
    default_reasoning_effort: Optional[str] = None
    note: str = ""


def _catalog(
    *,
    text_input: bool,
    text_output: bool,
    image_input: bool,
    structured_output: bool,
    efforts: tuple[str, ...],
) -> ModelCapabilities:
    return ModelCapabilities(
        text_input=text_input,
        text_output=text_output,
        image_input=image_input,
        structured_output=structured_output,
        reasoning_efforts=efforts,
        certainty=CapabilityCertainty.CATALOG,
    )


#: Provisional detector model (M07 evaluates it; nothing is executed here).
DETECTOR_MODEL = "google/gemini-3.5-flash-lite"

#: Public Gateway metadata checked on `CATALOG_CHECKED_ON`. Only the two models
#: this build actually defaults to are listed; everything else is `unknown`.
MODEL_CATALOG: dict[str, CatalogEntry] = {
    DEFAULT_TEXT_MODEL: CatalogEntry(
        model_id=DEFAULT_TEXT_MODEL,
        capabilities=_catalog(
            text_input=True,
            text_output=True,
            image_input=True,
            structured_output=True,
            efforts=("low", "high"),
        ),
        default_reasoning_effort="low",
        note="Initial answer default (ADR 0013). Low reasoning is applied.",
    ),
    DETECTOR_MODEL: CatalogEntry(
        model_id=DETECTOR_MODEL,
        capabilities=_catalog(
            text_input=True,
            text_output=True,
            image_input=True,
            structured_output=True,
            efforts=("low", "high"),
        ),
        default_reasoning_effort="low",
        note="Provisional M07 detector (live quality evaluation in M10); public catalog confirms structured output and low/high reasoning.",
    ),
}

#: Capabilities reported when nothing is positively known about a model.
UNKNOWN_CAPABILITIES = ModelCapabilities(
    text_input=True,
    text_output=True,
    image_input=False,
    structured_output=False,
    reasoning_efforts=(),
    certainty=CapabilityCertainty.UNKNOWN,
)


def capabilities_for_model(model: str) -> ModelCapabilities:
    entry = MODEL_CATALOG.get(model)
    return entry.capabilities if entry else UNKNOWN_CAPABILITIES


def resolve_model_settings(
    *,
    role: ModelRole,
    requested_model: Optional[str],
    default_model: str,
    known_catalog: Optional[Sequence[str]] = None,
    requested_effort: Optional[str] = None,
    require_image_input: bool = False,
) -> ModelSettings:
    """Resolve the frozen role/model/capability settings, or raise.

    Raises `ModelReadinessError` with `unsupported_capability` when the role or
    attachment needs a capability that is not positively supported, and with
    `unavailable_model` when a read catalog does not contain the selection.
    """
    raw_requested = (requested_model or "").strip()
    normalized_requested = normalize_gateway_model_id(raw_requested) if raw_requested else None
    normalized_default = normalize_gateway_model_id(default_model) or (default_model or "").strip()

    if raw_requested:
        selection_source = ModelSelectionSource.CLIENT
    elif normalized_default:
        selection_source = ModelSelectionSource.ENVIRONMENT
    else:
        # An empty environment default falls back to the documented default.
        selection_source = ModelSelectionSource.DEFAULT

    effective = normalized_requested or normalized_default or DEFAULT_TEXT_MODEL
    if not effective:
        raise ModelReadinessError(ErrorCode.UNAVAILABLE_MODEL, "No answer model is configured.")

    substituted_from: Optional[str] = None
    notice: Optional[str] = None
    if raw_requested and raw_requested in DEPRECATED_MODEL_REPLACEMENTS:
        selection_source = ModelSelectionSource.DEPRECATED_ALIAS
        substituted_from = raw_requested
        notice = (
            f"{raw_requested} is a retired snapshot; the request uses {effective}. "
            "The original selection is recorded."
        )

    capabilities = capabilities_for_model(effective)

    known = {str(item) for item in (known_catalog or ()) if str(item).strip()}
    if known_catalog is not None and effective not in known:
        raise ModelReadinessError(
            ErrorCode.UNAVAILABLE_MODEL,
            f"{effective} is not present in the Gateway language catalog this backend read.",
        )

    if not capabilities.text_input or not capabilities.text_output:
        raise ModelReadinessError(
            ErrorCode.UNSUPPORTED_CAPABILITY,
            f"{effective} has no verified text input/output for the {role.value} role.",
        )
    if role is ModelRole.DETECTOR and not capabilities.structured_output:
        raise ModelReadinessError(
            ErrorCode.UNSUPPORTED_CAPABILITY,
            f"{effective} has no verified structured output for the detector role.",
        )
    if require_image_input and not capabilities.image_input:
        raise ModelReadinessError(
            ErrorCode.UNSUPPORTED_CAPABILITY,
            f"{effective} has no verified image input; the screenshot is kept and no request is sent.",
        )

    reasoning = _resolve_reasoning(effective, capabilities, requested_effort, role)
    if notice is None and capabilities.certainty is CapabilityCertainty.UNKNOWN:
        notice = (
            f"Capabilities for {effective} are unverified; only a text-only "
            f"{role.value} request is accepted."
        )

    return ModelSettings(
        role=role,
        model=effective,
        requested_model=raw_requested or None,
        selection_source=selection_source,
        capabilities=capabilities,
        reasoning=reasoning,
        substituted_from=substituted_from,
        notice=notice,
    )


def _resolve_reasoning(
    model: str,
    capabilities: ModelCapabilities,
    requested_effort: Optional[str],
    role: ModelRole,
) -> Optional[ReasoningSetting]:
    effort = (requested_effort or "").strip() or None
    if effort is None:
        entry = MODEL_CATALOG.get(model)
        preferred = entry.default_reasoning_effort if entry else None
        if not preferred:
            return None
        return ReasoningSetting(
            effort=preferred,
            applied=(model == VERIFIED_REASONING_MODEL or (model == DETECTOR_MODEL and role is ModelRole.DETECTOR)),
            supported_efforts=capabilities.reasoning_efforts,
            source="role_default",
        )
    if not capabilities.reasoning_efforts:
        raise ModelReadinessError(
            ErrorCode.UNSUPPORTED_CAPABILITY,
            f"{model} has no verified reasoning support; the preference is not applied silently.",
        )
    if effort not in capabilities.reasoning_efforts:
        raise ModelReadinessError(
            ErrorCode.UNSUPPORTED_CAPABILITY,
            f"{model} does not accept reasoning effort {effort!r}; "
            f"supported: {', '.join(capabilities.reasoning_efforts)}.",
        )
    return ReasoningSetting(
        effort=effort,
        applied=(model == VERIFIED_REASONING_MODEL or (model == DETECTOR_MODEL and role is ModelRole.DETECTOR)),
        supported_efforts=capabilities.reasoning_efforts,
        source="client",
    )


def detector_model_settings(*, default_model: str = DETECTOR_MODEL) -> ModelSettings:
    """Resolve the provisional detector role (M07 executes it, not this module)."""
    return resolve_model_settings(
        role=ModelRole.DETECTOR,
        requested_model=default_model,
        default_model=default_model,
    )
