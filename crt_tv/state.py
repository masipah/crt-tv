"""Shared display state and a tiny WebSocket broadcast hub.

Both the on-CRT display app and the remote control app subscribe to ``/ws`` and
receive the full state whenever it changes, so they stay in sync.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass

from fastapi import WebSocket

VALID_MODES = ("teletext", "weather", "video")


@dataclass
class DisplayState:
    mode: str
    video_index: int = 0


class StateManager:
    def __init__(self, default_mode: str) -> None:
        if default_mode not in VALID_MODES:
            default_mode = VALID_MODES[0]
        self.state = DisplayState(mode=default_mode)
        self._clients: set[WebSocket] = set()

    def _payload(self) -> str:
        return json.dumps({"type": "state", "state": asdict(self.state)})

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.add(ws)
        await ws.send_text(self._payload())

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.discard(ws)

    async def set_mode(self, mode: str) -> None:
        if mode not in VALID_MODES:
            raise ValueError(f"invalid mode: {mode!r}")
        self.state.mode = mode
        await self.broadcast()

    async def set_video_index(self, index: int) -> None:
        self.state.video_index = max(0, index)
        await self.broadcast()

    async def broadcast(self) -> None:
        await self._send_all(self._payload())

    async def notify_playlist_changed(self) -> None:
        """Tell clients the media library changed (after upload/delete)."""
        await self._send_all(json.dumps({"type": "playlist"}))

    async def notify_weather_changed(self) -> None:
        """Tell clients the weather location/options changed, so the display refreshes."""
        await self._send_all(json.dumps({"type": "weather"}))

    async def send_weather_command(self, action: str) -> None:
        """Transient control-bar command for the weather display (prev/next/…)."""
        await self._send_all(json.dumps({"type": "wxcmd", "action": action}))

    async def _send_all(self, text: str) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)
