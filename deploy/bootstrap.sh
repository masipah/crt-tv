#!/usr/bin/env bash
# crt-tv one-line installer — host this at masipah.com and run on the Pi with:
#
#   curl -sSL https://masipah.com/crt-tv/install.sh | bash
#
# Optional environment overrides:
#   CRT_TV_DIR       install location           (default: $HOME/crt-tv)
#   CRT_TV_TARBALL   .tar.gz of the project      (default: masipah.com tarball)
#   CRT_TV_REPO      git URL (used instead of the tarball if set)
#   CRT_TV_REF       git branch/tag              (default: main)
#   Static IP (optional — only applied if CRT_TV_STATIC_IP is set):
#   CRT_TV_STATIC_IP e.g. 192.168.1.50/24
#   CRT_TV_GATEWAY   e.g. 192.168.1.1
#   CRT_TV_DNS       e.g. "192.168.1.1 1.1.1.1"
#   CRT_TV_IFACE     e.g. eth0   (default: the active interface)
#
# Example with a static IP:
#   curl -sSL https://masipah.com/crt-tv/install.sh | \
#     CRT_TV_STATIC_IP=192.168.1.50/24 CRT_TV_GATEWAY=192.168.1.1 bash
set -euo pipefail

DIR="${CRT_TV_DIR:-$HOME/crt-tv}"
TARBALL="${CRT_TV_TARBALL:-https://masipah.com/crt-tv/latest.tar.gz}"
REPO="${CRT_TV_REPO:-}"
REF="${CRT_TV_REF:-main}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [ "$(uname -s)" != "Linux" ]; then
  echo "This installer targets Raspberry Pi OS (Linux). Aborting." >&2
  exit 1
fi

say "Installing prerequisites (git, curl)"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates tar

# --- fetch the project -------------------------------------------------------
if [ -n "$REPO" ]; then
  if [ -d "$DIR/.git" ]; then
    say "Updating existing checkout in $DIR"
    git -C "$DIR" fetch --depth 1 origin "$REF"
    git -C "$DIR" reset --hard "origin/$REF"
  else
    say "Cloning $REPO -> $DIR"
    git clone --depth 1 --branch "$REF" "$REPO" "$DIR"
  fi
else
  say "Downloading $TARBALL -> $DIR"
  mkdir -p "$DIR"
  # Tarball is expected to have a single top-level folder (e.g. from
  # `git archive` or GitHub's auto-tarballs); strip it as we extract.
  curl -fsSL "$TARBALL" | tar xz --strip-components=1 -C "$DIR"
fi

# --- run the per-host installer ---------------------------------------------
say "Running installer"
cd "$DIR"
bash deploy/install.sh

# --- optional static IP (do this last; it can drop your SSH session) --------
if [ -n "${CRT_TV_STATIC_IP:-}" ]; then
  say "Configuring static IP ${CRT_TV_STATIC_IP}"
  echo "    (this may interrupt your current SSH connection)"
  bash deploy/set-static-ip.sh || echo "    static IP step failed — set it manually if needed"
fi

IP="${CRT_TV_STATIC_IP%%/*}"
[ -n "$IP" ] || IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
say "Done."
cat <<EOF

  Dashboard : http://${IP:-<pi-ip>}:8000/
  Preview   : http://${IP:-<pi-ip>}:8000/preview
  Display   : http://${IP:-<pi-ip>}:8000/display   (what the kiosk shows)

  Remember: enable composite video by appending deploy/config.txt.snippet to
  /boot/firmware/config.txt and rebooting (this disables HDMI on the Pi 4).
EOF
