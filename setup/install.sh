#!/usr/bin/env bash
# crt-tv initial provisioning; use setup/update.sh for app-only updates:
#   curl -fsSL https://raw.githubusercontent.com/masipah/crt-tv/main/setup/install.sh | sudo bash
# It syncs /opt/crt-tv to the latest main and installs from there.
# Developers with their own checkout elsewhere: sudo setup/install.sh installs
# from that checkout as-is (no sync).
set -euo pipefail

CRT_TV_REPO=https://github.com/masipah/crt-tv

if [[ $EUID -ne 0 ]]; then
  echo "install.sh: run with sudo" >&2
  exit 1
fi

# Where am I running from? Piped from curl there is no script file at all —
# never guess from the working directory (that's how a stale /opt/crt-tv once
# masqueraded as the source and the self-update silently skipped).
SELF=${BASH_SOURCE[0]:-}
REPO_DIR=''
[[ -f $SELF ]] && REPO_DIR=$(cd "$(dirname "$SELF")/.." && pwd)

# Piped from curl, or running from the appliance's managed clone: sync
# /opt/crt-tv to the latest main first and re-exec from it. fetch+reset
# rather than pull so a rewritten upstream history can't break the
# self-update (no local edits are expected in /opt/crt-tv). The env guard
# keeps the re-exec from syncing forever.
if [[ -z ${CRT_TV_SYNCED:-} ]] && [[ -z $REPO_DIR || $REPO_DIR == /opt/crt-tv ]]; then
  echo "==> Syncing /opt/crt-tv to latest main"
  command -v git >/dev/null 2>&1 || { apt-get update; apt-get install -y git; }
  if [[ -d /opt/crt-tv/.git ]]; then
    git -C /opt/crt-tv fetch origin
    git -C /opt/crt-tv reset --hard origin/main
  else
    git clone "$CRT_TV_REPO" /opt/crt-tv
  fi
  CRT_TV_SYNCED=1 exec /opt/crt-tv/setup/install.sh
fi

# Capture display state before provisioning restarts any service.
display_mode=off
if systemctl is-active --quiet crt-player.service; then display_mode=player
elif systemctl is-active --quiet weather-kiosk.service; then display_mode=kiosk
elif [[ $(systemctl show crt-player.service -p LoadState --value) == not-found ]]; then display_mode=boot
fi

# Retire old network-audio components before apt reads their repository.
bash "$REPO_DIR/setup/migrate.sh"

echo "==> Installing packages"
apt-get update || true
apt-get install -y git curl nodejs npm mpv ffmpeg socat alsa-utils \
  xserver-xorg xserver-xorg-legacy xinit x11-utils x11-xserver-utils
# Package name differs between Debian (chromium) and some RPi OS builds.
# Install once and leave it alone: re-runs must not upgrade the browser (a
# working kiosk beats a fresh Chromium, and upgrades mid-run risk the SD card)
if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1; then
  apt-get install -y chromium || apt-get install -y chromium-browser
fi

# Let the crt service user start X on tty1 without being root
printf 'allowed_users=anybody\nneeds_root_rights=yes\n' > /etc/X11/Xwrapper.config

# The kiosk runs Chromium under en_US so the WeatherStar clock is 12-hour
# AM/PM; make sure the locale actually exists (RPi OS ships en_GB only)
if ! locale -a 2>/dev/null | grep -qi '^en_US.utf-\?8$'; then
  sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen
  locale-gen || true
fi

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
  # Keep the tested installed revision unless an explicit revision is supplied.
else
  install -d -o crt -g crt /opt/ws4kp
  sudo -u crt git clone https://github.com/netbymatt/ws4kp /opt/ws4kp
fi
install -d /etc/crt-tv
ws_revision=${WS4KP_REVISION:-$(cat /etc/crt-tv/ws4kp-revision 2>/dev/null || true)}
ws_revision=${ws_revision:-$(sudo -u crt git -C /opt/ws4kp rev-parse HEAD)}
[[ $ws_revision =~ ^[a-fA-F0-9]{40}$ ]] || { echo 'WS4KP_REVISION must be a full commit SHA' >&2; exit 1; }
if ! sudo -u crt git -C /opt/ws4kp cat-file -e "$ws_revision^{commit}" 2>/dev/null; then
  sudo -u crt git -C /opt/ws4kp fetch origin "$ws_revision"
fi
sudo -u crt git -C /opt/ws4kp reset --hard "$ws_revision"
(cd /opt/ws4kp && sudo -u crt npm ci --no-audit --no-fund)
printf '%s\n' "$ws_revision" >/etc/crt-tv/ws4kp-revision

echo "==> Hardening for hard power-off"
# This appliance gets unplugged, not shut down. ext4's journal plus the
# fsck.repair=yes already on the kernel command line survive that fine —
# as long as the SD card isn't mid-write. So: minimize steady-state writes.

# Logs to RAM — the journal is the biggest constant writer on an idle kiosk.
# Logs reset each boot; tv doctor only reads the current boot anyway.
install -d /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/crt-tv.conf <<'EOF'
[Journal]
Storage=volatile
RuntimeMaxUse=32M
EOF
systemctl restart systemd-journald

# No swapfile: swap writes at unpredictable times, and the weather/video
# workload fits easily in the Pi 4's RAM
systemctl disable --now dphys-swapfile.service 2>/dev/null || true
swapoff -a 2>/dev/null || true
rm -f /var/swap

# Unattended apt runs write heavily at random times; updates happen through
# install.sh re-runs instead
systemctl disable --now apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || true

echo "==> Enabling analog audio out (TRRS jack)"
amixer -M -q -c Headphones sset PCM 75% 2>/dev/null \
  || amixer -M -q sset Headphone 75% 2>/dev/null \
  || amixer -M -q sset PCM 75% 2>/dev/null || true
alsactl store 2>/dev/null || true

echo "==> Restoring appliance startup settings"
bash "$REPO_DIR/setup/fast-boot.sh"

CRT_PROVISION=1 bash "$REPO_DIR/setup/deploy.sh" "$display_mode"

echo "==> HTTPS for the web remote (Let's Encrypt via Cloudflare DNS-01)"
# Opt-in: needs HTTPS_DOMAIN in /etc/crt-tv/crt-tv.env and a Cloudflare
# API token in /etc/crt-tv/cloudflare.ini (setup/cloudflare.ini.example).
# DNS-01 proves ownership with a TXT record in the public zone, so the
# hostname itself can stay on local DNS (the router) pointing at a LAN IP
# — nothing is exposed to the internet and no port-forward is involved.
https_domain=$(sed -n 's/^HTTPS_DOMAIN=//p' /etc/crt-tv/crt-tv.env 2>/dev/null | tail -n1 | tr -d '"')
cf_ini=/etc/crt-tv/cloudflare.ini
if [[ -n $https_domain && -f $cf_ini ]]; then
  chmod 600 "$cf_ini"
  apt-get install -y nginx certbot python3-certbot-dns-cloudflare
  if [[ ! -s /etc/letsencrypt/live/$https_domain/fullchain.pem ]]; then
    le_email=$(sed -n 's/^LETSENCRYPT_EMAIL=//p' /etc/crt-tv/crt-tv.env 2>/dev/null | tail -n1 | tr -d '"')
    email_args=(--register-unsafely-without-email)
    if [[ -n $le_email ]]; then
      email_args=(-m "$le_email" --no-eff-email)
    fi
    certbot certonly --non-interactive --agree-tos "${email_args[@]}" \
      --dns-cloudflare --dns-cloudflare-credentials "$cf_ini" \
      -d "$https_domain" || true
  fi
  if [[ -s /etc/letsencrypt/live/$https_domain/fullchain.pem ]]; then
    # the certbot package's systemd timer renews on its own; this hook
    # hands each fresh certificate to nginx
    install -d /etc/letsencrypt/renewal-hooks/deploy
    printf '#!/bin/sh\nsystemctl reload nginx\n' >/etc/letsencrypt/renewal-hooks/deploy/crt-tv-nginx
    chmod 755 /etc/letsencrypt/renewal-hooks/deploy/crt-tv-nginx
    remote_port=$(sed -n 's/^CRT_REMOTE_PORT=//p' /etc/crt-tv/crt-tv.env | tail -n1)
    remote_port=${remote_port:-8090}
    [[ $remote_port =~ ^[0-9]+$ ]] && ((remote_port > 0 && remote_port < 65536)) || { echo 'Invalid CRT_REMOTE_PORT' >&2; exit 1; }
    sed -e "s/__DOMAIN__/$https_domain/g" -e "s/__PORT__/$remote_port/g" "$REPO_DIR/setup/nginx-crt-tv.conf" \
      >/etc/nginx/sites-available/crt-tv
    ln -sf /etc/nginx/sites-available/crt-tv /etc/nginx/sites-enabled/crt-tv
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl enable --now nginx
    systemctl reload nginx
    echo "  https://$https_domain/ -> 127.0.0.1:8090"
  else
    echo "!! no certificate for $https_domain — issuance failed; check the"
    echo "!! token in $cf_ini and /var/log/letsencrypt/letsencrypt.log"
  fi
else
  echo "  skipped — set HTTPS_DOMAIN in /etc/crt-tv/crt-tv.env and create"
  echo "  $cf_ini (from setup/cloudflare.ini.example) to enable"
fi

echo "==> Configuring composite video output (480i NTSC)"
"$REPO_DIR/setup/enable-composite.sh"

cat <<'EOF'

Done. Reboot to switch output from HDMI to composite:

  sudo reboot

The PVM should show the MASIPAH loader followed by Channel. Control with `tv`
(tv weather / tv play <file> / tv status) or from a browser
on your network:  http://<this-pi>:8090/
EOF
