"""RainViewer radar frame list (proxied so the display avoids CORS), cached."""
from __future__ import annotations

import time
from typing import Any

import httpx

_API = "https://api.rainviewer.com/public/weather-maps.json"
_TTL_SECONDS = 300
_cache: dict[str, Any] = {"ts": 0.0, "data": None}


async def fetch_radar() -> dict[str, Any]:
    now = time.time()
    if _cache["data"] is not None and now - _cache["ts"] < _TTL_SECONDS:
        return _cache["data"]
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(_API)
        resp.raise_for_status()
        data = resp.json()
    _cache.update(ts=now, data=data)
    return data
