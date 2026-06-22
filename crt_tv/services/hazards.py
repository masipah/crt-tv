"""Active weather alerts from the US National Weather Service (api.weather.gov).

US-only — for points outside NWS coverage the API returns nothing, so the
Hazards screen simply doesn't appear. Cached per location.
"""
from __future__ import annotations

import time
from typing import Any

import httpx

_API = "https://api.weather.gov/alerts/active"
_TTL_SECONDS = 300
_cache: dict[str, dict[str, Any]] = {}


async def fetch_hazards(client: httpx.AsyncClient, lat: float, lon: float) -> list[dict[str, str]]:
    key = f"{round(lat, 2)},{round(lon, 2)}"
    now = time.time()
    cached = _cache.get(key)
    if cached and now - cached["ts"] < _TTL_SECONDS:
        return cached["data"]

    data: list[dict[str, str]] = []
    try:
        resp = await client.get(
            _API,
            params={"point": f"{lat},{lon}", "status": "actual"},
            headers={"User-Agent": "crt-tv (personal WeatherStar project)", "Accept": "application/geo+json"},
            timeout=8,
        )
        if resp.status_code == 200:
            for f in resp.json().get("features", []):
                p = f.get("properties", {})
                data.append({
                    "event": p.get("event", ""),
                    "headline": p.get("headline", ""),
                    "severity": p.get("severity", ""),
                })
    except Exception:
        data = []

    _cache[key] = {"ts": now, "data": data}
    return data
