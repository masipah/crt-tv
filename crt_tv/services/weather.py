"""Weather via Open-Meteo (no API key, works worldwide), shaped to drive a
WeatherStar 4000-style display.

The presentation is modelled on the WeatherStar 4000+ project
(github.com/netbymatt/ws4kp, MIT) — including its current-conditions icon
names — but the data source is Open-Meteo rather than the US-only NWS API, so it
works for any configured location. Results are cached for a few minutes.
"""
from __future__ import annotations

import datetime
import math
import re
import time
from typing import Any

import httpx

from ..config import settings

_API = "https://api.open-meteo.com/v1/forecast"
_GEOCODE_API = "https://geocoding-api.open-meteo.com/v1/search"
_ZIP_API = "https://api.zippopotam.us/us"
_TTL_SECONDS = 600
_cache: dict[str, Any] = {"ts": 0.0, "data": None}
_resolved_location: dict[str, Any] | None = None

# WMO weather code -> (label, day-icon, night-icon). Icon filenames match the
# ws4kp current-conditions set (server/images/icons/current-conditions/).
_WMO: dict[int, tuple[str, str, str]] = {
    0: ("Clear", "Sunny.gif", "Clear.gif"),
    1: ("Mostly Clear", "Mostly-Clear.gif", "Clear.gif"),
    2: ("Partly Cloudy", "Partly-Cloudy.gif", "Partly-Cloudy.gif"),
    3: ("Cloudy", "Cloudy.gif", "Cloudy.gif"),
    45: ("Fog", "Fog.gif", "Fog.gif"),
    48: ("Freezing Fog", "Fog.gif", "Fog.gif"),
    51: ("Light Drizzle", "Shower.gif", "Shower.gif"),
    53: ("Drizzle", "Shower.gif", "Shower.gif"),
    55: ("Heavy Drizzle", "Rain.gif", "Rain.gif"),
    56: ("Freezing Drizzle", "Freezing-Rain.gif", "Freezing-Rain.gif"),
    57: ("Freezing Drizzle", "Freezing-Rain.gif", "Freezing-Rain.gif"),
    61: ("Light Rain", "Shower.gif", "Shower.gif"),
    63: ("Rain", "Rain.gif", "Rain.gif"),
    65: ("Heavy Rain", "Rain.gif", "Rain.gif"),
    66: ("Freezing Rain", "Freezing-Rain.gif", "Freezing-Rain.gif"),
    67: ("Freezing Rain", "Freezing-Rain.gif", "Freezing-Rain.gif"),
    71: ("Light Snow", "Light-Snow.gif", "Light-Snow.gif"),
    73: ("Snow", "Heavy-Snow.gif", "Heavy-Snow.gif"),
    75: ("Heavy Snow", "Heavy-Snow.gif", "Heavy-Snow.gif"),
    77: ("Snow Grains", "Light-Snow.gif", "Light-Snow.gif"),
    80: ("Rain Showers", "Shower.gif", "Shower.gif"),
    81: ("Rain Showers", "Rain.gif", "Rain.gif"),
    82: ("Heavy Showers", "Rain.gif", "Rain.gif"),
    85: ("Snow Showers", "Light-Snow.gif", "Light-Snow.gif"),
    86: ("Snow Showers", "Heavy-Snow.gif", "Heavy-Snow.gif"),
    95: ("Thunderstorm", "Thunderstorm.gif", "Thunderstorm.gif"),
    96: ("Thunderstorm", "Thunderstorm.gif", "Thunderstorm.gif"),
    99: ("Thunderstorm", "Thunderstorm.gif", "Thunderstorm.gif"),
}

_COMPASS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]
_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_MOON_PHASES = [
    "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
    "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
]


def _describe(code: int, is_day: bool) -> tuple[str, str]:
    label, day_icon, night_icon = _WMO.get(int(code), ("Unknown", "No-Data.gif", "No-Data.gif"))
    return label, (day_icon if is_day else night_icon)


def _compass(deg: float) -> str:
    return _COMPASS[int((deg / 22.5) + 0.5) % 16]


def _dewpoint(temp: float, rh: float, metric: bool) -> float:
    """Magnus-formula dewpoint. Works in whatever unit `temp` is in."""
    rh = max(1.0, min(100.0, rh))
    tc = temp if metric else (temp - 32) * 5 / 9
    a, b = 17.27, 237.7
    alpha = (a * tc) / (b + tc) + math.log(rh / 100.0)
    td_c = (b * alpha) / (a - alpha)
    return td_c if metric else td_c * 9 / 5 + 32


def _weekday(date_iso: str) -> str:
    try:
        return _WEEKDAYS[datetime.date.fromisoformat(date_iso).weekday()]
    except Exception:
        return date_iso


def _fmt_time(iso: str) -> str:
    # "2026-06-21T04:43" -> "4:43 AM"
    try:
        t = datetime.datetime.fromisoformat(iso)
        hour = t.hour % 12 or 12
        ampm = "AM" if t.hour < 12 else "PM"
        return f"{hour}:{t.minute:02d} {ampm}"
    except Exception:
        return iso


def _moon_phase(d: datetime.date) -> str:
    known_new = datetime.date(2000, 1, 6)
    synodic = 29.53058867
    pos = ((d - known_new).days % synodic) / synodic
    return _MOON_PHASES[int(pos * 8 + 0.5) % 8]


async def _resolve_location(client: httpx.AsyncClient) -> dict[str, Any]:
    """Turn the configured location (city or US zip) into coordinates. Cached
    after the first lookup. An explicit lat/lon in config skips geocoding."""
    global _resolved_location
    if _resolved_location is not None:
        return _resolved_location

    w = settings.weather
    if w.latitude is not None and w.longitude is not None:
        _resolved_location = {
            "lat": w.latitude,
            "lon": w.longitude,
            "name": w.location_name or w.location,
            "tz": w.timezone or "auto",
        }
        return _resolved_location

    query = (w.location or "").strip()
    if re.fullmatch(r"\d{5}", query):  # US ZIP code
        resp = await client.get(f"{_ZIP_API}/{query}")
        resp.raise_for_status()
        place = resp.json()["places"][0]
        name = w.location_name or f"{place['place name']}, {place['state abbreviation']}"
        _resolved_location = {
            "lat": float(place["latitude"]),
            "lon": float(place["longitude"]),
            "name": name,
            "tz": w.timezone or "auto",
        }
    else:  # city / place name
        resp = await client.get(_GEOCODE_API, params={"name": query, "count": 10, "format": "json"})
        resp.raise_for_status()
        results = resp.json().get("results") or []
        if w.country:
            cc = w.country.upper()
            results = [r for r in results if r.get("country_code", "").upper() == cc] or results
        if not results:
            raise RuntimeError(f"could not geocode location: {query!r}")
        g = results[0]
        _resolved_location = {
            "lat": g["latitude"],
            "lon": g["longitude"],
            "name": w.location_name or g["name"],
            "tz": w.timezone if w.timezone and w.timezone != "auto" else g.get("timezone", "auto"),
        }
    return _resolved_location


async def fetch_weather() -> dict[str, Any]:
    now = time.time()
    if _cache["data"] is not None and now - _cache["ts"] < _TTL_SECONDS:
        return _cache["data"]

    w = settings.weather
    metric = w.units != "imperial"
    async with httpx.AsyncClient(timeout=10) as client:
        loc = await _resolve_location(client)
        params = {
            "latitude": loc["lat"],
            "longitude": loc["lon"],
            "timezone": loc["tz"] or "auto",
            "current": (
                "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,"
                "weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
            ),
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max",
            "temperature_unit": "celsius" if metric else "fahrenheit",
            "wind_speed_unit": "kmh" if metric else "mph",
            "forecast_days": 7,
        }
        resp = await client.get(_API, params=params)
        resp.raise_for_status()
        raw = resp.json()

    cur = raw.get("current", {})
    is_day = bool(cur.get("is_day", 1))
    temp = cur.get("temperature_2m", 0)
    rh = cur.get("relative_humidity_2m", 0)
    cur_label, cur_icon = _describe(cur.get("weather_code", -1), is_day)
    pressure_hpa = cur.get("pressure_msl", 0)

    daily = raw.get("daily", {})
    times = daily.get("time", [])
    forecast = []
    for i, date in enumerate(times):
        label, icon = _describe(daily.get("weather_code", [])[i], True)
        forecast.append(
            {
                "day": _weekday(date),
                "label": label,
                "icon": icon,
                "high": round(daily.get("temperature_2m_max", [])[i]),
                "low": round(daily.get("temperature_2m_min", [])[i]),
                "precip": daily.get("precipitation_probability_max", [None] * len(times))[i],
            }
        )

    today = datetime.date.fromisoformat(times[0]) if times else datetime.date.today()
    data = {
        "location": loc["name"],
        "units": {
            "temp": "C" if metric else "F",
            "wind": "km/h" if metric else "mph",
            "pressure": "mb" if metric else "in",
        },
        "current": {
            "temp": round(temp),
            "feels_like": round(cur.get("apparent_temperature", temp)),
            "humidity": round(rh),
            "dewpoint": round(_dewpoint(temp, rh, metric)),
            "wind_dir": _compass(cur.get("wind_direction_10m", 0)),
            "wind_speed": round(cur.get("wind_speed_10m", 0)),
            "wind_gust": round(cur.get("wind_gusts_10m", 0)),
            "pressure": round(pressure_hpa) if metric else round(pressure_hpa * 0.02953, 2),
            "label": cur_label,
            "icon": cur_icon,
            "is_day": is_day,
        },
        "forecast": forecast,
        "almanac": {
            "sunrise": _fmt_time(daily.get("sunrise", [""])[0]),
            "sunset": _fmt_time(daily.get("sunset", [""])[0]),
            "moon_phase": _moon_phase(today),
        },
        "fetched_at": int(now),
    }
    _cache.update(ts=now, data=data)
    return data
