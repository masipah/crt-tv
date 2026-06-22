#!/usr/bin/env bash
# Provision crt-tv on a Raspberry Pi 4 (Raspberry Pi OS Bookworm, Lite is fine).
# Run from the repo root on the Pi:  bash deploy/install.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "==> Installing system packages"
sudo apt-get update
sudo apt-get install -y \
  python3 python3-venv python3-pip \
  chromium-browser \
  xserver-xorg xinit x11-xserver-utils \
  curl

echo "==> Creating Python virtualenv"
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt

echo "==> Config file"
if [ ! -f config.toml ]; then
  cp config.example.toml config.toml
  echo "    created config.toml (edit your location + media dir)"
fi

chmod +x deploy/kiosk.sh web/display/assets/fetch-assets.sh

echo "==> Fetching WeatherStar 4000 fonts + icons (weather display)"
bash web/display/assets/fetch-assets.sh || echo "    (skipped — weather mode will use fallback fonts)"

echo "==> Installing systemd units"
# Run the services as the installing user, from this repo path (templates use
# __CRT_TV_USER__ / __CRT_TV_DIR__ placeholders).
RUN_USER="${SUDO_USER:-$(id -un)}"
echo "    user=$RUN_USER  dir=$REPO_DIR"
for unit in crt-tv.service crt-tv-kiosk.service; do
  sed -e "s|__CRT_TV_USER__|$RUN_USER|g" -e "s|__CRT_TV_DIR__|$REPO_DIR|g" \
    "deploy/$unit" | sudo tee "/etc/systemd/system/$unit" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable crt-tv crt-tv-kiosk
# restart (not just start) so re-running the installer picks up code updates
sudo systemctl restart crt-tv crt-tv-kiosk

cat <<'EOF'

==> Done.

Remaining manual step (one-off): enable composite NTSC video.
  Append deploy/config.txt.snippet to /boot/firmware/config.txt and reboot.
  (On the Pi 4 this disables HDMI — SSH in to manage from here on.)

Dashboard:    http://<pi-ip>:8000/         (pick modes, manage + upload videos)
Preview:      http://<pi-ip>:8000/preview   (simulated CRT, test before the TV)
Display app:  http://<pi-ip>:8000/display  (this is what the kiosk shows)

Logs:
  journalctl -u crt-tv -f
  journalctl -u crt-tv-kiosk -f
EOF
