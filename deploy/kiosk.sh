#!/usr/bin/env bash
# Launch Chromium full-screen, pointed at the local display app.
# Run under an X session via crt-tv-kiosk.service (which wraps this in xinit).
set -euo pipefail

URL="${CRT_TV_DISPLAY_URL:-http://localhost:8000/display}"

# Wait until the control service is actually serving before opening the page.
until curl -sf "http://localhost:8000/api/health" >/dev/null 2>&1; do
  sleep 1
done

# Blank the cursor and stop the screen blanking / DPMS (no-op on composite,
# but harmless and useful if you ever test on HDMI).
xset -dpms || true
xset s off || true
xset s noblank || true

# Pick whichever chromium binary exists on this image.
CHROMIUM="$(command -v chromium-browser || command -v chromium)"

exec "$CHROMIUM" \
  --kiosk \
  --app="$URL" \
  --no-first-run \
  --noerrordialogs \
  --disable-infobars \
  --disable-translate \
  --disable-features=TranslateUI \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  --overscroll-history-navigation=0 \
  --window-position=0,0
