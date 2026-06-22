#!/usr/bin/env bash
# Fetch the WeatherStar 4000 background music into web/display/assets/audio/.
#
# Source: the vbguyny/ws4kp project (https://github.com/vbguyny/ws4kp), Audio/.
# ~90 tracks, ~160 MB. This is OPT-IN and the files are NOT committed to git.
#
# COPYRIGHT: this is the smooth-jazz music used by the original Weather Channel
# WeatherStar 4000, copyrighted by the respective artists/labels. It is fetched
# here for PERSONAL, NON-COMMERCIAL use only, mirroring ws4kp. Do not redistribute.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
mkdir -p audio

API="https://api.github.com/repos/vbguyny/ws4kp/contents/Audio"

echo "==> listing tracks from vbguyny/ws4kp"
# Music tracks only — skip tiny effect clips (beeps etc.) by filtering on size.
urls="$(curl -fsSL "$API" | python3 -c "
import sys, json
for f in json.load(sys.stdin):
    n = f.get('name', '').lower()
    if n.endswith(('.mp3', '.m4a', '.ogg')) and f.get('size', 0) > 100000:
        print(f['download_url'])
")"

count="$(printf '%s\n' "$urls" | grep -c . || true)"
echo "==> downloading $count tracks into $(pwd)/audio (~160 MB)"
printf '%s\n' "$urls" | while read -r url; do
  [ -n "$url" ] || continue
  name="$(basename "$url")"
  if [ -f "audio/$name" ]; then
    echo "    have $name"
    continue
  fi
  echo "    $name"
  curl -fsSL "$url" -o "audio/$name"
done

echo "==> done. Weather mode will now play this music ([weather] music = true)."
