#!/usr/bin/env bash
# Plays the queued playlist with mpv inside a bare X session on the composite
# output (started by crt-player.service). X for the same reason as the kiosk:
# it sets the interlaced 480i mode reliably, where both wlroots and mpv's
# direct-KMS output misbehave (see docs/composite-video.md).
set -euo pipefail

exec xinit /usr/local/lib/crt-tv/play-media-x.sh -- :0 vt1 -nolisten tcp -nocursor
