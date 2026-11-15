#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo 'Run with sudo on the TV Pi.' >&2
  exit 1
fi

profile=/home/crt/.config/chromium
if [[ ! -d $profile ]]; then
  echo 'Chromium will create a profile the next time the kiosk starts.'
  exit 0
fi

kiosk_state=$(systemctl show weather-kiosk.service -p ActiveState --value)
backup=$(mktemp -d /var/backups/crt-tv-kiosk-XXXXXX)
systemctl stop weather-kiosk.service
mv -- "$profile" "$backup/"
install -d -m 700 -o crt -g crt "$profile"
if [[ $kiosk_state == active || $kiosk_state == activating ]]; then
  systemctl start weather-kiosk.service
fi
printf 'Previous kiosk profile saved in %s/chromium\n' "$backup"
