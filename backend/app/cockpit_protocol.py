"""Protocol v2/v3 contract parsers (M01-T06, amended by M3bis-T04).

Pure validation/parsing helpers shared by the contract tests. They encode the
same rules as `frontend/src/cockpit/protocol.ts` and the fixtures under
`contracts/v2/` and `contracts/v3/`, so both sides must agree on the outcome of
every fixture.

These functions never open sockets, call models, or touch the transcript store.
They only answer: is this payload structurally valid for this context (and
version), and if not, which stable error code applies?

See ADR 0012, ADR 0014 and docs/API.md ("Protocol v2", "Protocol v3").
"""
from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Any, Mapping, Optional

from .cockpit_models import (
    KNOWN_REASONING_EFFORTS,
    SUPPORTED_WIRE_VERSIONS,
    Answer,
    AnswerStatus,
    AnswerTiming,
    BackendTiming,
    CapabilityCertainty,
    CandidateAction,
    CandidateState,
    ContextNoteAction,
    ClientTiming,
    ErrorCode,
    GenerationTiming,
    ModelCapabilities,
    ModelRole,
    ModelSelectionSource,
    ModelSettings,
    ProfileMode,
    RagTiming,
    ReasoningSetting,
    RetrievalOutcome,
    RetrievalResult,
    RetrievedChunk,
    ScreenshotAttachment,
    SnapshotKind,
    SourceKind,
    SourceSpan,
    TimingClock,
)

V2_COMMAND_TYPES = frozenset(
    {
        "hello",
        "claim_control",
        "get_command_status",
        "create_snapshot",
        "run_context_query",
        "run_snapshot_query",
        "cancel_answer",
        "candidate_action",
        "answer_action",
        "context_note_action",
        "set_detection",
        "set_auto",
        "configure_auto",
        "interaction_state",
        "rerun_answer",
        "snapshot_action",
    }
)

WINDOW_SECONDS = frozenset({20, 45, 90})


class ContractError(Exception):
    """A payload failed contract validation. `code` is a stable `ErrorCode`."""

    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ContractContext:
    """The server-side facts a pure contract check needs."""

    protocol_version: int = 2
    backend_instance_id: str = ""
    session_epoch: int = 0
    current_revision: int = 0
    known_snapshot_ids: frozenset = frozenset()
    known_candidate_ids: frozenset = frozenset()

    @classmethod
    def from_mapping(cls, raw: Mapping[str, Any]) -> "ContractContext":
        return cls(
            protocol_version=int(raw.get("protocolVersion", 2)),
            backend_instance_id=str(raw.get("backendInstanceId", "") or ""),
            session_epoch=int(raw.get("sessionEpoch", 0)),
            current_revision=int(raw.get("currentRevision", 0)),
            known_snapshot_ids=frozenset(raw.get("knownSnapshotIds", ()) or ()),
            known_candidate_ids=frozenset(raw.get("knownCandidateIds", ()) or ()),
        )


def _invalid(message: str) -> ContractError:
    return ContractError(ErrorCode.INVALID_PAYLOAD, message)


def _require_mapping(payload: Any) -> Mapping[str, Any]:
    if not isinstance(payload, Mapping):
        raise _invalid("Payload must be a JSON object.")
    return payload


def _require_str(payload: Mapping[str, Any], key: str, *, allow_null: bool = False) -> Optional[str]:
    value = payload.get(key)
    if value is None and allow_null:
        return None
    if not isinstance(value, str) or not value.strip():
        raise _invalid(f"Missing or invalid identity field: {key}")
    return value


def _require_int(payload: Mapping[str, Any], key: str) -> int:
    value = payload.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise _invalid(f"Missing or invalid integer field: {key}")
    return value


def _require_enum(payload: Mapping[str, Any], key: str, enum_cls: type, *, allow_null: bool = False):
    value = payload.get(key)
    if value is None and allow_null:
        return None
    if not isinstance(value, str) or value not in {item.value for item in enum_cls}:
        raise _invalid(f"Unknown {key}: {value!r}")
    return enum_cls(value)


def _optional_number(payload: Mapping[str, Any], key: str) -> Optional[float]:
    """A nullable, finite, non-negative millisecond measurement."""
    value = payload.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _invalid(f"{key} must be a number or null.")
    if not isfinite(float(value)) or float(value) < 0:
        raise _invalid(f"{key} must be a finite non-negative number.")
    return float(value)


def _require_number(payload: Mapping[str, Any], key: str) -> float:
    value = _optional_number(payload, key)
    if value is None:
        raise _invalid(f"{key} is required.")
    return value


def parse_model_settings(raw: Any, *, version: int) -> ModelSettings:
    """Validate a frozen role/model/capability block (v3)."""
    data = _require_mapping(raw)
    role = _require_enum(data, "role", ModelRole)
    model = _require_str(data, "model")
    requested_model = _require_str(data, "requestedModel", allow_null=True)
    selection_source = _require_enum(data, "selectionSource", ModelSelectionSource)
    capabilities_raw = _require_mapping(data.get("capabilities"))
    capabilities = ModelCapabilities(
        text_input=bool(capabilities_raw.get("textInput")),
        text_output=bool(capabilities_raw.get("textOutput")),
        image_input=bool(capabilities_raw.get("imageInput")),
        structured_output=bool(capabilities_raw.get("structuredOutput")),
        reasoning_efforts=tuple(
            str(item) for item in (capabilities_raw.get("reasoningEfforts") or ()) if isinstance(item, str)
        ),
        certainty=_require_enum(capabilities_raw, "certainty", CapabilityCertainty),
    )
    reasoning: Optional[ReasoningSetting] = None
    reasoning_raw = data.get("reasoning")
    if reasoning_raw is not None:
        reasoning_map = _require_mapping(reasoning_raw)
        reasoning = ReasoningSetting(
            effort=_require_str(reasoning_map, "effort") or "",
            applied=bool(reasoning_map.get("applied")),
            supported_efforts=tuple(
                str(item) for item in (reasoning_map.get("supportedEfforts") or ()) if isinstance(item, str)
            ),
            source=str(reasoning_map.get("source") or "role_default"),
        )
    return ModelSettings(
        role=role,
        model=model or "",
        requested_model=requested_model,
        selection_source=selection_source,
        capabilities=capabilities,
        reasoning=reasoning,
        substituted_from=_require_str(data, "substitutedFrom", allow_null=True),
        notice=_require_str(data, "notice", allow_null=True),
    )


def parse_backend_timing(raw: Any) -> BackendTiming:
    """Validate a server-monotonic timing block (v3).

    Every measurement is milliseconds from request acceptance. Unmeasured
    stages stay null and are named in `unavailable`; ordering is enforced so a
    fabricated or cross-clock value cannot pass.
    """
    data = _require_mapping(raw)
    clock = _require_enum(data, "clock", TimingClock)
    if clock is not TimingClock.SERVER_MONOTONIC:
        raise _invalid("backend timing must use the server_monotonic clock.")
    accepted = _require_number(data, "acceptedMs")
    completed = _optional_number(data, "completedMs")
    if completed is not None and completed < accepted:
        raise _invalid("completedMs must be >= acceptedMs.")

    rag: Optional[RagTiming] = None
    rag_raw = data.get("rag")
    if rag_raw is not None:
        rag_map = _require_mapping(rag_raw)
        start = _require_number(rag_map, "startMs")
        end = _require_number(rag_map, "endMs")
        if end < start or start < accepted:
            raise _invalid("rag timing must satisfy acceptedMs <= startMs <= endMs.")
        rag = RagTiming(start_ms=start, end_ms=end, outcome=_require_enum(rag_map, "outcome", RetrievalOutcome))

    generation: Optional[GenerationTiming] = None
    generation_raw = data.get("generation")
    if generation_raw is not None:
        generation_map = _require_mapping(generation_raw)
        start = _require_number(generation_map, "startMs")
        end = _require_number(generation_map, "endMs")
        first = _optional_number(generation_map, "firstDeltaMs")
        if start < accepted or end < start:
            raise _invalid("generation timing must satisfy acceptedMs <= startMs <= endMs.")
        if first is not None and (first < start or first > end):
            raise _invalid("firstDeltaMs must fall inside the generation window.")
        generation = GenerationTiming(start_ms=start, first_delta_ms=first, end_ms=end)

    unavailable_raw = data.get("unavailable") or ()
    if not isinstance(unavailable_raw, (list, tuple)) or any(not isinstance(item, str) for item in unavailable_raw):
        raise _invalid("unavailable must be an array of measurement names.")

    return BackendTiming(
        clock=clock,
        accepted_ms=accepted,
        rag=rag,
        generation=generation,
        completed_ms=completed,
        unavailable=tuple(unavailable_raw),
    )


def parse_client_timing(raw: Any) -> ClientTiming:
    """Validate a client-monotonic timing block. The backend never computes with it."""
    data = _require_mapping(raw)
    clock = _require_enum(data, "clock", TimingClock)
    if clock is not TimingClock.CLIENT_MONOTONIC:
        raise _invalid("client timing must use the client_monotonic clock.")
    pressed = _optional_number(data, "pressedMs")
    first_visible = _optional_number(data, "firstVisibleMs")
    terminal = _optional_number(data, "terminalReceivedMs")
    if pressed is not None and first_visible is not None and first_visible < pressed:
        raise _invalid("firstVisibleMs must be >= pressedMs on the same client clock.")
    if pressed is not None and terminal is not None and terminal < pressed:
        raise _invalid("terminalReceivedMs must be >= pressedMs on the same client clock.")
    return ClientTiming(
        clock=clock,
        pressed_ms=pressed,
        first_visible_ms=first_visible,
        terminal_received_ms=terminal,
    )


def parse_answer_timing(raw: Any) -> AnswerTiming:
    data = _require_mapping(raw)
    client_raw = data.get("client")
    client = parse_client_timing(client_raw) if client_raw is not None else None
    return AnswerTiming(backend=parse_backend_timing(data.get("backend")), client=client)


def parse_screenshot_attachment(raw: Any) -> ScreenshotAttachment:
    data = _require_mapping(raw)
    return ScreenshotAttachment(
        requested=bool(data.get("requested")),
        included=bool(data.get("included")),
        reason=_require_str(data, "reason", allow_null=True),
    )


def validate_source_span(raw: Any) -> SourceSpan:
    span = _require_mapping(raw)
    start = span.get("start")
    end = span.get("end")
    if isinstance(start, bool) or isinstance(end, bool) or not isinstance(start, int) or not isinstance(end, int):
        raise ContractError(ErrorCode.INVALID_SPAN, "Span offsets must be integers.")
    if start < 0 or end <= start:
        raise ContractError(ErrorCode.INVALID_SPAN, "Span offsets must satisfy 0 <= start < end.")
    segment_key = _require_str(span, "segmentKey")
    audio_epoch = _require_str(span, "audioEpoch")
    revision = _require_int(span, "revision")
    source_kind = _require_enum(span, "sourceKind", SourceKind)
    source_name = span.get("sourceName")
    if source_name is not None and not isinstance(source_name, str):
        raise ContractError(ErrorCode.INVALID_SPAN, "sourceName must be a string or null.")
    t0 = span.get("t0")
    t1 = span.get("t1")
    if isinstance(t0, bool) or isinstance(t1, bool) or not isinstance(t0, (int, float)) or not isinstance(t1, (int, float)):
        raise ContractError(ErrorCode.INVALID_SPAN, "Span t0/t1 must be numbers.")
    if t1 < t0:
        raise ContractError(ErrorCode.INVALID_SPAN, "Span t1 must be >= t0.")
    return SourceSpan(
        segment_key=segment_key,
        start=start,
        end=end,
        t0=float(t0),
        t1=float(t1),
        source_kind=source_kind,
        source_name=source_name,
        audio_epoch=audio_epoch,
        revision=revision,
    )


def parse_command(payload: Any, context: ContractContext) -> Mapping[str, Any]:
    """Validate a client -> server v2 command. Returns the payload on success."""
    data = _require_mapping(payload)
    msg_type = data.get("type")
    if not isinstance(msg_type, str) or msg_type not in V2_COMMAND_TYPES:
        raise _invalid(f"Unknown command type: {msg_type!r}")

    if data.get("protocolVersion") != context.protocol_version:
        raise ContractError(
            ErrorCode.INCOMPATIBLE_VERSION,
            f"Unsupported protocolVersion: {data.get('protocolVersion')!r}",
        )

    # Identity: every v2/v3 command needs commandId and sessionEpoch.
    _require_str(data, "commandId")
    _require_int(data, "sessionEpoch")

    # backendInstanceId is required for all commands except hello (first contact).
    if msg_type != "hello":
        _require_str(data, "backendInstanceId")

    if msg_type in {"rerun_answer", "snapshot_action"}:
        if context.protocol_version < 4:
            raise ContractError(ErrorCode.INCOMPATIBLE_VERSION, "This command requires protocol v4.")
        _require_str(data, "sourceAnswerId" if msg_type == "rerun_answer" else "snapshotId")
        if msg_type == "snapshot_action" and data.get("action") != "release":
            raise _invalid("Unknown snapshot action.")
    target = data.get("manualTarget")
    if target is not None:
        if context.protocol_version < 4:
            raise ContractError(ErrorCode.INCOMPATIBLE_VERSION, "Manual targets require protocol v4.")
        target = _require_mapping(target)
        _require_str(target, "targetId")
        wording = _require_str(target, "wording")
        if len(wording) > 24000:
            raise _invalid("Manual target wording exceeds 24,000 characters.")
        if _require_str(target, "sourceSnapshotId") != data.get("snapshotId"):
            raise ContractError(ErrorCode.INVALID_SPAN, "Manual target source mismatch.")

    if msg_type == "hello" and context.protocol_version >= 3:
        supported = data.get("supportedProtocolVersions")
        if supported is not None:
            if not isinstance(supported, list) or not supported:
                raise _invalid("supportedProtocolVersions must be a non-empty array.")
            for item in supported:
                if isinstance(item, bool) or not isinstance(item, int):
                    raise _invalid("supportedProtocolVersions must contain integers.")
            if not set(supported) & set(SUPPORTED_WIRE_VERSIONS):
                raise ContractError(
                    ErrorCode.INCOMPATIBLE_VERSION,
                    f"No supported protocol version in {supported!r}.",
                )

    if context.protocol_version >= 3:
        effort = data.get("reasoningEffort")
        if effort is not None:
            if not isinstance(effort, str) or effort not in KNOWN_REASONING_EFFORTS:
                raise _invalid(f"Unknown reasoningEffort: {effort!r}")
        _optional_number(data, "clientPressedAtMs")

    if msg_type in {"run_context_query", "run_snapshot_query"}:
        if msg_type == "run_context_query":
            window = data.get("windowSeconds")
            if window not in WINDOW_SECONDS:
                raise _invalid(f"Unsupported windowSeconds: {window!r}")
        else:
            snapshot_id = _require_str(data, "snapshotId")
            if context.known_snapshot_ids and snapshot_id not in context.known_snapshot_ids:
                raise ContractError(ErrorCode.INVALID_SPAN, f"Unknown snapshotId: {snapshot_id}")
        mode = _require_enum(data, "mode", ProfileMode)
        if mode is ProfileMode.CUSTOM:
            instruction = data.get("customInstruction")
            if not isinstance(instruction, str) or not instruction.strip():
                raise _invalid("Custom mode requires a non-empty customInstruction.")

    if msg_type == "create_snapshot":
        kind = _require_enum(data, "kind", SnapshotKind)
        if kind is SnapshotKind.SELECTION:
            spans = data.get("sourceSpans")
            if not isinstance(spans, list) or not spans:
                raise _invalid("Selection needs source spans.")
            for span in spans:
                validate_source_span(span)
        else:
            _require_str(data, "anchorSegmentKey")

    if msg_type == "context_note_action":
        _require_enum(data, "action", ContextNoteAction)
        _require_str(data, "noteId")
        _require_str(data, "text")
        if not isinstance(data.get("includeInFutureContext"), bool):
            raise _invalid("includeInFutureContext must be a boolean.")

    if msg_type == "configure_auto" and context.protocol_version < 6:
        raise ContractError(ErrorCode.INCOMPATIBLE_VERSION, "AUTO configuration requires v6.")
    if msg_type in {"set_auto", "configure_auto"} and context.protocol_version >= 6:
        revision = _require_int(data, "expectedConfigRevision")
        if revision < 0:
            raise _invalid("AUTO configuration revision cannot be negative.")
        if msg_type == "set_auto":
            if type(data.get("armed")) is not bool or data.get("mode") != "full_auto":
                raise _invalid("AUTO requires an armed boolean and full_auto mode.")
        else:
            settings = _require_mapping(data.get("settings"))
            if set(settings) != {"mode","presetId","customInstruction","model","reasoningEffort","humanNoteIds","includeScreenshot","screenshotDataUrl"}:
                raise _invalid("AUTO settings contain missing or unsupported fields.")
            if settings.get("mode") not in {"Preset", "Custom"} or type(settings.get("includeScreenshot")) is not bool:
                raise _invalid("AUTO settings need a profile and explicit screenshot flag.")
            if not isinstance(settings.get("humanNoteIds"), list) or len(settings["humanNoteIds"]) > 50 or any(not isinstance(i,str) or not i for i in settings["humanNoteIds"]):
                raise _invalid("AUTO human note IDs must be a bounded string array.")
            for key in ("presetId", "customInstruction", "model", "reasoningEffort", "screenshotDataUrl"):
                if settings.get(key) is not None and not isinstance(settings[key], str):
                    raise _invalid("AUTO setting fields must be strings or null.")
        return data
    if msg_type == "interaction_state" and context.protocol_version >= 6:
        reasons = data.get("holdReasons")
        if not isinstance(reasons,list) or len(reasons)>7 or any(not isinstance(r,str) or r not in {"raw_selection","target","question_editor","profile_editor","note_editor","settings","configuration_pending"} for r in reasons):
            raise _invalid("Unknown or excessive AUTO hold reasons.")
        for key in ("selectedSnapshotIds","openEditors","inspectedAnswerIds"):
            if not isinstance(data.get(key),list) or len(data[key])>200 or any(not isinstance(i,str) for i in data[key]):
                raise _invalid("Interaction identities must be bounded string arrays.")
        if type(data.get("publicationHold")) is not bool:
            raise _invalid("publicationHold must be a boolean.")

    if msg_type == "set_detection" and context.protocol_version >= 5:
        if type(data.get("enabled")) is not bool or type(data.get("retry", False)) is not bool:
            raise _invalid("Detection needs enabled and optional retry booleans.")

    if msg_type == "candidate_action" and context.protocol_version >= 5:
        validate_candidate_action(data)
        return data

    if msg_type == "candidate_action":
        action = _require_enum(data, "action", CandidateAction)
        candidate_id = _require_str(data, "candidateId")
        expected_revision = _require_int(data, "expectedRevision")
        if context.known_candidate_ids and candidate_id not in context.known_candidate_ids:
            raise ContractError(ErrorCode.INVALID_SPAN, f"Unknown candidateId: {candidate_id}")
        if action is not CandidateAction.CREATE and expected_revision != context.current_revision:
            raise ContractError(
                ErrorCode.STALE_REVISION,
                f"expectedRevision {expected_revision} != current {context.current_revision}",
            )
        raw_spans = data.get("sourceSpans")
        if not isinstance(raw_spans, list):
            raise _invalid("sourceSpans must be an array.")
        for raw_span in raw_spans:
            validate_source_span(raw_span)

    return data


def parse_answer_event(payload: Any, context: ContractContext) -> Answer:
    """Validate a server -> client v2 answer event."""
    data = _require_mapping(payload)
    if data.get("type") != "answer_finished":
        raise _invalid("parse_answer_event expects an answer_finished payload.")
    if data.get("protocolVersion") != context.protocol_version:
        raise ContractError(ErrorCode.INCOMPATIBLE_VERSION, "Unsupported protocolVersion.")
    request_id = _require_str(data, "requestId")
    answer_id = _require_str(data, "answerId")
    status = _require_enum(data, "status", AnswerStatus)
    event_seq = _require_int(data, "eventSeq")
    text = data.get("text")
    if not isinstance(text, str):
        raise _invalid("answer_finished.text must be a string.")

    retrieval_raw = data.get("retrieval")
    retrieval: Optional[RetrievalResult] = None
    if retrieval_raw is not None:
        retrieval_map = _require_mapping(retrieval_raw)
        outcome = _require_enum(retrieval_map, "outcome", RetrievalOutcome)
        chunks = []
        for raw_chunk in retrieval_map.get("chunks", ()) or ():
            chunk = _require_mapping(raw_chunk)
            chunks.append(
                RetrievedChunk(
                    doc_id=_require_str(chunk, "docId"),
                    file_path=str(chunk.get("filePath") or ""),
                    chunk_index=_require_int(chunk, "chunkIndex"),
                    title=_require_str(chunk, "title"),
                    excerpt=_require_str(chunk, "excerpt"),
                )
            )
        retrieval = RetrievalResult(outcome=outcome, chunks=tuple(chunks))

    return Answer(
        request_id=request_id,
        answer_id=answer_id,
        snapshot_id=data.get("snapshotId"),
        candidate_revision=data.get("candidateRevision"),
        status=status,
        text=text,
        event_seq=event_seq,
        latency_ms=data.get("latencyMs"),
        model=data.get("model"),
        screenshot_used=bool(data.get("screenshotUsed", False)),
        retrieval=retrieval,
        metadata=dict(data.get("metadata", {}) or {}),
        model_settings=(
            parse_model_settings(data.get("modelSettings"), version=context.protocol_version)
            if context.protocol_version >= 3 and data.get("modelSettings") is not None
            else None
        ),
        timing=(
            parse_answer_timing(data.get("timing"))
            if context.protocol_version >= 3 and data.get("timing") is not None
            else None
        ),
    )


def parse_answer_accepted_event(payload: Any, context: ContractContext) -> ModelSettings:
    """Validate an `answer_accepted` event (v3) and return its frozen model settings."""
    data = _require_mapping(payload)
    if data.get("type") != "answer_accepted":
        raise _invalid("parse_answer_accepted_event expects an answer_accepted payload.")
    if data.get("protocolVersion") != context.protocol_version:
        raise ContractError(ErrorCode.INCOMPATIBLE_VERSION, "Unsupported protocolVersion.")
    if context.protocol_version < 3:
        raise ContractError(
            ErrorCode.INCOMPATIBLE_VERSION,
            "answer_accepted carries frozen model settings only in protocol version 3.",
        )
    _require_str(data, "requestId")
    _require_str(data, "answerId")
    _require_str(data, "snapshotId")
    frozen = _require_mapping(data.get("frozenInputs"))
    _require_str(frozen, "instruction")
    parse_screenshot_attachment(frozen.get("screenshot"))
    settings = parse_model_settings(frozen.get("model"), version=context.protocol_version)
    if data.get("timing") is not None:
        parse_answer_timing(data.get("timing"))
    return settings


def parse_answer_timing_event(payload: Any, context: ContractContext) -> AnswerTiming:
    """Validate an `answer_timing` event (v3)."""
    data = _require_mapping(payload)
    if data.get("type") != "answer_timing":
        raise _invalid("parse_answer_timing_event expects an answer_timing payload.")
    if data.get("protocolVersion") != context.protocol_version:
        raise ContractError(ErrorCode.INCOMPATIBLE_VERSION, "Unsupported protocolVersion.")
    if context.protocol_version < 3:
        raise ContractError(
            ErrorCode.INCOMPATIBLE_VERSION,
            "answer_timing exists only in protocol version 3.",
        )
    _require_str(data, "requestId")
    _require_str(data, "answerId")
    timing_seq = _require_int(data, "timingSeq")
    if timing_seq < 1:
        raise _invalid("timingSeq must be >= 1.")
    return parse_answer_timing(data.get("timing"))


def parse_answer_state_event(payload: Any, context: ContractContext) -> dict:
    data = _require_mapping(payload)
    if context.protocol_version < 4 or data.get('protocolVersion') != context.protocol_version:
        raise ContractError(ErrorCode.INCOMPATIBLE_VERSION, 'Answer state requires protocol v4.')
    if data.get('type') != 'answer_state':
        raise _invalid('Expected answer_state.')
    for key in ('backendInstanceId', 'connectionId', 'requestId', 'answerId', 'reason'):
        _require_str(data, key)
    _require_int(data, 'sessionEpoch')
    if _require_int(data, 'stateSeq') < 1 or data.get('placement') not in {'working', 'kept'}:
        raise _invalid('Invalid answer state sequence/placement.')
    if not isinstance(data.get('removed'), bool) or not isinstance(data.get('snapshotAvailable'), bool):
        raise _invalid('Answer state flags must be booleans.')
    return dict(data)


def validate_candidate_action(data):
    action = _require_enum(data, "action", CandidateAction).value
    parents, drafts = data.get("parents"), data.get("drafts")
    if not isinstance(parents, list) or not isinstance(drafts, list):
        raise _invalid("Candidate actions need parents and drafts arrays.")
    expected = {"create": (0, 1), "edit": (1, 1), "split": (1, None), "merge": (None, 1),
                "dismiss": (1, 0), "undo": (1, 0), "correct": (None, 1)}[action]
    if (expected[0] is not None and len(parents) != expected[0]) or (expected[1] is not None and len(drafts) != expected[1]):
        raise _invalid("Wrong number of candidate parents/drafts.")
    if (action == "split" and not 2 <= len(drafts) <= 8) or (action == "merge" and not 2 <= len(parents) <= 8) or (action == "correct" and len(parents) > 1):
        raise _invalid("Split needs 2-8 drafts; merge needs 2-8 parents; correction has at most one parent.")
    ids = set()
    for raw in parents:
        parent = _require_mapping(raw)
        identity = _require_str(parent, "candidateId")
        revision = _require_int(parent, "expectedRevision")
        if revision < 1 or identity in ids:
            raise _invalid("Candidate parents need distinct identities and positive revisions.")
        ids.add(identity)
    for raw in drafts:
        draft = _require_mapping(raw)
        wording = _require_str(draft, "wording")
        spans = draft.get("sourceSpans")
        if len(wording) > 2000 or not isinstance(spans, list) or not 0 < len(spans) <= 64:
            raise _invalid("Draft needs 1-2000 characters and 1-64 source spans.")
        for span in spans:
            validate_source_span(span)
    if action == "correct":
        _require_str(data, "sourceAnswerId")
    return data


def parse_question_event(payload, context):
    data = _require_mapping(payload)
    if context.protocol_version not in (5,6) or data.get('protocolVersion') != context.protocol_version:
        raise ContractError(ErrorCode.INCOMPATIBLE_VERSION, 'Question state requires protocol v5.')
    for key in ('backendInstanceId', 'connectionId'):
        _require_str(data, key)
    _require_int(data, 'sessionEpoch')
    if _require_int(data, 'stateSeq') < 1:
        raise _invalid('Question state sequence must be positive.')
    if data.get('type') == 'detector_state':
        if any(type(data.get(k)) is not bool for k in ('enabled','inFlight','dirty','truncated')) or data.get('outcome') not in {'disabled','disconnected','no_source','running','proposals','no_candidates','failed','superseded'}:
            raise _invalid('Invalid detector state.')
        if data.get('lastError') is not None and not isinstance(data['lastError'], str):
            raise _invalid('Invalid detector error.')
        if data.get('lastRevision') is not None and (type(data['lastRevision']) is not int or data['lastRevision'] < 0):
            raise _invalid('Invalid detector revision.')
        if data.get('model') is not None:
            parse_model_settings(data['model'], version=5)
        return dict(data)
    if data.get('type') != 'candidate_state' or not 0 <= _require_int(data,'revisionCount') <= 200:
        raise _invalid('Invalid candidate state.')
    candidates = data.get('candidates')
    if not isinstance(candidates,list) or len(candidates)>200:
        raise _invalid('Invalid candidate list.')
    ids = set()
    for raw in candidates:
        c = _require_mapping(raw)
        identity = _require_str(c,'candidateId')
        if identity in ids or _require_int(c,'candidateRevision') < 1 or len(_require_str(c,'wording'))>2000 or c.get('state') not in {s.value for s in CandidateState}:
            raise _invalid('Invalid candidate.')
        ids.add(identity)
        if context.protocol_version >= 6:
            review = c.get("reviewReasons")
            if "reviewReasons" not in c or (review is not None and (not isinstance(review,list) or len(review)>5 or any(not isinstance(r,str) or r not in {"incomplete","ambiguous","conflicting","negated","unsupported"} for r in review))):
                raise _invalid("Invalid AUTO review flags.")
            if "autoStatus" not in c or (c["autoStatus"] is not None and (not isinstance(c["autoStatus"],str) or c["autoStatus"] not in {"pending","active","deferred","attempted"})):
                raise _invalid("Invalid candidate AUTO status.")
        snapshot = c.get('snapshot')
        if c.get('origin') not in {'human','detector'} or not isinstance(c.get('supersedes'),list) or not isinstance(snapshot,dict) or not isinstance(snapshot.get('text'),str):
            raise _invalid('Invalid candidate provenance.')
        _require_str(snapshot,'snapshotId')
        spans=c.get('sourceSpans')
        if not isinstance(spans,list) or not spans or len(spans)>64 or snapshot.get('sourceSpans') != spans:
            raise _invalid('Invalid candidate evidence.')
        for span in spans: validate_source_span(span)
    return dict(data)


def parse_assistance_state(payload, context):
    data = _require_mapping(payload)
    if context.protocol_version != 6 or data.get("protocolVersion") != 6:
        raise ContractError(ErrorCode.INCOMPATIBLE_VERSION, "AUTO state requires protocol v6.")
    if any(key not in data for key in ("lastError","activeAnswerId","deferredAnswerId","pendingCandidate")):
        raise _invalid("Missing AUTO state fields.")
    if data.get("type") != "assistance_state":
        raise _invalid("Expected assistance_state.")
    for key in ("backendInstanceId","connectionId","pauseReason"):
        _require_str(data,key)
    _require_int(data,"sessionEpoch")
    if _require_int(data,"stateSeq")<1 or _require_int(data,"configRevision")<0:
        raise _invalid("Invalid AUTO state revision/sequence.")
    for key in ("autoArmed","listening","detectionEnabled","configurationReady","generationBusy"):
        if type(data.get(key)) is not bool:
            raise _invalid("Invalid AUTO state flags.")
    if data.get("lastError") is not None and not isinstance(data["lastError"],str):
        raise _invalid("Invalid AUTO error.")
    for key in ("activeAnswerId","deferredAnswerId"):
        if data.get(key) is not None:
            _require_str(data,key)
    reasons = data.get("holdReasons")
    if not isinstance(reasons,list) or len(reasons)>7 or any(not isinstance(r,str) or r not in {"raw_selection","target","question_editor","profile_editor","note_editor","settings","configuration_pending"} for r in reasons):
        raise _invalid("Invalid AUTO hold reasons.")
    if data.get("pendingCandidate") is not None:
        pending=_require_mapping(data["pendingCandidate"])
        _require_str(pending,"candidateId")
        if _require_int(pending,"candidateRevision")<1:
            raise _invalid("Invalid pending candidate revision.")
    return dict(data)
