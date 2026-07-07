#!/usr/bin/env bash
# crt-tv installer — run once on the Pi with sudo, from the repo checkout:
#   sudo setup/install.sh
# Idempotent: safe to re-run after a git pull to pick up changes.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "install.sh: run with sudo" >&2
  exit 1
fi

REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)

echo "==> Installing packages"
apt-get update
apt-get install -y git curl nodejs npm mpv cage socat alsa-utils
# Package name differs between Debian (chromium) and some RPi OS builds
apt-get install -y chromium || apt-get install -y chromium-browser

echo "==> Creating service user 'crt'"
if ! id crt &>/dev/null; then
  useradd --create-home --shell /bin/bash crt
fi
usermod -aG video,render,input,audio,tty crt

echo "==> Installing WeatherStar servers to /opt"
for app in ws4kp ws3kp; do
  if [[ -d /opt/$app/.git ]]; then
    git -C "/opt/$app" pull --ff-only
  else
    git clone "https://github.com/netbymatt/$app" "/opt/$app"
  fi
  (cd "/opt/$app" && npm install --no-audit --no-fund)
  chown -R crt:crt "/opt/$app"
done

echo "==> Installing config, scripts, and systemd units"
install -d /etc/crt-tv
if [[ ! -f /etc/crt-tv/crt-tv.env ]]; then
  install -m 644 "$REPO_DIR/setup/crt-tv.env" /etc/crt-tv/crt-tv.env
fi

install -m 644 "$REPO_DIR/setup/tmpfiles-crt-tv.conf" /etc/tmpfiles.d/crt-tv.conf
systemd-tmpfiles --create /etc/tmpfiles.d/crt-tv.conf

install -d /usr/local/lib/crt-tv
install -m 755 "$REPO_DIR/scripts/kiosk.sh" /usr/local/lib/crt-tv/kiosk.sh
install -m 755 "$REPO_DIR/scripts/tv" /usr/local/bin/tv

install -m 644 "$REPO_DIR"/systemd/*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable ws4kp.service ws3kp.service weather-kiosk.service

install -d -m 775 -o crt -g crt /srv/media

echo "==> Configuring composite video output (480i NTSC)"
"$REPO_DIR/setup/enable-composite.sh"

cat <<'EOF'

Done. Reboot to switch output from HDMI to composite:

  sudo reboot

The PVM should come up with the WeatherStar 4000+. Control with `tv`
(tv weather / tv retro / tv play <file> / tv status).
EOF
