"""FastAPI app: control API, state WebSocket, and static hosting for both
the on-CRT display app and the remote control app.

Routes are registered before the catch-all static mounts, so /api/* and /ws
always win over the "/" mount.
"""
from __future__ import annotations

from dataclasses import asdict

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import ROOT, settings
from .services.playlist import list_videos
from .services.weather import fetch_weather
from .state import VALID_MODES, StateManager

app = FastAPI(title="crt-tv", version="0.1.0")
state = StateManager(settings.default_mode)

WEB = ROOT / "web"


class ModeBody(BaseModel):
    mode: str


class VideoIndexBody(BaseModel):
    index: int


# ---------------------------------------------------------------- control API
@app.get("/api/state")
async def get_state() -> dict:
    return {"state": asdict(state.state), "modes": list(VALID_MODES)}


@app.post("/api/mode")
async def set_mode(body: ModeBody) -> dict:
    if body.mode not in VALID_MODES:
        raise HTTPException(400, f"invalid mode: {body.mode!r}")
    await state.set_mode(body.mode)
    return {"ok": True, "mode": body.mode}


@app.post("/api/video/index")
async def set_video_index(body: VideoIndexBody) -> dict:
    await state.set_video_index(body.index)
    return {"ok": True, "index": state.state.video_index}


@app.get("/api/weather")
async def get_weather() -> dict:
    try:
        return await fetch_weather()
    except Exception as exc:  # noqa: BLE001 - surface upstream failure to client
        raise HTTPException(502, f"weather fetch failed: {exc}") from exc


@app.get("/api/playlist")
async def get_playlist() -> dict:
    return {"videos": list_videos()}


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "mode": state.state.mode}


# ----------------------------------------------------------------- state WS
@app.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    await state.connect(websocket)
    try:
        while True:
            # We don't expect inbound messages; this keeps the socket open.
            await websocket.receive_text()
    except WebSocketDisconnect:
        state.disconnect(websocket)


# -------------------------------------------------------------- static mounts
# Media: StaticFiles supports HTTP Range, so <video> seeking/streaming works.
_media = settings.media_path
_media.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(_media)), name="media")

# The full-screen app shown on the CRT.
app.mount("/display", StaticFiles(directory=str(WEB / "display"), html=True), name="display")

# The remote control app at "/". Mounted last so it never shadows the above.
app.mount("/", StaticFiles(directory=str(WEB / "control"), html=True), name="control")
