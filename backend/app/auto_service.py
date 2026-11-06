"""M08 controller wiring for the pure single-owner AUTO execution slots."""
from __future__ import annotations

import asyncio
from copy import deepcopy
import uuid

from .assistance import AssistanceError, AutoScheduler
from .cockpit_models import AnswerStatus, ErrorCode
from .cockpit_protocol import ContractContext, ContractError, parse_command

PUBLICATION_EVENTS = {'answer_chunk', 'answer_timing', 'answer_finished', 'request_error'}


class AutoService:
    def __init__(self, app):
        self.app = app
        self.state = AutoScheduler()
        self.sequence = 0
        self.offer_sequence = 0
        self.task = None
        self.closing = False
        self.dirty = False

    def held(self):
        return self.app.interaction_state.publication_hold

    def hold_reasons(self):
        interaction = self.app.interaction_state
        return list(interaction.hold_reasons) or (['target'] if interaction.publication_hold else [])

    def current(self, identity):
        if identity is None:
            return None
        p = self.app.questions.current.get(identity[0])
        return p if p and p.revision == identity[1] else None

    def eligible(self, p):
        return bool(p and p.origin == 'detector' and p.state == 'proposed' and p.review_reasons == ()
                    and not p.snapshot.tentative and p.snapshot.source_spans
                    and all(s.audio_epoch == self.app.transcript.audio_epoch for s in p.snapshot.source_spans))

    def readiness(self):
        app = self.app
        owner = app.lease.owner_connection_id
        if not owner:
            return 'no_owner'
        if app._protocol_version(owner) < 6:
            return 'no_capability'
        if not app.state.running:
            return 'not_listening'
        if not app.questions.detector.enabled:
            return 'detection_disabled'
        if not app.transcript.audio_epoch:
            return 'no_source_epoch'
        if self.state.config is None:
            return 'configuration_required'
        return None

    def state_payload(self, command_id=None):
        self.sequence += 1
        s = self.state
        active = self.app.requests.get(s.active_request_id) if s.active_request_id else None
        deferred = self.app.requests.get(s.deferred_request_id) if s.deferred_request_id else None
        reason = (self.readiness() or ('hold' if self.held() else 'generation_busy' if self.app.requests.is_busy()
                  else 'deferred' if deferred else 'ready')) if s.armed else s.pause_reason
        return {'commandId': command_id, 'stateSeq': self.sequence, 'autoArmed': s.armed,
                'pauseReason': reason, 'lastError': s.last_error, 'listening': self.app.state.running,
                'detectionEnabled': self.app.questions.detector.enabled, 'holdReasons': self.hold_reasons(),
                'configRevision': s.config_revision, 'configurationReady': s.config is not None,
                'activeAnswerId': active.answer_id if active else None,
                'pendingCandidate': {'candidateId': s.pending[0], 'candidateRevision': s.pending[1]} if s.pending else None,
                'deferredAnswerId': deferred.answer_id if deferred else None, 'generationBusy': self.app.requests.is_busy()}

    async def emit(self, command_id=None):
        owner = self.app.lease.owner_connection_id
        if owner and self.app._protocol_version(owner) >= 6:
            await self.app._send_v2(owner, 'assistance_state', self.state_payload(command_id))

    def check(self, connection, data):
        self.app.lease.require_owner(connection.connection_id)
        if self.app._protocol_version(connection.connection_id) < 6 or data.get('protocolVersion') != 6:
            raise AssistanceError(ErrorCode.INCOMPATIBLE_VERSION, 'FULL AUTO requires negotiated protocol v6.')
        try:
            parse_command(data, ContractContext(protocol_version=6, backend_instance_id=self.app.backend_instance_id,
                                                session_epoch=self.app.lease.session_epoch))
        except ContractError as exc:
            raise AssistanceError(exc.code, exc.message) from exc

    async def configure(self, connection, data, command_id):
        app, s = self.app, self.state
        try:
            self.check(connection, data)
            if data['expectedConfigRevision'] != s.config_revision:
                raise AssistanceError(ErrorCode.STALE_REVISION, 'AUTO settings changed; reconcile current configuration before updating.')
            settings = deepcopy(data['settings'])
            instruction, mode, preset = app._resolve_instruction(settings)
            app._freeze_inputs(settings, instruction, mode, preset)
            s.config, s.config_revision = settings, s.config_revision + 1
            s.last_error = None
            app.commands.accept(connection.connection_id, command_id)
        except AssistanceError as exc:
            await app._reject_command(connection.connection_id, command_id, exc)
            await self.emit()
            return
        await self.emit(command_id)
        await app._send_ack(connection.connection_id, app.commands.get(connection.connection_id, command_id))
        self.wake()

    async def set_auto(self, connection, data, command_id):
        app, s = self.app, self.state
        try:
            self.check(connection, data)
            if data['armed']:
                if data['expectedConfigRevision'] != s.config_revision:
                    raise AssistanceError(ErrorCode.STALE_REVISION, 'Wait for the displayed AUTO settings to be acknowledged.')
                reason = self.readiness()
                if reason:
                    raise AssistanceError(ErrorCode.NOT_READY, f'Cannot arm FULL AUTO: {reason.replace("_", " ")}.')
                # Do not re-arm/reset execution slots for a redundant command.
                if not s.armed:
                    s.arm()
            else:
                s.pause('paused')
            app.commands.accept(connection.connection_id, command_id)
        except AssistanceError as exc:
            await app._reject_command(connection.connection_id, command_id, exc)
            await self.emit()
            return
        await self.emit(command_id)
        await app._send_ack(connection.connection_id, app.commands.get(connection.connection_id, command_id))
        await app.questions.emit()
        self.wake()

    def offer(self, proposals):
        for p in proposals:
            self.offer_sequence += 1
            if self.eligible(p):
                self.state.offer((p.candidate_id, p.revision), (max(span.revision for span in p.snapshot.source_spans), self.offer_sequence))
        self.wake()

    def wake(self):
        self.dirty = True
        if not self.closing and (self.task is None or self.task.done()):
            self.task = asyncio.create_task(self._work())

    async def _work(self):
        try:
            while self.dirty and not self.closing:
                self.dirty = False
                async with self.app._v2_command_lock:
                    await self._step()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self.state.pause('failed', str(exc))
            await self.emit()

    async def _step(self):
        app, s = self.app, self.state
        # A previously visible active card may have buffered chunks during a hold.
        active = app.requests.get(s.active_request_id) if s.active_request_id else None
        if active and active.metadata.get('publicationStatus') == 'deferred' and not self.held():
            await self.flush(active)
        if s.deferred_request_id:
            record = app.requests.get(s.deferred_request_id)
            if record and not self.held():
                await self.flush(record)
            if s.deferred_request_id:
                await self.emit()
                return
        if not s.armed:
            await self.emit()
            return
        reason = self.readiness()
        if reason:
            s.pause(reason)
        elif not self.held() and not app.requests.is_busy() and s.pending:
            identity = s.take()
            p = self.current(identity)
            if self.eligible(p):
                owner = app.lease.owner_connection_id
                connection = next((c for c in app.hub.connections() if c.connection_id == owner), None)
                if connection is None:
                    s.pause('no_owner')
                else:
                    data = deepcopy(s.config)
                    data.update({'protocolVersion': 6, 'backendInstanceId': app.backend_instance_id,
                        'sessionEpoch': app.lease.session_epoch, 'candidateId': p.candidate_id, 'candidateRevision': p.revision,
                        'snapshotId': p.snapshot.snapshot_id, 'targetId': None, '_auto': True,
                        'manualTarget': {'targetId': f'auto-{p.candidate_id}-{p.revision}',
                                         'sourceSnapshotId': p.snapshot.snapshot_id, 'wording': p.wording, 'wordingOrigin': 'detector'}})
                    try:
                        app.requests.ensure_capacity()
                        app._working_victim()
                        app.questions.resolve_target(data, p.snapshot)
                        instruction, mode, preset = app._resolve_instruction(data)
                        frozen = app._freeze_inputs(data, instruction, mode, preset)
                        command = f'auto-{uuid.uuid4()}'
                        await app._accept_v2_answer(connection, data, command, p.snapshot, instruction, mode, preset, frozen, context_window=False, automated=True, config_revision=s.config_revision)
                        outcome = app.commands.get(owner, command)
                        if outcome and outcome.request_id:
                            record = app.requests.get(outcome.request_id)
                            if record and not record.terminal:
                                s.active_request_id = record.request_id
                        else:
                            s.pause('failed', 'Automatic answer was not accepted.')
                    except AssistanceError as exc:
                        s.pause('capacity' if exc.code is ErrorCode.CAPACITY else 'failed', exc.message)
        await app.questions.emit()
        await self.emit()

    def is_auto(self, record):
        return record is not None and record.metadata.get('origin') == 'auto'

    def valid_record(self, record):
        p = self.current((record.metadata.get('candidateId'), record.candidate_revision))
        return bool(p and p.state not in {'dismissed', 'superseded'} and record.session_epoch == self.app.lease.session_epoch
                    and record.connection_id == self.app.lease.owner_connection_id and all(
                    span.audio_epoch == self.app.transcript.audio_epoch for span in p.snapshot.source_spans))

    def route_event(self, msg_type, payload):
        """Return whether publication is allowed; underlying record always advances."""
        record = self.app.requests.get(payload.get('requestId'))
        if not self.is_auto(record) or msg_type not in PUBLICATION_EVENTS:
            return True
        meta = record.metadata
        if meta.get('flushing'):
            return True
        terminal_cancel = msg_type == 'answer_finished' and payload.get('status') in {'cancelled', 'superseded'}
        if terminal_cancel:
            payload['text'] = record.text[:meta.get('publishedChars', 0)]
            meta['publicationStatus'] = 'superseded'
            self._terminal_metadata(record, payload)
            if self.state.deferred_request_id == record.request_id:
                self.state.deferred_request_id = None
            return True
        if self.held() or meta.get('publicationStatus') == 'deferred':
            meta['publicationStatus'] = 'deferred'
            if msg_type == 'request_error':
                meta['deferredError'] = deepcopy(payload)
            self.wake()
            return False
        if msg_type == 'answer_chunk':
            meta['publishedChars'] = len(record.text)
        if msg_type == 'answer_finished':
            meta['publicationStatus'] = 'published'
            self._terminal_metadata(record, payload)
        return True

    def _terminal_metadata(self, record, payload):
        payload.setdefault('metadata', {}).update({'origin': 'auto', 'configRevision': record.metadata.get('configRevision'),
            'generationStatus': record.metadata.get('generationStatus', record.status), 'publicationStatus': record.metadata.get('publicationStatus', 'live')})
        record.metadata['terminalPayload'] = {'type': 'answer_finished', **self.app._v2_envelope(record.connection_id), **deepcopy(payload)}

    async def flush(self, record, *, discard=False, status='superseded'):
        app, meta = self.app, record.metadata
        valid = not discard and self.valid_record(record)
        meta['flushing'] = True
        try:
            if valid:
                delta = record.text[meta.get('publishedChars', 0):]
                if delta:
                    await app._send_v2(record.connection_id, 'answer_chunk', {'requestId': record.request_id,
                        'answerId': record.answer_id, 'snapshotId': record.snapshot_id, 'candidateRevision': record.candidate_revision,
                        'eventSeq': record.next_event_seq(), 'delta': delta})
                    meta['publishedChars'] = len(record.text)
                if meta.get('deferredError'):
                    await app._send_v2(record.connection_id, 'request_error', meta.pop('deferredError'))
            if record.terminal or not valid:
                payload = deepcopy(meta.get('terminalPayload') or {'requestId': record.request_id, 'answerId': record.answer_id,
                    'snapshotId': record.snapshot_id, 'candidateRevision': record.candidate_revision, 'metadata': {}})
                payload.pop('type', None)
                payload.update({'eventSeq': record.next_event_seq(), 'status': record.status if valid else status,
                                'text': record.text if valid else record.text[:meta.get('publishedChars', 0)]})
                meta['publicationStatus'] = 'published' if valid else 'superseded'
                if not valid:
                    record.status = status
                    record.terminal = True
                self._terminal_metadata(record, payload)
                await app._send_v2(record.connection_id, 'answer_finished', payload)
                if self.state.deferred_request_id == record.request_id:
                    self.state.deferred_request_id = None
                if valid and record.status == 'completed':
                    await app.questions.answered(record)
            else:
                meta['publicationStatus'] = 'live'
            await app._answer_state(record, 'publication_released')
        finally:
            meta.pop('flushing', None)

    async def finished(self, record):
        s = self.state
        if self.is_auto(record):
            if s.active_request_id == record.request_id:
                s.active_request_id = None
            if record.metadata.get('publicationStatus') == 'deferred':
                s.deferred_request_id = record.request_id
                await self.app._answer_state(record, 'publication_deferred')
            if record.status == 'failed':
                s.pause('failed', record.metadata.get('generationError') or 'Automatic generation failed; review before re-arming.')
            await self.app.questions.emit()
        self.wake()

    async def manual(self):
        self.state.pending = None
        if self.state.deferred_request_id:
            record = self.app.requests.get(self.state.deferred_request_id)
            if record:
                await self.flush(record, discard=True)
        self.wake()

    async def stop_answer(self, record):
        if self.is_auto(record):
            self.state.pause('answer_stopped')
            if record.terminal and record.metadata.get('publicationStatus') == 'deferred':
                await self.flush(record, discard=True, status='cancelled')
            await self.emit()

    async def invalidate_candidates(self, parents):
        ids = {p.candidate_id for p in parents}
        s = self.state
        if s.pending and s.pending[0] in ids:
            s.pending = None
        record = self.app.requests.get(s.active_request_id) if s.active_request_id else None
        if record and record.metadata.get('candidateId') in ids:
            await self.app._cancel_answer_record(record, AnswerStatus.SUPERSEDED, 'candidate_changed')
        deferred = self.app.requests.get(s.deferred_request_id) if s.deferred_request_id else None
        if deferred and deferred.metadata.get('candidateId') in ids:
            await self.flush(deferred, discard=True)
        self.wake()

    async def invalidate(self, reason, *, owner_lost=False):
        s = self.state
        s.pause(reason)
        record = self.app.requests.get(s.active_request_id) if s.active_request_id else None
        if record and not record.terminal:
            await self.app._cancel_answer_record(record, AnswerStatus.SUPERSEDED, reason)
        if s.deferred_request_id:
            record = self.app.requests.get(s.deferred_request_id)
            if record:
                await self.flush(record, discard=True)
        s.active_request_id = s.deferred_request_id = None
        s.attempted.clear()
        if owner_lost:
            s.config = None
            s.config_revision = 0
        await self.emit()

    async def close(self):
        self.closing = True
        if self.task and self.task is not asyncio.current_task() and not self.task.done():
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
