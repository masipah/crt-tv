#!/usr/bin/env bash
# Runs mpv straight to KMS on the composite connector (started by
# crt-player.service). The Pi 4 exposes two DRM cards — v3d (render-only, no
# connectors) and vc4 (the display) — and their numbering varies by boot, so
# find the one that owns Composite-1 instead of trusting mpv's card0 default.
set -euo pipefail

DEV=""
for c in /sys/class/drm/card*-Composite-1; do
  [[ -e $c ]] || continue
  card=$(basename "$c")
  DEV=/dev/dri/${card%-Composite-1}
done
if [[ -z $DEV ]]; then
  echo "play-media: no Composite-1 connector found; is composite enabled?" >&2
  exit 1
fi
echo "play-media: using $DEV (Composite-1)"

# --vo=gpu,drm: try GL first, fall back to the plain DRM framebuffer VO —
# more than enough for 480p onto a 480i screen.
exec mpv \
  --fs \
  --vo=gpu,drm \
  --gpu-context=drm \
  --drm-device="$DEV" \
  --drm-connector=Composite-1 \
  --input-ipc-server=/run/crt-tv/mpv.sock \
  --loop-playlist=inf \
  --playlist=/run/crt-tv/playlist.m3u
