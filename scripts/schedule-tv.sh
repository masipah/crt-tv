#!/bin/bash
# Fixed transient jobs for Channel startup and weather breaks.
set -euo pipefail
[[ $# == 2 && $2 =~ ^[0-9]+$ ]] || exit 2
case $1 in
  channel) unit=crt-start-videos; action=play ;;
  resume)  unit=crt-weatherbreak; action=resume ;;
  *) exit 2 ;;
esac
exec /usr/bin/systemd-run --quiet --collect --uid=crt --unit="$unit" \
  --on-active="${2}s" --timer-property=AccuracySec=1s /usr/local/bin/tv "$action"
