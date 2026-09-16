#!/usr/bin/env bash
# snd-aloop's playback device 0 appears on capture device 1. No desktop audio
# daemon, global output changes, or second media decoder is needed.
set -euo pipefail
exec arecord -q -D hw:CARD=Loopback,DEV=1,SUBDEV=0 \
  -t raw -f S16_LE -r 44100 -c 2 > /srv/owntone-pipe/CRT-TV
