#!/usr/bin/env bash
# X client for the kiosk session — run by xinit from kiosk.sh, which exports
# URL and BROWSER.
set -euo pipefail

# Never blank a weather display (the PVM has no DPMS to speak of anyway)
xset s off -dpms || true

# en-US locale: RPi OS defaults to en_GB, which makes ws4kp's clock render
# 24-hour; the authentic WeatherStar clock is 12-hour AM/PM. On Linux,
# Chromium ignores --lang and reads the locale from the environment.
export LANGUAGE=en_US:en LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

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
