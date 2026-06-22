"""Configuration loading.

Reads a TOML file (config.toml by default, override with CRT_TV_CONFIG) and
falls back to sensible defaults so the service runs with no config at all.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any

try:  # Python 3.11+
    import tomllib
except ModuleNotFoundError:  # Python <3.11 (e.g. macOS system Python)
    import tomli as tomllib  # type: ignore

ROOT = Path(__file__).resolve().parent.parent


def _filtered(cls, data: dict[str, Any]) -> dict[str, Any]:
    """Keep only keys that are real fields of dataclass ``cls``."""
    names = {f.name for f in fields(cls)}
    return {k: v for k, v in data.items() if k in names}


@dataclass
class WeatherConfig:
    location: str = "London"          # city name or US zip code (geocoded)
    country: str = ""                 # optional ISO code to disambiguate, e.g. "US"
    units: str = "metric"             # metric | imperial
    # Optional explicit point — if both lat & lon are set, geocoding is skipped.
    latitude: float | None = None
    longitude: float | None = None
    location_name: str = ""           # display name; defaults to the geocoded name
    timezone: str = "auto"            # IANA tz, or "auto" to derive from coords


@dataclass
class VideoConfig:
    media_dir: str = "media"
    shuffle: bool = False


@dataclass
class Settings:
    host: str = "0.0.0.0"
    port: int = 8000
    default_mode: str = "teletext"
    weather: WeatherConfig = field(default_factory=WeatherConfig)
    video: VideoConfig = field(default_factory=VideoConfig)

    @property
    def media_path(self) -> Path:
        p = Path(self.video.media_dir).expanduser()
        return p if p.is_absolute() else (ROOT / p)


def load_settings() -> Settings:
    cfg_path = Path(os.environ.get("CRT_TV_CONFIG", str(ROOT / "config.toml")))
    data: dict[str, Any] = {}
    if cfg_path.exists():
        with open(cfg_path, "rb") as f:
            data = tomllib.load(f)

    s = Settings()
    s.default_mode = data.get("default_mode", s.default_mode)

    server = data.get("server", {})
    s.host = server.get("host", s.host)
    s.port = int(server.get("port", s.port))

    s.weather = WeatherConfig(**{**vars(s.weather), **_filtered(WeatherConfig, data.get("weather", {}))})
    s.video = VideoConfig(**{**vars(s.video), **_filtered(VideoConfig, data.get("video", {}))})
    return s


settings = load_settings()
