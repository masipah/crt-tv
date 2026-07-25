#!/usr/bin/env bash
# Launched by weather-kiosk.service: waits for the page to answer, then
# starts a bare X session (no desktop) running Chromium fullscreen. It shows
# whatever KIOSK_URL names — the WeatherStar, or the oscilloscope channel
# served by the web remote (`tv scope`).
# X11 instead of a Wayland compositor on purpose: wlroots/cage refuse the
# interlaced modes (480i) that composite output offers, and hang trying.
set -euo pipefail

URL=${KIOSK_URL:-http://127.0.0.1:8080/}

# Where the weather is: a ws4kp search string (ZIP code, or "City, ST"),
# default San Francisco 94102. Forced on every launch — the location belongs
# to the appliance, not to whatever a browser profile remembers or an old
# permalink still carries, so the TV can't drift to another city behind our
# backs. Override with KIOSK_LOCATION in /etc/crt-tv/crt-tv.env.
WS4KP_LOCATION=${KIOSK_LOCATION:-94102}
# Coordinates for the default, so the usual case needs no geocoder round-trip
# at startup; any other location is geocoded by ws4kp itself. Percent-encoded
# because latLon carries JSON, whose quotes wouldn't survive the env file.
WS4KP_LATLON=${KIOSK_LATLON:-}
if [[ -z $WS4KP_LATLON && $WS4KP_LOCATION == 94102 ]]; then
  WS4KP_LATLON='%7B%22lat%22%3A37.7815%2C%22lon%22%3A-122.4167%7D'
fi

# How much of the raster the CRT actually shows. Composite overscan crops the
# outer few percent, which eats the WeatherStar's bottom scroll; the PVM's
# UNDERSCAN button is the manual fix (and leaves black borders), this is the
# automatic one — the page is scaled to this fraction and stays centred, so
# the whole picture lands inside the visible area. 1 = no compensation.
KIOSK_FIT=${KIOSK_FIT:-0.90}

# ws4kp-only URL surgery. Other pages the kiosk shows (the oscilloscope)
# take no parameters and are launched exactly as given; ws4kp lives on
# :8080 here, the same test `tv weather` uses on a configured KIOSK_URL.
if [[ $URL == *:8080* ]]; then
  # Force ws4kp kiosk mode: no location bar, no toolbar, display scaled to
  # fill the screen (no scrollbars). Permalinks serialize the page's kiosk
  # checkbox — usually kiosk=false — which would put the location bar on the
  # TV, so strip any existing kiosk= parameter and set our own.
  URL=$(printf '%s' "$URL" | sed -E 's/([?&])kiosk=[^&]*&?/\1/g; s/[?&]$//')
  [[ $URL == *\?* ]] && URL="$URL&kiosk=true" || URL="$URL?kiosk=true"

  # Background music (ws4kp ships default tracks; audio rides the same TRRS
  # jack as the video). Forced on the same way; KIOSK_MUSIC=off disables.
  # mediaVolume is pinned to 1 (100%) — ws4kp defaults to 0.75, which made
  # the weather quieter than the videos; the remote's slider is the one
  # volume control.
  if [[ ${KIOSK_MUSIC:-on} != off ]]; then
    URL=$(printf '%s' "$URL" | sed -E 's/([?&])mediaPlaying=[^&]*&?/\1/g; s/[?&]$//')
    URL=$(printf '%s' "$URL" | sed -E 's/([?&])mediaVolume=[^&]*&?/\1/g; s/[?&]$//')
    URL="$URL&mediaPlaying=true&mediaVolume=1"
  fi

  # Location last, and forced: strip whatever the URL carries (a permalink
  # serializes the location it was made at) and append ours. A search string
  # alone is enough — ws4kp geocodes it in place, no redirect — and the
  # coordinates, when we have them, skip that lookup entirely.
  URL=$(printf '%s' "$URL" | sed -E 's/([?&])latLonQuery=[^&]*&?/\1/g; s/([?&])latLon=[^&]*&?/\1/g; s/[?&]$//')
  # a city-style location needs its spaces and commas encoded
  URL="$URL&latLonQuery=$(printf '%s' "$WS4KP_LOCATION" | sed 's/ /%20/g; s/,/%2C/g')"
  if [[ -n $WS4KP_LATLON ]]; then
    URL="$URL&latLon=$WS4KP_LATLON"
  fi
fi

# Overscan compensation, read by the kiosk-fit extension on ws4kp pages and by
# the oscilloscope page. Our own parameter; anything else ignores it.
[[ $URL == *\?* ]] && URL="$URL&crtFit=$KIOSK_FIT" || URL="$URL?crtFit=$KIOSK_FIT"

# Wait briefly for the audio graph so Chromium binds to PipeWire instead of
# falling back to raw ALSA (which AirPlay routing can't touch). Non-fatal —
# worst case the weather comes up with jack-only audio.
tries=0
while [[ ! -S ${XDG_RUNTIME_DIR:-/nonexistent}/pulse/native ]] && ((tries < 20)); do
  tries=$((tries + 1))
  sleep 0.5
done

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
    echo "kiosk: waiting for $URL — check the ws4kp service if this repeats"
  fi
  tries=$((tries + 1))
  sleep 2
done

exec xinit /usr/local/lib/crt-tv/kiosk-x.sh -- :0 vt1 -nolisten tcp -nocursor
