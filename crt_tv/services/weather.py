"""Weather via Open-Meteo (no API key required), shaped for a Ceefax-style page.

Results are cached for a few minutes so the display can poll freely.
"""
from __future__ import annotations

import time
from typing import Any

import httpx

from ..config import settings

_API = "https://api.open-meteo.com/v1/forecast"
_TTL_SECONDS = 600
_cache: dict[str, Any] = {"ts": 0.0, "data": None}

# WMO weather interpretation codes -> short label + a chunky emoji-free glyph.
_WMO: dict[int, tuple[str, str]] = {
    0: ("CLEAR", "☀"),
    1: ("MAINLY CLEAR", "☀"),
    2: ("PARTLY CLOUDY", "⛅"),
    3: ("OVERCAST", "☁"),
    45: ("FOG", "▒"),
    48: ("RIME FOG", "▒"),
    51: ("LIGHT DRIZZLE", "☂"),
    53: ("DRIZZLE", "☂"),
    55: ("HEAVY DRIZZLE", "☂"),
    56: ("FREEZING DRIZZLE", "☂"),
    57: ("FREEZING DRIZZLE", "☂"),
    61: ("LIGHT RAIN", "☔"),
    63: ("RAIN", "☔"),
    65: ("HEAVY RAIN", "☔"),
    66: ("FREEZING RAIN", "☔"),
    67: ("FREEZING RAIN", "☔"),
    71: ("LIGHT SNOW", "❄"),
    73: ("SNOW", "❄"),
    75: ("HEAVY SNOW", "❄"),
    77: ("SNOW GRAINS", "❄"),
    80: ("RAIN SHOWERS", "☔"),
    81: ("RAIN SHOWERS", "☔"),
    82: ("VIOLENT SHOWERS", "☔"),
    85: ("SNOW SHOWERS", "❄"),
    86: ("SNOW SHOWERS", "❄"),
    95: ("THUNDERSTORM", "⚡"),
    96: ("THUNDERSTORM", "⚡"),
    99: ("THUNDERSTORM", "⚡"),
}

_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


def _describe(code: int) -> tuple[str, str]:
    return _WMO.get(int(code), ("UNKNOWN", "?"))


def _day_label(date_iso: str) -> str:
    # date_iso like "2026-06-21"; weekday via a cheap Zeller-free approach.
    try:
        import datetime

        d = datetime.date.fromisoformat(date_iso)
        return _DAYS[d.weekday()]
    except Exception:
        return date_iso[5:]


async def fetch_weather() -> dict[str, Any]:
    now = time.time()
    if _cache["data"] is not None and now - _cache["ts"] < _TTL_SECONDS:
        return _cache["data"]

    w = settings.weather
    metric = w.units != "imperial"
    params = {
        "latitude": w.latitude,
        "longitude": w.longitude,
        "timezone": w.timezone,
        "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min",
        "temperature_unit": "celsius" if metric else "fahrenheit",
        "wind_speed_unit": "kmh" if metric else "mph",
        "forecast_days": 5,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(_API, params=params)
        resp.raise_for_status()
        raw = resp.json()

    cur = raw.get("current", {})
    cur_label, cur_glyph = _describe(cur.get("weather_code", -1))
    daily = raw.get("daily", {})
    days = []
    for i, date in enumerate(daily.get("time", [])):
        label, glyph = _describe(daily.get("weather_code", [])[i])
        days.append(
            {
                "day": _day_label(date),
                "label": label,
                "glyph": glyph,
                "high": round(daily.get("temperature_2m_max", [])[i]),
                "low": round(daily.get("temperature_2m_min", [])[i]),
            }
        )

    data = {
        "location": w.location_name,
        "units": {"temp": "C" if metric else "F", "wind": "km/h" if metric else "mph"},
        "current": {
            "temp": round(cur.get("temperature_2m", 0)),
            "feels_like": round(cur.get("apparent_temperature", cur.get("temperature_2m", 0))),
            "humidity": round(cur.get("relative_humidity_2m", 0)),
            "wind": round(cur.get("wind_speed_10m", 0)),
            "label": cur_label,
            "glyph": cur_glyph,
        },
        "forecast": days,
        "fetched_at": int(now),
    }
    _cache.update(ts=now, data=data)
    return data
