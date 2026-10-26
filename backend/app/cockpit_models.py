"""Protocol v2/v3 data models (M01-T04, amended by M3bis-T04).

These definitions describe the wire contract that `cockpit_protocol.py` parses
and `main.py` serializes. They are intentionally free of runtime/IO logic so
they can be shared by tests and fixtures.

Protocol v3 (M3bis) adds role/capability metadata for model readiness and the
C08 timing contract (units, clock origins, nullable measurements). The recorded
v2 contract is unchanged: a v2 payload still parses exactly as it did.

Internal Python field names are snake_case. The camelCase wire representation
is produced by `cockpit_protocol.py` and mirrors `frontend/src/cockpit/types.ts`
and `docs/API.md`.

See ADR 0012, ADR 0014 and docs/API.md ("Protocol v2", "Protocol v3").
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ProtocolVersion(int, Enum):
    """Wire protocol versions this build can speak."""

    LEGACY = 1
    V2 = 2
    V3 = 3
    V4 = 4
    V5 = 5
    V6 = 6


#: Wire versions the server accepts today. `LEGACY` keeps its own adapter.
SUPPORTED_WIRE_VERSIONS: tuple[int, ...] = (2, 3, 4, 5, 6)

#: Newest version this build prefers when a client offers several.
PREFERRED_WIRE_VERSION = 6

#: Reasoning effort labels this contract accepts from a client (M3bis-T02).
KNOWN_REASONING_EFFORTS: tuple[str, ...] = ("low", "medium", "high")


class SourceKind(str, Enum):
    """Identifies an audio input, never a person."""

    SYSTEM = "system"
    MIC = "mic"


class SnapshotKind(str, Enum):
    RECENT_WINDOW = "recent_window"
    SELECTION = "selection"
    PINNED_MOMENT = "pinned_moment"


class AnswerStatus(str, Enum):
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"
    EMPTY = "empty"
    SUPERSEDED = "superseded"


class RetrievalOutcome(str, Enum):
    USED = "used"
    NO_DOCUMENTS = "no_documents"
    NO_MATCHES = "no_matches"
    FAILED = "failed"


class CandidateState(str, Enum):
    PROPOSED = "proposed"
    INCOMPLETE = "incomplete"
    NEEDS_REVIEW = "needs_review"
    USER_SET = "user_set"
    QUEUED = "queued"
    ANSWERED = "answered"
    DISMISSED = "dismissed"
    SUPERSEDED = "superseded"


class CandidateAction(str, Enum):
    CREATE = "create"
    EDIT = "edit"
    SPLIT = "split"
    MERGE = "merge"
    DISMISS = "dismiss"
    UNDO = "undo"
    CORRECT = "correct"


class AnswerAction(str, Enum):
    KEEP = "keep"
    UNKEEP = "unkeep"
    REMOVE = "remove"


class ContextNoteAction(str, Enum):
    CREATE = "create"
    EDIT = "edit"
    REMOVE = "remove"


class CommandStatus(str, Enum):
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    UNKNOWN = "unknown"


class PauseReason(str, Enum):
    NOT_ARMED = "not_armed"
    NO_CAPABILITY = "no_capability"
    NO_OWNER = "no_owner"
    NO_SOURCE_EPOCH = "no_source_epoch"
    HOLD = "hold"
    CAPACITY = "capacity"
    OWNER_LOST = "owner_lost"


class ErrorCode(str, Enum):
    OFFLINE = "offline"
    NOT_READY = "not_ready"
    INCOMPATIBLE_VERSION = "incompatible_version"
    NOT_OWNER = "not_owner"
    STALE_EPOCH = "stale_epoch"
    STALE_REVISION = "stale_revision"
    INVALID_SPAN = "invalid_span"
    CAPACITY = "capacity"
    DEPENDENCY = "dependency"
    EMPTY = "empty"
    INVALID_PAYLOAD = "invalid_payload"
    #: The requested role/attachment/reasoning combination is known-incompatible,
    #: or cannot be positively confirmed for the selected model (M3bis-T02).
    UNSUPPORTED_CAPABILITY = "unsupported_capability"
    #: The selected model is absent from a catalog this backend actually read.
    UNAVAILABLE_MODEL = "unavailable_model"


class ModelRole(str, Enum):
    """A model's job in the pipeline. Roles are never interchangeable silently."""

    ANSWER = "answer"
    DETECTOR = "detector"


class ModelSelectionSource(str, Enum):
    """Where the effective model came from. Never used to swap models silently."""

    CLIENT = "client"
    ENVIRONMENT = "environment"
    DEFAULT = "default"
    DEPRECATED_ALIAS = "deprecated_alias"


class CapabilityCertainty(str, Enum):
    """How much is actually known about a model's capabilities.

    `verified` means observed against this account (no model is `verified` yet);
    `catalog` means public Gateway metadata checked on a recorded date;
    `unknown` means nothing is positively known.
    """

    VERIFIED = "verified"
    CATALOG = "catalog"
    UNKNOWN = "unknown"


class TimingClock(str, Enum):
    """Clock domain of a timing block. Values from two domains never combine."""

    SERVER_MONOTONIC = "server_monotonic"
    CLIENT_MONOTONIC = "client_monotonic"


class ProfileMode(str, Enum):
    PRESET = "Preset"
    CUSTOM = "Custom"


@dataclass(frozen=True)
class SourceSpan:
    """A validated half-open `[start, end)` range over a frozen segment."""

    segment_key: str
    start: int
    end: int
    t0: float
    t1: float
    source_kind: SourceKind
    source_name: Optional[str]
    audio_epoch: str
    revision: int


@dataclass(frozen=True)
class Snapshot:
    snapshot_id: str
    kind: SnapshotKind
    text: str
    char_count: int
    truncated: bool
    source_spans: tuple[SourceSpan, ...] = field(default_factory=tuple)
    anchor_segment_key: Optional[str] = None
    created_at: float = 0.0
    #: True when the frozen text includes explicitly requested partial text. A
    #: tentative snapshot may be used for a manual answer, never for AUTO.
    tentative: bool = False


@dataclass(frozen=True)
class Target:
    """An explicit, optionally human-edited intent that overrides recent context."""

    target_id: str
    wording: str
    source_snapshot_id: Optional[str]
    source_spans: tuple[SourceSpan, ...] = field(default_factory=tuple)
    mode: ProfileMode = ProfileMode.PRESET
    created_by: str = "user"
    created_at: float = 0.0
    superseded_by: Optional[str] = None


@dataclass(frozen=True)
class Candidate:
    candidate_id: str
    candidate_revision: int
    state: CandidateState
    wording: str
    reason: Optional[str]
    origin: str
    source_spans: tuple[SourceSpan, ...] = field(default_factory=tuple)
    supersedes: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ModelCapabilities:
    """Capabilities of one model for one role.

    `image_input` and `structured_output` are *positively* supported facts: an
    unknown model reports `False`, which makes an attachment-bearing or detector
    request fail visibly instead of dropping the image or guessing.
    """

    text_input: bool = True
    text_output: bool = True
    image_input: bool = False
    structured_output: bool = False
    reasoning_efforts: tuple[str, ...] = field(default_factory=tuple)
    certainty: CapabilityCertainty = CapabilityCertainty.UNKNOWN

    def supports_reasoning(self, effort: str) -> bool:
        return effort in self.reasoning_efforts


@dataclass(frozen=True)
class ReasoningSetting:
    """The accepted reasoning preference and whether this build actually sends it."""

    effort: str
    applied: bool
    supported_efforts: tuple[str, ...] = field(default_factory=tuple)
    source: str = "role_default"


@dataclass(frozen=True)
class ModelSettings:
    """Frozen effective model choice for one request. A rerun re-freezes it."""

    role: ModelRole
    model: str
    requested_model: Optional[str]
    selection_source: ModelSelectionSource
    capabilities: ModelCapabilities
    reasoning: Optional[ReasoningSetting] = None
    substituted_from: Optional[str] = None
    notice: Optional[str] = None


@dataclass(frozen=True)
class ScreenshotAttachment:
    """What the client asked for and what the request actually carries."""

    requested: bool = False
    included: bool = False
    reason: Optional[str] = None


@dataclass(frozen=True)
class FrozenInputs:
    """Everything a rerun must reuse unchanged (C05/C08)."""

    instruction: str
    mode: ProfileMode
    preset_id: Optional[str]
    human_note_ids: tuple[str, ...]
    model: ModelSettings
    screenshot: ScreenshotAttachment


@dataclass(frozen=True)
class RagTiming:
    """Backend retrieval window in milliseconds from request acceptance."""

    start_ms: float
    end_ms: float
    outcome: RetrievalOutcome

    @property
    def duration_ms(self) -> float:
        return self.end_ms - self.start_ms


@dataclass(frozen=True)
class GenerationTiming:
    """Backend Gateway window; `first_delta_ms` is the first nonempty answer delta."""

    start_ms: float
    first_delta_ms: Optional[float]
    end_ms: float


@dataclass(frozen=True)
class BackendTiming:
    """Server monotonic measurements, all relative to request acceptance.

    Unmeasured stages are `None` and named in `unavailable`; they are never
    replaced with zero or a benchmark number.
    """

    clock: TimingClock = TimingClock.SERVER_MONOTONIC
    accepted_ms: float = 0.0
    rag: Optional[RagTiming] = None
    generation: Optional[GenerationTiming] = None
    completed_ms: Optional[float] = None
    unavailable: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ClientTiming:
    """Client monotonic measurements. The backend echoes these and never computes with them."""

    clock: TimingClock = TimingClock.CLIENT_MONOTONIC
    pressed_ms: Optional[float] = None
    first_visible_ms: Optional[float] = None
    terminal_received_ms: Optional[float] = None


@dataclass(frozen=True)
class AnswerTiming:
    backend: BackendTiming
    client: Optional[ClientTiming] = None


@dataclass(frozen=True)
class RetrievedChunk:
    """Actual retrieval evidence. `doc_id:chunk_index` is the chunk identity."""

    doc_id: str
    file_path: str
    chunk_index: int
    title: str
    excerpt: str


@dataclass(frozen=True)
class RetrievalResult:
    outcome: RetrievalOutcome
    chunks: tuple[RetrievedChunk, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class Answer:
    """One immutable answer card. A rerun gets a new `request_id`/`answer_id`."""

    request_id: str
    answer_id: str
    snapshot_id: Optional[str]
    candidate_revision: Optional[int]
    status: AnswerStatus
    text: str
    event_seq: int
    latency_ms: Optional[int] = None
    model: Optional[str] = None
    screenshot_used: bool = False
    retrieval: Optional[RetrievalResult] = None
    metadata: dict = field(default_factory=dict)
    #: v3 only. `None` on a v2 payload.
    model_settings: Optional[ModelSettings] = None
    timing: Optional[AnswerTiming] = None


@dataclass(frozen=True)
class ControlState:
    is_owner: bool
    owner_connection_id: Optional[str]
    read_only: bool
    session_epoch: int


@dataclass(frozen=True)
class Capabilities:
    values: tuple[str, ...] = field(default_factory=tuple)

    def supports(self, capability: str) -> bool:
        return capability in self.values


@dataclass(frozen=True)
class HelloAck:
    backend_instance_id: str
    connection_id: str
    session_epoch: int
    capabilities: Capabilities
    server_time: float = 0.0
    protocol_version: int = PREFERRED_WIRE_VERSION
    supported_protocol_versions: tuple[int, ...] = SUPPORTED_WIRE_VERSIONS


@dataclass(frozen=True)
class CommandAck:
    command_id: str
    accepted: bool
    request_id: Optional[str] = None
    answer_id: Optional[str] = None


@dataclass(frozen=True)
class CommandStatusRecord:
    command_id: str
    status: CommandStatus
    request_id: Optional[str] = None
    answer_id: Optional[str] = None


@dataclass(frozen=True)
class DetectorState:
    enabled: bool
    in_flight: bool
    last_error: Optional[str] = None
    dirty: bool = False


@dataclass(frozen=True)
class AssistanceState:
    auto_armed: bool
    pause_reason: PauseReason
    active_answer_id: Optional[str] = None
    pending_candidate_id: Optional[str] = None
    generation_busy: bool = False
