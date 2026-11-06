"""Owned, versioned assistance session state (M03).

This module holds the transport-adjacent state that makes one UI the controller
and every other connection read-only for assistance:

- `ControlLease`: the single control lease plus the server-owned `sessionEpoch`.
- `CommandRegistry`: bounded `commandId` outcomes so a duplicate send never
  executes a paid command twice and an unacknowledged command can be reconciled.
- `RequestRegistry`: one immutable request record per answer attempt. Records
  survive until a definitive status is known; a nonterminal legacy
  `query_state` cannot discard them.

No IO, no sockets, no model calls. `main.py` wires these to the hub, and
`ws_server.py` supplies the connection identity.

See ADR 0012 and docs/API.md ("Protocol v2").
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

from .cockpit_models import (
    SUPPORTED_WIRE_VERSIONS,
    AnswerStatus,
    CommandStatus,
    ErrorCode,
)

#: Capabilities advertised to a v2 client. `candidates`, `answer_records`, and
#: `full_auto` are added by later milestones, never before their checks pass.
M03_CAPABILITIES: tuple[str, ...] = ("assist", "snapshots")

#: Capabilities added by the amended v3 contract (M3bis).
#: `model_readiness` = preflight role/capability validation is implemented;
#: `timing` = scoped C08 timing fields are serialized (unmeasured stages are
#: reported as null, never as fabricated values).
V3_CAPABILITIES: tuple[str, ...] = M03_CAPABILITIES + ("model_readiness", "timing")


def capabilities_for(version: int) -> tuple[str, ...]:
    """Capabilities this build actually implements for a negotiated version."""
    if version < 3:
        return M03_CAPABILITIES
    result = V3_CAPABILITIES
    if version >= 4:
        result += ("manual_targets", "answer_rerun", "answer_state", "answer_records")
    if version >= 5:
        result += ("candidates",)
    if version >= 6:
        result += ("full_auto",)
    return result


def negotiate_protocol_version(preferred: object, supported: object = None) -> Optional[int]:
    """Pick the newest version both sides can speak, or `None` for none.

    A client may advertise `supportedProtocolVersions`; otherwise its single
    `protocolVersion` is the only offer. No version is assumed for a client that
    offers nothing this build supports.
    """
    if isinstance(supported, (list, tuple)):
        offered = {item for item in supported if isinstance(item, int) and not isinstance(item, bool)}
        common = [version for version in SUPPORTED_WIRE_VERSIONS if version in offered]
        if common:
            return max(common)
        return None
    if isinstance(preferred, int) and not isinstance(preferred, bool) and preferred in SUPPORTED_WIRE_VERSIONS:
        return preferred
    return None


#: Plan contract C04: client acknowledgement deadline.
ACK_TIMEOUT_SECONDS = 5.0

MAX_COMMAND_HISTORY = 500
MAX_REQUEST_HISTORY = 200


class AssistanceError(Exception):
    """A command was rejected. `code` is a stable contract `ErrorCode`."""

    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class ControlLease:
    """The one control lease for assistance and capture-changing commands."""

    def __init__(self, backend_instance_id: str, session_epoch: int = 1) -> None:
        self.backend_instance_id = backend_instance_id
        self.session_epoch = session_epoch
        self._owner_connection_id: Optional[str] = None

    @property
    def owner_connection_id(self) -> Optional[str]:
        return self._owner_connection_id

    @property
    def has_owner(self) -> bool:
        return self._owner_connection_id is not None

    def is_owner(self, connection_id: Optional[str]) -> bool:
        return bool(connection_id) and connection_id == self._owner_connection_id

    def claim(self, connection_id: str) -> bool:
        """Grant the lease. Returns False when another connection holds it."""
        if not connection_id:
            return False
        if self._owner_connection_id in (None, connection_id):
            self._owner_connection_id = connection_id
            return True
        return False

    def release(self, connection_id: Optional[str] = None) -> bool:
        """Release the lease held by `connection_id` (or any owner if omitted).

        Releasing the active owner invalidates the session epoch so in-flight
        commands from the old owner cannot be applied to the new session.
        """
        if self._owner_connection_id is None:
            return False
        if connection_id is not None and connection_id != self._owner_connection_id:
            return False
        self._owner_connection_id = None
        self.session_epoch += 1
        return True

    def invalidate(self, reason: str = "") -> int:
        """Bump the session epoch (transcript clear, capture restart)."""
        self.session_epoch += 1
        return self.session_epoch

    def require_owner(self, connection_id: Optional[str]) -> None:
        if not self.is_owner(connection_id):
            raise AssistanceError(
                ErrorCode.NOT_OWNER,
                "Another connection controls assistance." if self.has_owner else "Claim control first.",
            )

    def require_epoch(self, session_epoch: object) -> None:
        if not isinstance(session_epoch, int) or isinstance(session_epoch, bool):
            raise AssistanceError(ErrorCode.INVALID_PAYLOAD, "sessionEpoch must be an integer.")
        if session_epoch != self.session_epoch:
            raise AssistanceError(
                ErrorCode.STALE_EPOCH,
                f"sessionEpoch {session_epoch} != current {self.session_epoch}.",
            )

    def require_instance(self, backend_instance_id: object) -> None:
        if not isinstance(backend_instance_id, str) or backend_instance_id != self.backend_instance_id:
            raise AssistanceError(
                ErrorCode.INCOMPATIBLE_VERSION,
                "This message targets a different backend instance.",
            )


@dataclass
class CommandOutcome:
    """The retained result of one client command."""

    command_id: str
    connection_id: str
    accepted: bool
    status: CommandStatus
    request_id: Optional[str] = None
    answer_id: Optional[str] = None
    code: Optional[ErrorCode] = None
    message: Optional[str] = None
    created_at: float = 0.0


class CommandRegistry:
    """Bounded duplicate-send suppression and reconciliation records."""

    def __init__(
        self,
        max_entries: int = MAX_COMMAND_HISTORY,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._clock = clock
        self._max_entries = max_entries
        self._outcomes: Dict[str, CommandOutcome] = {}

    @staticmethod
    def _key(connection_id: str, command_id: str) -> str:
        return f"{connection_id}:{command_id}"

    def get(self, connection_id: str, command_id: str) -> Optional[CommandOutcome]:
        if not connection_id or not command_id:
            return None
        return self._outcomes.get(self._key(connection_id, command_id))

    def record(self, outcome: CommandOutcome) -> CommandOutcome:
        if not outcome.created_at:
            outcome.created_at = self._clock()
        self._outcomes[self._key(outcome.connection_id, outcome.command_id)] = outcome
        self._prune()
        return outcome

    def accept(
        self,
        connection_id: str,
        command_id: str,
        *,
        request_id: Optional[str] = None,
        answer_id: Optional[str] = None,
    ) -> CommandOutcome:
        return self.record(
            CommandOutcome(
                command_id=command_id,
                connection_id=connection_id,
                accepted=True,
                status=CommandStatus.ACCEPTED,
                request_id=request_id,
                answer_id=answer_id,
            )
        )

    def discard(self, connection_id: str, command_id: str) -> Optional[CommandOutcome]:
        return self._outcomes.pop(self._key(connection_id, command_id), None)

    def reject(self, connection_id: str, command_id: str, error: AssistanceError) -> CommandOutcome:
        return self.record(
            CommandOutcome(
                command_id=command_id,
                connection_id=connection_id,
                accepted=False,
                status=CommandStatus.REJECTED,
                code=error.code,
                message=error.message,
            )
        )

    def status_for(self, connection_id: str, command_id: str) -> CommandStatus:
        outcome = self.get(connection_id, command_id)
        return outcome.status if outcome else CommandStatus.UNKNOWN

    def _prune(self) -> None:
        overflow = len(self._outcomes) - self._max_entries
        if overflow <= 0:
            return
        ordered: List[tuple[float, str]] = sorted(
            ((outcome.created_at, key) for key, outcome in self._outcomes.items()),
        )
        for _created_at, key in ordered[:overflow]:
            self._outcomes.pop(key, None)

    def __len__(self) -> int:
        return len(self._outcomes)


@dataclass
class RequestRecord:
    """One answer attempt. A rerun gets a new `request_id`/`answer_id`."""

    request_id: str
    answer_id: str
    command_id: Optional[str] = None
    connection_id: Optional[str] = None
    session_epoch: int = 0
    snapshot_id: Optional[str] = None
    mode: str = "Preset"
    model: str = ""
    status: str = "running"
    event_seq: int = 0
    text: str = ""
    terminal: bool = False
    legacy: bool = False
    candidate_revision: Optional[int] = None
    created_at: float = 0.0
    metadata: dict = field(default_factory=dict)
    #: v3 (M3bis): frozen inputs, role/capability provenance, and C08 timing.
    frozen_inputs: dict = field(default_factory=dict)
    model_settings: Optional[dict] = None
    timing: dict = field(default_factory=dict)
    timing_seq: int = 0
    #: Monotonic instant of acceptance; the origin of every server timing value.
    accepted_perf: float = 0.0
    #: Client monotonic press instant, echoed for display correlation only.
    client_pressed_at_ms: Optional[float] = None
    protocol_version: int = 2

    def next_event_seq(self) -> int:
        self.event_seq += 1
        return self.event_seq

    def next_timing_seq(self) -> int:
        self.timing_seq += 1
        return self.timing_seq

    def append_text(self, delta: str) -> str:
        self.text += delta
        return self.text


class RequestRegistry:
    """Bounded request records with one active answer slot."""

    def __init__(
        self,
        max_entries: int = MAX_REQUEST_HISTORY,
        clock: Callable[[], float] = time.time,
        on_prune: Optional[Callable[[RequestRecord], None]] = None,
    ) -> None:
        self._clock = clock
        self._max_entries = max_entries
        self._on_prune = on_prune
        self._records: Dict[str, RequestRecord] = {}
        self.is_protected: Callable[[RequestRecord], bool] = lambda record: bool(record.metadata.get("placement") == "kept")

    def ensure_capacity(self) -> None:
        """Prune terminal history and reject when every bounded slot is live."""
        self._prune()
        if len(self._records) >= self._max_entries:
            terminal_keys = sorted(
                (record.created_at, request_id)
                for request_id, record in self._records.items()
                if record.terminal and not self.is_protected(record)
            )
            while len(self._records) >= self._max_entries and terminal_keys:
                _created_at, request_id = terminal_keys.pop(0)
                evicted = self._records.pop(request_id, None)
                if evicted is not None and self._on_prune:
                    self._on_prune(evicted)
        if len(self._records) >= self._max_entries:
            raise AssistanceError(ErrorCode.CAPACITY, "Request history is full of active answers.")

    def create(self, record: RequestRecord) -> RequestRecord:
        if not record.created_at:
            record.created_at = self._clock()
        if record.request_id not in self._records and len(self._records) >= self._max_entries:
            self.ensure_capacity()
        self._records[record.request_id] = record
        self._prune()
        return record

    def get(self, request_id: str) -> Optional[RequestRecord]:
        if not request_id:
            return None
        return self._records.get(request_id)

    def get_by_answer_id(self, answer_id: str) -> Optional[RequestRecord]:
        if not answer_id:
            return None
        return next((record for record in self._records.values() if record.answer_id == answer_id), None)

    def discard(self, request_id: str) -> Optional[RequestRecord]:
        """Remove a record that never reached accepted-event dispatch."""
        return self._records.pop(request_id, None)

    def running(self, *, exclude_request_id: Optional[str] = None) -> List[RequestRecord]:
        return [record for record in self._records.values() if not record.terminal and record.request_id != exclude_request_id]

    def active(self) -> Optional[RequestRecord]:
        running = self.running()
        return running[-1] if running else None

    def is_busy(self) -> bool:
        return bool(self.running())

    def owned_by(self, connection_id: Optional[str]) -> List[RequestRecord]:
        return [
            record
            for record in self.running()
            if record.connection_id == connection_id
        ]

    def cancel(
        self,
        request_id: str,
        answer_id: Optional[str],
        connection_id: Optional[str],
        *,
        privileged: bool = False,
    ) -> RequestRecord:
        """Return the matching owned request record or raise `AssistanceError`."""
        record = self._records.get(request_id or "")
        if record is None:
            raise AssistanceError(ErrorCode.INVALID_SPAN, f"Unknown requestId: {request_id}")
        if answer_id and answer_id != record.answer_id:
            raise AssistanceError(
                ErrorCode.INVALID_SPAN,
                "requestId and answerId do not identify the same answer.",
            )
        if not privileged and record.connection_id != connection_id:
            raise AssistanceError(
                ErrorCode.NOT_OWNER,
                "This request belongs to a different connection.",
            )
        return record

    def finish(self, record: RequestRecord, status: AnswerStatus, text: Optional[str] = None) -> RequestRecord:
        record.status = status.value
        record.terminal = True
        if text is not None:
            record.text = text
        return record

    def _prune(self) -> None:
        overflow = len(self._records) - self._max_entries
        if overflow <= 0:
            return
        newest_request_id = next(reversed(self._records))
        terminal_keys = [
            (record.created_at, request_id)
            for request_id, record in self._records.items()
            if record.terminal and request_id != newest_request_id and not self.is_protected(record)
        ]
        terminal_keys.sort()
        for _created_at, request_id in terminal_keys[:overflow]:
            evicted = self._records.pop(request_id, None)
            if evicted is not None and self._on_prune:
                self._on_prune(evicted)

    def __len__(self) -> int:
        return len(self._records)


@dataclass
class InteractionState:
    """Human holds that capacity checks must respect."""

    selected_snapshot_ids: List[str] = field(default_factory=list)
    open_editors: List[str] = field(default_factory=list)
    inspected_answer_ids: List[str] = field(default_factory=list)
    publication_hold: bool = False
    hold_reasons: List[str] = field(default_factory=list)
    owner_connection_id: Optional[str] = None

    def update(self, payload: dict, connection_id: Optional[str]) -> None:
        self.selected_snapshot_ids = _string_list(payload.get("selectedSnapshotIds"))
        self.open_editors = _string_list(payload.get("openEditors"))
        self.inspected_answer_ids = _string_list(payload.get("inspectedAnswerIds"))
        self.hold_reasons = _string_list(payload.get("holdReasons"))
        self.publication_hold = bool(payload.get("publicationHold")) or bool(self.hold_reasons) or bool(self.open_editors) or bool(self.selected_snapshot_ids)
        self.owner_connection_id = connection_id

    def is_protected(self, *, answer_id: Optional[str] = None, snapshot_id: Optional[str] = None) -> bool:
        if self.publication_hold:
            return True
        if answer_id and answer_id in self.inspected_answer_ids:
            return True
        if snapshot_id and snapshot_id in self.selected_snapshot_ids:
            return True
        return False


def _string_list(value: object) -> List[str]:
    if not isinstance(value, (list, tuple)):
        return []
    return [str(item) for item in value if isinstance(item, str) and item]


@dataclass
class AutoScheduler:
    """Pure session-owned execution slots. Networking lives in AutoService."""
    armed: bool = False
    pending: Optional[tuple[str, int]] = None
    active_request_id: Optional[str] = None
    deferred_request_id: Optional[str] = None
    attempted: set[tuple[str, int]] = field(default_factory=set)
    config_revision: int = 0
    config: Optional[dict] = None
    pause_reason: str = "not_armed"
    last_error: Optional[str] = None
    newest_rank: tuple[int, int] = (-1, -1)

    def arm(self) -> None:
        self.armed = True
        self.pending = None
        self.pause_reason = "ready"
        self.last_error = None
        self.newest_rank = (-1, -1)

    def pause(self, reason: str, error: Optional[str] = None) -> None:
        self.armed = False
        self.pending = None
        self.pause_reason = reason
        self.last_error = error

    def offer(self, identity: tuple[str, int], rank: tuple[int, int]) -> bool:
        if not self.armed or identity in self.attempted or rank < self.newest_rank:
            return False
        self.pending = identity
        self.newest_rank = rank
        return True

    def take(self) -> Optional[tuple[str, int]]:
        identity, self.pending = self.pending, None
        if identity:
            self.attempted.add(identity)
        return identity
