#!/usr/bin/env bash
# X client for the video player session — run by xinit from play-media.sh.
set -euo pipefail

xset s off -dpms || true

# After a weather break, `tv break` leaves a resume point (playlist index +
# seconds) so the video picks up where it left off. Mute lives in PipeWire
# (see `tv mute`) and needs nothing here.
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

# Starting while the output is already AirPlay: shift video to match the
# buffering for lip-sync (AIRPLAY_LATENCY_MS / OWNTONE_LATENCY_MS in
# crt-tv.env; the OwnTone bridge buffers ~2s and can't report it)
sink_info=$(wpctl inspect @DEFAULT_AUDIO_SINK@ 2>/dev/null || true)
if grep -q 'crt-bridge' <<<"$sink_info"; then
  ap_sec=$(awk "BEGIN { printf \"%.3f\", ${OWNTONE_LATENCY_MS:-2000} / 1000 }")
  RESUME_ARGS+=("--audio-delay=-$ap_sec")
elif grep -qi 'raop' <<<"$sink_info"; then
  ap_sec=$(awk "BEGIN { printf \"%.3f\", ${AIRPLAY_LATENCY_MS:-0} / 1000 }")
  RESUME_ARGS+=("--audio-delay=-$ap_sec")
fi

# --volume=100: mpv's own softvol stays out of the way — the sink volume
# (remote slider / tv volume) is the one volume control
# --monitoraspect=4:3: the 720x480 raster displays as 4:3 on the CRT
# (non-square pixels) — without this mpv assumes square pixels and
# squeezes everything ~7%
# --panscan: 16:9 videos zoom to fill the 4:3 screen, cropping the sides
# (center-cut, like broadcast). CRT_PANSCAN=0 in crt-tv.env letterboxes.
exec mpv \
  --fs \
  --volume=100 \
  --monitoraspect=4:3 \
  --panscan="${CRT_PANSCAN:-1.0}" \
  --log-file=/run/crt-tv/mpv.log \
  --input-ipc-server=/run/crt-tv/mpv.sock \
  --script=/usr/local/lib/crt-tv/commercials.lua \
  --script=/usr/local/lib/crt-tv/loudness.lua \
  --script=/usr/local/lib/crt-tv/metadata.lua \
  --loop-playlist=inf \
  --playlist=/run/crt-tv/playlist.m3u \
  "${RESUME_ARGS[@]}"
