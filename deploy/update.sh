#!/usr/bin/env bash
# Update an existing crt-tv install to the latest version on GitHub and restart.
# Faster than re-running the full installer (skips apt). Run on the Pi:
#
#   bash ~/crt-tv/deploy/update.sh
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

say "Fetching the latest version"
git fetch --depth 1 origin main
git reset --hard origin/main

say "Updating Python packages"
./.venv/bin/pip install -q -r requirements.txt

say "Refreshing weather assets (fonts/icons + backgrounds)"
bash web/display/assets/fetch-assets.sh || echo "    (skipped)"
bash web/display/assets/fetch-backgrounds.sh || echo "    (skipped)"

say "Setting up ws4kp (the real WeatherStar 4000+, via Docker)"
if bash deploy/ws4kp.sh; then
  if grep -q '^weather_engine' config.toml 2>/dev/null; then
    sed -i 's/^weather_engine.*/weather_engine = "ws4kp"/' config.toml
  else
    printf '\nweather_engine = "ws4kp"\n' >> config.toml
  fi
  echo "    weather_engine = ws4kp"
else
  echo "    (ws4kp setup failed — keeping the current weather engine)"
fi

say "Reinstalling services (in case they changed)"
RUN_USER="${SUDO_USER:-$(id -un)}"
for unit in crt-tv.service crt-tv-kiosk.service; do
  sed -e "s|__CRT_TV_USER__|$RUN_USER|g" -e "s|__CRT_TV_DIR__|$REPO_DIR|g" \
    "deploy/$unit" | sudo tee "/etc/systemd/system/$unit" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl restart crt-tv crt-tv-kiosk

say "Done — now running $(git rev-parse --short HEAD). Open http://$(hostname -I | awk '{print $1}'):8000/"
