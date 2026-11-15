#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 || $# -ne 1 || ! -s ${1:-} ]]; then
  echo 'Usage: sudo bash hat/install.sh /path/to/mouth.mp4' >&2
  exit 1
fi

source_dir=$(cd "$(dirname "$0")" && pwd)
clip=$(realpath -- "$1")
config=/boot/firmware/config.txt
if [[ ! -f $config ]] || ! id crt >/dev/null; then
  echo 'Install Masipah TV on Raspberry Pi OS first.' >&2
  exit 1
fi

apt-get install -y --no-install-recommends \
  ffmpeg python3-gpiozero python3-lgpio python3-spidev python3-luma.oled python3-pil python3-smbus2
ffmpeg -nostdin -v error -xerror -i "$clip" -map 0:v:0 -frames:v 1 -f null -

install -d /usr/local/lib/crt-face /var/lib/crt-face
install -m 644 "$source_dir/face.py" /usr/local/lib/crt-face/face.py
if [[ $clip != /var/lib/crt-face/mouth.mp4 ]]; then
  install -m 644 "$clip" /var/lib/crt-face/mouth.mp4
fi
install -m 644 "$source_dir/crt-face.service" /etc/systemd/system/crt-face.service

backup=$(mktemp -d /var/backups/crt-face-XXXXXX)
cp -p "$config" /etc/modules "$backup/"
raspi-config nonint do_spi 0
raspi-config nonint do_i2c 0
# Fast-mode I²C keeps blinks smooth across both SSD1315 displays.
if ! grep -Eq '^dtparam=.*i2c_arm_baudrate=' "$config"; then
  printf '\n[all]\ndtparam=i2c_arm_baudrate=400000\n' >> "$config"
fi

systemctl daemon-reload
systemctl enable crt-face.service
printf 'HAT face enabled for the next boot. Boot settings backup: %s\n' "$backup"
