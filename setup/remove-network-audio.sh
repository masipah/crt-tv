#!/usr/bin/env bash
# Idempotent upgrade cleanup for the retired network audio sender.
# Preserve Avahi, ALSA, nftables, and other shared system components.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run through sudo' >&2; exit 1; }

for unit in crt-airplay-feed.service owntone.service; do
  if [[ $(systemctl show "$unit" -p LoadState --value) != not-found ]]; then
    systemctl disable --now "$unit"
  fi
done
rm -f /etc/systemd/system/crt-airplay-feed.service \
  /etc/systemd/system/owntone.service.d/crt-tv.conf \
  /etc/tmpfiles.d/crt-airplay.conf \
  /etc/apt/sources.list.d/owntone.list \
  /usr/share/keyrings/owntone-archive-keyring.gpg
rmdir /etc/systemd/system/owntone.service.d 2>/dev/null || true
if command -v nft >/dev/null && nft list table inet crt_airplay &>/dev/null; then
  nft delete table inet crt_airplay
fi
if [[ $(dpkg-query -W -f='${Status}' owntone 2>/dev/null || true) == 'install ok installed' ]]; then
  apt-get purge -y owntone
fi
rm -f /etc/owntone.conf \
  /usr/local/lib/crt-tv/airplay-feed.sh \
  /usr/local/lib/crt-tv/airplay-route.lua \
  /usr/local/lib/crt-tv/owntone-firewall.nft \
  /usr/local/lib/crt-tv/remote/airplay.mjs \
  /usr/local/lib/crt-tv/remote/airplay-output.mjs \
  /run/crt-tv/airplay.json /run/crt-tv/airplay.json.tmp /run/crt-tv/boot-muted \
  /srv/owntone-pipe/CRT-TV /srv/owntone-pipe/CRT-TV.metadata
rmdir /srv/owntone-pipe 2>/dev/null || true
rm -rf /run/crt-owntone
if [[ -f /etc/crt-tv/crt-tv.env ]]; then
  sed -i '/^[[:space:]]*#\{0,1\}[[:space:]]*AIRPLAY_[A-Z_]*=/d' /etc/crt-tv/crt-tv.env
fi
# No module is removed while another process might still be using it.
modprobe -r snd_aloop 2>/dev/null || true
systemctl daemon-reload
