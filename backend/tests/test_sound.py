"""M06 audio lifecycle checks: synthetic capture only, isolated SQLite."""
import asyncio
import dataclasses
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import app.main as main
from app.assistance import RequestRecord
from app.audio_capture import AudioSourceInfo

BASE = main.Settings()
def sources():
    return AudioSourceInfo(None, 'mic-a', 'monitor-a', 'monitor-a', 'mic-a', ['monitor-a','monitor-b'], ['mic-a','mic-b'])

class Capture:
    instances = []
    def __init__(self, source_name, *args):
        self.source_name = source_name
        self.stopped = False
        self.instances.append(self)
    async def start(self): pass
    async def stop(self): self.stopped = True
    async def stream(self):
        await asyncio.Event().wait()
        yield b''

class SoundTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        with patch.object(main,'Settings',lambda:dataclasses.replace(BASE,rag_db_path=str(Path(self.tmp.name)/'rag.sqlite'))):
            self.app = main.AppController()
        self.discovery=patch.object(main,'discover_audio_sources',side_effect=lambda:sources());self.discovery.start()
        self.capture=patch.object(main,'AudioCapture',Capture);self.capture.start()
        Capture.instances=[]
        self.app.hub.broadcast=AsyncMock()
        self.app.hub.send_to=AsyncMock()
        self.conn=SimpleNamespace(connection_id='owner')
        await self.app._broadcast_audio_sources()
    async def asyncTearDown(self):
        await self.app._stop_meter_loop('system');await self.app._stop_meter_loop('mic')
        self.discovery.stop();self.capture.stop();self.app._rag_store.close();self.tmp.cleanup()
    async def command(self,kind,**data):
        await self.app._handle_message({'type':kind,**data},self.conn)
    async def test_monitors_start_without_transcription_and_survive_stop(self):
        self.assertFalse(self.app.state.running)
        original=(self.app._system_meter_task,self.app._mic_meter_task)
        self.assertTrue(all(original))
        self.app.state.running=True
        self.app._capture=SimpleNamespace(stop=AsyncMock())
        await self.app.stop_transcription()
        self.assertEqual(original,(self.app._system_meter_task,self.app._mic_meter_task))
        self.assertTrue(all(not t.done() for t in original))
        self.assertTrue(all(not c.stopped for c in Capture.instances))
    async def test_inactive_preference_and_identical_selection_do_not_restart_or_invalidate(self):
        self.app.state.audio_mode='system';self.app.state.running=True
        self.app._restart_transcription_if_running=AsyncMock()
        epoch=self.app.lease.session_epoch
        await self.command('set_mic_source',sourceName='mic-b')
        await self.command('set_audio_source',sourceName='monitor-a')
        await self.command('set_audio_mode',mode='system')
        self.assertEqual(self.app.state.mic_source,'mic-b')
        self.app._restart_transcription_if_running.assert_not_awaited()
        self.assertEqual(self.app.lease.session_epoch,epoch)
        self.app.state.running=False
    async def test_active_source_resolves_fallback_before_restart(self):
        self.app.state.audio_mode='system';self.app.state.running=True
        observed=[]
        async def restart():observed.append(self.app.state.monitor_source)
        self.app._restart_transcription_if_running=restart
        await self.command('set_audio_source',sourceName='monitor-b')
        self.assertEqual(observed,['monitor-b'])
        await self.command('set_audio_source',sourceName='missing')
        self.assertEqual(observed,['monitor-b','monitor-a'])
        self.app.state.running=False
    async def test_active_source_cancels_old_answer_then_invalidates_preserving_card(self):
        record=RequestRecord('r','a',connection_id='owner',text='Partial',session_epoch=self.app.lease.session_epoch)
        self.app.requests.create(record)
        epoch=self.app.lease.session_epoch
        await self.command('set_audio_source',sourceName='monitor-b')
        self.assertTrue(record.terminal)
        self.assertEqual(record.text,'Partial')
        self.assertEqual(record.status,'cancelled')
        self.assertGreater(self.app.lease.session_epoch,epoch)
        self.assertIs(self.app.requests.get('r'),record)
    async def test_other_owner_cannot_change_source(self):
        self.app.lease.claim('other')
        await self.command('set_audio_source',sourceName='monitor-b')
        self.assertEqual(self.app.state.monitor_source,'monitor-a')
        self.assertEqual(self.app.hub.send_to.call_args.args[2]['code'],'not_owner')
    async def test_observer_cannot_start_stop_or_clear_capture(self):
        self.app.lease.claim('other')
        self.app.start_transcription=AsyncMock();self.app.stop_transcription=AsyncMock()
        before=self.app.lease.session_epoch
        for command in ['start_transcription','stop_transcription','clear_transcript']:
            await self.command(command)
        self.app.start_transcription.assert_not_awaited();self.app.stop_transcription.assert_not_awaited()
        self.assertEqual(self.app.lease.session_epoch,before)
    async def test_failed_refresh_keeps_acknowledged_sources(self):
        with patch.object(main,'discover_audio_sources',side_effect=RuntimeError('fixture discovery failure')):
            await self.command('get_audio_sources')
        self.assertEqual(self.app.state.monitor_source,'monitor-a')
        self.assertEqual(self.app.hub.broadcast.call_args.args[1]['state'],'audio_sources_error')
    async def test_failed_discovery_does_not_commit_mode_change(self):
        before=self.app.lease.session_epoch
        with patch.object(main,'discover_audio_sources',side_effect=RuntimeError('fixture discovery failure')):
            await self.command('set_audio_mode',mode='mic')
        self.assertEqual(self.app.state.audio_mode,'system')
        self.assertEqual(self.app.lease.session_epoch,before)
    async def test_disappearing_active_device_resolves_and_invalidates(self):
        before=self.app.lease.session_epoch
        info=sources();info.monitor_sources=['monitor-b'];info.default_monitor='monitor-b';info.preferred_monitor='monitor-b'
        with patch.object(main,'discover_audio_sources',return_value=info):await self.command('get_audio_sources')
        self.assertEqual(self.app.state.monitor_source,'monitor-b')
        self.assertGreater(self.app.lease.session_epoch,before)
    async def test_empty_devices_are_unavailable_not_quiet_samples(self):
        info=sources();info.monitor_sources=[];info.mic_sources=[]
        self.app.hub.broadcast.reset_mock()
        with patch.object(main,'discover_audio_sources',return_value=info):await self.command('get_audio_sources')
        self.assertIsNone(self.app.state.monitor_source)
        self.assertIsNone(self.app._system_meter_task)
        self.assertFalse(any(call.args[0]=='audio_level' for call in self.app.hub.broadcast.call_args_list))
        self.assertTrue(any(call.args[1].get('state')=='audio_meter_unavailable' for call in self.app.hub.broadcast.call_args_list))
    async def test_meter_capture_failure_is_source_specific(self):
        await self.app._stop_meter_loop('mic')
        with patch.object(Capture,'start',side_effect=RuntimeError('fixture failure')):
            await self.app._ensure_meter_loop('mic','mic-a')
        status=self.app.hub.broadcast.call_args.args[1]
        self.assertEqual(status['state'],'audio_meter_unavailable')
        self.assertEqual(status['details']['streamKind'],'mic')
        self.assertTrue(Capture.instances[-1].stopped)
    async def test_meter_stream_end_reports_unavailable_and_releases_capture(self):
        class Ended(Capture):
            async def stream(self):
                if False: yield b''
        capture=Ended('mic-a')
        await self.app._meter_loop('mic',capture)
        self.assertTrue(capture.stopped)
        status=self.app.hub.broadcast.call_args.args[1]
        self.assertEqual(status['state'],'audio_meter_unavailable')
        self.assertIn('ended',status['details']['message'])
    async def test_shutdown_closes_all_meter_captures(self):
        self.app.hub.stop=AsyncMock()
        await self.app.stop()
        self.assertTrue(all(c.stopped for c in Capture.instances))
