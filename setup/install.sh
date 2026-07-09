#!/usr/bin/env bash
# crt-tv installer — install AND update, always via the same one-liner:
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

echo "==> Installing packages"
# Heal a half-configured OwnTone repo from a previous failed run — a list
# without its key breaks every apt update from then on
if [[ -f /etc/apt/sources.list.d/owntone.list ]] &&
  [[ ! -s /usr/share/keyrings/owntone-archive-keyring.gpg ]]; then
  rm -f /etc/apt/sources.list.d/owntone.list
fi
apt-get update || true
apt-get install -y git curl nodejs npm mpv ffmpeg socat alsa-utils \
  xserver-xorg xserver-xorg-legacy xinit x11-xserver-utils
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
# Address the card directly: once pipewire-alsa is installed, the default
# ALSA control no longer points at the hardware
amixer -q -c Headphones sset PCM 100% unmute 2>/dev/null \
  || amixer -q sset Headphone 100% unmute 2>/dev/null \
  || amixer -q sset PCM 100% unmute 2>/dev/null || true
alsactl store 2>/dev/null || true

echo "==> Audio routing (PipeWire + AirPlay out)"
# PipeWire carries chromium (via its pulse interface) and mpv; the RAOP
# module turns AirPlay receivers on the LAN into ordinary output sinks.
# pipewire-alsa matters: chromium falls back to raw ALSA when the pulse
# socket isn't ready at launch, and raw ALSA bypasses the graph entirely —
# with it installed, even that fallback routes through PipeWire (and thus
# follows the AirPlay/jack output selection).
apt-get install -y pipewire pipewire-pulse pipewire-alsa wireplumber dbus-user-session avahi-daemon rtkit

# Realtime scheduling for the audio stack: RAOP packet pacing is
# timer-driven and starves under CPU load without RT priority (Chromium +
# mpv contend), which kills AirPlay sessions after ~30s ("missing
# timeout" → broken pipe). Lite has no desktop session setup, so grant
# the headroom to user managers directly. Takes effect on reboot.
install -d /etc/systemd/system/user@.service.d
cat >/etc/systemd/system/user@.service.d/crt-tv-rt.conf <<'EOF'
[Service]
LimitRTPRIO=95
LimitMEMLOCK=infinity
EOF
systemctl daemon-reload
install -d /etc/pipewire/pipewire.conf.d
install -m 644 "$REPO_DIR/setup/pipewire-airplay.conf" /etc/pipewire/pipewire.conf.d/50-crt-tv-airplay.conf
install -d /etc/wireplumber/wireplumber.conf.d
install -m 644 "$REPO_DIR/setup/wireplumber-crt-tv.conf" /etc/wireplumber/wireplumber.conf.d/50-crt-tv.conf
# Audio belongs to the crt user ALONE. Debian ships the pipewire/wireplumber
# user units enabled for every user, so any other login — an admin ssh'ing
# in — silently spawns a second session manager that fights crt's for the
# ALSA card and resets sink volumes to 100% on every grab. That was heard
# as the TV's volume jumping whenever someone was logged in over ssh.
for u in pipewire.service pipewire.socket pipewire-pulse.service \
  pipewire-pulse.socket wireplumber.service; do
  install -d "/etc/systemd/user/$u.d"
  printf '[Unit]\nConditionUser=crt\n' >"/etc/systemd/user/$u.d/crt-tv.conf"
done
# crt's user manager (which hosts pipewire) must run from boot, sessions or not
loginctl enable-linger crt 2>/dev/null || true
crt_uid=$(id -u crt)
sudo -u crt XDG_RUNTIME_DIR="/run/user/$crt_uid" \
  systemctl --user restart pipewire pipewire-pulse wireplumber 2>/dev/null || true
# Level the field: every output at 100% (the remote's slider takes it from there)
sleep 2
/usr/local/bin/tv normalize 2>/dev/null || true

echo "==> OwnTone (AirPlay with track titles)"
# OwnTone isn't in Debian; the project runs an apt repo with a trixie dist.
# Everything degrades gracefully if this fails — the direct AirPlay path
# doesn't depend on it. Lite images lack the full gnupg needed to dearmor
# the key, so install prerequisites first, validate every artifact, and
# never leave a list without its key.
apt-get install -y gnupg wget || true
ot_key=/usr/share/keyrings/owntone-archive-keyring.gpg
ot_list=/etc/apt/sources.list.d/owntone.list
if [[ ! -s $ot_key ]]; then
  rm -f "$ot_key"
  ot_tmp=$(mktemp)
  if wget -q -O "$ot_tmp" http://www.gyfgafguf.dk/raspbian/owntone.gpg &&
    [[ -s $ot_tmp ]] && gpg --dearmor --output "$ot_key" <"$ot_tmp"; then
    echo "  owntone repo key installed"
  else
    rm -f "$ot_key"
    echo "  !! could not fetch/convert the owntone repo key"
  fi
  rm -f "$ot_tmp"
fi
if [[ -s $ot_key && ! -s $ot_list ]]; then
  ot_tmp=$(mktemp)
  if wget -q -O "$ot_tmp" \
    "https://raw.githubusercontent.com/owntone/owntone-apt/refs/heads/master/repo/rpi/owntone-trixie.list" &&
    [[ -s $ot_tmp ]]; then
    install -m 644 "$ot_tmp" "$ot_list"
    apt-get update || true
  else
    echo "  !! could not fetch the owntone repo list"
  fi
  rm -f "$ot_tmp"
fi
if [[ -s $ot_key && -s $ot_list ]] && apt-get install -y owntone; then
  install -m 644 "$REPO_DIR/setup/owntone.conf" /etc/owntone.conf
  # the audio pipe + its metadata companion, writable by crt, readable by owntone
  install -d -m 755 /srv/owntone-pipe
  [[ -p /srv/owntone-pipe/CRT-TV ]] || mkfifo -m 666 /srv/owntone-pipe/CRT-TV
  [[ -p /srv/owntone-pipe/CRT-TV.metadata ]] || mkfifo -m 666 /srv/owntone-pipe/CRT-TV.metadata
  install -m 644 "$REPO_DIR/setup/pipewire-bridge.conf" /etc/pipewire/pipewire.conf.d/60-crt-tv-bridge.conf
  install -m 755 "$REPO_DIR/scripts/bridge-feed.sh" /usr/local/lib/crt-tv/bridge-feed.sh
  systemctl enable owntone.service 2>/dev/null || true
  systemctl restart owntone.service || true
  sudo -u crt XDG_RUNTIME_DIR="/run/user/$crt_uid" \
    systemctl --user restart pipewire wireplumber 2>/dev/null || true
else
  echo "!! OwnTone install failed — '(with titles)' outputs won't appear; direct AirPlay still works"
fi

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
install -m 755 "$REPO_DIR/scripts/play-media-x.sh" /usr/local/lib/crt-tv/play-media-x.sh
install -m 644 "$REPO_DIR/scripts/commercials.lua" /usr/local/lib/crt-tv/commercials.lua
install -m 644 "$REPO_DIR/scripts/loudness.lua" /usr/local/lib/crt-tv/loudness.lua
install -m 644 "$REPO_DIR/scripts/metadata.lua" /usr/local/lib/crt-tv/metadata.lua
install -m 644 "$REPO_DIR/scripts/reshuffle.lua" /usr/local/lib/crt-tv/reshuffle.lua
rm -f /usr/local/lib/crt-tv/weather-break.lua
install -m 755 "$REPO_DIR/scripts/clear-console.sh" /usr/local/lib/crt-tv/clear-console.sh
install -m 755 "$REPO_DIR/scripts/splash.sh" /usr/local/lib/crt-tv/splash.sh
rm -f /usr/local/lib/crt-tv/splash.txt
install -d /usr/local/lib/crt-tv/kiosk-ext
install -m 644 "$REPO_DIR"/scripts/kiosk-ext/* /usr/local/lib/crt-tv/kiosk-ext/
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
systemctl enable ws4kp.service weather-kiosk.service crt-remote.service crt-autostart.service crt-splash.service
# No login prompt over the splash: tty1 is the display, not a terminal. Log in
# via SSH, or Ctrl+Alt+F2 for a console (logind still spawns getty on tty2+).
systemctl disable getty@tty1.service 2>/dev/null || true
systemctl restart ws4kp.service crt-remote.service
# Restart the kiosk too so display-stack changes take effect on re-runs
systemctl restart weather-kiosk.service

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
    sed "s/__DOMAIN__/$https_domain/g" "$REPO_DIR/setup/nginx-crt-tv.conf" \
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

install -d -m 775 -o crt -g crt /srv/media /srv/media/videos /srv/media/commercials
# Migrate a pre-bucket layout: loose videos at the top level belong to the
# videos bucket now
find /srv/media -maxdepth 1 -type f \( \
  -iname '*.mp4' -o -iname '*.mkv' -o -iname '*.avi' -o -iname '*.mov' -o \
  -iname '*.m4v' -o -iname '*.mpg' -o -iname '*.mpeg' -o -iname '*.ts' -o \
  -iname '*.webm' \) -exec mv -n {} /srv/media/videos/ \;

echo "==> Configuring composite video output (480i NTSC)"
"$REPO_DIR/setup/enable-composite.sh"

cat <<'EOF'

Done. Reboot to switch output from HDMI to composite:

  sudo reboot

The PVM should come up with the WeatherStar 4000+. Control with `tv`
(tv weather / tv play <file> / tv status) or from a browser
on your network:  http://<this-pi>:8090/
EOF
