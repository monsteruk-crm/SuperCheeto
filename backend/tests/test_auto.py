"""M08 deterministic state/race checks. No devices, database data or paid calls."""
import asyncio
import dataclasses
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import app.main as main
from app.assistance import AutoScheduler, RequestRecord
from app.ai_gateway_client import DEFAULT_TEXT_MODEL
from app.cockpit_models import AnswerStatus
from app.question_detector import freeze_input, validate_proposals
from app.stt import Segment
from test_questions import output


class Clock:
    def __init__(self):self.now=0.
    def __call__(self):return self.now
    def advance(self,seconds=5):self.now+=seconds;return self.now


class SchedulerTests(unittest.TestCase):
    def test_newest_slot_attempts_and_explicit_rearm_without_backfill(self):
        s=AutoScheduler();self.assertFalse(s.offer(('a',1),(1,1)));s.arm()
        s.offer(('a',1),(1,1));s.offer(('b',1),(2,2));self.assertEqual(s.pending,('b',1))
        self.assertFalse(s.offer(('old',1),(1,3)));self.assertEqual(s.take(),('b',1))
        self.assertFalse(s.offer(('b',1),(2,4)));s.pause('paused');self.assertIsNone(s.pending)
        s.arm();self.assertFalse(s.offer(('b',1),(2,5)));self.assertIsNone(s.pending)


BASE=main.Settings()
class AutoTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.clock=Clock()
        with patch.object(main,'Settings',lambda:dataclasses.replace(BASE,rag_db_path=str(Path(self.tmp.name)/'rag.sqlite'),ai_gateway_model=DEFAULT_TEXT_MODEL)):
            self.app=main.AppController()
        self.conn=SimpleNamespace(connection_id='owner',protocol_version=6,peer='synthetic')
        self.app.lease.claim('owner');self.app._connection_versions['owner']=6
        self.app.hub.connections=lambda:[self.conn]
        self.app.hub.send_to=AsyncMock(return_value=True);self.app.hub.broadcast=AsyncMock()
        self.app.requests._clock=self.clock;self.app.snapshots._clock=self.clock
        self.app.state.running=True;self.app.questions.detector.enabled=True
        self.calls=[];self.releases=[];self.started=asyncio.Queue();self.counter=0
        async def runner(**kwargs):
            event=asyncio.Event();self.releases.append(event);self.calls.append(kwargs)
            await kwargs['on_stream_delta']('First ')
            self.started.put_nowait(len(self.calls))
            await event.wait()
            await kwargs['on_stream_delta']('complete.')
            return SimpleNamespace(text='First complete.',latency_ms=10)
        self.app._generation_runner=runner
        self.settings={'mode':'Preset','presetId':'answer_question','customInstruction':None,'model':DEFAULT_TEXT_MODEL,
                       'reasoningEffort':None,'humanNoteIds':[],'includeScreenshot':False,'screenshotDataUrl':None}
    async def asyncTearDown(self):
        self.app.auto.state.pause('cleanup');await self.app.auto.close();await self.app.questions.detector.cancel()
        tasks=list(self.app._answer_tasks.values())
        for task in tasks:task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        self.app._rag_store.close();self.tmp.cleanup()
    async def command(self,kind,**data):
        self.counter+=1;command=data.pop('commandId',f'cmd-{self.counter}')
        await self.app._handle_message({'type':kind,'protocolVersion':6,'backendInstanceId':self.app.backend_instance_id,
            'sessionEpoch':self.app.lease.session_epoch,'commandId':command,**data},self.conn)
        return self.app.commands.get(self.conn.connection_id,command)
    async def configure(self,**settings):
        return await self.command('configure_auto',expectedConfigRevision=self.app.auto.state.config_revision,settings={**self.settings,**settings})
    async def arm(self):
        await self.configure();result=await self.command('set_auto',armed=True,mode='full_auto',expectedConfigRevision=self.app.auto.state.config_revision)
        self.assertTrue(result.accepted);await self.settle()
    async def settle(self):
        for _ in range(10):
            task=self.app.auto.task
            if task:await asyncio.wait_for(asyncio.shield(task),1)
            await asyncio.sleep(0)
            if self.app.auto.task is task and (not task or task.done()):return
        self.fail('scheduler failed to settle')
    async def proposal(self,flags=(),state='proposed',human=False):
        ident=len(self.app.transcript.records())+1;t=self.clock.advance()
        self.app.transcript.add_segment(Segment(id=ident,t0=t,t1=t+.5,text=f'Please explain synthetic plan number {ident}',is_final=True))
        frozen=freeze_input(self.app.transcript);raw=output(frozen,wording=f'Explain plan {ident}',state=state,reason='Review needed' if state!='proposed' else '')
        if flags is not None:raw['proposals'][0]['reviewReasons']=list(flags)
        await self.app.questions.publish(validate_proposals(raw,frozen),frozen)
        p=list(self.app.questions.current.values())[-1]
        if human:
            p=dataclasses.replace(p,origin='human');self.app.questions.current[p.candidate_id]=p
        await self.settle();return p
    async def start(self):return await asyncio.wait_for(self.started.get(),1)
    def record(self):return self.app.requests.get(self.app.auto.state.active_request_id)
    async def finish(self,index=-1):
        tasks=list(self.app._answer_tasks.values());self.releases[index].set()
        await asyncio.wait_for(asyncio.gather(*tasks),1);await self.settle()
    async def hold(self,enabled=True):
        await self.command('interaction_state',selectedSnapshotIds=[],openEditors=['human'] if enabled else [],inspectedAnswerIds=[],publicationHold=enabled,holdReasons=['raw_selection'] if enabled else [])
        await self.settle()
    def events(self,kind):return [call.args[2] for call in self.app.hub.send_to.call_args_list if call.args[1]==kind]

    async def test_readiness_requires_owner_listening_detection_and_configuration(self):
        for field in ('listening','detection','configuration'):
            with self.subTest(field=field):
                self.app.state.running=field!='listening';self.app.questions.detector.enabled=field!='detection'
                if field!='configuration':await self.configure()
                else:self.app.auto.state.config=None
                outcome=await self.command('set_auto',armed=True,mode='full_auto',expectedConfigRevision=self.app.auto.state.config_revision)
                self.assertFalse(outcome.accepted);self.assertFalse(self.app.auto.state.armed)
        self.conn.connection_id='observer';self.app._connection_versions['observer']=6
        outcome=await self.configure();self.assertFalse(outcome.accepted);self.assertEqual(outcome.code.value,'not_owner')
    async def test_arm_does_not_backfill_and_automatic_answer_needs_no_manual_command(self):
        await self.proposal();await self.arm();self.assertEqual(self.calls,[])
        p=await self.proposal();await self.start();record=self.record()
        self.assertEqual(record.metadata['origin'],'auto');self.assertEqual(record.candidate_revision,p.revision)
        self.assertIsNone(record.client_pressed_at_ms);self.assertEqual(record.metadata['snapshotText'],p.snapshot.text)
        await self.finish();self.assertEqual(record.text,'First complete.');self.assertTrue(record.terminal)
    async def test_newest_pending_replaces_only_slot_never_active_or_inbox(self):
        await self.arm();first=await self.proposal();await self.start();record=self.record()
        second=await self.proposal();third=await self.proposal()
        self.assertEqual(self.app.auto.state.pending,(third.candidate_id,third.revision));self.assertEqual(len(self.calls),1)
        self.assertIs(self.record(),record);self.assertIn(second.candidate_id,self.app.questions.current)
        self.releases[0].set();await self.start();self.assertEqual(len(self.calls),2)
        self.assertEqual(self.record().metadata['candidateId'],third.candidate_id)
    async def test_review_human_and_unverified_proposals_never_auto_execute(self):
        await self.arm()
        for flag in ('incomplete','ambiguous','conflicting','negated','unsupported'):
            await self.proposal(flags=(flag,))
        await self.proposal(flags=None)
        await self.hold();human=await self.proposal();self.app.questions.current[human.candidate_id]=dataclasses.replace(human,origin='human')
        await self.hold(False);self.assertEqual(self.calls,[])
    async def test_manual_priority_preserves_partial_and_uses_same_slot(self):
        await self.arm();p=await self.proposal();await self.start();auto=self.record()
        outcome=await self.command('run_context_query',anchorSegmentKey=p.snapshot.anchor_segment_key,windowSeconds=20,targetId=None,**self.settings)
        self.assertTrue(outcome.accepted);await self.start();manual=self.app.requests.get(outcome.request_id)
        self.assertEqual(auto.status,'superseded');self.assertEqual(auto.text,'First ')
        self.assertEqual(manual.metadata['origin'],'manual');self.assertEqual(len(self.app.requests.running()),1)
    async def test_hold_before_offer_stops_launch_and_release_uses_newest(self):
        await self.arm();await self.hold();await self.proposal();p=await self.proposal()
        self.assertEqual(self.calls,[]);await self.hold(False);await self.start()
        self.assertEqual(self.record().metadata['candidateId'],p.candidate_id)
    async def test_completed_generation_defers_publication_and_resumes_with_valid_lineage(self):
        await self.arm();await self.proposal();await self.start();record=self.record();await self.hold()
        finished_before=len(self.events('answer_finished'));await self.finish()
        self.assertTrue(record.terminal);self.assertEqual(record.metadata['publicationStatus'],'deferred')
        self.assertEqual(len(self.events('answer_finished')),finished_before);self.assertEqual(self.app.auto.state.deferred_request_id,record.request_id)
        candidates=self.events('candidate_state')[-1]['candidates'];self.assertTrue(any(c['candidateId']==record.metadata['candidateId'] and c['autoStatus']=='deferred' for c in candidates))
        await self.hold(False)
        final=self.events('answer_finished')[-1];self.assertEqual(final['text'],'First complete.');self.assertEqual(final['status'],'completed')
        self.assertEqual(final['metadata']['publicationStatus'],'published');self.assertIsNone(self.app.auto.state.deferred_request_id)
    async def test_newer_revision_invalidates_deferred_without_publishing_hidden_text(self):
        await self.arm();p=await self.proposal();await self.start();record=self.record();await self.hold();await self.finish()
        self.app.questions.current[p.candidate_id]=dataclasses.replace(p,revision=p.revision+1,wording='Human changed intent')
        await self.hold(False);final=self.events('answer_finished')[-1]
        self.assertEqual(final['status'],'superseded');self.assertEqual(final['text'],'First ')
        self.assertEqual(final['metadata']['generationStatus'],'completed')
        self.assertEqual(record.text,'First complete.')
    async def test_manual_send_discards_held_result_and_manual_stream_ignores_hold(self):
        await self.arm();p=await self.proposal();await self.start();old=self.record();await self.hold();await self.finish()
        outcome=await self.command('run_context_query',anchorSegmentKey=p.snapshot.anchor_segment_key,windowSeconds=20,targetId=None,**self.settings)
        await self.start();self.assertTrue(outcome.accepted);self.assertEqual(self.events('answer_finished')[-1]['status'],'superseded')
        self.assertTrue(any(e['requestId']==outcome.request_id for e in self.events('answer_chunk')))
    async def test_pause_clears_pending_but_finishes_active_and_no_same_revision_retry(self):
        await self.arm();await self.proposal();await self.start();record=self.record();pending=await self.proposal()
        await self.command('set_auto',armed=False,mode='full_auto',expectedConfigRevision=self.app.auto.state.config_revision)
        self.assertIsNone(self.app.auto.state.pending);await self.finish();self.assertEqual(record.status,'completed');self.assertEqual(len(self.calls),1)
        await self.command('set_auto',armed=True,mode='full_auto',expectedConfigRevision=self.app.auto.state.config_revision)
        await self.settle();self.assertEqual(len(self.calls),1)
    async def test_stop_automated_answer_pauses_and_preserves_partial(self):
        await self.arm();await self.proposal();await self.start();record=self.record()
        await self.command('cancel_answer',requestId=record.request_id,answerId=record.answer_id)
        await self.settle();self.assertFalse(self.app.auto.state.armed);self.assertEqual(record.text,'First ');self.assertEqual(record.status,'cancelled')
    async def test_active_candidate_edit_cancels_old_automatic_revision(self):
        await self.arm();p=await self.proposal();await self.start();record=self.record()
        from app.question_service import span_wire
        outcome=await self.command('candidate_action',action='edit',parents=[{'candidateId':p.candidate_id,'expectedRevision':p.revision}],drafts=[{'wording':'Human wording','sourceSpans':[span_wire(s) for s in p.snapshot.source_spans]}])
        self.assertTrue(outcome.accepted);self.assertEqual(record.status,'superseded');self.assertEqual(record.text,'First ')
        await self.settle();self.assertEqual(len(self.calls),1)
    async def test_source_epoch_and_owner_loss_disarm_and_invalidate_pending(self):
        await self.arm();await self.proposal();await self.start();record=self.record();await self.proposal()
        await self.app._invalidate_session('source_changed');await self.settle()
        self.assertFalse(self.app.auto.state.armed);self.assertIsNone(self.app.auto.state.pending);self.assertTrue(record.terminal)
        self.assertIsNotNone(self.app.snapshots.get(record.snapshot_id))
        await self.app._on_client_disconnect(self.conn);self.assertIsNone(self.app.auto.state.config)
    async def test_configuration_is_revisioned_frozen_and_idempotently_reconciled(self):
        await self.arm();await self.proposal();await self.start();record=self.record();old=record.frozen_inputs['instruction']
        outcome=await self.configure(mode='Custom',presetId=None,customInstruction='A new visible instruction')
        self.assertTrue(outcome.accepted);self.assertEqual(record.frozen_inputs['instruction'],old)
        revision=self.app.auto.state.config_revision
        for _ in range(2):await self.command('configure_auto',commandId='same-settings',expectedConfigRevision=revision,settings=self.settings)
        self.assertEqual(self.app.auto.state.config_revision,revision+1)
        result=self.app._reconciliation_result('owner','same-settings',self.app.commands.get('owner','same-settings'))
        self.assertEqual(result[0]['type'],'assistance_state');self.assertEqual(result[0]['configRevision'],revision+1)
    async def test_generation_failure_pauses_without_paid_retry(self):
        async def fail(**kwargs):raise RuntimeError('Synthetic Gateway failure')
        self.app._generation_runner=fail;await self.arm();await self.proposal();await self.settle()
        tasks=list(self.app._answer_tasks.values())
        if tasks:await asyncio.gather(*tasks)
        await self.settle();self.assertFalse(self.app.auto.state.armed)
        self.assertIn('Synthetic Gateway failure',self.app.auto.state.last_error)
    async def test_capacity_pauses_without_evicting_kept_or_inspected_cards(self):
        await self.arm()
        for i in range(50):
            self.app.requests.create(RequestRecord(f'r{i}',f'a{i}',connection_id='owner',terminal=True,status='completed',metadata={'placement':'working'}))
        self.app.interaction_state.inspected_answer_ids=[f'a{i}' for i in range(50)]
        await self.proposal();self.assertFalse(self.app.auto.state.armed);self.assertEqual(self.app.auto.state.pause_reason,'capacity')
        self.assertEqual(self.calls,[]);self.assertEqual(len(self.app.requests._records),50)
    async def test_stopping_a_deferred_result_discards_hidden_output_and_pauses(self):
        await self.arm();await self.proposal();await self.start();record=self.record();await self.hold();await self.finish()
        await self.command('cancel_answer',requestId=record.request_id,answerId=record.answer_id);await self.settle()
        self.assertFalse(self.app.auto.state.armed);self.assertIsNone(self.app.auto.state.deferred_request_id)
        self.assertEqual(self.events('answer_finished')[-1]['text'],'First ');self.assertEqual(self.events('answer_finished')[-1]['status'],'cancelled')
    async def test_live_hold_release_flushes_real_buffer_then_continues_stream(self):
        await self.arm();await self.proposal();await self.start();record=self.record();await self.hold()
        await self.app._emit_answer_chunk(record,'Held delta ')
        before=len(self.events('answer_chunk'));await self.hold(False)
        self.assertEqual(len(self.events('answer_chunk')),before+1);self.assertEqual(self.events('answer_chunk')[-1]['delta'],'Held delta ')
        self.assertFalse(record.terminal);self.assertEqual(record.metadata['publicationStatus'],'live')
    async def test_stop_listening_and_clear_disarm_preserving_kept_source(self):
        await self.arm();await self.proposal();await self.start();record=self.record()
        record.metadata['placement']='kept';await self.app.stop_transcription();await self.settle()
        self.assertFalse(self.app.auto.state.armed);self.assertFalse(self.app.state.running)
        self.assertIsNotNone(self.app.snapshots.get(record.snapshot_id))
        await self.app._handle_message({'type':'clear_transcript'},self.conn)
        self.assertIsNotNone(self.app.snapshots.get(record.snapshot_id));self.assertEqual(record.metadata['placement'],'kept')
    async def test_ownership_loss_during_acceptance_never_starts_a_paid_job(self):
        await self.arm();entered=asyncio.Event();release=asyncio.Event()
        async def barrier():entered.set();await release.wait()
        self.app._supersede_running_answers=barrier
        proposal=asyncio.create_task(self.proposal());await asyncio.wait_for(entered.wait(),1)
        await self.app.auto.invalidate('owner_lost',owner_lost=True);self.app.lease.release('owner');release.set()
        await proposal;await self.settle();self.assertEqual(self.calls,[]);self.assertEqual(self.app.requests.running(),[])
    async def test_false_eligible_AUTO_answer_has_source_preserving_correction(self):
        await self.arm();p=await self.proposal();await self.start();original=self.record();await self.hold()
        from app.question_service import span_wire
        outcome=await self.command('candidate_action',action='correct',parents=[{'candidateId':p.candidate_id,'expectedRevision':p.revision}],drafts=[{'wording':'The actual intended question','sourceSpans':[span_wire(s) for s in p.snapshot.source_spans]}],sourceAnswerId=original.answer_id)
        self.assertTrue(outcome.accepted);corrected=self.app.questions.current[original.metadata['correctedBy']]
        self.assertEqual(corrected.snapshot,p.snapshot);self.assertEqual(original.status,'superseded');self.assertEqual(original.text,'First ')
        manual=await self.command('run_snapshot_query',snapshotId=corrected.snapshot.snapshot_id,targetId=None,candidateId=corrected.candidate_id,candidateRevision=corrected.revision,manualTarget={'targetId':'corrected','sourceSnapshotId':corrected.snapshot.snapshot_id,'wording':corrected.wording},**self.settings)
        await self.start();self.assertTrue(manual.accepted);self.assertEqual(self.app.requests.get(manual.request_id).metadata['origin'],'manual')
    async def test_private_execution_fields_cannot_enter_AUTO_configuration(self):
        outcome=await self.command('configure_auto',expectedConfigRevision=0,settings={**self.settings,'_rerunSource':{'attack':'hidden'}})
        self.assertFalse(outcome.accepted);self.assertIsNone(self.app.auto.state.config)

    async def test_candidate_history_capacity_pauses_AUTO_without_dropping_evidence(self):
        await self.arm();await self.proposal();await self.start();record=self.record()
        with patch('app.question_service.MAX_CANDIDATE_REVISIONS',1):
            with self.assertRaises(Exception):await self.proposal()
        await self.settle();self.assertFalse(self.app.auto.state.armed);self.assertEqual(self.app.auto.state.pause_reason,'capacity')
        self.assertEqual(len(self.app.questions.history),1);self.assertIsNotNone(self.app.snapshots.get(record.snapshot_id))
    async def test_explicit_image_and_human_notes_are_frozen_for_AUTO(self):
        self.app.context_notes['note']={'noteId':'note','text':'Original human claim','includeInFutureContext':True}
        shot='data:image/png;base64,YWJj'
        await self.configure(humanNoteIds=['note'],includeScreenshot=True,screenshotDataUrl=shot)
        result=await self.command('set_auto',armed=True,mode='full_auto',expectedConfigRevision=1);self.assertTrue(result.accepted)
        await self.proposal();await self.start();record=self.record()
        self.app.context_notes['note']['text']='Later human claim'
        await self.configure(humanNoteIds=['note'],includeScreenshot=False,screenshotDataUrl=None)
        self.assertEqual(record.metadata['screenshotDataUrl'],shot);self.assertEqual(record.metadata['humanNotes'][0]['text'],'Original human claim')
        self.assertEqual(self.calls[0]['screenshot_data_url'],shot)

    async def test_synthetic_flood_keeps_one_active_and_newest_pending(self):
        await self.arm();await self.proposal();await self.start()
        for _ in range(80):last=await self.proposal()
        self.assertEqual(len(self.calls),1);self.assertEqual(len(self.app.requests.running()),1)
        self.assertEqual(self.app.auto.state.pending,(last.candidate_id,last.revision));self.assertEqual(len(self.app.questions.current),81)

from test_cockpit_transport import TransportTestBase

class AutoWebSocketTests(TransportTestBase):
    async def asyncTearDown(self):
        await self.controller.auto.close()
        await self.controller.questions.detector.cancel()
        await super().asyncTearDown()
    async def six(self,name):
        client=await self.connect(name)
        await client.hello(command_id=f'v6-{name}',protocol_version=6,supported=[6,5,4,3,2])
        return client
    async def setup_owner(self):
        owner=await self.six('owner');await owner.command('claim_control','claim')
        await owner.wait_for('command_ack',predicate=lambda e:e.get('commandId')=='claim')
        self.controller.state.running=True;self.controller.questions.detector.enabled=True
        self.settings={'mode':'Preset','presetId':'answer_question','customInstruction':None,'model':DEFAULT_TEXT_MODEL,'reasoningEffort':None,'humanNoteIds':[],'includeScreenshot':False,'screenshotDataUrl':None}
        await owner.command('configure_auto','config',expectedConfigRevision=0,settings=self.settings)
        await owner.wait_for('command_ack',predicate=lambda e:e.get('commandId')=='config')
        await owner.command('set_auto','arm',armed=True,mode='full_auto',expectedConfigRevision=1)
        await owner.wait_for('assistance_state',predicate=lambda e:e.get('commandId')=='arm' and e.get('autoArmed'))
        return owner
    async def publish(self,index=1):
        self.controller.transcript.add_segment(Segment(id=index,t0=index*5,t1=index*5+1,text=f'Explain synthetic socket plan {index}',is_final=True))
        frozen=freeze_input(self.controller.transcript);raw=output(frozen);raw['proposals'][0]['reviewReasons']=[]
        await self.controller.questions.publish(validate_proposals(raw,frozen),frozen)
    async def test_two_windows_cannot_double_generate_or_replay_arming_receipt(self):
        owner=await self.setup_owner();observer=await self.six('observer')
        await observer.command('set_auto','intruder',armed=True,mode='full_auto',expectedConfigRevision=1)
        rejected=await observer.wait_for('command_ack',predicate=lambda e:e.get('commandId')=='intruder')
        self.assertFalse(rejected['accepted']);self.assertEqual(rejected['code'],'not_owner')
        await self.publish();accepted=await owner.wait_for('answer_accepted')
        self.assertEqual(accepted['origin'],'auto');self.assertEqual(len(self.generation_calls),1)
        await owner.command('set_auto','arm',armed=True,mode='full_auto',expectedConfigRevision=1)
        await owner.command('get_command_status','status-arm',queryCommandId='arm')
        status=await owner.wait_for('command_status',predicate=lambda e:e.get('commandId')=='arm')
        self.assertEqual(status['result'][0]['type'],'assistance_state');self.assertEqual(len(self.generation_calls),1)
        self.assertEqual(observer.of_type('answer_accepted'),[])
        await owner.command('cancel_answer','stop',requestId=accepted['requestId'],answerId=accepted['answerId'])
        final=await owner.wait_for('answer_finished',predicate=lambda e:e.get('requestId')==accepted['requestId'])
        self.assertEqual(final['status'],'cancelled');self.assertFalse(self.controller.auto.state.armed)
    async def test_owner_disconnect_cancels_pending_and_new_controller_stays_in_Assist(self):
        owner=await self.setup_owner();observer=await self.six('observer');old_epoch=owner.session_epoch
        await self.publish();accepted=await owner.wait_for('answer_accepted');await self.publish(2)
        await owner.close()
        control=await observer.wait_for('control_state',predicate=lambda e:e.get('sessionEpoch',0)>old_epoch)
        observer.session_epoch=control['sessionEpoch']
        await observer.command('claim_control','takeover')
        state=await observer.wait_for('assistance_state',predicate=lambda e:e.get('connectionId')==observer.connection_id)
        self.assertFalse(state['autoArmed']);self.assertIsNone(state['pendingCandidate']);self.assertFalse(state['configurationReady'])
        self.assertTrue(self.controller.requests.get(accepted['requestId']).terminal)
        self.assertIsNotNone(self.controller.snapshots.get(accepted['snapshotId']))
        await self.publish(3)
        task=self.controller.auto.task
        if task:await task
        self.assertEqual(len(self.generation_calls),1)
