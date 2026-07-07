#!/usr/bin/env bash
# X client for the video player session — run by xinit from play-media.sh.
set -euo pipefail

xset s off -dpms || true

# After a weather break, `tv break` leaves a resume point (playlist index,
# seconds, mute state) so the video picks up exactly where it left off.
# At boot, tv autostart leaves a one-shot start-muted flag instead.
RESUME_ARGS=()
if [[ -f /run/crt-tv/resume ]]; then
  read -r pos start muted </run/crt-tv/resume || true
  rm -f /run/crt-tv/resume
  if [[ -n ${pos:-} ]]; then RESUME_ARGS+=("--playlist-start=$pos"); fi
  if [[ -n ${start:-} ]]; then RESUME_ARGS+=("--start=$start"); fi
  if [[ ${muted:-} == true ]]; then RESUME_ARGS+=("--mute=yes"); fi
elif [[ -f /run/crt-tv/start-muted ]]; then
  rm -f /run/crt-tv/start-muted
  RESUME_ARGS+=("--mute=yes")
fi

exec mpv \
  --fs \
  --log-file=/run/crt-tv/mpv.log \
  --input-ipc-server=/run/crt-tv/mpv.sock \
  --script=/usr/local/lib/crt-tv/weather-break.lua \
  --loop-playlist=inf \
  --playlist=/run/crt-tv/playlist.m3u \
  "${RESUME_ARGS[@]}"
