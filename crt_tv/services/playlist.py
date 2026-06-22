"""Scan the media directory for playable videos, with a persisted play order.

The order is stored in a hidden ``.order.json`` inside the media dir. Files not
yet in the order are appended (name-sorted); files that have been deleted drop
out automatically. If ``[video] shuffle`` is enabled, the saved order is ignored.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from ..config import settings

VIDEO_EXTS = {".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi", ".ogv"}
ORDER_FILENAME = ".order.json"


def _order_path() -> Path:
    return settings.media_path / ORDER_FILENAME


def _scan_files() -> dict[str, Path]:
    media = settings.media_path
    media.mkdir(parents=True, exist_ok=True)
    return {
        p.name: p
        for p in sorted(media.iterdir())
        if p.is_file() and p.suffix.lower() in VIDEO_EXTS
    }


def load_order() -> list[str]:
    p = _order_path()
    if p.exists():
        try:
            data = json.loads(p.read_text())
            if isinstance(data, list):
                return [str(x) for x in data]
        except Exception:
            pass
    return []


def save_order(order: list[str]) -> None:
    settings.media_path.mkdir(parents=True, exist_ok=True)
    _order_path().write_text(json.dumps(order, indent=2))


def _ordered_names(files: dict[str, Path]) -> list[str]:
    if settings.video.shuffle:
        names = list(files)
        random.shuffle(names)
        return names
    order = load_order()
    names = [n for n in order if n in files]          # saved order, still present
    names += [n for n in sorted(files) if n not in names]  # new files appended
    return names


def list_videos() -> list[dict[str, str]]:
    files = _scan_files()
    return [
        {"name": Path(n).stem, "file": n, "url": f"/media/{n}"}
        for n in _ordered_names(files)
    ]


def set_order(order: list[str]) -> list[dict[str, str]]:
    """Persist a new order (filenames). Unknown names ignored; missing ones
    appended so nothing disappears from the library."""
    files = _scan_files()
    cleaned = [n for n in order if n in files]
    cleaned += [n for n in sorted(files) if n not in cleaned]
    save_order(cleaned)
    return list_videos()
