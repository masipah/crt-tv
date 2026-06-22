"""FastAPI app: control API, state WebSocket, and static hosting for both
the on-CRT display app and the remote control app.

Routes are registered before the catch-all static mounts, so /api/* and /ws
always win over the "/" mount.
"""
from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import ROOT, settings
from .services.playlist import VIDEO_EXTS, list_videos, set_order
from .services.store import (
    SPEEDS,
    WEATHER_SCREENS,
    effective_weather,
    load_state,
    save_state,
    update_state,
    weather_options,
)
from .services.weather import fetch_weather, reset_caches as reset_weather_caches
from .state import VALID_MODES, StateManager

app = FastAPI(title="crt-tv", version="0.1.0")
state = StateManager(settings.default_mode)

WEB = ROOT / "web"


class ModeBody(BaseModel):
    mode: str


class VideoIndexBody(BaseModel):
    index: int


class OrderBody(BaseModel):
    order: list[str]


class WeatherLocationBody(BaseModel):
    location: str
    country: Optional[str] = None
    units: Optional[str] = None


class WeatherOptionsBody(BaseModel):
    screens: Optional[list] = None       # enabled screen keys
    speed: Optional[str] = None          # slow | normal | fast
    music: Optional[bool] = None
    music_volume: Optional[float] = None


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


@app.get("/api/weather/settings")
async def get_weather_settings() -> dict:
    ew = effective_weather()
    return {"location": ew["location"], "country": ew["country"], "units": ew["units"]}


@app.post("/api/weather/location")
async def set_weather_location(body: WeatherLocationBody) -> dict:
    loc = body.location.strip()
    if not loc:
        raise HTTPException(400, "location is required")
    # Apply tentatively, then verify it resolves before keeping it — so a typo
    # never gets persisted and breaks weather on the next boot.
    previous = load_state()
    update_state(weather_location=loc, weather_country=(body.country or ""), weather_units=body.units)
    reset_weather_caches()
    try:
        data = await fetch_weather()
    except Exception as exc:  # noqa: BLE001
        save_state(previous)  # roll back the bad location
        reset_weather_caches()
        raise HTTPException(502, f"could not find location {loc!r}") from exc
    await state.notify_weather_changed()
    return {"ok": True, "location": data["location"]}


AUDIO_DIR = WEB / "display" / "assets" / "audio"
AUDIO_EXTS = {".mp3", ".m4a", ".ogg", ".aac"}


@app.get("/api/weather/options")
async def get_weather_options() -> dict:
    return weather_options()


@app.post("/api/weather/options")
async def set_weather_options(body: WeatherOptionsBody) -> dict:
    updates: dict = {}
    if body.screens is not None:
        valid = {k for k, _, impl in WEATHER_SCREENS if impl}
        updates["weather_screens"] = [k for k in body.screens if k in valid]
    if body.speed is not None and body.speed in SPEEDS:
        updates["weather_speed"] = body.speed
    if body.music is not None:
        updates["music_enabled"] = bool(body.music)
    if body.music_volume is not None:
        updates["music_volume"] = max(0.0, min(1.0, float(body.music_volume)))
    if updates:
        update_state(**updates)
    await state.notify_weather_changed()
    return {"ok": True, **weather_options()}


@app.get("/api/music")
async def get_music() -> dict:
    """Background-music tracks for the weather channel (served from the display
    assets). Empty unless the opt-in fetch-audio.sh has been run."""
    opts = weather_options()
    if not opts["music"]:
        return {"enabled": False, "volume": 0, "tracks": []}
    tracks = []
    if AUDIO_DIR.is_dir():
        for p in sorted(AUDIO_DIR.iterdir()):
            if p.is_file() and p.suffix.lower() in AUDIO_EXTS:
                tracks.append(f"/display/assets/audio/{p.name}")
    return {"enabled": True, "volume": opts["music_volume"], "tracks": tracks}


@app.get("/api/playlist")
async def get_playlist() -> dict:
    return {"videos": list_videos()}


def _unique_dest(name: str) -> Path:
    """A non-colliding path inside the media dir for sanitized `name`."""
    dest = settings.media_path / name
    if not dest.exists():
        return dest
    stem, suffix = dest.stem, dest.suffix
    i = 1
    while (settings.media_path / f"{stem}-{i}{suffix}").exists():
        i += 1
    return settings.media_path / f"{stem}-{i}{suffix}"


@app.post("/api/playlist/order")
async def set_playlist_order(body: OrderBody) -> dict:
    videos = set_order([Path(n).name for n in body.order])
    await state.notify_playlist_changed()
    return {"ok": True, "videos": videos}


@app.post("/api/upload")
async def upload_videos(files: list[UploadFile] = File(...)) -> dict:
    saved: list[str] = []
    skipped: list[str] = []
    settings.media_path.mkdir(parents=True, exist_ok=True)
    for f in files:
        name = Path(f.filename or "").name  # strip any path components
        if not name or Path(name).suffix.lower() not in VIDEO_EXTS:
            skipped.append(f.filename or "(unnamed)")
            continue
        dest = _unique_dest(name)
        with open(dest, "wb") as out:
            while chunk := await f.read(1024 * 1024):
                out.write(chunk)
        saved.append(dest.name)
    if saved:
        await state.notify_playlist_changed()
    return {"ok": True, "saved": saved, "skipped": skipped, "videos": list_videos()}


@app.delete("/api/video/{filename}")
async def delete_video(filename: str) -> dict:
    name = Path(filename).name
    dest = (settings.media_path / name).resolve()
    media_root = settings.media_path.resolve()
    if dest.parent != media_root or dest.suffix.lower() not in VIDEO_EXTS:
        raise HTTPException(400, "invalid filename")
    if not dest.exists():
        raise HTTPException(404, "not found")
    dest.unlink()
    await state.notify_playlist_changed()
    return {"ok": True, "videos": list_videos()}


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "mode": state.state.mode}


# Convenience redirects so the bare paths work (the StaticFiles mounts only
# serve the trailing-slash form, e.g. /preview/).
@app.get("/preview")
async def preview_redirect() -> RedirectResponse:
    return RedirectResponse("/preview/")


@app.get("/display")
async def display_redirect() -> RedirectResponse:
    return RedirectResponse("/display/")


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

# A CRT-bezel preview of /display, for testing before the real TV is connected.
app.mount("/preview", StaticFiles(directory=str(WEB / "preview"), html=True), name="preview")

# The remote control app at "/". Mounted last so it never shadows the above.
app.mount("/", StaticFiles(directory=str(WEB / "control"), html=True), name="control")
