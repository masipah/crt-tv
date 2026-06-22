"""Persistent runtime settings (survive reboot), separate from config.toml.

config.toml holds install-time defaults; this small JSON store holds things the
user changes from the web UI — currently the weather location. It lives in
``data/state.json`` next to the app and is git-ignored.
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from ..config import ROOT, settings

STATE_PATH = ROOT / "data" / "state.json"


def atomic_write_text(path: Path, text: str) -> None:
    """Write a file so it can't be left half-written by a power loss: write a
    temp file in the same dir, fsync it, atomically rename over the target, then
    fsync the directory so the rename itself is durable after a power cut."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-", suffix=path.suffix)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)  # atomic on the same filesystem
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    # Persist the directory entry (the rename) so a power cut right after can't
    # lose it. Not supported on every platform — best effort.
    try:
        dir_fd = os.open(str(path.parent), os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except OSError:
        pass


def load_state() -> dict[str, Any]:
    if STATE_PATH.exists():
        try:
            data = json.loads(STATE_PATH.read_text())
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return {}


def save_state(state: dict[str, Any]) -> None:
    atomic_write_text(STATE_PATH, json.dumps(state, indent=2))


def update_state(**values: Any) -> dict[str, Any]:
    """Merge non-None values into the store and persist."""
    state = load_state()
    for key, value in values.items():
        if value is not None:
            state[key] = value
    save_state(state)
    return state


def effective_weather() -> dict[str, Any]:
    """Weather settings to actually use: a UI-set location (persisted) overrides
    config.toml; otherwise fall back to config (which may pin lat/lon)."""
    s = load_state()
    w = settings.weather
    if s.get("weather_location"):
        return {
            "location": s["weather_location"],
            "country": s.get("weather_country", ""),
            "units": s.get("weather_units", w.units),
            "latitude": None,
            "longitude": None,
            "location_name": "",
            "timezone": "auto",
            "regional_cities": list(w.regional_cities),
        }
    return {
        "location": w.location,
        "country": w.country,
        "units": w.units,
        "latitude": w.latitude,
        "longitude": w.longitude,
        "location_name": w.location_name,
        "timezone": w.timezone,
        "regional_cities": list(w.regional_cities),
    }
