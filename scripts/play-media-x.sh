#!/usr/bin/env bash
# X client for the video player session — run by xinit from play-media.sh.
set -euo pipefail

xset s off -dpms || true

# After a weather break, `tv break` leaves a resume point (playlist index +
# seconds) so the video picks up where it left off.
RESUME_ARGS=()
if [[ -f /run/crt-tv/resume ]]; then
  read -r pos start </run/crt-tv/resume || true
  rm -f /run/crt-tv/resume
  if [[ -n ${pos:-} ]]; then RESUME_ARGS+=("--playlist-start=$pos"); fi
  if [[ -n ${start:-} ]]; then RESUME_ARGS+=("--start=$start"); fi
fi

exec mpv \
  --fs \
  --log-file=/run/crt-tv/mpv.log \
  --input-ipc-server=/run/crt-tv/mpv.sock \
  --loop-playlist=inf \
  --playlist=/run/crt-tv/playlist.m3u \
  "${RESUME_ARGS[@]}"
