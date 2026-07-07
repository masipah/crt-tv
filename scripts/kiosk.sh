#!/usr/bin/env bash
# Launched by weather-kiosk.service: waits for the weather server to answer,
# then runs Chromium fullscreen inside the cage Wayland compositor.
set -euo pipefail

URL=${KIOSK_URL:-http://127.0.0.1:8080/}

BROWSER=$(command -v chromium || command -v chromium-browser) || {
  echo "kiosk: chromium not installed" >&2
  exit 1
}

# Chromium renders a permanent error page if the server isn't up yet.
tries=0
until curl -fsS --max-time 2 -o /dev/null "$URL"; do
  if ((tries % 15 == 0)); then
    echo "kiosk: waiting for $URL — check the ws4kp/ws3kp service if this repeats"
  fi
  tries=$((tries + 1))
  sleep 2
done

# shellcheck disable=SC2086  # KIOSK_FLAGS is intentionally word-split
exec cage -- "$BROWSER" \
  --kiosk "$URL" \
  --ozone-platform=wayland \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  ${KIOSK_FLAGS:-}
