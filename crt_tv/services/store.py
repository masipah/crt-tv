"""Persistent runtime settings (survive reboot), separate from config.toml.

config.toml holds install-time defaults; this small JSON store holds things the
user changes from the web UI — currently the weather location. It lives in
``data/state.json`` next to the app and is git-ignored.
"""
from __future__ import annotations

import json
from typing import Any

from ..config import ROOT, settings

STATE_PATH = ROOT / "data" / "state.json"


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
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2))


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
        }
    return {
        "location": w.location,
        "country": w.country,
        "units": w.units,
        "latitude": w.latitude,
        "longitude": w.longitude,
        "location_name": w.location_name,
        "timezone": w.timezone,
    }
