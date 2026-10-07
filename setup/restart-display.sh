#!/usr/bin/env bash
# Restart the selected display only; a Channel update must not start the idle kiosk.
set -euo pipefail
case ${1:-off} in
  player) systemctl restart crt-player.service ;;
  kiosk) systemctl restart weather-kiosk.service ;;
  boot) systemctl restart weather-kiosk.service; systemctl restart crt-autostart.service ;;
  off) : ;;
  *) echo 'Unknown display mode' >&2; exit 1 ;;
esac
