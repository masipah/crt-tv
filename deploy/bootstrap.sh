#!/usr/bin/env bash
# crt-tv one-line installer.
#
# The code is hosted on GitHub; masipah.com (Vercel) just proxies this script.
# On a fresh Raspberry Pi OS, SSH in and run:
#
#   curl -sSL https://masipah.com/crt-tv/install.sh | bash
#
# (equivalently: curl -sSL https://raw.githubusercontent.com/masipah/crt-tv/main/deploy/bootstrap.sh | bash)
#
# Optional environment overrides:
#   CRT_TV_DIR      install location     (default: $HOME/crt-tv)
#   CRT_TV_REPO     git URL              (default: https://github.com/masipah/crt-tv.git)
#   CRT_TV_REF      git branch/tag       (default: main)
#   CRT_TV_TARBALL  if set, fetch this .tar.gz instead of git-cloning
set -euo pipefail

DIR="${CRT_TV_DIR:-$HOME/crt-tv}"
REPO="${CRT_TV_REPO:-https://github.com/masipah/crt-tv.git}"
REF="${CRT_TV_REF:-main}"
TARBALL="${CRT_TV_TARBALL:-}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [ "$(uname -s)" != "Linux" ]; then
  echo "This installer targets Raspberry Pi OS (Linux). Aborting." >&2
  exit 1
fi

say "Installing prerequisites (git, curl)"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates tar

# --- fetch the project from GitHub ------------------------------------------
if [ -n "$TARBALL" ]; then
  say "Downloading $TARBALL -> $DIR"
  mkdir -p "$DIR"
  curl -fsSL "$TARBALL" | tar xz --strip-components=1 -C "$DIR"
elif [ -d "$DIR/.git" ]; then
  say "Updating existing checkout in $DIR"
  git -C "$DIR" fetch --depth 1 origin "$REF"
  git -C "$DIR" reset --hard "origin/$REF"
else
  say "Cloning $REPO -> $DIR"
  git clone --depth 1 --branch "$REF" "$REPO" "$DIR"
fi

# --- run the per-host installer ---------------------------------------------
say "Running installer"
cd "$DIR"
bash deploy/install.sh

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
say "Done."
cat <<EOF

  Dashboard : http://${IP:-<pi-ip>}:8000/
  Preview   : http://${IP:-<pi-ip>}:8000/preview
  Display   : http://${IP:-<pi-ip>}:8000/display   (what the kiosk shows)

  Remember: enable composite video by appending deploy/config.txt.snippet to
  /boot/firmware/config.txt and rebooting (this disables HDMI on the Pi 4).
EOF
