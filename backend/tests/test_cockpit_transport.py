"""Owned, versioned transport tests (M03-T06/T07).

These tests drive two real local WebSocket clients against the real hub and the
real `AppController` message handlers. Generation is mocked; no Gateway, RAG,
audio capture, or native window is touched.
"""
from __future__ import annotations

import asyncio
import dataclasses
import json
import socket
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Optional
from unittest import mock

import websockets
import httpx

import app.main as main_module
from app.assistance import (
    M03_CAPABILITIES,
    V3_CAPABILITIES,
    AssistanceError,
    CommandRegistry,
    RequestRecord,
    RequestRegistry,
)
from app.ai_gateway_client import AIGatewayClient, DEFAULT_TEXT_MODEL
from app.cockpit_models import AnswerStatus, ErrorCode, RetrievalOutcome, RetrievalResult
from app.cockpit_protocol import (
    ContractContext,
    parse_answer_accepted_event,
    parse_answer_event,
)
from app.main import AppController
from app.stt import Segment
from app.transcript import TranscriptStore


#: Real settings, used only to derive an isolated RAG path for tests.
BASE_SETTINGS = main_module.Settings()


def _isolated_settings(rag_db_path: Path):
    return dataclasses.replace(BASE_SETTINGS, rag_db_path=str(rag_db_path))


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class Client:
    """A real WebSocket client that records every server message."""

    def __init__(self, websocket, name: str = "") -> None:
        self.ws = websocket
        self.name = name
        self.messages: list[dict] = []
        self.backend_instance_id: Optional[str] = None
        self.connection_id: Optional[str] = None
        self.session_epoch: Optional[int] = None
        self.protocol_version: int = 2
        self._reader = asyncio.create_task(self._read())

    async def _read(self) -> None:
        try:
            async for raw in self.ws:
                self.messages.append(json.loads(raw))
        except Exception:  # noqa: BLE001 - the reader stops when the socket closes
            return

    async def wait_for(self, msg_type: str, predicate=None, timeout: float = 3.0) -> dict:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        seen = 0
        while True:
            for message in self.messages[seen:]:
                if message.get("type") == msg_type and (predicate is None or predicate(message)):
                    return message
            seen = len(self.messages)
            remaining = deadline - loop.time()
            if remaining <= 0:
                types = [message.get("type") for message in self.messages]
                raise AssertionError(f"{self.name}: {msg_type} not received; saw {types}")
            await asyncio.sleep(min(0.01, remaining))

    def of_type(self, msg_type: str) -> list[dict]:
        return [message for message in self.messages if message.get("type") == msg_type]

    async def send(self, payload: dict) -> None:
        await self.ws.send(json.dumps(payload))

    async def hello(
        self,
        app_id: str = "test-ui",
        command_id: str = "hello-1",
        protocol_version: int = 2,
        supported: Optional[list] = None,
    ) -> dict:
        payload = {
            "type": "hello",
            "protocolVersion": protocol_version,
            "backendInstanceId": None,
            "sessionEpoch": 0,
            "commandId": command_id,
            "client": {"appId": app_id, "clientVersion": "test"},
        }
        if supported is not None:
            payload["supportedProtocolVersions"] = supported
        await self.send(payload)
        ack = await self.wait_for("hello_ack", predicate=lambda m: m.get("commandId") == command_id)
        self.backend_instance_id = ack["backendInstanceId"]
        self.connection_id = ack["connectionId"]
        self.session_epoch = ack["sessionEpoch"]
        self.protocol_version = ack["protocolVersion"]
        return ack

    async def command(self, command_type: str, command_id: str, **fields: Any) -> dict:
        payload = {
            "type": command_type,
            "protocolVersion": self.protocol_version,
            "backendInstanceId": self.backend_instance_id,
            "sessionEpoch": self.session_epoch,
            "commandId": command_id,
            **fields,
        }
        await self.send(payload)
        return payload

    async def close(self) -> None:
        self._reader.cancel()
        await self.ws.close()


class StubRagStore:
    """Test double: no SQLite access, no embedding calls, no network."""

    def __init__(self) -> None:
        self.searches: list[str] = []

    async def search(self, query: str, top_k: int = 6, embed_texts=None):
        self.searches.append(query)
        return []

    def list_documents(self):
        return []

    async def ingest_paths(self, paths, embed_texts=None):
        raise AssertionError("transport tests must not ingest documents")

    def clear(self) -> None:
        return None

    def close(self) -> None:
        return None


class TransportTestBase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        rag_path = Path(self._tmpdir.name) / "rag.sqlite"
        with mock.patch.object(main_module, "Settings", lambda: _isolated_settings(rag_path)):
            self.controller = AppController()
        self.rag_store = StubRagStore()
        self.controller._rag_store.close()
        self.controller._rag_store = self.rag_store
        self.controller.hub.port = _free_port()
        self.url = f"ws://127.0.0.1:{self.controller.hub.port}"
        self.generation_calls: list[dict] = []
        self.generation_started = asyncio.Event()
        self.generation_release = asyncio.Event()
        self.controller._generation_runner = self._fake_runner
        self.controller._retrieve_evidence = self._no_evidence
        await self.controller.hub.start()
        self.clients: list[Client] = []

    async def asyncTearDown(self) -> None:
        for client in self.clients:
            await client.close()
        for task in list(self.controller._answer_tasks.values()):
            task.cancel()
        await asyncio.gather(*self.controller._answer_tasks.values(), return_exceptions=True)
        await self.controller.hub.stop()
        self.controller._rag_store.close()

    async def _no_evidence(self, text: str, instruction: str, record) -> RetrievalResult:
        return RetrievalResult(outcome=RetrievalOutcome.NO_MATCHES)

    def release_generation(self) -> None:
        self.generation_release.set()

    async def _fake_runner(self, **kwargs):
        """Deterministic mocked generation; blocks until released."""
        self.generation_calls.append(kwargs)
        self.generation_started.set()
        await self.generation_release.wait()
        on_delta = kwargs.get("on_stream_delta")
        if on_delta is not None:
            await on_delta("First ")
            await on_delta("answer.")
        return SimpleNamespace(text="First answer.", latency_ms=12, input_tokens=3, output_tokens=2)

    async def connect(self, name: str, protocol_version: int = 2) -> Client:
        websocket = await websockets.connect(self.url)
        client = Client(websocket, name=name)
        self.clients.append(client)
        if protocol_version >= 3:
            await client.hello(
                command_id=f"hello-{name}",
                protocol_version=protocol_version,
                supported=[4, 3, 2] if protocol_version >= 4 else [3, 2],
            )
        else:
            await client.hello(command_id=f"hello-{name}")
        return client

    def add_speech(self, *texts: str) -> None:
        for index, text in enumerate(texts, start=1):
            self.controller.transcript.add_segment(
                Segment(id=index, t0=float(index), t1=float(index) + 0.9, text=text, source_kind="system", source_name="Test Monitor")
            )

    def anchor_key(self, text: str) -> str:
        for record in self.controller.transcript.records():
            if record.text == text:
                return record.segment_key
        raise AssertionError(f"no record for {text!r}")


class RegistryCapacityTests(unittest.TestCase):
    def test_command_registry_prunes_oldest_and_keeps_newest_outcome(self) -> None:
        registry = CommandRegistry(max_entries=2, clock=lambda: 100.0)
        registry.accept("c", "first")
        registry.accept("c", "second")
        registry.accept("c", "third")
        self.assertIsNone(registry.get("c", "first"))
        self.assertIsNotNone(registry.get("c", "second"))
        self.assertIsNotNone(registry.get("c", "third"))

    def test_request_registry_preserves_kept_records_at_history_capacity(self):
        registry = RequestRegistry(max_entries=2)
        kept = RequestRecord(request_id="kept", answer_id="kept", terminal=True, metadata={"placement":"kept"})
        oldest = RequestRecord(request_id="oldest", answer_id="oldest", terminal=True)
        registry.create(kept); registry.create(oldest)
        registry.create(RequestRecord(request_id="new", answer_id="new", terminal=False))
        self.assertIs(registry.get("kept"), kept)
        self.assertIsNone(registry.get("oldest"))

    def test_request_registry_prunes_terminal_history_but_rejects_all_live_capacity(self) -> None:
        timestamps = iter((1.0, 2.0, 3.0))
        registry = RequestRegistry(max_entries=2, clock=lambda: next(timestamps))
        old = registry.create(RequestRecord("old", "old-answer", status="completed", terminal=True))
        live = registry.create(RequestRecord("live", "live-answer", status="running"))
        registry.create(RequestRecord("new", "new-answer", status="completed", terminal=True))
        self.assertIsNone(registry.get(old.request_id))
        self.assertIsNotNone(registry.get(live.request_id))
        self.assertIsNotNone(registry.get("new"))

        full = RequestRegistry(max_entries=1)
        full.create(RequestRecord("active", "active-answer", status="running"))
        with self.assertRaises(AssistanceError):
            full.ensure_capacity()


class NegotiationTests(TransportTestBase):
    async def test_hello_ack_returns_identity_capabilities_and_no_full_auto(self) -> None:
        client = await self.connect("owner")

        self.assertEqual(client.backend_instance_id, self.controller.backend_instance_id)
        self.assertTrue(client.connection_id)
        ack = client.of_type("hello_ack")[0]
        self.assertEqual(ack["protocolVersion"], 2)
        self.assertEqual(ack["capabilities"], list(M03_CAPABILITIES))
        self.assertNotIn("full_auto", ack["capabilities"])
        self.assertNotIn("candidates", ack["capabilities"])
        self.assertNotIn("answer_records", ack["capabilities"])
        self.assertEqual(ack["sessionEpoch"], self.controller.lease.session_epoch)

    async def test_stale_backend_instance_is_rejected(self) -> None:
        client = await self.connect("owner")

        await client.send(
            {
                "type": "claim_control",
                "protocolVersion": 2,
                "backendInstanceId": "an-earlier-backend-incarnation",
                "sessionEpoch": client.session_epoch,
                "commandId": "c-stale-instance",
            }
        )

        ack = await client.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "c-stale-instance")
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["code"], ErrorCode.INCOMPATIBLE_VERSION.value)


class OwnershipTests(TransportTestBase):
    async def test_first_claimant_becomes_owner_and_second_is_read_only(self) -> None:
        owner = await self.connect("owner")
        observer = await self.connect("observer")

        await owner.command("claim_control", "claim-1")
        ack = await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")
        self.assertTrue(ack["accepted"])
        state = await observer.wait_for(
            "control_state", predicate=lambda m: m.get("ownerConnectionId") == owner.connection_id
        )
        self.assertTrue(state["readOnly"])
        self.assertEqual(state["ownerConnectionId"], owner.connection_id)

        await observer.command("claim_control", "claim-2")
        rejected = await observer.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-2")
        self.assertFalse(rejected["accepted"])
        self.assertEqual(rejected["code"], ErrorCode.NOT_OWNER.value)

    async def test_observer_cannot_snapshot_or_generate(self) -> None:
        self.add_speech("should we ship on friday")
        owner = await self.connect("owner")
        observer = await self.connect("observer")
        owner.session_epoch = observer.session_epoch = self.controller.lease.session_epoch
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")

        await observer.command(
            "create_snapshot",
            "snap-1",
            kind="recent_window",
            anchorSegmentKey=self.anchor_key("should we ship on friday"),
            windowSeconds=20,
            includePartial=False,
        )
        await observer.command(
            "run_context_query",
            "run-1",
            anchorSegmentKey=self.anchor_key("should we ship on friday"),
            windowSeconds=20,
            mode="Preset",
            presetId="answer_question",
            customInstruction=None,
            model="test/model",
            includeScreenshot=False,
            screenshotDataUrl=None,
            humanNoteIds=[],
        )

        snapshot_ack = await observer.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "snap-1")
        run_ack = await observer.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "run-1")
        for ack in (snapshot_ack, run_ack):
            self.assertFalse(ack["accepted"])
            self.assertEqual(ack["code"], ErrorCode.NOT_OWNER.value)
        self.assertEqual(self.generation_calls, [])
        self.assertEqual(observer.of_type("snapshot_created"), [])

    async def test_owner_disconnect_cancels_owned_work_and_releases_control(self) -> None:
        self.add_speech("what should we do about the rollback")
        owner = await self.connect("owner")
        observer = await self.connect("observer")
        owner.session_epoch = observer.session_epoch = self.controller.lease.session_epoch
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")
        epoch_before = owner.session_epoch

        await owner.command(
            "run_context_query",
            "run-1",
            anchorSegmentKey=self.anchor_key("what should we do about the rollback"),
            windowSeconds=20,
            mode="Preset",
            presetId="answer_question",
            customInstruction=None,
            model="test/model",
            includeScreenshot=False,
            screenshotDataUrl=None,
            humanNoteIds=[],
        )
        accepted = await owner.wait_for("answer_accepted")
        await self.generation_started.wait()
        request_id = accepted["requestId"]

        await owner.close()

        released = await observer.wait_for(
            "control_state", predicate=lambda m: m.get("ownerConnectionId") is None, timeout=5.0
        )
        self.assertGreater(released["sessionEpoch"], epoch_before)
        record = self.controller.requests.get(request_id)
        self.assertIsNotNone(record)
        self.assertTrue(record.terminal)
        self.assertEqual(record.status, AnswerStatus.CANCELLED.value)
        self.assertIsNone(self.controller.lease.owner_connection_id)

    async def test_reconnect_negotiates_a_new_epoch_before_claiming(self) -> None:
        owner = await self.connect("owner")
        observer = await self.connect("observer")
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")
        await owner.close()
        await observer.wait_for("control_state", predicate=lambda m: m.get("ownerConnectionId") is None, timeout=5.0)

        stale = observer.session_epoch
        await observer.command("claim_control", "claim-stale")
        rejected = await observer.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-stale")
        self.assertFalse(rejected["accepted"])
        self.assertEqual(rejected["code"], ErrorCode.STALE_EPOCH.value)

        await observer.hello(command_id="hello-again")
        self.assertNotEqual(observer.session_epoch, stale)
        await observer.command("claim_control", "claim-2")
        accepted = await observer.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-2")
        self.assertTrue(accepted["accepted"])


class RequestLifecycleTests(TransportTestBase):
    async def _start_answer(self, client: Client, command_id: str = "run-1") -> dict:
        key = self.anchor_key(self.controller.transcript.records()[0].text)
        await client.command(
            "run_context_query",
            command_id,
            anchorSegmentKey=key,
            windowSeconds=20,
            mode="Preset",
            presetId="answer_question",
            customInstruction=None,
            model="test/model",
            includeScreenshot=False,
            screenshotDataUrl=None,
            humanNoteIds=[],
        )
        return await client.wait_for("answer_accepted", predicate=lambda m: m.get("commandId") == command_id)

    async def test_streaming_answer_is_scoped_and_finishes_with_final_text(self) -> None:
        self.add_speech("what should we do about the rollback")
        owner = await self.connect("owner")
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")

        accepted = await self._start_answer(owner)
        snapshot = await owner.wait_for("snapshot_created")
        self.assertEqual(snapshot["snapshot"]["text"], "what should we do about the rollback")
        self.assertTrue(owner.connection_id)
        self.release_generation()
        finished = await owner.wait_for("answer_finished")

        self.assertEqual(finished["status"], AnswerStatus.COMPLETED.value)
        self.assertEqual(finished["text"], "First answer.")
        self.assertEqual(finished["requestId"], accepted["requestId"])
        self.assertEqual(finished["answerId"], accepted["answerId"])
        self.assertEqual(finished["retrieval"]["outcome"], RetrievalOutcome.NO_DOCUMENTS.value)
        # Chunks carry increasing sequence numbers below the terminal event.
        seqs = [chunk["eventSeq"] for chunk in owner.of_type("answer_chunk")]
        self.assertEqual(seqs, sorted(seqs))
        self.assertEqual(finished["eventSeq"], max(seqs) + 1)

    async def test_gateway_failure_retains_partial_and_empty_stream_stays_empty(self) -> None:
        self.add_speech("what should we do about the rollback")
        owner = await self.connect("owner")
        await owner.command("claim_control", "claim-stream")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-stream")

        cases = [
            (AnswerStatus.FAILED, [
                {"type": "response.output_text.delta", "delta": "Partial advice"},
                {"type": "response.failed", "response": {"status": "failed"}},
            ], "Partial advice"),
            (AnswerStatus.EMPTY, [
                {"type": "response.completed", "response": {"output_text": ""}},
            ], ""),
        ]
        for expected_status, events, expected_text in cases:
            with self.subTest(status=expected_status):
                body = "".join(f"data: {json.dumps(event)}\n\n" for event in events)
                calls = []

                def handler(request):
                    calls.append(request)
                    return httpx.Response(200, content=body, headers={"content-type": "text/event-stream"})

                gateway = AIGatewayClient("synthetic-key", DEFAULT_TEXT_MODEL, transport=httpx.MockTransport(handler))
                self.addAsyncCleanup(gateway.close)
                self.controller._generation_runner = gateway.run_query
                with mock.patch.object(main_module.logger, "exception"):
                    accepted = await self._start_answer(owner, f"stream-{expected_status.value}")
                    finished = await owner.wait_for(
                        "answer_finished", predicate=lambda m: m.get("requestId") == accepted["requestId"]
                    )
                self.assertEqual(finished["status"], expected_status.value)
                self.assertEqual(finished["text"], expected_text)
                self.assertEqual(len(calls), 1)

    async def test_duplicate_command_id_executes_once(self) -> None:
        self.add_speech("what should we do about the rollback")
        owner = await self.connect("owner")
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")

        await self._start_answer(owner, "run-dup")
        await self._start_answer(owner, "run-dup")
        self.release_generation()
        await owner.wait_for("answer_finished")

        self.assertEqual(len(self.generation_calls), 1)
        acks = [m for m in owner.of_type("command_ack") if m.get("commandId") == "run-dup"]
        self.assertEqual(len(acks), 2)
        self.assertTrue(all(ack["accepted"] for ack in acks))
        self.assertEqual(acks[0]["requestId"], acks[1]["requestId"])

    async def test_command_status_reconciles_without_reexecution(self) -> None:
        self.add_speech("what should we do about the rollback")
        owner = await self.connect("owner")
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")
        await self._start_answer(owner, "run-lost-ack")
        self.release_generation()
        await owner.wait_for("answer_finished")

        await owner.command("get_command_status", "status-1", queryCommandId="run-lost-ack")
        status = await owner.wait_for("command_status")
        self.assertEqual(status["status"], "accepted")
        self.assertTrue(status["requestId"])
        status_ack = await owner.wait_for("command_ack", predicate=lambda m:m.get("commandId")=="status-1")
        self.assertTrue(status_ack["accepted"])
        await owner.command("get_command_status", "status-2", queryCommandId="never-sent")
        unknown = await owner.wait_for("command_status", predicate=lambda m: m.get("commandId") == "never-sent")
        self.assertEqual(unknown["status"], "unknown")
        unknown_ack = await owner.wait_for("command_ack", predicate=lambda m:m.get("commandId")=="status-2")
        self.assertTrue(unknown_ack["accepted"])
        self.assertEqual(len(self.generation_calls), 1)

    async def test_reconciliation_returns_outcome_if_its_lookup_is_pruned_by_the_query(self) -> None:
        self.add_speech("what should we do about the rollback")
        owner = await self.connect("owner")
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")
        await self._start_answer(owner, "run-reconcile-edge")
        self.release_generation()
        await owner.wait_for("answer_finished")
        # At capacity, recording the status-query command may evict the queried
        # outcome after it has been read. Reconciliation must return the captured
        # accepted result, not an incorrect unknown.
        self.controller.commands._max_entries = len(self.controller.commands)
        # Make this the oldest retained result deterministically; equal wall
        # clock timestamps otherwise leave ordering implementation-dependent.
        self.controller.commands.get(owner.connection_id, "run-reconcile-edge").created_at = 0.0

        await owner.command("get_command_status", "status-prunes-lookup", queryCommandId="run-reconcile-edge")
        status = await owner.wait_for("command_status", predicate=lambda m: m.get("commandId") == "run-reconcile-edge")
        self.assertEqual(status["status"], "accepted")
        self.assertEqual(status["requestId"], owner.of_type("answer_accepted")[-1]["requestId"])
        self.assertIsNone(self.controller.commands.get(owner.connection_id, "run-reconcile-edge"))
        self.assertEqual(len(self.generation_calls), 1)

    async def test_cancellation_requires_the_matching_owned_request(self) -> None:
        self.add_speech("what should we do about the rollback")
        owner = await self.connect("owner")
        observer = await self.connect("observer")
        owner.session_epoch = observer.session_epoch = self.controller.lease.session_epoch
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")
        accepted = await self._start_answer(owner)
        await self.generation_started.wait()

        await owner.command(
            "cancel_answer",
            "cancel-wrong-answer",
            requestId=accepted["requestId"],
            answerId="some-other-answer",
        )
        wrong = await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "cancel-wrong-answer")
        self.assertFalse(wrong["accepted"])
        self.assertEqual(wrong["code"], ErrorCode.INVALID_SPAN.value)

        await observer.command(
            "cancel_answer",
            "cancel-foreign",
            requestId=accepted["requestId"],
            answerId=accepted["answerId"],
        )
        foreign = await observer.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "cancel-foreign")
        self.assertFalse(foreign["accepted"])
        self.assertIn(foreign["code"], {ErrorCode.NOT_OWNER.value})

        await owner.command(
            "cancel_answer",
            "cancel-own",
            requestId=accepted["requestId"],
            answerId=accepted["answerId"],
        )
        own = await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "cancel-own")
        self.assertTrue(own["accepted"])
        finished = await owner.wait_for("answer_finished")
        self.assertEqual(finished["status"], AnswerStatus.CANCELLED.value)
        self.assertTrue(self.controller.requests.get(accepted["requestId"]).terminal)

    async def test_unimplemented_commands_are_rejected_and_not_advertised(self) -> None:
        owner = await self.connect("owner")
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")

        await owner.command("set_auto", "auto-1", armed=True, mode="full_auto")
        rejected = await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "auto-1")
        self.assertFalse(rejected["accepted"])
        self.assertEqual(rejected["code"], ErrorCode.INCOMPATIBLE_VERSION.value)
        self.assertEqual(owner.of_type("assistance_state"), [])


    async def test_stop_listening_finishes_manual_answer_in_its_original_epoch(self):
        async def runner(**kwargs):
            await kwargs["on_stream_delta"]("Retained partial")
            await self.generation_release.wait()
            await kwargs["on_stream_delta"](" must not arrive")
            return SimpleNamespace(text="Retained partial must not arrive", latency_ms=1)

        self.controller._generation_runner = runner
        self.add_speech("please explain the rollback plan")
        owner = await self.connect("owner", protocol_version=4)
        await owner.command("claim_control", "claim")
        await owner.wait_for("command_ack", predicate=lambda m:m.get("commandId")=="claim")
        accepted = await self._start_answer(owner)
        await owner.wait_for("answer_chunk")
        task = self.controller._answer_tasks[accepted["requestId"]]
        epoch = self.controller.lease.session_epoch
        self.controller.state.running = True
        await owner.send({"type":"stop_transcription"})
        finished = await owner.wait_for("answer_finished")
        await owner.wait_for("control_state", predicate=lambda m:m.get("sessionEpoch",0)>epoch)
        self.assertEqual(finished["sessionEpoch"], epoch)
        self.assertEqual(finished["status"], "superseded")
        self.assertEqual(finished["text"], "Retained partial")
        record = self.controller.requests.get(accepted["requestId"])
        self.assertTrue(record.terminal)
        self.assertFalse(self.controller.requests.is_busy())
        self.release_generation()
        await asyncio.gather(task, return_exceptions=True)
        self.assertEqual(len(owner.of_type("answer_chunk")), 1)
        self.assertEqual(len(owner.of_type("answer_finished")), 1)

    async def _failed_send_releases_control(self, broadcast=False, from_generation=False):
        self.add_speech("please explain the rollback plan")
        owner = await self.connect("owner")
        observer = await self.connect("observer")
        await owner.command("claim_control", "claim")
        await owner.wait_for("command_ack", predicate=lambda m:m.get("commandId")=="claim")
        accepted = await self._start_answer(owner)
        await asyncio.wait_for(self.generation_started.wait(), 1)
        info = self.controller.hub.connection(owner.connection_id)
        hook = mock.AsyncMock(wraps=self.controller._on_client_disconnect)
        self.controller.hub._on_disconnect = hook
        with mock.patch.object(info.websocket, "send", side_effect=ConnectionError("synthetic send failure")):
            if from_generation:
                self.release_generation()
            elif broadcast:
                await self.controller.hub.broadcast("test_failure", {})
            else:
                self.assertFalse(await self.controller.hub.send_to(owner.connection_id, "test_failure", {}))
            await observer.wait_for("control_state", predicate=lambda m:m.get("ownerConnectionId") is None)
            await asyncio.wait_for(info.disconnect_task, 1)
        hook.assert_awaited_once_with(info)
        record = self.controller.requests.get(accepted["requestId"])
        self.assertTrue(record.terminal)
        observer.session_epoch = self.controller.lease.session_epoch
        await observer.command("claim_control", "replacement-claim")
        ack = await observer.wait_for("command_ack", predicate=lambda m:m.get("commandId")=="replacement-claim")
        self.assertTrue(ack["accepted"])
        self.assertEqual(self.controller.lease.owner_connection_id, observer.connection_id)

    async def test_targeted_send_failure_releases_the_owner_lease(self):
        await self._failed_send_releases_control()

    async def test_broadcast_send_failure_releases_the_owner_lease(self):
        await self._failed_send_releases_control(broadcast=True)

    async def test_generation_send_failure_can_cancel_its_own_job_without_deadlock(self):
        await self._failed_send_releases_control(from_generation=True)


class LegacyCompatibilityTests(TransportTestBase):
    async def test_legacy_query_runs_when_no_v2_owner_holds_control(self) -> None:
        client = await self.connect("legacy")
        await client.send(
            {
                "type": "run_query",
                "requestId": "legacy-1",
                "presetId": "answer_question",
                "customInstruction": None,
                "selectedText": "should we ship on friday",
                "selectionTimeRange": None,
                "model": "test/model",
                "includeScreenshot": False,
                "screenshotDataUrl": None,
            }
        )
        self.release_generation()
        response = await client.wait_for("query_response", predicate=lambda m: m.get("requestId") == "legacy-1")
        state = await client.wait_for("query_state", predicate=lambda m: m.get("requestId") == "legacy-1" and not m.get("running"))

        self.assertEqual(response["text"], "First answer.")
        types = [message.get("type") for message in client.messages]
        self.assertLess(
            types.index("query_response"),
            len(types) - 1 - types[::-1].index("query_state"),
            "the definitive response must precede the nonterminal state update",
        )
        self.assertEqual(state.get("cancelled"), None)

    async def test_legacy_query_is_rejected_for_a_read_only_observer(self) -> None:
        owner = await self.connect("owner")
        observer = await self.connect("observer")
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")

        await observer.send(
            {
                "type": "run_query",
                "requestId": "legacy-2",
                "presetId": "answer_question",
                "customInstruction": None,
                "selectedText": "should we ship on friday",
                "selectionTimeRange": None,
                "model": "test/model",
                "includeScreenshot": False,
                "screenshotDataUrl": None,
            }
        )
        error = await observer.wait_for("error")
        self.assertEqual(error["code"], ErrorCode.NOT_OWNER.value)
        self.assertEqual(self.generation_calls, [])

    async def test_legacy_cancel_cannot_cancel_another_connections_job(self) -> None:
        owner = await self.connect("owner")
        observer = await self.connect("observer")
        await owner.send(
            {
                "type": "run_query",
                "requestId": "legacy-owner",
                "presetId": "answer_question",
                "customInstruction": None,
                "selectedText": "should we ship on friday",
                "selectionTimeRange": None,
                "model": "test/model",
                "includeScreenshot": False,
                "screenshotDataUrl": None,
            }
        )
        await self.generation_started.wait()

        await observer.send({"type": "cancel_query", "requestId": "legacy-owner"})
        error = await observer.wait_for("error")
        self.assertEqual(error["code"], ErrorCode.NOT_OWNER.value)
        record = self.controller.requests.get("legacy-owner")
        self.assertFalse(record.terminal)

        self.release_generation()
        await owner.wait_for("query_response", predicate=lambda m: m.get("requestId") == "legacy-owner")


class SnapshotTransportTests(TransportTestBase):
    async def test_pinned_moment_makes_no_generation_call(self) -> None:
        self.add_speech("pin this moment")
        owner = await self.connect("owner")
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")

        await owner.command(
            "create_snapshot",
            "pin-1",
            kind="pinned_moment",
            anchorSegmentKey=self.anchor_key("pin this moment"),
            windowSeconds=20,
            includePartial=False,
        )
        created = await owner.wait_for("snapshot_created")
        self.assertEqual(created["snapshot"]["kind"], "pinned_moment")
        self.assertEqual(created["snapshot"]["text"], "pin this moment")
        self.assertTrue(self.controller.snapshots.is_pinned(created["snapshot"]["snapshotId"]))
        self.assertEqual(self.generation_calls, [])

    async def test_selection_snapshot_uses_validated_offsets(self) -> None:
        self.add_speech("Should we ship on friday?")
        owner = await self.connect("owner")
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")

        await owner.command(
            "create_snapshot",
            "sel-1",
            kind="selection",
            anchorSegmentKey="",
            windowSeconds=20,
            includePartial=False,
            sourceSpans=[{"segmentKey": self.anchor_key("Should we ship on friday?"), "start": 0, "end": 9}],
        )
        created = await owner.wait_for("snapshot_created")
        self.assertEqual(created["snapshot"]["text"], "Should we")
        self.assertEqual(created["snapshot"]["kind"], "selection")

    async def test_snapshot_rejects_a_stale_epoch(self) -> None:
        self.add_speech("should we ship on friday")
        owner = await self.connect("owner")
        await owner.command("claim_control", "claim-1")
        await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "claim-1")
        stale = owner.session_epoch

        await self.controller._invalidate_session("test_rotation")
        await owner.wait_for("control_state", predicate=lambda m: m.get("sessionEpoch") > stale)
        owner.session_epoch = stale
        await owner.command(
            "create_snapshot",
            "snap-stale",
            kind="recent_window",
            anchorSegmentKey=self.anchor_key("should we ship on friday"),
            windowSeconds=20,
            includePartial=False,
        )

        ack = await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "snap-stale")
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["code"], ErrorCode.STALE_EPOCH.value)


class ProtocolV3TransportTests(TransportTestBase):
    """Amended v3 contract over the real hub (M3bis-T05/T06)."""

    def v3_context(self, client: Client):
        return ContractContext(
            protocol_version=3,
            backend_instance_id=self.controller.backend_instance_id,
            session_epoch=client.session_epoch or 0,
            current_revision=self.controller.transcript.revision,
        )

    async def _claim(self, client: Client, command_id: str = "claim-1") -> None:
        await client.command("claim_control", command_id)
        ack = await client.wait_for("command_ack", predicate=lambda m: m.get("commandId") == command_id)
        self.assertTrue(ack["accepted"])

    async def _run(self, client: Client, command_id: str = "run-1", **overrides: Any) -> dict:
        key = self.anchor_key(self.controller.transcript.records()[0].text)
        fields = {
            "anchorSegmentKey": key,
            "windowSeconds": 20,
            "mode": "Preset",
            "presetId": "answer_question",
            "customInstruction": None,
            "model": DEFAULT_TEXT_MODEL,
            "includeScreenshot": False,
            "screenshotDataUrl": None,
            "humanNoteIds": [],
        }
        fields.update(overrides)
        await client.command("run_context_query", command_id, **fields)
        return await client.wait_for("command_ack", predicate=lambda m: m.get("commandId") == command_id)

    async def test_v3_negotiation_advertises_amended_capabilities(self) -> None:
        client = await self.connect("owner", protocol_version=3)
        ack = client.of_type("hello_ack")[0]

        self.assertEqual(ack["protocolVersion"], 3)
        self.assertEqual(ack["supportedProtocolVersions"], [2, 3, 4, 5, 6])
        self.assertEqual(list(ack["capabilities"]), list(V3_CAPABILITIES))
        self.assertIn("model_readiness", ack["capabilities"])
        self.assertIn("timing", ack["capabilities"])
        self.assertNotIn("full_auto", ack["capabilities"])
        self.assertNotIn("candidates", ack["capabilities"])

        await self._claim(client)
        state = await client.wait_for("control_state")
        self.assertEqual(state["protocolVersion"], 3, "later events must use the negotiated version")

    async def test_v2_client_keeps_the_recorded_v2_contract(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("legacy-v2", protocol_version=2)
        ack = client.of_type("hello_ack")[0]
        self.assertEqual(ack["protocolVersion"], 2)
        self.assertEqual(list(ack["capabilities"]), list(M03_CAPABILITIES))
        await self._claim(client)

        await self._run(client, "run-v2")
        accepted = await client.wait_for("answer_accepted")
        self.assertNotIn("model", accepted["frozenInputs"])
        self.assertNotIn("timing", accepted)
        self.release_generation()
        finished = await client.wait_for("answer_finished")
        self.assertNotIn("timing", finished)
        self.assertNotIn("modelSettings", finished)
        self.assertEqual(client.of_type("answer_timing"), [])
        self.assertEqual(finished["protocolVersion"], 2)

    async def test_v3_answer_freezes_model_settings_and_scoped_timing(self) -> None:
        self.add_speech("what should we do about the rollback")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)

        await self._run(client, "run-v3", clientPressedAtMs=1234.5)
        accepted = await client.wait_for("answer_accepted")

        # Parsed through the same contract the client harness uses.
        settings = parse_answer_accepted_event(accepted, self.v3_context(client))
        self.assertEqual(settings.role.value, "answer")
        self.assertEqual(settings.model, DEFAULT_TEXT_MODEL)
        self.assertEqual(settings.selection_source.value, "client")
        self.assertEqual(settings.reasoning.effort, "low")
        self.assertTrue(settings.reasoning.applied)
        self.assertEqual(accepted["frozenInputs"]["screenshot"], {"requested": False, "included": False, "reason": None})
        self.assertEqual(accepted["timing"]["client"]["clock"], "client_monotonic")
        self.assertEqual(accepted["timing"]["client"]["pressedMs"], 1234.5)
        self.assertEqual(accepted["timing"]["backend"]["acceptedMs"], 0.0)

        early = await client.wait_for("answer_timing")
        self.assertEqual(early["timingSeq"], 1)
        self.assertIsNone(early["timing"]["backend"]["completedMs"])
        self.assertEqual(early["timing"]["backend"]["clock"], "server_monotonic")

        self.release_generation()
        finished = await client.wait_for("answer_finished")
        answer = parse_answer_event(finished, self.v3_context(client))
        self.assertIsNotNone(answer.timing)
        self.assertIsNotNone(answer.timing.backend.completed_ms)
        self.assertGreaterEqual(answer.timing.backend.completed_ms, 0.0)
        self.assertEqual(answer.timing.backend.unavailable, ())
        self.assertIsNotNone(answer.timing.backend.rag)
        self.assertEqual(answer.timing.backend.rag.outcome, RetrievalOutcome.NO_DOCUMENTS)
        self.assertIsNotNone(answer.timing.backend.generation)
        self.assertIsNotNone(answer.timing.backend.generation.first_delta_ms)
        self.assertGreaterEqual(
            answer.timing.backend.generation.end_ms,
            answer.timing.backend.generation.first_delta_ms,
        )
        self.assertIsNotNone(answer.model_settings)
        self.assertEqual(answer.model_settings.model, DEFAULT_TEXT_MODEL)
        self.assertEqual(answer.status, AnswerStatus.COMPLETED)

    async def test_acceptance_rolls_back_registry_and_snapshot_when_command_commit_fails(self) -> None:
        self.add_speech("should we roll back if commit fails")
        owner = await self.connect("commit-failure-owner", protocol_version=3)
        await self._claim(owner)
        original = self.controller.commands.accept
        def fail_accept(*args, **kwargs):
            raise RuntimeError("injected command registry failure")
        self.controller.commands.accept = fail_accept
        try:
            ack = await self._run(owner, "commit-failure")
        finally:
            self.controller.commands.accept = original
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["code"], ErrorCode.DEPENDENCY.value)
        self.assertEqual(self.controller.requests.running(), [])
        self.assertEqual(self.controller.snapshots.sizes()[0], 0)
        self.assertEqual(self.generation_calls, [])

    async def test_acceptance_rolls_back_snapshot_when_request_store_create_fails(self) -> None:
        self.add_speech("should we reject if request storage fails")
        owner = await self.connect("request-store-failure-owner", protocol_version=3)
        await self._claim(owner)
        original = self.controller.requests.create

        def fail_create(_record):
            raise RuntimeError("injected request store failure")

        self.controller.requests.create = fail_create
        try:
            ack = await self._run(owner, "request-store-failure")
        finally:
            self.controller.requests.create = original
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["code"], ErrorCode.DEPENDENCY.value)
        self.assertEqual(self.controller.requests.running(), [])
        self.assertEqual(self.controller.snapshots.sizes()[0], 0)
        self.assertEqual(self.generation_calls, [])

    async def test_failed_command_ack_closes_accepted_record_without_generation(self) -> None:
        self.add_speech("does a dropped acknowledgement stay active")
        owner = await self.connect("ack-send-failure-owner", protocol_version=3)
        await self._claim(owner)
        original = self.controller._send_ack

        async def fail_run_ack(connection_id, outcome):
            if outcome.command_id == "ack-send-failure":
                return False
            return await original(connection_id, outcome)

        self.controller._send_ack = fail_run_ack
        try:
            await owner.command(
                "run_context_query", "ack-send-failure",
                anchorSegmentKey=self.anchor_key(self.controller.transcript.records()[0].text),
                windowSeconds=20, mode="Preset", presetId="answer_question",
                customInstruction=None, model=DEFAULT_TEXT_MODEL,
                includeScreenshot=False, screenshotDataUrl=None, humanNoteIds=[],
            )
            await owner.wait_for("answer_finished", predicate=lambda message: message.get("status") == "failed")
        finally:
            self.controller._send_ack = original
        record = next(record for record in self.controller.requests._records.values() if record.command_id == "ack-send-failure")
        self.assertTrue(record.terminal)
        self.assertEqual(record.status, AnswerStatus.FAILED.value)
        self.assertFalse(self.controller.requests.is_busy())
        self.assertEqual(len(self.generation_calls), 0)

    async def test_failed_answer_accepted_send_closes_record_without_generation(self) -> None:
        self.add_speech("does a dropped accepted event stay active")
        owner = await self.connect("accepted-send-failure-owner", protocol_version=3)
        await self._claim(owner)
        original = self.controller._send_v2

        async def fail_accepted_event(connection_id, msg_type, payload):
            if msg_type == "answer_accepted" and payload.get("commandId") == "accepted-send-failure":
                return False
            return await original(connection_id, msg_type, payload)

        self.controller._send_v2 = fail_accepted_event
        try:
            await self._run(owner, "accepted-send-failure")
            finished = await owner.wait_for("answer_finished", predicate=lambda message: message.get("status") == "failed")
        finally:
            self.controller._send_v2 = original
        record = self.controller.requests.get(finished["requestId"])
        self.assertIsNotNone(record)
        self.assertTrue(record.terminal)
        self.assertEqual(record.status, AnswerStatus.FAILED.value)
        self.assertFalse(self.controller.requests.is_busy())
        self.assertEqual(len(self.generation_calls), 0)

    async def test_answer_action_keeps_moves_and_removes_owned_answer(self) -> None:
        self.add_speech("should we keep the release note")
        owner = await self.connect("answer-action-owner", protocol_version=3)
        await self._claim(owner)
        await self._run(owner, "run-action")
        accepted = await owner.wait_for("answer_accepted")
        record = self.controller.requests.get(accepted["requestId"])
        self.assertIsNotNone(self.controller.snapshots.get(record.snapshot_id))

        await owner.command("answer_action", "keep-answer", answerId=record.answer_id, action="keep")
        kept = await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "keep-answer")
        self.assertTrue(kept["accepted"])
        self.assertEqual(record.metadata["placement"], "kept")
        self.assertIsNotNone(self.controller.snapshots.get(record.snapshot_id))

        await owner.command("answer_action", "remove-answer", answerId=record.answer_id, action="remove")
        removed = await owner.wait_for("command_ack", predicate=lambda m: m.get("commandId") == "remove-answer")
        self.assertTrue(removed["accepted"])
        self.assertTrue(record.metadata["removed"])
        self.assertTrue(record.metadata["snapshotReleased"])
        self.assertIsNone(self.controller.snapshots.get(record.snapshot_id))

    async def test_human_context_notes_are_owner_managed_and_frozen_per_answer(self) -> None:
        self.add_speech("what should happen before rollback")
        owner = await self.connect("human-note-owner", protocol_version=3)
        await self._claim(owner)
        await owner.command(
            "context_note_action", "note-create", action="create", noteId="note-release-order",
            text="Notify the release owner first.", includeInFutureContext=True,
        )
        created = await owner.wait_for("command_ack", predicate=lambda message: message.get("commandId") == "note-create")
        self.assertTrue(created["accepted"])

        await self._run(owner, "run-with-note", humanNoteIds=["note-release-order"])
        accepted = await owner.wait_for("answer_accepted")
        await self.generation_started.wait()
        frozen_context = self.generation_calls[0]["context_text"]
        self.assertIn("Notify the release owner first.", frozen_context)
        self.assertIn("not independently verified sources", frozen_context)

        await owner.command(
            "context_note_action", "note-edit", action="edit", noteId="note-release-order",
            text="Notify the incident commander first.", includeInFutureContext=True,
        )
        edited = await owner.wait_for("command_ack", predicate=lambda message: message.get("commandId") == "note-edit")
        self.assertTrue(edited["accepted"])
        self.assertIn("Notify the release owner first.", self.controller.requests.get(accepted["requestId"]).metadata["humanNotes"][0]["text"])
        self.assertNotIn("Notify the incident commander first.", frozen_context)
        self.release_generation()
        await owner.wait_for("answer_finished", predicate=lambda message: message.get("requestId") == accepted["requestId"])

    async def test_unknown_included_human_note_rejects_before_snapshot_creation(self) -> None:
        self.add_speech("what should happen before rollback")
        owner = await self.connect("missing-note-owner", protocol_version=3)
        await self._claim(owner)
        ack = await self._run(owner, "run-missing-note", humanNoteIds=["missing-note"])
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["code"], ErrorCode.STALE_REVISION.value)
        self.assertEqual(self.controller.snapshots.sizes()[0], 0)
        self.assertEqual(self.generation_calls, [])

    async def test_invented_retrieval_citation_fails_with_scoped_partial_answer(self) -> None:
        self.add_speech("what does the release note say")
        owner = await self.connect("citation-owner", protocol_version=3)
        await self._claim(owner)
        chunk = SimpleNamespace(doc_id="doc-real", file_path="/local/release.md", chunk_index=2,
                                title="release.md", text="Rollback is safe.")

        class EvidenceStore(StubRagStore):
            def list_documents(self): return [chunk]
            async def search(self, query, top_k=6, embed_texts=None):
                return [chunk]

        self.controller._rag_store = EvidenceStore()

        calls = []
        async def runner(**kwargs):
            calls.append(kwargs)
            await kwargs["on_stream_delta"]("The note says [invented:99].")
            return SimpleNamespace(text="The note says [invented:99].", latency_ms=4)

        self.controller._generation_runner = runner
        with mock.patch.object(main_module.logger, "exception"):
            await self._run(owner, "run-false-citation")
            accepted = await owner.wait_for("answer_accepted")
            await owner.wait_for("request_error", predicate=lambda message: message.get("requestId") == accepted["requestId"])
            finished = await owner.wait_for("answer_finished", predicate=lambda message: message.get("requestId") == accepted["requestId"])
        self.assertEqual(finished["status"], AnswerStatus.FAILED.value)
        self.assertEqual(finished["text"], "The note says [invented:99].")
        self.assertEqual(finished["retrieval"]["outcome"], "used")
        self.assertEqual(len(calls), 1)

    async def test_v3_answer_includes_real_retrieval_identity_and_timing_producers(self) -> None:
        self.add_speech("should we roll back the release")
        owner = await self.connect("evidence-owner", protocol_version=3)
        await self._claim(owner)
        chunk = SimpleNamespace(
            doc_id="doc-42", file_path="/local/release-notes.md", chunk_index=2,
            title="release-notes.md", text="Rollback is safe after monitoring.",
        )

        class EvidenceStore(StubRagStore):
            def list_documents(self): return [chunk]
            async def search(self, query, top_k=6, embed_texts=None):
                self.searches.append(query)
                return [chunk]

        self.controller._rag_store = EvidenceStore()

        async def runner(**kwargs):
            self.generation_calls.append(kwargs)
            await kwargs["on_stream_delta"]("Roll back if errors rise.")
            return SimpleNamespace(text="Roll back if errors rise.", latency_ms=8)

        self.controller._generation_runner = runner
        await self._run(owner, "run-evidence")
        finished = await owner.wait_for("answer_finished")
        parsed = parse_answer_event(finished, self.v3_context(owner))
        self.assertEqual(finished["retrieval"]["outcome"], "used")
        self.assertEqual(finished["retrieval"]["chunks"][0]["filePath"], "/local/release-notes.md")
        self.assertEqual(finished["retrieval"]["chunks"][0]["chunkId"], "doc-42:2")
        self.assertEqual(parsed.retrieval.chunks[0].excerpt, "Rollback is safe after monitoring.")
        self.assertEqual(parsed.timing.backend.unavailable, ())
        self.assertTrue(owner.of_type("answer_timing"))
        self.assertEqual(self.generation_calls[0]["model"], DEFAULT_TEXT_MODEL)

    async def test_v3_preflight_rejects_an_unverified_attachment_without_generation(self) -> None:
        self.add_speech("look at this and tell me the risk")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)

        ack = await self._run(
            client,
            "run-caps",
            model="openai/gpt-5.6-sol",
            includeScreenshot=True,
            screenshotDataUrl="data:image/png;base64,iVBORw0KGgo=",
        )
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["code"], ErrorCode.UNSUPPORTED_CAPABILITY.value)
        self.assertEqual(client.of_type("snapshot_created"), [])
        self.assertEqual(client.of_type("answer_accepted"), [])
        self.assertEqual(self.generation_calls, [])

    async def test_v3_invalid_timing_input_rejects_before_snapshot_acceptance(self) -> None:
        self.add_speech("what should we do next")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        for command_id, press_value, effort in [
            ("bad-press", -1, None),
            ("bad-nan", float("nan"), None),
            ("bad-effort-type", None, 4),
        ]:
            with self.subTest(command=command_id):
                ack = await self._run(client, command_id, clientPressedAtMs=press_value,
                                      reasoningEffort=effort)
                self.assertFalse(ack["accepted"])
                self.assertEqual(ack["code"], ErrorCode.INVALID_PAYLOAD.value)
        self.assertEqual(client.of_type("snapshot_created"), [])
        self.assertEqual(client.of_type("answer_accepted"), [])
        self.assertEqual(self.generation_calls, [])
        self.assertEqual(self.controller.requests.running(), [])

    async def test_v3_preflight_failure_retains_explicit_target_snapshot(self) -> None:
        self.add_speech("should we launch the feature")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        source = self.controller.transcript.records()[0]
        snapshot = self.controller.snapshots.create_recent_window(
            self.controller.transcript, self.anchor_key(source.text), 20, pin=True
        )
        ack = await self._run(
            client, "target-preflight-failure", targetId=snapshot.snapshot_id,
            model="openai/gpt-5.6-sol", includeScreenshot=True,
            screenshotDataUrl="data:image/png;base64,synthetic",
        )
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["code"], ErrorCode.UNSUPPORTED_CAPABILITY.value)
        self.assertIsNotNone(self.controller.snapshots.get(snapshot.snapshot_id))
        self.assertEqual(self.generation_calls, [])
        self.assertEqual(self.controller.requests.running(), [])

    async def test_v3_explicit_target_snapshot_survives_gc_during_acceptance_handoff(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        source = self.controller.transcript.records()[0]
        snapshot = self.controller.snapshots.create_recent_window(self.controller.transcript, source.segment_key, 20)
        self.assertFalse(self.controller.snapshots._entries[snapshot.snapshot_id].pinned)
        original_supersede = self.controller._supersede_running_answers

        async def collect_during_handoff():
            self.controller.snapshots.gc()
            self.assertIsNotNone(self.controller.snapshots.get(snapshot.snapshot_id))
            await original_supersede()

        with mock.patch.object(self.controller, "_supersede_running_answers", side_effect=collect_during_handoff):
            accepted = await self._run(client, "gc-explicit-target", targetId=snapshot.snapshot_id)
            await self.generation_started.wait()

        self.assertTrue(accepted["accepted"])
        record = self.controller.requests.get(accepted["requestId"])
        self.assertEqual(record.snapshot_id, snapshot.snapshot_id)
        self.assertIsNotNone(self.controller.snapshots.get(snapshot.snapshot_id))
        self.release_generation()
        await client.wait_for("answer_finished", predicate=lambda item: item.get("requestId") == accepted["requestId"])
        self.assertIsNotNone(self.controller.snapshots.get(snapshot.snapshot_id), "accepted answer retains its source snapshot for rerun")

    async def test_v3_owner_disconnect_during_acceptance_releases_snapshot_and_rejects(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        original_supersede = self.controller._supersede_running_answers
        observed_snapshots: list[str] = []

        async def disconnect_during_handoff():
            observed_snapshots.extend(self.controller.snapshots._entries)
            await self.controller._on_client_disconnect(self.controller.hub.connection(client.connection_id))
            await original_supersede()

        with mock.patch.object(self.controller, "_supersede_running_answers", side_effect=disconnect_during_handoff):
            rejected = await self._run(client, "disconnect-race")

        self.assertFalse(rejected["accepted"])
        self.assertEqual(rejected["code"], ErrorCode.STALE_EPOCH.value)
        self.assertEqual(len(observed_snapshots), 1)
        self.assertIsNone(self.controller.snapshots.get(observed_snapshots[0]))
        self.assertEqual(self.controller.requests.running(), [])
        self.assertEqual(self.generation_calls, [])

    async def test_v3_supersession_failure_releases_source_and_rejects(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        with mock.patch.object(self.controller, "_supersede_running_answers", side_effect=RuntimeError("simulated teardown failure")):
            rejected = await self._run(client, "supersession-fails")

        self.assertFalse(rejected["accepted"])
        self.assertEqual(rejected["code"], ErrorCode.DEPENDENCY.value)
        self.assertIn("Could not safely prepare answer slot", rejected["message"])
        self.assertEqual(self.controller.requests.running(), [])
        self.assertEqual(self.generation_calls, [])
        self.assertEqual(client.of_type("answer_accepted"), [])
        self.assertEqual(len(self.controller.snapshots._entries), 0)

    async def test_v3_epoch_change_during_acceptance_releases_snapshot_and_rejects(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        original_supersede = self.controller._supersede_running_answers
        observed_snapshots: list[str] = []

        async def invalidate_during_handoff():
            observed_snapshots.extend(self.controller.snapshots._entries)
            await self.controller._invalidate_session("test_acceptance_race")
            await original_supersede()

        with mock.patch.object(self.controller, "_supersede_running_answers", side_effect=invalidate_during_handoff):
            rejected = await self._run(client, "epoch-race")

        self.assertFalse(rejected["accepted"])
        self.assertEqual(rejected["code"], ErrorCode.STALE_EPOCH.value)
        self.assertEqual(len(observed_snapshots), 1)
        self.assertIsNone(self.controller.snapshots.get(observed_snapshots[0]))
        self.assertEqual(self.controller.requests.running(), [])
        self.assertEqual(client.of_type("answer_accepted"), [])
        self.assertEqual(self.generation_calls, [])

    async def test_v3_context_snapshot_survives_gc_during_acceptance_handoff(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        original_supersede = self.controller._supersede_running_answers
        snapshots_seen_during_handoff: list[str] = []

        async def collect_during_handoff():
            # The unpinned context snapshot must already have a live request ref
            # before this await point allows garbage collection to run.
            snapshots_seen_during_handoff.extend(self.controller.snapshots._entries)
            self.controller.snapshots.gc()
            self.assertTrue(snapshots_seen_during_handoff)
            self.assertTrue(all(self.controller.snapshots.get(sid) for sid in snapshots_seen_during_handoff))
            await original_supersede()

        with mock.patch.object(self.controller, "_supersede_running_answers", side_effect=collect_during_handoff):
            accepted = await self._run(client, "gc-handoff")
            await self.generation_started.wait()

        self.assertTrue(accepted["accepted"])
        self.assertEqual(len(snapshots_seen_during_handoff), 1)
        record = self.controller.requests.get(accepted["requestId"])
        self.assertIsNotNone(record)
        self.assertIsNotNone(self.controller.snapshots.get(record.snapshot_id))
        self.release_generation()
        await client.wait_for("answer_finished", predicate=lambda item: item.get("requestId") == accepted["requestId"])
        self.assertIsNotNone(self.controller.snapshots.get(record.snapshot_id), "accepted answer retains its source snapshot for rerun")

    async def test_v3_malformed_instruction_source_and_model_reject_before_acceptance(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)

        cases = [
            ("bad-mode-type", {"mode": 4}),
            ("bad-custom-type", {"mode": "Custom", "customInstruction": ["answer"]}),
            ("empty-custom", {"mode": "Custom", "customInstruction": "  \t "}),
            ("unknown-preset", {"presetId": "not-a-real-preset"}),
            ("bad-preset-type", {"presetId": 7}),
            ("bad-model-type", {"model": {"name": DEFAULT_TEXT_MODEL}}),
            ("bad-anchor-type", {"anchorSegmentKey": 12}),
            ("bad-window-type", {"windowSeconds": True}),
            ("bad-partial-type", {"includePartial": "false"}),
            ("bad-notes-type", {"humanNoteIds": ["ok", 8]}),
            ("bad-screenshot-flag", {"includeScreenshot": "false"}),
        ]
        for command_id, overrides in cases:
            with self.subTest(command=command_id):
                ack = await self._run(client, command_id, **overrides)
                self.assertFalse(ack["accepted"])
                self.assertEqual(ack["code"], ErrorCode.INVALID_PAYLOAD.value)

        self.assertEqual(client.of_type("snapshot_created"), [])
        self.assertEqual(client.of_type("answer_accepted"), [])
        self.assertEqual(self.generation_calls, [])
        self.assertEqual(self.controller.requests.running(), [])

    async def test_v3_snapshot_target_mismatch_rejects_and_retains_both_sources(self) -> None:
        self.add_speech("first source question", "second source question")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        keys = [record.segment_key for record in self.controller.transcript.records()]
        first = self.controller.snapshots.create_recent_window(self.controller.transcript, keys[0], 20, pin=True)
        second = self.controller.snapshots.create_recent_window(self.controller.transcript, keys[1], 20, pin=True)

        await client.command(
            "run_snapshot_query", "mismatched-target", snapshotId=first.snapshot_id,
            targetId=second.snapshot_id, mode="Preset", presetId="answer_question",
            customInstruction=None, model=DEFAULT_TEXT_MODEL, includeScreenshot=False,
            screenshotDataUrl=None, humanNoteIds=[],
        )
        ack = await client.wait_for("command_ack", predicate=lambda item: item.get("commandId") == "mismatched-target")
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["code"], ErrorCode.INVALID_SPAN.value)
        self.assertIsNotNone(self.controller.snapshots.get(first.snapshot_id))
        self.assertIsNotNone(self.controller.snapshots.get(second.snapshot_id))
        self.assertEqual(client.of_type("answer_accepted"), [])
        self.assertEqual(self.generation_calls, [])

    async def test_v3_request_capacity_rejects_before_snapshot_or_generation(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        self.controller.requests._max_entries = len(self.controller.requests)

        rejected = await self._run(client, "request-history-full")
        self.assertFalse(rejected["accepted"])
        self.assertEqual(rejected["code"], ErrorCode.CAPACITY.value)
        self.assertEqual(client.of_type("snapshot_created"), [])
        self.assertEqual(client.of_type("answer_accepted"), [])
        self.assertEqual(self.generation_calls, [])
        self.assertEqual(self.controller.requests.running(), [])

    async def test_v3_request_capacity_rejects_without_consuming_snapshot_or_superseding(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        accepted = await self._run(client, "capacity-live")
        await self.generation_started.wait()
        live = self.controller.requests.get(accepted["requestId"])
        snapshot = self.controller.snapshots.get(live.snapshot_id)
        self.controller.requests._max_entries = len(self.controller.requests)

        rejected = await self._run(client, "capacity-reject")
        self.assertFalse(rejected["accepted"])
        self.assertEqual(rejected["code"], ErrorCode.CAPACITY.value)
        self.assertFalse(live.terminal)
        self.assertEqual(self.controller.requests.running(), [live])
        self.assertIsNotNone(snapshot)
        self.assertEqual(len(self.generation_calls), 1)
        self.assertEqual(len(client.of_type("snapshot_created")), 1)
        self.release_generation()
        await client.wait_for("answer_finished", predicate=lambda item: item.get("requestId") == accepted["requestId"])

    async def test_v3_empty_or_invalid_target_does_not_fall_back_to_context(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        for command_id, target_id, expected_code in (
            ("empty-target", "   ", ErrorCode.INVALID_PAYLOAD.value),
            ("missing-target", "snapshot-that-is-gone", ErrorCode.STALE_REVISION.value),
        ):
            with self.subTest(target=target_id):
                ack = await self._run(client, command_id, targetId=target_id)
                self.assertFalse(ack["accepted"])
                self.assertEqual(ack["code"], expected_code)
        self.assertEqual(client.of_type("snapshot_created"), [])
        self.assertEqual(client.of_type("answer_accepted"), [])
        self.assertEqual(self.generation_calls, [])
        self.assertEqual(self.controller.requests.running(), [])

    async def test_v3_two_concurrent_same_command_ids_create_one_answer(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        key = self.anchor_key("should we ship on friday")
        command = {
            "type": "run_context_query",
            "protocolVersion": 3,
            "backendInstanceId": client.backend_instance_id,
            "sessionEpoch": client.session_epoch,
            "commandId": "concurrent-duplicate",
            "anchorSegmentKey": key,
            "windowSeconds": 20,
            "mode": "Preset",
            "presetId": "answer_question",
            "customInstruction": None,
            "model": DEFAULT_TEXT_MODEL,
            "includeScreenshot": False,
            "screenshotDataUrl": None,
            "humanNoteIds": [],
        }
        await asyncio.gather(client.send(command), client.send(command))
        await self.generation_started.wait()
        acks = []
        while len(acks) < 2:
            acks = [item for item in client.of_type("command_ack") if item.get("commandId") == "concurrent-duplicate"]
            if len(acks) < 2:
                await asyncio.sleep(0.01)
        self.assertTrue(all(item["accepted"] for item in acks))
        self.assertEqual(len({item["requestId"] for item in acks}), 1)
        self.assertEqual(len(self.generation_calls), 1)
        self.assertEqual(len(client.of_type("answer_accepted")), 1)
        self.release_generation()
        await client.wait_for("answer_finished")

    async def test_v3_concurrent_distinct_requests_keep_one_active_answer(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        key = self.anchor_key("should we ship on friday")

        async def send_run(command_id: str):
            await client.command(
                "run_context_query", command_id, anchorSegmentKey=key, windowSeconds=20,
                mode="Preset", presetId="answer_question", customInstruction=None,
                model=DEFAULT_TEXT_MODEL, includeScreenshot=False, screenshotDataUrl=None, humanNoteIds=[],
            )
            return await client.wait_for("command_ack", predicate=lambda item: item.get("commandId") == command_id)

        first, second = await asyncio.gather(send_run("concurrent-first"), send_run("concurrent-second"))
        self.assertTrue(first["accepted"])
        self.assertTrue(second["accepted"])
        first_record = self.controller.requests.get(first["requestId"])
        second_record = self.controller.requests.get(second["requestId"])
        self.assertTrue(first_record.terminal, f"first={first_record!r}; second={second_record!r}; running={self.controller.requests.running()!r}")
        self.assertIn(first_record.status, (AnswerStatus.SUPERSEDED.value, AnswerStatus.CANCELLED.value))
        self.assertFalse(second_record.terminal)
        self.assertEqual(self.controller.requests.running(), [second_record])
        self.assertEqual(len(self.generation_calls), 1, "superseded task must not reach the generator")
        self.release_generation()
        await client.wait_for("answer_finished", predicate=lambda item: item.get("requestId") == second["requestId"])

    async def test_v3_invalid_preflight_does_not_supersede_running_answer(self) -> None:
        self.add_speech("should we ship on friday")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        accepted = await self._run(client, "first-valid")
        await self.generation_started.wait()
        first_record = self.controller.requests.get(accepted["requestId"])

        rejected = await self._run(
            client, "second-invalid", mode="Custom", customInstruction=["not", "text"]
        )
        self.assertFalse(rejected["accepted"])
        self.assertEqual(rejected["code"], ErrorCode.INVALID_PAYLOAD.value)
        self.assertFalse(first_record.terminal)
        self.assertEqual(len(self.generation_calls), 1)
        self.assertEqual(len(self.controller.requests.running()), 1)
        self.assertEqual(len(client.of_type("snapshot_created")), 1)

        await client.command(
            "run_context_query", "bad-target", targetId=123, anchorSegmentKey=self.anchor_key("should we ship on friday"),
            windowSeconds=20, mode="Preset", presetId="answer_question", customInstruction=None,
            model=DEFAULT_TEXT_MODEL, includeScreenshot=False, screenshotDataUrl=None, humanNoteIds=[],
        )
        bad_target = await client.wait_for("command_ack", predicate=lambda item: item.get("commandId") == "bad-target")
        self.assertFalse(bad_target["accepted"])
        self.assertEqual(bad_target["code"], ErrorCode.INVALID_PAYLOAD.value)
        self.assertFalse(first_record.terminal)
        self.assertEqual(len(self.generation_calls), 1)
        self.release_generation()
        await client.wait_for("answer_finished", predicate=lambda item: item.get("requestId") == accepted["requestId"])

    async def test_v3_unavailable_model_after_a_catalog_read(self) -> None:
        self.add_speech("what should we do about the rollback")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)
        self.controller._known_language_models = ("openai/gpt-5.6-sol",)

        ack = await self._run(client, "run-missing", model=DEFAULT_TEXT_MODEL)
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["code"], ErrorCode.UNAVAILABLE_MODEL.value)
        self.assertEqual(self.generation_calls, [])
        self.assertEqual(client.of_type("snapshot_created"), [])

    async def test_v3_cancellation_keeps_partial_text_and_final_timing(self) -> None:
        self.add_speech("what should we do about the rollback")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)

        partial_sent = asyncio.Event()
        hold = asyncio.Event()

        async def runner(**kwargs):
            on_delta = kwargs.get("on_stream_delta")
            if on_delta is not None:
                await on_delta("Partial advice")
            partial_sent.set()
            await hold.wait()
            return SimpleNamespace(text="Partial advice", latency_ms=5)

        self.controller._generation_runner = runner
        await self._run(client, "run-cancel")
        accepted = await client.wait_for("answer_accepted")
        await asyncio.wait_for(partial_sent.wait(), timeout=3.0)
        await client.wait_for(
            "answer_chunk", predicate=lambda m: m.get("requestId") == accepted["requestId"]
        )

        await client.command(
            "cancel_answer",
            "cancel-1",
            requestId=accepted["requestId"],
            answerId=accepted["answerId"],
        )
        finished = await client.wait_for("answer_finished")
        self.assertEqual(finished["status"], AnswerStatus.CANCELLED.value)
        self.assertEqual(finished["text"], "Partial advice")
        self.assertIsNotNone(finished["timing"]["backend"]["completedMs"])
        self.assertEqual(finished["timing"]["backend"]["clock"], "server_monotonic")
        # A late timing update cannot revive the terminal record.
        await asyncio.sleep(0.05)
        terminal_timing_count = len(client.of_type("answer_timing"))
        await asyncio.sleep(0.05)
        self.assertEqual(len(client.of_type("answer_timing")), terminal_timing_count)

    async def test_v3_answer_events_are_scoped_to_the_owner(self) -> None:
        self.add_speech("what should we do about the rollback")
        owner = await self.connect("owner", protocol_version=3)
        observer = await self.connect("observer", protocol_version=3)
        owner.session_epoch = observer.session_epoch = self.controller.lease.session_epoch
        await self._claim(owner)

        await self._run(owner, "run-scoped")
        self.release_generation()
        await owner.wait_for("answer_finished")
        await asyncio.sleep(0.05)

        self.assertEqual(observer.of_type("answer_accepted"), [])
        self.assertEqual(observer.of_type("answer_chunk"), [])
        self.assertEqual(observer.of_type("answer_timing"), [])
        self.assertEqual(observer.of_type("answer_finished"), [])

    async def test_v3_generation_time_access_failure_is_scoped_and_terminal(self) -> None:
        self.add_speech("what should we do about the rollback")
        owner = await self.connect("owner", protocol_version=3)
        await self._claim(owner)
        self.controller._generation_runner = None
        with mock.patch.object(self.controller, "_ensure_ai_gateway_client", return_value=None), \
             mock.patch.object(main_module.logger, "exception"):
            accepted = await self._run(owner, "missing-gateway-access")
            self.assertTrue(accepted["accepted"])
            request_id = accepted["requestId"]
            failure = await owner.wait_for("request_error", predicate=lambda event: event.get("requestId") == request_id)
            finished = await owner.wait_for("answer_finished", predicate=lambda event: event.get("requestId") == request_id)

        self.assertEqual(failure["code"], ErrorCode.DEPENDENCY.value)
        self.assertEqual(finished["status"], AnswerStatus.FAILED.value)
        self.assertEqual(finished["text"], "")
        self.assertEqual(finished["timing"]["backend"]["unavailable"], ["generation"])
        self.assertEqual(self.generation_calls, [])
        self.assertEqual(self.controller.requests.running(), [])

    async def test_v3_failed_and_empty_streams_stay_truthful(self) -> None:
        self.add_speech("what should we do about the rollback")
        owner = await self.connect("owner", protocol_version=3)
        await self._claim(owner)

        cases = [
            (
                AnswerStatus.FAILED,
                [
                    {"type": "response.output_text.delta", "delta": "Partial advice"},
                    {"type": "response.failed", "response": {"status": "failed"}},
                ],
                "Partial advice",
            ),
            (
                AnswerStatus.EMPTY,
                [{"type": "response.completed", "response": {"output_text": ""}}],
                "",
            ),
        ]
        for expected_status, events, expected_text in cases:
            with self.subTest(status=expected_status):
                body = "".join(f"data: {json.dumps(event)}\n\n" for event in events)
                calls = []

                def handler(request):
                    calls.append(request)
                    return httpx.Response(200, content=body, headers={"content-type": "text/event-stream"})

                gateway = AIGatewayClient("synthetic-key", DEFAULT_TEXT_MODEL, transport=httpx.MockTransport(handler))
                self.addAsyncCleanup(gateway.close)
                self.controller._generation_runner = gateway.run_query
                with mock.patch.object(main_module.logger, "exception"):
                    await self._run(owner, f"run-{expected_status.value}")
                    finished = await owner.wait_for(
                        "answer_finished", predicate=lambda m: m.get("status") == expected_status.value
                    )
                self.assertEqual(finished["text"], expected_text)
                self.assertIsNotNone(finished["timing"]["backend"]["completedMs"])
                self.assertEqual(finished["modelSettings"]["model"], DEFAULT_TEXT_MODEL)
                self.assertEqual(len(calls), 1, "no duplicate or retried paid call")
                owner.messages.clear()

    async def test_v3_duplicate_command_id_executes_once(self) -> None:
        self.add_speech("what should we do about the rollback")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)

        await self._run(client, "run-dup")
        await self._run(client, "run-dup")
        self.release_generation()
        await client.wait_for("answer_finished")

        self.assertEqual(len(self.generation_calls), 1)
        acks = [m for m in client.of_type("command_ack") if m.get("commandId") == "run-dup"]
        self.assertEqual(len(acks), 2)
        self.assertEqual(acks[0]["requestId"], acks[1]["requestId"])
        self.assertEqual(acks[0]["protocolVersion"], 3)

    async def test_an_unsupported_protocol_version_is_reported(self) -> None:
        client = await self.connect("owner", protocol_version=3)
        await client.send(
            {
                "type": "claim_control",
                "protocolVersion": 999,
                "backendInstanceId": self.controller.backend_instance_id,
                "sessionEpoch": self.controller.lease.session_epoch,
                "commandId": "c-future",
            }
        )
        error = await client.wait_for("request_error", predicate=lambda m: m.get("requestId") == "c-future")
        self.assertEqual(error["code"], ErrorCode.INCOMPATIBLE_VERSION.value)
        self.assertIn("Supported protocol versions", error["message"])

    async def test_no_live_gateway_client_is_constructed(self) -> None:
        self.add_speech("what should we do about the rollback")
        client = await self.connect("owner", protocol_version=3)
        await self._claim(client)

        with mock.patch.object(
            httpx,
            "AsyncClient",
            side_effect=AssertionError("transport tests must not construct a live HTTP client"),
        ):
            await self._run(client, "run-offline")
            self.release_generation()
            finished = await client.wait_for("answer_finished")
        self.assertEqual(finished["status"], AnswerStatus.COMPLETED.value)
        self.assertEqual(len(self.generation_calls), 1)


    async def test_v4_pin_and_release_make_no_generation_call(self):
        self.add_speech("freeze this moment without answering")
        owner = await self.connect("pin-owner", protocol_version=4)
        await self._claim(owner)
        self.assertIn("answer_rerun", owner.of_type("hello_ack")[0]["capabilities"])
        await owner.command("create_snapshot", "pin", kind="pinned_moment", anchorSegmentKey=self.anchor_key("freeze this moment without answering"), windowSeconds=20)
        created = await owner.wait_for("snapshot_created")
        snapshot_id = created["snapshot"]["snapshotId"]
        self.assertEqual(self.generation_calls, [])
        await owner.command("snapshot_action", "unpin", snapshotId=snapshot_id, action="release")
        ack = await owner.wait_for("command_ack", predicate=lambda event: event.get("commandId") == "unpin")
        self.assertTrue(ack["accepted"])
        self.assertIsNone(self.controller.snapshots.get(snapshot_id))

    async def test_v4_rerun_reuses_original_notes_image_reasoning_and_deleted_evidence(self):
        self.add_speech("what should the release owner do")
        owner = await self.connect("rerun-owner", protocol_version=4)
        await self._claim(owner)
        self.controller.context_notes["note"] = {"noteId":"note", "text":"Original note", "includeInFutureContext":True}
        chunk = SimpleNamespace(doc_id="release", file_path="/tmp/synthetic.md", title="synthetic.md", chunk_index=1, text="Captured document evidence")
        self.rag_store.list_documents = lambda: [chunk]
        self.rag_store.search = mock.AsyncMock(return_value=[chunk])
        self.release_generation()
        await self._run(owner, "original", humanNoteIds=["note"], reasoningEffort="high", includeScreenshot=True, screenshotDataUrl="data:image/png;base64,YWJj")
        first = await owner.wait_for("answer_finished")
        first_call = self.generation_calls[0]
        self.controller.context_notes.clear()
        self.controller.transcript.clear()
        self.rag_store.search = mock.AsyncMock(side_effect=AssertionError("Rerun must never search again"))
        await owner.command("rerun_answer", "rerun", sourceAnswerId=first["answerId"], clientPressedAtMs=5)
        second = await owner.wait_for("answer_finished", predicate=lambda event: event["answerId"] != first["answerId"])
        self.assertEqual(second["status"], "completed")
        self.assertNotEqual(second["requestId"], first["requestId"])
        self.assertEqual(second["retrieval"], first["retrieval"])
        for key in ("instruction", "selected_text", "context_text", "model", "screenshot_data_url", "reasoning_effort"):
            self.assertEqual(self.generation_calls[1][key], first_call[key], key)
        self.assertEqual(first_call["reasoning_effort"], "high")
        self.assertIn("Original note", first_call["context_text"])
        self.assertEqual(second["metadata"]["usage"]["inputTokens"], 3)
        self.assertEqual(second["metadata"]["rerunOf"], first["answerId"])
        self.rag_store.search.assert_not_called()

    async def test_v4_manual_target_keeps_original_source_and_rejects_mismatched_source(self):
        self.add_speech("raw words with an incomplete question")
        owner = await self.connect("target-owner", protocol_version=4)
        await self._claim(owner)
        await owner.command("create_snapshot", "target-source", kind="recent_window", anchorSegmentKey=self.anchor_key("raw words with an incomplete question"), windowSeconds=20)
        snapshot = (await owner.wait_for("snapshot_created"))["snapshot"]
        fields = dict(snapshotId=snapshot["snapshotId"], targetId=None, mode="Preset", presetId="answer_question", model=DEFAULT_TEXT_MODEL, includeScreenshot=False, screenshotDataUrl=None, humanNoteIds=[])
        target = dict(targetId="human-target", sourceSnapshotId="wrong", wording="Should we roll back first?")
        await owner.command("run_snapshot_query", "bad-target", **fields, manualTarget=target)
        rejected = await owner.wait_for("command_ack", predicate=lambda event:event.get("commandId")=="bad-target")
        self.assertFalse(rejected["accepted"])
        self.assertIsNotNone(self.controller.snapshots.get(snapshot["snapshotId"]))
        target["sourceSnapshotId"] = snapshot["snapshotId"]
        self.release_generation()
        await owner.command("run_snapshot_query", "good-target", **fields, manualTarget=target)
        accepted = await owner.wait_for("answer_accepted")
        finished = await owner.wait_for("answer_finished")
        self.assertEqual(accepted["frozenInputs"]["manualTarget"]["wording"], target["wording"])
        self.assertEqual(self.generation_calls[0]["selected_text"], snapshot["text"])
        self.assertIn(target["wording"], self.generation_calls[0]["context_text"])
        self.assertNotIn(snapshot["snapshotId"], self.controller._draft_snapshots.get(owner.connection_id,set()))
        self.assertEqual(finished["status"], "completed")

    async def test_v4_status_reconciliation_includes_terminal_result_without_reexecution(self):
        self.add_speech("reconcile this manual answer")
        owner = await self.connect("status-owner", protocol_version=4)
        await self._claim(owner)
        self.release_generation()
        await self._run(owner, "run-reconcile")
        finished = await owner.wait_for("answer_finished")
        await owner.command("get_command_status", "check", queryCommandId="run-reconcile")
        state = await owner.wait_for("command_status")
        self.assertEqual(state["status"], "accepted")
        self.assertIn("answer_accepted", [event["type"] for event in state["result"]])
        terminal = next(event for event in state["result"] if event["type"]=="answer_finished")
        self.assertEqual(terminal["text"], finished["text"])
        self.assertEqual(len(self.generation_calls),1)

    async def test_v4_protected_capacity_rejects_then_evicts_only_unprotected_card(self):
        self.add_speech("one new answer with bounded working cards")
        owner = await self.connect("capacity-owner", protocol_version=4)
        await self._claim(owner)
        for index in range(50):
            self.controller.requests.create(RequestRecord(request_id=f"old-{index}",answer_id=f"answer-{index}",connection_id=owner.connection_id,session_epoch=owner.session_epoch,terminal=True,created_at=index+1,status="completed",protocol_version=4))
        self.controller.interaction_state.inspected_answer_ids = [f"answer-{index}" for index in range(50)]
        rejected = await self._run(owner,"capacity-reject")
        self.assertFalse(rejected["accepted"])
        self.assertEqual(rejected["code"],"capacity")
        self.controller.interaction_state.inspected_answer_ids.remove("answer-1")
        self.release_generation()
        accepted = await self._run(owner,"capacity-accept")
        self.assertTrue(accepted["accepted"])
        state = await owner.wait_for("answer_state",predicate=lambda event:event.get("reason")=="capacity_eviction")
        self.assertEqual(state["answerId"],"answer-1")
        self.assertTrue(state["removed"])
        self.assertFalse(self.controller.requests.get("old-0").metadata.get("removed",False))

    async def test_v4_superseded_partial_cannot_be_replaced_by_a_late_runner_result(self):
        self.add_speech("replace the old manual answer")
        owner=await self.connect("supersede-owner",protocol_version=4)
        await self._claim(owner)
        calls=[]
        async def runner(**kwargs):
            calls.append(kwargs)
            if len(calls)==1:
                await kwargs["on_stream_delta"]("Original partial")
                try:
                    await asyncio.Event().wait()
                except asyncio.CancelledError:
                    await kwargs["on_stream_delta"](" forbidden late text")
                    return SimpleNamespace(text="Forbidden late completion")
            await kwargs["on_stream_delta"]("New answer")
            return SimpleNamespace(text="New answer")
        self.controller._generation_runner=runner
        await self._run(owner,"first")
        original=(await owner.wait_for("answer_accepted"))["answerId"]
        await owner.wait_for("answer_chunk")
        await self._run(owner,"second")
        old=await owner.wait_for("answer_finished",predicate=lambda event:event["answerId"]==original)
        new=await owner.wait_for("answer_finished",predicate=lambda event:event["answerId"]!=original)
        self.assertEqual(old["status"],"superseded")
        self.assertEqual(old["text"],"Original partial")
        self.assertEqual(new["text"],"New answer")
        self.assertFalse(any("forbidden" in event.get("delta","") for event in owner.of_type("answer_chunk")))

    async def test_v4_reconciliation_recovers_a_failed_acceptance_send(self):
        self.add_speech("recover an acceptance handoff failure")
        owner = await self.connect("handoff-owner", protocol_version=4)
        await self._claim(owner)
        original_ack = self.controller._send_ack
        async def fail_run_ack(connection_id, outcome):
            if outcome.command_id == "handoff": return False
            return await original_ack(connection_id, outcome)
        with mock.patch.object(self.controller,"_send_ack",side_effect=fail_run_ack):
            key=self.anchor_key("recover an acceptance handoff failure")
            await owner.command("run_context_query","handoff",anchorSegmentKey=key,windowSeconds=20,mode="Preset",presetId="answer_question",model=DEFAULT_TEXT_MODEL,includeScreenshot=False,humanNoteIds=[])
            failed = await owner.wait_for("answer_finished")
        self.assertEqual(failed["status"],"failed")
        await owner.command("get_command_status","recover",queryCommandId="handoff")
        state=await owner.wait_for("command_status")
        self.assertEqual([event["type"] for event in state["result"]][:2],["answer_accepted","answer_finished"])
        self.assertEqual(self.generation_calls,[])

    async def test_v4_rejects_requested_missing_image_before_generation(self):
        self.add_speech("look at the attached screen")
        owner = await self.connect("image-owner",protocol_version=4)
        await self._claim(owner)
        ack = await self._run(owner,"missing-image",includeScreenshot=True,screenshotDataUrl="not-an-image")
        self.assertFalse(ack["accepted"])
        self.assertEqual(ack["code"],"invalid_payload")
        self.assertEqual(self.generation_calls,[])


class SnapshotStabilityAcrossRestartTests(unittest.TestCase):
    def test_transcript_clear_does_not_rewrite_an_existing_snapshot(self) -> None:
        store = TranscriptStore(audio_epoch="epoch-a")
        store.add_segment(Segment(id=1, t0=0.0, t1=1.0, text="the original question"))
        from app.source_snapshots import SourceSnapshotStore, make_segment_key

        snapshots = SourceSnapshotStore()
        snapshot = snapshots.create_recent_window(store, make_segment_key("epoch-a", 1), 20)
        store.clear()
        self.assertEqual(snapshot.text, "the original question")


if __name__ == "__main__":
    unittest.main()
