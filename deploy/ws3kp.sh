#!/usr/bin/env bash
# Install Docker (if needed) and run the real WeatherSTAR 3000+ (netbymatt/ws3kp)
# as a container, so crt-tv's weather mode can show it fullscreen in kiosk mode.
#
#   bash deploy/ws3kp.sh            # set up + start (idempotent)
#
# ws3kp serves on WS3KP_PORT (default 8083). Uses US/NWS data.
set -euo pipefail

PORT="${WS3KP_PORT:-8083}"
IMAGE="ghcr.io/netbymatt/ws3kp"
NAME="ws3kp"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$(id -un)" || true
fi

say "Pulling $IMAGE"
sudo docker pull "$IMAGE"

say "Starting ws3kp on port $PORT"
sudo docker rm -f "$NAME" >/dev/null 2>&1 || true
sudo docker run -d --name "$NAME" --restart unless-stopped -p "${PORT}:8083" "$IMAGE"

say "ws3kp running at http://localhost:${PORT}/  (control page) and via crt-tv weather mode"
