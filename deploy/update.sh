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

say "Refreshing weather fonts/icons"
bash web/display/assets/fetch-assets.sh || echo "    (skipped)"

say "Reinstalling services (in case they changed)"
RUN_USER="${SUDO_USER:-$(id -un)}"
for unit in crt-tv.service crt-tv-kiosk.service; do
  sed -e "s|__CRT_TV_USER__|$RUN_USER|g" -e "s|__CRT_TV_DIR__|$REPO_DIR|g" \
    "deploy/$unit" | sudo tee "/etc/systemd/system/$unit" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl restart crt-tv crt-tv-kiosk

say "Done — now running $(git rev-parse --short HEAD). Open http://$(hostname -I | awk '{print $1}'):8000/"
