"""Disconnect cleanup must survive every removal path and sender cancellation."""
import asyncio
import unittest
from unittest.mock import AsyncMock

from app.ws_server import WebSocketHub


class FailedSocket:
    remote_address = ("127.0.0.1", 1234)

    def __init__(self):
        self.closed = asyncio.Event()

    async def send(self, message):
        await asyncio.sleep(0)
        raise ConnectionError("synthetic failed send")

    async def close(self):
        self.closed.set()

    def __aiter__(self):
        return self

    async def __anext__(self):
        await self.closed.wait()
        raise StopAsyncIteration


class DisconnectTests(unittest.IsolatedAsyncioTestCase):
    async def setup_hub(self, hook):
        connected = asyncio.Event()

        async def on_connect(info):
            connected.set()

        hub = WebSocketHub("127.0.0.1", 0, AsyncMock(), on_connect, hook)
        socket = FailedSocket()
        handler = asyncio.create_task(hub._client_handler(socket))
        await connected.wait()
        return hub, socket, handler, hub.connections()[0]

    async def test_send_and_broadcast_failures_racing_handler_cleanup_notify_once(self):
        hook = AsyncMock()
        hub, socket, handler, info = await self.setup_hub(hook)
        await asyncio.wait_for(asyncio.gather(
            hub.send_to(info.connection_id, "test", {}),
            hub.broadcast("test", {}),
            handler,
        ), 1)
        self.assertEqual(hub.connections(), [])
        hook.assert_awaited_once_with(info)

    async def test_cleanup_can_cancel_the_sender_without_cancelling_itself(self):
        sender = None

        async def disconnect(info):
            sender.cancel()
            await asyncio.gather(sender, return_exceptions=True)

        hook = AsyncMock(side_effect=disconnect)
        hub, socket, handler, info = await self.setup_hub(hook)
        sender = asyncio.create_task(hub.send_to(info.connection_id, "test", {}))
        await asyncio.wait_for(asyncio.gather(sender, return_exceptions=True), 1)
        await asyncio.wait_for(handler, 1)
        hook.assert_awaited_once_with(info)
        self.assertTrue(sender.cancelled())

    async def test_connect_hook_failure_also_disconnects_once(self):
        hook = AsyncMock()
        hub = WebSocketHub("127.0.0.1", 0, AsyncMock(),
                           AsyncMock(side_effect=RuntimeError("connect failed")), hook)
        with self.assertRaisesRegex(RuntimeError, "connect failed"):
            await hub._client_handler(FailedSocket())
        self.assertEqual(hub.connections(), [])
        hook.assert_awaited_once()
