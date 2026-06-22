#!/usr/bin/env bash
# Fetch the real WeatherStar 4000 background art from vbguyny/ws4kp so the
# weather channel uses the authentic 640x480 backgrounds (gradient + panels)
# instead of a recreated gradient. NOT committed (git-ignored); run once.
#
# Source: https://github.com/vbguyny/ws4kp  (Images/). The display degrades to a
# recreated CSS gradient if these aren't present.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
mkdir -p backgrounds
RAW="https://raw.githubusercontent.com/vbguyny/ws4kp/master/Images"

# Background art by WeatherStar product number.
for f in \
  BackGround1.png BackGround1_1.png BackGround2.png BackGround3.png \
  BackGround4.png BackGround5.png BackGround6.png BackGround7.png ; do
  echo "    $f"
  curl -fsSL "$RAW/${f}" -o "backgrounds/$f" || echo "    (skip $f)"
done

echo "==> done. Weather mode will use the real WeatherStar backgrounds."
