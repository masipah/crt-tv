#!/usr/bin/env bash
# X client for the video player session — run by xinit from play-media.sh.
set -euo pipefail

xset s off -dpms || true

# After a weather break, `tv break` leaves a resume point (playlist index +
# seconds) so the video picks up where it left off. Mute is hardware-level
# (ALSA, see `tv mute`) and needs nothing here.
RESUME_ARGS=()
if [[ -f /run/crt-tv/resume ]]; then
  read -r pos start _ </run/crt-tv/resume || true
  rm -f /run/crt-tv/resume
  if [[ -n ${pos:-} ]]; then RESUME_ARGS+=("--playlist-start=$pos"); fi
  if [[ -n ${start:-} ]]; then RESUME_ARGS+=("--start=$start"); fi
fi
# Note: shuffle mode is baked into the playlist file by `tv play` — no
# --shuffle here, so the first entry is always what the user picked and
# weather-break resumes line up with the file.

# --volume=100: mpv's own softvol stays out of the way — the sink volume
# (remote slider / tv volume) is the one volume control
exec mpv \
  --fs \
  --volume=100 \
  --log-file=/run/crt-tv/mpv.log \
  --input-ipc-server=/run/crt-tv/mpv.sock \
  --script=/usr/local/lib/crt-tv/commercials.lua \
  --script=/usr/local/lib/crt-tv/loudness.lua \
  --loop-playlist=inf \
  --playlist=/run/crt-tv/playlist.m3u \
  "${RESUME_ARGS[@]}"
