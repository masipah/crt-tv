#!/usr/bin/env bash
# crt-tv installer — run once on the Pi with sudo. Either from a checkout:
#   sudo setup/install.sh
# or straight from GitHub (clones itself to /opt/crt-tv):
#   curl -fsSL https://raw.githubusercontent.com/masipah/crt-tv/main/setup/install.sh | sudo bash
# Idempotent: safe to re-run after a git pull to pick up changes.
set -euo pipefail

CRT_TV_REPO=https://github.com/masipah/crt-tv

if [[ $EUID -ne 0 ]]; then
  echo "install.sh: run with sudo" >&2
  exit 1
fi

REPO_DIR=$(cd "$(dirname "$0")/.." 2>/dev/null && pwd || echo /nonexistent)

# Piped from curl (or run outside a checkout): fetch the repo and re-exec
if [[ ! -f $REPO_DIR/systemd/ws4kp.service ]]; then
  echo "==> Not running from a checkout — cloning to /opt/crt-tv"
  apt-get update
  apt-get install -y git
  if [[ -d /opt/crt-tv/.git ]]; then
    git -C /opt/crt-tv pull --ff-only
  else
    git clone "$CRT_TV_REPO" /opt/crt-tv
  fi
  exec /opt/crt-tv/setup/install.sh
fi

echo "==> Installing packages"
apt-get update
apt-get install -y git curl nodejs npm mpv socat alsa-utils \
  xserver-xorg xserver-xorg-legacy xinit x11-xserver-utils
# Package name differs between Debian (chromium) and some RPi OS builds
apt-get install -y chromium || apt-get install -y chromium-browser

# Let the crt service user start X on tty1 without being root
printf 'allowed_users=anybody\nneeds_root_rights=yes\n' > /etc/X11/Xwrapper.config

echo "==> Creating service user 'crt'"
if ! id crt &>/dev/null; then
  useradd --create-home --shell /bin/bash crt
fi
usermod -aG video,render,input,audio,tty crt

echo "==> Installing WeatherStar 4000+ to /opt/ws4kp"
# Everything as the crt user: git refuses to touch crt-owned repos as root
# ("dubious ownership"), and the service runs as crt anyway.
if [[ -d /opt/ws4kp/.git ]]; then
  chown -R crt:crt /opt/ws4kp
  sudo -u crt git -C /opt/ws4kp pull --ff-only
else
  install -d -o crt -g crt /opt/ws4kp
  sudo -u crt git clone https://github.com/netbymatt/ws4kp /opt/ws4kp
fi
(cd /opt/ws4kp && sudo -u crt npm install --no-audit --no-fund)

# Retired: WeatherStar 3000+ was removed from this project
if [[ -f /etc/systemd/system/ws3kp.service || -d /opt/ws3kp ]]; then
  echo "==> Removing retired WeatherStar 3000+"
  systemctl disable --now ws3kp.service 2>/dev/null || true
  rm -f /etc/systemd/system/ws3kp.service
  rm -rf /opt/ws3kp
fi

echo "==> Enabling analog audio out (TRRS jack)"
amixer -q sset Headphone 100% unmute 2>/dev/null \
  || amixer -q sset PCM 100% unmute 2>/dev/null || true
alsactl store 2>/dev/null || true

echo "==> Installing config, scripts, and systemd units"
install -d /etc/crt-tv
if [[ ! -f /etc/crt-tv/crt-tv.env ]]; then
  install -m 644 "$REPO_DIR/setup/crt-tv.env" /etc/crt-tv/crt-tv.env
fi

install -m 644 "$REPO_DIR/setup/tmpfiles-crt-tv.conf" /etc/tmpfiles.d/crt-tv.conf
systemd-tmpfiles --create /etc/tmpfiles.d/crt-tv.conf

install -d /usr/local/lib/crt-tv
install -m 755 "$REPO_DIR/scripts/kiosk.sh" /usr/local/lib/crt-tv/kiosk.sh
install -m 755 "$REPO_DIR/scripts/kiosk-x.sh" /usr/local/lib/crt-tv/kiosk-x.sh
install -m 755 "$REPO_DIR/scripts/play-media.sh" /usr/local/lib/crt-tv/play-media.sh
install -m 755 "$REPO_DIR/scripts/tv" /usr/local/bin/tv

echo "==> Installing web remote"
install -d /usr/local/lib/crt-tv/remote/public
install -m 644 "$REPO_DIR/remote/server.mjs" /usr/local/lib/crt-tv/remote/server.mjs
install -m 644 "$REPO_DIR/remote/public/index.html" /usr/local/lib/crt-tv/remote/public/index.html

# The remote runs unprivileged as 'crt'; this lets it (and the crt user
# generally) run the tv command without a password.
visudo -cf "$REPO_DIR/setup/sudoers-crt-tv"
install -m 440 "$REPO_DIR/setup/sudoers-crt-tv" /etc/sudoers.d/crt-tv

install -m 644 "$REPO_DIR"/systemd/*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable ws4kp.service weather-kiosk.service crt-remote.service
systemctl restart ws4kp.service crt-remote.service
# Restart the kiosk too so display-stack changes take effect on re-runs
systemctl restart weather-kiosk.service

install -d -m 775 -o crt -g crt /srv/media

echo "==> Configuring composite video output (480i NTSC)"
"$REPO_DIR/setup/enable-composite.sh"

cat <<'EOF'

Done. Reboot to switch output from HDMI to composite:

  sudo reboot

The PVM should come up with the WeatherStar 4000+. Control with `tv`
(tv weather / tv play <file> / tv status) or from a browser
on your network:  http://<this-pi>:8090/
EOF
