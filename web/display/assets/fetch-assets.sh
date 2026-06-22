#!/usr/bin/env bash
# Fetch the WeatherStar 4000 fonts + current-conditions icons used by the
# weather display. These are TWCClassics assets vendored in the ws4kp project
# (github.com/netbymatt/ws4kp, MIT) — see CREDITS.md. They are NOT committed to
# this repo; run this once after cloning to get the authentic look. The weather
# display falls back to monospace + text labels if you skip this.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
RAW="https://raw.githubusercontent.com/netbymatt/ws4kp/main/server"

mkdir -p fonts icons/current-conditions

echo "==> fonts"
for f in "Star4000.woff" "Star4000 Large.woff" "Star4000 Extended.woff" "Star4000 Small.woff"; do
  echo "    $f"
  curl -fsSL "$RAW/fonts/${f// /%20}" -o "fonts/$f"
done

echo "==> current-conditions icons"
ICONS=(
  Blowing-Snow Clear Cloudy Fog Freezing-Rain-Snow Freezing-Rain Heavy-Snow
  Light-Snow Mostly-Clear No-Data Partly-Cloudy Rain-Sleet Rain-Snow Rain
  Scattered-Thunderstorms-Day Scattered-Thunderstorms-Night Shower Sleet Smoke
  Snow-Sleet Sunny Thunderstorm Windy
)
for i in "${ICONS[@]}"; do
  echo "    $i.gif"
  curl -fsSL "$RAW/images/icons/current-conditions/$i.gif" -o "icons/current-conditions/$i.gif"
done

echo "==> done. Weather mode will now use the WeatherStar 4000 fonts + icons."
