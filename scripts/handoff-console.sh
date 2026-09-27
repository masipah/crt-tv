#!/usr/bin/env bash
# Hand tty1 from the boot animation to an X display session. This helper is
# intentionally separate from clear-console.sh: display-unit stop hooks must
# never enqueue another systemd stop job from inside their own stop transaction.
set -euo pipefail

systemctl stop crt-splash.service
# Leave the final station card on tty1 until X takes ownership.
# Display stop hooks still clear the console when leaving a channel.
