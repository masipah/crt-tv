#!/usr/bin/env bash
# Called by install.sh only when AIRPLAY_ENABLED=1. OwnTone's official Pi repo:
# https://owntone.github.io/owntone-server/installation/
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run through sudo setup/install.sh' >&2; exit 1; }
REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
echo '==> Installing AirPlay video sender with metadata'
apt-get install -y ca-certificates curl gnupg avahi-daemon alsa-utils
key_tmp=$(mktemp)
list_tmp=$(mktemp)
trap 'rm -f "$key_tmp" "$list_tmp"' EXIT
curl -fsSL https://raw.githubusercontent.com/owntone/owntone-apt/refs/heads/master/repo/rpi/owntone.gpg -o "$key_tmp"
curl -fsSL https://raw.githubusercontent.com/owntone/owntone-apt/refs/heads/master/repo/rpi/owntone-trixie.list -o "$list_tmp"
gpg --batch --yes --dearmor --output /usr/share/keyrings/owntone-archive-keyring.gpg "$key_tmp"
install -m 644 "$list_tmp" /etc/apt/sources.list.d/owntone.list
apt-get update
apt-get install -y owntone
id owntone &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin owntone
install -d -m 750 -o owntone -g crt /srv/owntone-pipe
for pipe in CRT-TV CRT-TV.metadata; do
  [[ -p /srv/owntone-pipe/$pipe ]] || mkfifo "/srv/owntone-pipe/$pipe"
  chown owntone:crt "/srv/owntone-pipe/$pipe"
  chmod 660 "/srv/owntone-pipe/$pipe"
done
# Fail during setup if this Pi kernel lacks the loopback audio module.
modprobe snd-aloop
install -m 644 "$REPO_DIR/setup/tmpfiles-crt-airplay.conf" /etc/tmpfiles.d/crt-airplay.conf
systemd-tmpfiles --create /etc/tmpfiles.d/crt-airplay.conf
install -m 644 "$REPO_DIR/setup/owntone.conf" /etc/owntone.conf
systemctl enable --now avahi-daemon.service owntone.service
systemctl restart owntone.service
# This feed is on demand, never enabled at boot.
systemctl disable --now crt-airplay-feed.service 2>/dev/null || true
