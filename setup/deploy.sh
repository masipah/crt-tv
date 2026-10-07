#!/usr/bin/env bash
# Shared app deployment for initial provisioning and app-only updates.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'deploy.sh: run with sudo' >&2; exit 1; }
REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)
display_mode=${1:-off}
backup=$(mktemp -d /var/backups/crt-tv-deploy-XXXXXX)
paths=()
targets=()
for file in /usr/local/lib/crt-tv /usr/local/bin/tv /etc/crt-tv/crt-tv.env /etc/sudoers.d/crt-tv /etc/tmpfiles.d/crt-tv.conf "$REPO_DIR"/systemd/*.service; do
  [[ $file == "$REPO_DIR"/systemd/* ]] && file=/etc/systemd/system/$(basename "$file")
  targets+=("$file")
  [[ -e $file ]] && paths+=("${file#/}")
done
if (( ${#paths[@]} )); then tar -czf "$backup/runtime.tgz" -C / "${paths[@]}"; fi
rollback() {
  trap - ERR
  # Remove newly installed files too, so rollback restores exactly the saved tree.
  rm -rf -- "${targets[@]}"
  if [[ -f $backup/runtime.tgz ]]; then
    tar -xzf "$backup/runtime.tgz" -C /
    systemctl daemon-reload
    systemctl restart crt-remote.service || true
    bash "$REPO_DIR/setup/restart-display.sh" "$display_mode" || true
    echo "Deployment failed; previous runtime restored. Backup: $backup" >&2
  else
    echo "Deployment failed; no previous runtime was installed. Backup: $backup" >&2
  fi
  exit 1
}
trap rollback ERR
install -d -m 775 -o crt -g crt /srv/media /srv/media/videos /srv/media/commercials /srv/media/on-demand
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
install -d /usr/local/lib/crt-tv/startup
install -m 644 "$REPO_DIR"/scripts/startup/*.lua /usr/local/lib/crt-tv/startup/
install -m 644 "$REPO_DIR/scripts/loudness.lua" /usr/local/lib/crt-tv/loudness.lua
install -m 644 "$REPO_DIR/scripts/reshuffle.lua" /usr/local/lib/crt-tv/reshuffle.lua
rm -f /usr/local/lib/crt-tv/weather-break.lua
install -m 755 "$REPO_DIR/scripts/clear-console.sh" /usr/local/lib/crt-tv/clear-console.sh
install -m 755 "$REPO_DIR/scripts/handoff-console.sh" /usr/local/lib/crt-tv/handoff-console.sh
install -m 755 "$REPO_DIR/scripts/splash.sh" /usr/local/lib/crt-tv/splash.sh
rm -f /usr/local/lib/crt-tv/splash.txt
install -d /usr/local/lib/crt-tv/kiosk-ext
install -m 644 "$REPO_DIR"/scripts/kiosk-ext/* /usr/local/lib/crt-tv/kiosk-ext/
install -m 755 "$REPO_DIR/scripts/tv" /usr/local/bin/tv

echo "==> Installing web remote"
install -d /usr/local/lib/crt-tv/remote/public/icons
install -m 644 "$REPO_DIR"/remote/*.mjs "$REPO_DIR/remote/muni-stops.json" /usr/local/lib/crt-tv/remote/
# the whole public tree: the remote itself, the oscilloscope channel page,
# and the web-app manifest/icons
install -m 644 "$REPO_DIR"/remote/public/*.html "$REPO_DIR"/remote/public/*.webmanifest "$REPO_DIR"/remote/public/*.mjs "$REPO_DIR"/remote/public/*.css \
  /usr/local/lib/crt-tv/remote/public/
install -m 644 "$REPO_DIR"/remote/public/icons/* /usr/local/lib/crt-tv/remote/public/icons/

rm -rf /usr/local/lib/crt-tv/remote/public/boot
rm -f /usr/local/lib/crt-tv/remote/public/boot.html

install -d /usr/local/lib/crt-tv/remote/public/muni
install -m 644 "$REPO_DIR"/remote/public/muni/* /usr/local/lib/crt-tv/remote/public/muni/

# The remote runs unprivileged as 'crt'; this lets it (and the crt user
# generally) run the tv command without a password.
visudo -cf "$REPO_DIR/setup/sudoers-crt-tv"
install -m 440 "$REPO_DIR/setup/sudoers-crt-tv" /etc/sudoers.d/crt-tv

install -m 644 "$REPO_DIR"/systemd/*.service /etc/systemd/system/
systemctl daemon-reload
if [[ ${CRT_PROVISION:-0} == 1 ]]; then
  systemctl enable ws4kp.service weather-kiosk.service crt-remote.service crt-autostart.service crt-splash.service
  systemctl disable getty@tty1.service 2>/dev/null || true
  systemctl restart ws4kp.service
fi
systemctl restart crt-remote.service
bash "$REPO_DIR/setup/restart-display.sh" "$display_mode"

# Check the restarted server before considering deployment successful.
port=$(sed -n 's/^CRT_REMOTE_PORT=//p' /etc/crt-tv/crt-tv.env | tail -n1 | tr -d '"')
port=${port:-8090}
ready=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 2 -o /dev/null "http://127.0.0.1:$port/api/media"; then ready=1; break; fi
  sleep 1
done
(( ready == 1 )) || { echo 'Updated web remote failed its readiness check' >&2; rollback; }
trap - ERR
printf 'App installed. Runtime backup: %s\n' "$backup"
