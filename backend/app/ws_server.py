from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from time import time
from typing import Any, Awaitable, Callable, Dict, List, Optional

import websockets
from websockets.server import ServerConnection

MessageHandler = Callable[[Dict[str, Any], "ConnectionInfo"], Awaitable[None]]
LifecycleHook = Callable[["ConnectionInfo"], Awaitable[None]]


@dataclass
class WSMessage:
    type: str
    payload: Dict[str, Any]


@dataclass
class ConnectionInfo:
    """Server-assigned identity for one socket. Clients never claim it."""

    connection_id: str
    websocket: ServerConnection
    peer: Optional[str] = None
    created_at: float = field(default_factory=time)
    #: Wire version negotiated by `hello`; v2 until the client negotiates (M3bis).
    protocol_version: int = 2
    disconnect_task: Optional[asyncio.Task] = field(default=None, repr=False)


class WebSocketHub:
    """Connection registry, shared broadcasts, and targeted replies.

    Shared transcript/audio/status events stay broadcast. Request chunks,
    completions, and errors are sent to one connection through `send_to`.
    """

    def __init__(
        self,
        host: str,
        port: int,
        handler: MessageHandler,
        on_connect: Optional[LifecycleHook] = None,
        on_disconnect: Optional[LifecycleHook] = None,
    ) -> None:
        self.host = host
        self.port = port
        self._handler = handler
        self._on_connect = on_connect
        self._on_disconnect = on_disconnect
        self._connections: Dict[str, ConnectionInfo] = {}
        self._server = None

    async def start(self) -> None:
        self._server = await websockets.serve(self._client_handler, self.host, self.port)

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        self._server = None

    def connections(self) -> List[ConnectionInfo]:
        return list(self._connections.values())

    def connection(self, connection_id: str) -> Optional[ConnectionInfo]:
        return self._connections.get(connection_id or "")

    async def _disconnect(self, info: ConnectionInfo) -> None:
        """Run cleanup once, independently of a failing sender's cancellation."""
        if info.disconnect_task is None:
            self._connections.pop(info.connection_id, None)
            info.disconnect_task = asyncio.create_task(self._notify_disconnect(info))
        await asyncio.shield(info.disconnect_task)

    async def _notify_disconnect(self, info: ConnectionInfo) -> None:
        try:
            if self._on_disconnect:
                await self._on_disconnect(info)
        finally:
            await info.websocket.close()

    async def send_to(self, connection_id: str, msg_type: str, payload: Dict[str, Any]) -> bool:
        """Send one message to one connection. Returns False if it is gone."""
        info = self._connections.get(connection_id or "")
        if info is None:
            return False
        message = json.dumps({"type": msg_type, **payload})
        try:
            await info.websocket.send(message)
        except Exception:
            await self._disconnect(info)
            return False
        return True

    async def broadcast(self, msg_type: str, payload: Dict[str, Any]) -> None:
        if not self._connections:
            return
        message = json.dumps({"type": msg_type, **payload})
        infos = list(self._connections.values())
        results = await asyncio.gather(
            *[info.websocket.send(message) for info in infos],
            return_exceptions=True,
        )
        for info, result in zip(infos, results):
            if isinstance(result, Exception):
                await self._disconnect(info)

    async def _client_handler(self, websocket: ServerConnection):
        info = ConnectionInfo(
            connection_id=str(uuid.uuid4()),
            websocket=websocket,
            peer=_peer_label(websocket),
        )
        self._connections[info.connection_id] = info
        try:
            if self._on_connect:
                await self._on_connect(info)
            async for message in websocket:
                try:
                    data = json.loads(message)
                except json.JSONDecodeError:
                    continue
                if not isinstance(data, dict):
                    continue
                await self._handler(data, info)
        finally:
            await self._disconnect(info)


def _peer_label(websocket: ServerConnection) -> Optional[str]:
    for attribute in ("remote_address", "client_address"):
        value = getattr(websocket, attribute, None)
        if value:
            try:
                host, port = value[0], value[1]
            except (TypeError, IndexError):
                return str(value)
            return f"{host}:{port}"
    return None
