#!/usr/bin/env bash
# X client for the video player session — run by xinit from play-media.sh.
set -euo pipefail

xset s off -dpms || true

exec mpv \
  --fs \
  --log-file=/run/crt-tv/mpv.log \
  --input-ipc-server=/run/crt-tv/mpv.sock \
  --loop-playlist=inf \
  --playlist=/run/crt-tv/playlist.m3u
