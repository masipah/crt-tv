#!/usr/bin/env bash
# App-only update; provision a fresh Pi with install.sh first.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'update.sh: run with sudo' >&2; exit 1; }
SELF=${BASH_SOURCE[0]:-}
REPO_DIR=''
[[ -f $SELF ]] && REPO_DIR=$(cd "$(dirname "$SELF")/.." && pwd)
if [[ -z ${CRT_TV_SYNCED:-} && ( -z $REPO_DIR || $REPO_DIR == /opt/crt-tv ) ]]; then
  [[ -d /opt/crt-tv/.git ]] || { echo 'Install crt-tv first with setup/install.sh' >&2; exit 1; }
  test -z "$(git -C /opt/crt-tv status --porcelain)" || { echo '/opt/crt-tv has local changes; preserve them before updating' >&2; exit 1; }
  previous=$(git -C /opt/crt-tv rev-parse HEAD)
  git -C /opt/crt-tv fetch origin main
  git -C /opt/crt-tv checkout -B main origin/main
  CRT_TV_PREVIOUS_REVISION="$previous" CRT_TV_SYNCED=1 exec bash /opt/crt-tv/setup/update.sh
fi
[[ -f /etc/crt-tv/crt-tv.env ]] && id crt >/dev/null || { echo 'Provision this Pi with install.sh first' >&2; exit 1; }
mode=off
if systemctl is-active --quiet crt-player.service; then mode=player
elif systemctl is-active --quiet weather-kiosk.service; then mode=kiosk
fi
if ! bash "$REPO_DIR/setup/deploy.sh" "$mode"; then
  if [[ -n ${CRT_TV_PREVIOUS_REVISION:-} ]]; then git -C /opt/crt-tv reset --hard "$CRT_TV_PREVIOUS_REVISION"; fi
  exit 1
fi
