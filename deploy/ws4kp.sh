#!/usr/bin/env bash
# Install Docker (if needed) and run the real WeatherStar 4000+ (netbymatt/ws4kp)
# as a container, so crt-tv's weather mode can show it fullscreen in kiosk mode.
#
#   bash deploy/ws4kp.sh            # set up + start (idempotent)
#
# ws4kp serves on WS4KP_PORT (default 8080). Uses US/NWS data.
set -euo pipefail

PORT="${WS4KP_PORT:-8080}"
IMAGE="ghcr.io/netbymatt/ws4kp"
NAME="ws4kp"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$(id -un)" || true
fi

say "Pulling $IMAGE"
sudo docker pull "$IMAGE"

say "Starting ws4kp on port $PORT"
sudo docker rm -f "$NAME" >/dev/null 2>&1 || true
sudo docker run -d --name "$NAME" --restart unless-stopped -p "${PORT}:8080" "$IMAGE"

say "ws4kp running at http://localhost:${PORT}/  (control page) and via crt-tv weather mode"
