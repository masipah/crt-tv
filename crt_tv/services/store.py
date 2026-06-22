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


# The full WeatherStar 4000 display list (ws4kp order + labels). The third field
# is whether crt-tv actually renders it; unimplemented ones appear in the admin
# checklist but disabled (greyed), exactly as ws4kp greys no-data displays.
WEATHER_SCREENS = [
    ("hazards", "Hazards", True),
    ("current", "Current Conditions", True),
    ("regional", "Latest Observations", True),
    ("hourly", "Hourly Forecast", True),
    ("hourly_graph", "Hourly Graph", True),
    ("travel", "Travel Forecast", True),
    ("regional_forecast", "Regional Forecast", True),
    ("local", "Local Forecast", True),
    ("extended", "Extended Forecast", True),
    ("almanac", "Almanac", True),
    ("spc", "SPC Outlook", True),
    ("radar", "Local Radar", True),
]
_IMPLEMENTED = [k for k, _, impl in WEATHER_SCREENS if impl]

# Display cycle speed -> milliseconds per screen (ws4kp Slow/Normal/Fast).
SPEEDS = {"slow": 16000, "normal": 12000, "fast": 8000}

# Color themes (applied to the display as a CSS filter; Classic = the real art).
THEMES = ("classic", "dark", "seafoam", "cosmic")
# What the bottom ticker scrolls.
TICKERS = ("conditions", "custom")


def weather_options() -> dict[str, Any]:
    """User-selectable weather-channel options (which screens, speed, music)."""
    s = load_state()
    w = settings.weather
    enabled = s.get("weather_screens")
    if not isinstance(enabled, list) or not enabled:
        enabled = list(_IMPLEMENTED)
    speed = s.get("weather_speed", "normal")
    if speed not in SPEEDS:
        speed = "normal"
    return {
        "screens": [
            {"key": k, "label": label, "available": impl, "enabled": impl and k in enabled}
            for k, label, impl in WEATHER_SCREENS
        ],
        "enabled_keys": [k for k in _IMPLEMENTED if k in enabled],
        "speed": speed,
        "speed_ms": SPEEDS[speed],
        "theme": s.get("weather_theme", "classic"),
        "ticker": s.get("weather_ticker", "conditions"),
        "ticker_text": s.get("weather_ticker_text", ""),
        "music": bool(s.get("music_enabled", w.music)),
        "music_volume": float(s.get("music_volume", w.music_volume)),
    }


ENGINES = ("builtin", "ws4kp", "ws3kp")


def effective_engine() -> str:
    """The weather engine to use — a UI choice (state.json) overrides config."""
    e = load_state().get("weather_engine", settings.weather_engine)
    return e if e in ENGINES else settings.weather_engine


def engine_port(engine: str) -> int:
    return settings.ws3kp_port if engine == "ws3kp" else settings.ws4kp_port


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
