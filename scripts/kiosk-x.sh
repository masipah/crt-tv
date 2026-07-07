#!/usr/bin/env bash
# X client for the kiosk session — run by xinit from kiosk.sh, which exports
# URL and BROWSER.
set -euo pipefail

# Never blank a weather display (the PVM has no DPMS to speak of anyway)
xset s off -dpms || true

# shellcheck disable=SC2086  # KIOSK_FLAGS is intentionally word-split
exec "$BROWSER" \
  --kiosk "$URL" \
  --window-position=0,0 \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  ${KIOSK_FLAGS:-}
