#!/usr/bin/env bash
# Launched by weather-kiosk.service: waits for the weather server to answer,
# then starts a bare X session (no desktop) running Chromium fullscreen.
# X11 instead of a Wayland compositor on purpose: wlroots/cage refuse the
# interlaced modes (480i) that composite output offers, and hang trying.
set -euo pipefail

URL=${KIOSK_URL:-http://127.0.0.1:8080/}

# Force ws4kp/ws3kp kiosk mode: no location bar, no toolbar, display scaled
# to fill the screen (no scrollbars). Permalinks serialize the page's kiosk
# checkbox — usually kiosk=false — which would put the location bar on the
# TV, so strip any existing kiosk= parameter and set our own.
URL=$(printf '%s' "$URL" | sed -E 's/([?&])kiosk=[^&]*&?/\1/g; s/[?&]$//')
[[ $URL == *\?* ]] && URL="$URL&kiosk=true" || URL="$URL?kiosk=true"

echo "kiosk: launching $URL"

BROWSER=$(command -v chromium || command -v chromium-browser) || {
  echo "kiosk: chromium not installed" >&2
  exit 1
}
export URL BROWSER

# Chromium renders a permanent error page if the server isn't up yet.
tries=0
until curl -fsS --max-time 2 -o /dev/null "$URL"; do
  if ((tries % 15 == 0)); then
    echo "kiosk: waiting for $URL — check the ws4kp/ws3kp service if this repeats"
  fi
  tries=$((tries + 1))
  sleep 2
done

exec xinit /usr/local/lib/crt-tv/kiosk-x.sh -- :0 vt1 -nolisten tcp -nocursor
