"""Scan the media directory for playable video files."""
from __future__ import annotations

import random

from ..config import settings

VIDEO_EXTS = {".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi", ".ogv"}


def list_videos() -> list[dict[str, str]]:
    media = settings.media_path
    media.mkdir(parents=True, exist_ok=True)
    files = sorted(
        p for p in media.iterdir() if p.is_file() and p.suffix.lower() in VIDEO_EXTS
    )
    if settings.video.shuffle:
        random.shuffle(files)
    return [{"name": p.stem, "file": p.name, "url": f"/media/{p.name}"} for p in files]
