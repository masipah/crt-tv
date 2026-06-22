#!/usr/bin/env bash
# Run crt-tv locally for development (macOS / Linux). Creates a venv on first
# run, then starts uvicorn with autoreload.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -d .venv ]; then
  echo "==> creating .venv"
  python3 -m venv .venv
  ./.venv/bin/pip install --upgrade pip
  ./.venv/bin/pip install -r requirements.txt
fi

echo "==> control app : http://localhost:8000/"
echo "==> display app : http://localhost:8000/display"
exec ./.venv/bin/uvicorn crt_tv.main:app --reload --host 0.0.0.0 --port 8000
