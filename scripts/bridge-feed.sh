#!/usr/bin/env bash
# Feeds the crt-bridge sink's monitor into OwnTone's pipe as raw PCM
# (S16LE 44.1kHz stereo — what OwnTone expects from library pipes).
# Started/stopped on demand (tv bridge start|stop) so OwnTone only holds
# the AirPlay receiver while the bridge output is actually in use.
set -euo pipefail

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
PIPE=/srv/owntone-pipe/CRT-TV

while :; do
  pw-record -P '{ stream.capture.sink = true }' --target crt-bridge \
    --format s16 --rate 44100 --channels 2 - >"$PIPE" || true
  sleep 2
done
