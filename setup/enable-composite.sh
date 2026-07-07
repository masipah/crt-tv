#!/usr/bin/env bash
# Switch the Pi 4's video output to composite (480i NTSC) on the 3.5mm jack.
# Edits /boot/firmware/config.txt and cmdline.txt; timestamped backups are
# written next to the originals. See docs/composite-video.md for the details.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "enable-composite.sh: run with sudo" >&2
  exit 1
fi

BOOT=/boot/firmware
CFG=$BOOT/config.txt
CMD=$BOOT/cmdline.txt

if [[ ! -f $CFG || ! -f $CMD ]]; then
  echo "enable-composite.sh: $BOOT not found — is this a Pi running RPi OS (Bookworm/Trixie)?" >&2
  exit 1
fi

ts=$(date +%Y%m%d-%H%M%S)
cp "$CFG" "$CFG.bak-$ts"
cp "$CMD" "$CMD.bak-$ts"

# Tell the KMS driver to expose the composite connector (disables HDMI on Pi 4)
if grep -Eq '^dtoverlay=vc4-kms-v3d' "$CFG"; then
  sed -i '/^dtoverlay=vc4-kms-v3d/{/composite/!s/$/,composite/}' "$CFG"
else
  printf '\ndtoverlay=vc4-kms-v3d,composite\n' >> "$CFG"
fi

# The Pi 4 ships with the composite DAC off (it constrains the core clock);
# enable_tvout=1 turns it back on. Only meaningful in the [pi4] section.
if ! grep -Eq '^enable_tvout=1' "$CFG"; then
  printf '\n[pi4]\nenable_tvout=1\n\n[all]\n' >> "$CFG"
fi

# Force NTSC and the 480i mode on the kernel command line (cmdline.txt is one
# line; sdtv_mode= in config.txt is ignored under full KMS).
for arg in 'vc4.tv_norm=NTSC' 'video=Composite-1:720x480@60i'; do
  if ! grep -q "$arg" "$CMD"; then
    sed -i "1s|\$| $arg|" "$CMD"
  fi
done

echo "Composite 480i NTSC configured. Backups: $CFG.bak-$ts, $CMD.bak-$ts"
echo "Takes effect on next reboot. HDMI will be OFF while composite is enabled."
