"""Session-owned immutable candidate history and M07 transport handlers."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, replace

from .assistance import AssistanceError
from .cockpit_models import ErrorCode, ModelRole, AnswerStatus
from .cockpit_protocol import ContractContext, ContractError, parse_command
from .model_roles import resolve_model_settings
from .question_detector import QuestionDetector, freeze_input
from .source_snapshots import SnapshotError

MAX_CANDIDATE_REVISIONS = 200


def span_wire(s):
    return {"segmentKey": s.segment_key, "revision": s.revision, "start": s.start, "end": s.end,
            "t0": s.t0, "t1": s.t1, "sourceKind": s.source_kind.value, "sourceName": s.source_name, "audioEpoch": s.audio_epoch}


def snapshot_wire(s):
    return {"snapshotId": s.snapshot_id, "kind": s.kind.value, "text": s.text, "charCount": s.char_count,
            "truncated": s.truncated, "sourceSpans": [span_wire(span) for span in s.source_spans],
            "anchorSegmentKey": s.anchor_segment_key, "createdAt": s.created_at, "tentative": s.tentative}


@dataclass(frozen=True)
class Proposal:
    candidate_id: str
    revision: int
    wording: str
    state: str
    reason: str | None
    origin: str
    snapshot: object
    supersedes: tuple = ()
    source_answer_id: str | None = None
    review_reasons: tuple | None = None

    def wire(self):
        return {"candidateId": self.candidate_id, "candidateRevision": self.revision, "wording": self.wording,
                "state": self.state, "reason": self.reason, "origin": self.origin,
                "sourceSpans": [span_wire(s) for s in self.snapshot.source_spans],
                "snapshot": snapshot_wire(self.snapshot), "supersedes": list(self.supersedes),
                "sourceAnswerId": self.source_answer_id, "reviewReasons": list(self.review_reasons) if self.review_reasons is not None else None}


def fingerprint(spans):
    return tuple(sorted((s.audio_epoch, s.segment_key, s.revision, s.start, s.end) for s in spans))


class QuestionService:
    def __init__(self, app, serialize_model):
        self.app = app
        self.serialize_model = serialize_model
        self.current = {}
        self.history = []
        self.human_generation = 0
        self.sequence = 0
        self._runner = None  # deterministic Gateway seam, never configured by a client
        self.detector = QuestionDetector(lambda: freeze_input(app.transcript), self.run, self.publish, self.notify,
                                         debounce=app.settings.detector_debounce_seconds)

    def capacity(self, count):
        if len(self.history) + count > MAX_CANDIDATE_REVISIONS:
            raise AssistanceError(ErrorCode.CAPACITY, "Question history reached 200 revisions. Clear the transcript to start a new source session; existing answer cards remain.")

    def append(self, proposal):
        self.history.append(proposal)
        self.current[proposal.candidate_id] = proposal
        self.app.snapshots.retain(proposal.snapshot.snapshot_id)

    def state_payload(self, command_id=None, changed=()):
        self.sequence += 1
        candidates = []
        for p in self.current.values():
            wire = p.wire()
            if self.app._protocol_version(self.app.lease.owner_connection_id or "") >= 6:
                identity = (p.candidate_id,p.revision)
                scheduler = self.app.auto.state
                active = self.app.requests.get(scheduler.active_request_id) if scheduler.active_request_id else None
                deferred = self.app.requests.get(scheduler.deferred_request_id) if scheduler.deferred_request_id else None
                wire["autoStatus"] = "pending" if scheduler.pending == identity else "active" if active and active.metadata.get("candidateId") == p.candidate_id else "deferred" if deferred and deferred.metadata.get("candidateId") == p.candidate_id else "attempted" if identity in scheduler.attempted else None
            candidates.append(wire)
        return {"commandId": command_id, "stateSeq": self.sequence, "changedCandidateIds": list(changed),
                "candidates": candidates, "revisionCount": len(self.history)}

    def detector_payload(self, command_id=None):
        self.sequence += 1
        d = self.detector
        return {"commandId": command_id, "stateSeq": self.sequence, "enabled": d.enabled,
                "inFlight": d.in_flight, "lastError": d.last_error, "dirty": d.dirty,
                "outcome": d.outcome, "truncated": d.truncated, "lastRevision": d.last_revision, "model": d.model_settings}

    async def emit(self, command_id=None, changed=()):
        owner = self.app.lease.owner_connection_id
        if owner and self.app._protocol_version(owner) >= 5:
            await self.app._send_v2(owner, "candidate_state", self.state_payload(command_id, changed))

    async def notify(self, command_id=None):
        owner = self.app.lease.owner_connection_id
        if owner and self.app._protocol_version(owner) >= 5:
            await self.app._send_v2(owner, "detector_state", self.detector_payload(command_id))

    async def reset(self, owner_lost=False):
        await self.detector.cancel()
        for p in self.history:
            self.app.snapshots.release(p.snapshot.snapshot_id)
        self.history.clear()
        self.current.clear()
        self.detector.last_revision = None
        self.detector.last_error = None
        self.detector.outcome = "no_source"
        self.detector.enabled = self.detector.enabled and not owner_lost
        await self.emit()
        await self.notify()

    async def run(self, frozen):
        app = self.app
        settings = resolve_model_settings(role=ModelRole.DETECTOR, requested_model=None,
            default_model=app.settings.detector_model, known_catalog=app._known_language_models)
        self.detector.model_settings = self.serialize_model(settings)
        await self.notify()
        if self._runner:
            return await self._runner(frozen, settings)
        client = await app._ensure_ai_gateway_client()
        if client is None:
            raise AssistanceError(ErrorCode.DEPENDENCY, "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required for question detection.")
        return await client.detect_questions(frozen, settings)

    async def publish(self, proposals, frozen):
        app = self.app
        # Called only after full validation and generation/epoch checks by the detector.
        known = {fingerprint(p.snapshot.source_spans) for p in self.history}
        pending = []
        try:
            for item in proposals:
                key = fingerprint(item["spans"])
                if key in known:
                    continue
                known.add(key)
                snapshot = app.snapshots.create_selection(app.transcript, [span_wire(s) for s in item["spans"]])
                pending.append(Proposal(str(uuid.uuid4()), 1, item["wording"], item["state"], item["reason"], "detector", snapshot, review_reasons=item.get("review_reasons")))
            self.capacity(len(pending))
        except Exception as exc:
            if isinstance(exc, AssistanceError) and exc.code is ErrorCode.CAPACITY:
                app.auto.state.pause("capacity", exc.message)
                app.auto.wake()
            for p in pending:
                app.snapshots.release(p.snapshot.snapshot_id)
            raise
        for p in pending:
            self.append(p)
        self.app.auto.offer(pending)
        await self.emit()

    async def set_detection(self, connection, data, command_id):
        app = self.app
        try:
            self.check(connection, data)
            if type(data.get("enabled")) is not bool or type(data.get("retry", False)) is not bool:
                raise AssistanceError(ErrorCode.INVALID_PAYLOAD, "Detection needs enabled and optional retry booleans.")
            await self.detector.set_enabled(data["enabled"], data.get("retry", False))
            if not data["enabled"]:
                app.auto.state.pause("detection_disabled")
            app.auto.wake()
            app.commands.accept(connection.connection_id, command_id)
            await self.notify(command_id)
        except AssistanceError as exc:
            await app._reject_command(connection.connection_id, command_id, exc)
            return
        await app._send_ack(connection.connection_id, app.commands.get(connection.connection_id, command_id))

    def check(self, connection, data):
        self.app.lease.require_owner(connection.connection_id)
        if self.app._protocol_version(connection.connection_id) < 5 or data.get("protocolVersion") != self.app._protocol_version(connection.connection_id):
            raise AssistanceError(ErrorCode.INCOMPATIBLE_VERSION, "Question workflows require negotiated protocol v5.")

    def parent(self, identity):
        p = self.current.get(identity["candidateId"])
        if p is None or p.revision != identity["expectedRevision"]:
            raise AssistanceError(ErrorCode.STALE_REVISION, "Question changed. Review its latest revision before retrying.")
        return p

    def snapshot_for(self, spans, parents, source):
        if parents:
            for s in spans:
                if not any(s["segmentKey"] == allowed.segment_key and s["revision"] == allowed.revision and allowed.start <= s["start"] < s["end"] <= allowed.end for p in parents for allowed in p.snapshot.source_spans):
                    raise AssistanceError(ErrorCode.INVALID_SPAN, "Question edits must retain their parents' source evidence.")
        # Validate against retained frozen evidence first; it survives transcript mutation.
        for p in parents:
            if [span_wire(s) for s in p.snapshot.source_spans] == spans:
                return p.snapshot, False
        if source and source.snapshot_id:
            snapshot = self.app.snapshots.get(source.snapshot_id)
            if snapshot and [span_wire(s) for s in snapshot.source_spans] == spans:
                return snapshot, False
        return self.app.snapshots.create_selection(self.app.transcript, spans), True

    async def action(self, connection, data, command_id):
        app = self.app
        prepared = []
        created_snapshots = []
        try:
            self.check(connection, data)
            parse_command(data, ContractContext(protocol_version=app._protocol_version(connection.connection_id), backend_instance_id=app.backend_instance_id,
                                                  session_epoch=app.lease.session_epoch))
            epoch = app.lease.session_epoch
            action = data["action"]
            parents = [self.parent(i) for i in data["parents"]]
            if action != "undo" and any(p.state in {"dismissed", "superseded"} for p in parents):
                raise AssistanceError(ErrorCode.STALE_REVISION, "This interpretation has already been dismissed or superseded.")
            source = None
            if action == "correct":
                source = app.requests.get_by_answer_id(data.get("sourceAnswerId"))
                if source is None or source.connection_id != connection.connection_id or source.session_epoch != app.lease.session_epoch or source.metadata.get("removed") or source.metadata.get("correctedBy"):
                    raise AssistanceError(ErrorCode.STALE_REVISION, "This answer cannot be corrected in the current session.")
                source_snapshot = app.snapshots.get(source.snapshot_id)
                if source_snapshot is None:
                    raise AssistanceError(ErrorCode.STALE_REVISION, "The original answer source is unavailable.")
                if source.metadata.get("candidateId"):
                    original = self.current.get(source.metadata["candidateId"])
                    executed_wording = source.metadata.get("candidateWording") or (source.metadata.get("manualTarget") or {}).get("wording")
                    same_interpretation = original and original.state not in {"dismissed", "superseded"} and original.wording == executed_wording and original.snapshot.snapshot_id == source.snapshot_id
                    if same_interpretation and (not parents or parents[0] != original):
                        raise AssistanceError(ErrorCode.STALE_REVISION, "Correction must name the answer's current candidate revision.")
                    if parents and not same_interpretation:
                        raise AssistanceError(ErrorCode.STALE_REVISION, "The inbox now holds a different interpretation. Reopen Wrong question to preserve that newer question.")
            if action == "undo":
                p = parents[0]
                if p.state != "dismissed":
                    raise AssistanceError(ErrorCode.INVALID_PAYLOAD, "Undo restores only a dismissed question; split/merge corrections retain their lineage.")
                before = next((item for item in reversed(self.history) if item.candidate_id == p.candidate_id and item.state != "dismissed"), None)
                if before is None:
                    raise AssistanceError(ErrorCode.STALE_REVISION, "No dismissed revision is available to restore.")
                prepared.append(replace(before, revision=p.revision + 1))
            elif action == "dismiss":
                prepared.append(replace(parents[0], revision=parents[0].revision + 1, state="dismissed"))
            else:
                for draft in data["drafts"]:
                    snapshot, created = self.snapshot_for(draft["sourceSpans"], parents, source)
                    if created:
                        created_snapshots.append(snapshot)
                    if source and fingerprint(snapshot.source_spans) != fingerprint(app.snapshots.get(source.snapshot_id).source_spans):
                        raise AssistanceError(ErrorCode.INVALID_SPAN, "Wrong question must retain the original answer's complete frozen source.")
                    same = action == "edit"
                    prepared.append(Proposal(parents[0].candidate_id if same else str(uuid.uuid4()),
                        parents[0].revision + 1 if same else 1, draft["wording"].strip(), "user_set", None, "human",
                        snapshot, (tuple(f"{p.candidate_id}:{p.revision}" for p in parents) or ((f"{source.metadata['candidateId']}:{source.candidate_revision}",) if source and source.metadata.get("candidateId") else ())), source.answer_id if source else None))
                if action in {"split", "merge", "correct"}:
                    prepared.extend(replace(p, revision=p.revision + 1, state="superseded") for p in parents)
            self.capacity(len(prepared))
            # Every validation completes before mutating candidate or answer state.
            await app.auto.invalidate_candidates(parents)
            if source and not source.terminal:
                await app._cancel_answer_record(source, AnswerStatus.SUPERSEDED, "wrong_question")
            app.lease.require_epoch(epoch)
            self.detector.generation += 1
            self.human_generation += 1
            for p in prepared:
                self.append(p)
            app.commands.accept(connection.connection_id, command_id)
            if source:
                source.metadata["correctedBy"] = prepared[0].candidate_id
                await app._answer_state(source, "wrong_question", command_id)
            await self.emit(command_id, [p.candidate_id for p in prepared])
        except (AssistanceError, ContractError, SnapshotError) as exc:
            for snapshot in created_snapshots:
                if snapshot.snapshot_id not in {h.snapshot.snapshot_id for h in self.history}:
                    app.snapshots.release(snapshot.snapshot_id)
            await app._reject_command(connection.connection_id, command_id, AssistanceError(exc.code, exc.message))
            return
        await app._send_ack(connection.connection_id, app.commands.get(connection.connection_id, command_id))

    def resolve_target(self, data, snapshot):
        identity = data.get("candidateId")
        if identity is None:
            return
        p = self.parent({"candidateId": identity, "expectedRevision": data.get("candidateRevision")})
        if p.state in {"dismissed", "superseded"} or p.snapshot.snapshot_id != snapshot.snapshot_id:
            raise AssistanceError(ErrorCode.STALE_REVISION, "Question target is no longer current.")
        target = data.get("manualTarget")
        if not isinstance(target, dict) or target.get("wording") != p.wording:
            raise AssistanceError(ErrorCode.STALE_REVISION, "Save edited question wording before answering it.")
        data["manualTarget"] = dict(target, wordingOrigin=p.origin)

    async def answered(self, record):
        p = self.current.get(record.metadata.get("candidateId"))
        if p and p.revision == record.candidate_revision and p.state not in {"dismissed", "superseded"}:
            if len(self.history) < MAX_CANDIDATE_REVISIONS:
                self.append(replace(p, revision=p.revision + 1, state="answered"))
                await self.emit()
            else:
                self.detector.last_error = "Question history is full; answer retained without a new workflow revision."
                await self.notify()
