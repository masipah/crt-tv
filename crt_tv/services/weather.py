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

from .. import __version__
from .hazards import fetch_hazards
from .store import effective_weather

_API = "https://api.open-meteo.com/v1/forecast"
_GEOCODE_API = "https://geocoding-api.open-meteo.com/v1/search"
_ZIP_API = "https://api.zippopotam.us/us"
_TTL_SECONDS = 600
_cache: dict[str, Any] = {"ts": 0.0, "data": None}
_resolved_location: dict[str, Any] | None = None
_geocode_cache: dict[str, dict[str, Any]] = {}

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


def reset_caches() -> None:
    """Forget the resolved location and cached forecast — call after the user
    changes the location so the next fetch re-resolves and re-downloads."""
    global _resolved_location
    _resolved_location = None
    _cache["data"] = None
    _cache["ts"] = 0.0


async def _geocode(client: httpx.AsyncClient, query: str, country: str = "") -> dict[str, Any]:
    """Resolve a city name or US ZIP to {lat, lon, name, tz}. Cached per query."""
    query = (query or "").strip()
    key = f"{query}|{country}".lower()
    if key in _geocode_cache:
        return _geocode_cache[key]

    if re.fullmatch(r"\d{5}", query):  # US ZIP code
        resp = await client.get(f"{_ZIP_API}/{query}")
        resp.raise_for_status()
        place = resp.json()["places"][0]
        out = {
            "lat": float(place["latitude"]),
            "lon": float(place["longitude"]),
            "name": f"{place['place name']}, {place['state abbreviation']}",
            "tz": None,
        }
    else:  # city / place name
        resp = await client.get(_GEOCODE_API, params={"name": query, "count": 10, "format": "json"})
        resp.raise_for_status()
        results = resp.json().get("results") or []
        if country:
            cc = country.upper()
            results = [r for r in results if r.get("country_code", "").upper() == cc] or results
        if not results:
            raise RuntimeError(f"could not geocode location: {query!r}")
        g = results[0]
        out = {"lat": g["latitude"], "lon": g["longitude"], "name": g["name"], "tz": g.get("timezone")}

    _geocode_cache[key] = out
    return out


async def _resolve_location(client: httpx.AsyncClient, ew: dict[str, Any]) -> dict[str, Any]:
    """Coordinates for the primary location. Cached; explicit lat/lon skips geocoding."""
    global _resolved_location
    if _resolved_location is not None:
        return _resolved_location

    if ew["latitude"] is not None and ew["longitude"] is not None:
        _resolved_location = {
            "lat": ew["latitude"],
            "lon": ew["longitude"],
            "name": ew["location_name"] or ew["location"],
            "tz": ew["timezone"] or "auto",
        }
        return _resolved_location

    g = await _geocode(client, ew["location"], ew["country"])
    tz = ew["timezone"]
    _resolved_location = {
        "lat": g["lat"],
        "lon": g["lon"],
        "name": ew["location_name"] or g["name"],
        "tz": tz if tz and tz != "auto" else (g["tz"] or "auto"),
    }
    return _resolved_location


def _build_hourly(raw: dict[str, Any], now_iso: str, count: int = 12) -> list[dict[str, Any]]:
    """Next `count` hours from the hourly block, starting at the current hour."""
    h = raw.get("hourly", {})
    times = h.get("time", [])
    temps = h.get("temperature_2m", [])
    codes = h.get("weather_code", [])
    precs = h.get("precipitation_probability", [])
    days = h.get("is_day", [])
    try:
        now_hour = datetime.datetime.fromisoformat(now_iso).replace(minute=0, second=0, microsecond=0)
    except Exception:
        now_hour = datetime.datetime.now().replace(minute=0, second=0, microsecond=0)

    out = []
    for i, t in enumerate(times):
        try:
            dt = datetime.datetime.fromisoformat(t)
        except Exception:
            continue
        if dt < now_hour:
            continue
        is_day = bool(days[i]) if i < len(days) else (6 <= dt.hour < 20)
        label, glyph = _describe(codes[i], is_day)
        hour12 = dt.hour % 12 or 12
        out.append({
            "time": f"{hour12}{'AM' if dt.hour < 12 else 'PM'}",
            "temp": round(temps[i]),
            "icon": glyph,
            "label": label,
            "precip": precs[i] if i < len(precs) else None,
        })
        if len(out) >= count:
            break
    return out


def _local_forecast(forecast: list[dict[str, Any]], u: str) -> list[dict[str, Any]]:
    """Ceefax/WeatherStar-style narrative periods from the daily forecast."""
    periods = []
    for i, d in enumerate(forecast[:5]):
        title = "TODAY" if i == 0 else d["day"].upper()
        text = f"{d['label'].upper()}. HIGH {d['high']}{u}, LOW {d['low']}{u}."
        if d.get("precip"):
            text += f" PRECIP {d['precip']}%."
        periods.append({"title": title, "text": text})
    return periods


async def _fetch_regional(client: httpx.AsyncClient, cities: list[str], metric: bool) -> list[dict[str, Any]]:
    """Current conditions + today's hi/lo for a list of cities, in one multi-
    coordinate Open-Meteo call. Used by the Regional and Travel screens."""
    coords, names = [], []
    for city in cities[:8]:
        try:
            g = await _geocode(client, city)
            coords.append((g["lat"], g["lon"]))
            names.append(g["name"].upper())
        except Exception:
            continue
    if not coords:
        return []

    params = {
        "latitude": ",".join(str(la) for la, _ in coords),
        "longitude": ",".join(str(lo) for _, lo in coords),
        "current": "temperature_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m",
        "daily": "temperature_2m_max,temperature_2m_min,weather_code",
        "timezone": "auto",
        "temperature_unit": "celsius" if metric else "fahrenheit",
        "wind_speed_unit": "kmh" if metric else "mph",
        "forecast_days": 1,
    }
    resp = await client.get(_API, params=params)
    resp.raise_for_status()
    payload = resp.json()
    items = payload if isinstance(payload, list) else [payload]

    out = []
    for name, (clat, clon), item in zip(names, coords, items):
        cur = item.get("current", {})
        daily = item.get("daily", {})
        is_day = bool(cur.get("is_day", 1))
        label, glyph = _describe(cur.get("weather_code", -1), is_day)
        hi = (daily.get("temperature_2m_max") or [None])[0]
        lo = (daily.get("temperature_2m_min") or [None])[0]
        out.append({
            "name": name,
            "lat": clat,
            "lon": clon,
            "temp": round(cur.get("temperature_2m", 0)),
            "label": label,
            "icon": glyph,
            "high": round(hi) if hi is not None else None,
            "low": round(lo) if lo is not None else None,
            "wind_dir": _compass(cur.get("wind_direction_10m", 0)),
            "wind_speed": round(cur.get("wind_speed_10m", 0)),
        })
    return out


async def fetch_weather() -> dict[str, Any]:
    now = time.time()
    if _cache["data"] is not None and now - _cache["ts"] < _TTL_SECONDS:
        return _cache["data"]

    ew = effective_weather()
    metric = ew["units"] != "imperial"
    async with httpx.AsyncClient(timeout=10) as client:
        loc = await _resolve_location(client, ew)
        params = {
            "latitude": loc["lat"],
            "longitude": loc["lon"],
            "timezone": loc["tz"] or "auto",
            "current": (
                "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,"
                "weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
            ),
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max",
            "hourly": "temperature_2m,weather_code,precipitation_probability,is_day",
            "temperature_unit": "celsius" if metric else "fahrenheit",
            "wind_speed_unit": "kmh" if metric else "mph",
            "forecast_days": 7,
        }
        resp = await client.get(_API, params=params)
        resp.raise_for_status()
        raw = resp.json()

        regional = []
        if ew.get("regional_cities"):
            try:
                regional = await _fetch_regional(client, ew["regional_cities"], metric)
            except Exception:
                regional = []

        try:
            hazards = await fetch_hazards(client, loc["lat"], loc["lon"])
        except Exception:
            hazards = []

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
        "headend": {
            "latitude": round(float(loc["lat"]), 4),
            "longitude": round(float(loc["lon"]), 4),
            "timezone": raw.get("timezone", loc["tz"]),
            "source": "Open-Meteo",
            "version": __version__,
        },
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
        "hourly": _build_hourly(raw, cur.get("time", "")),
        "local_forecast": _local_forecast(forecast, "C" if metric else "F"),
        "regional": regional,
        "hazards": hazards,
        "almanac": {
            "sunrise": _fmt_time(daily.get("sunrise", [""])[0]),
            "sunset": _fmt_time(daily.get("sunset", [""])[0]),
            "moon_phase": _moon_phase(today),
        },
        "fetched_at": int(now),
    }
    _cache.update(ts=now, data=data)
    return data
