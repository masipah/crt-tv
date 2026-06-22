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

chmod +x deploy/kiosk.sh

echo "==> Installing systemd units"
sudo cp deploy/crt-tv.service /etc/systemd/system/
sudo cp deploy/crt-tv-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now crt-tv
sudo systemctl enable --now crt-tv-kiosk

cat <<'EOF'

==> Done.

Remaining manual step (one-off): enable composite NTSC video.
  Append deploy/config.txt.snippet to /boot/firmware/config.txt and reboot.
  (On the Pi 4 this disables HDMI — SSH in to manage from here on.)

Control app:  http://<pi-ip>:8000/
Display app:  http://<pi-ip>:8000/display  (this is what the kiosk shows)

Logs:
  journalctl -u crt-tv -f
  journalctl -u crt-tv-kiosk -f
EOF
