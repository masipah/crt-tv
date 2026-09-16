#!/usr/bin/env bash
# Hand tty1 from the boot animation to an X display session. This helper is
# intentionally separate from clear-console.sh: display-unit stop hooks must
# never enqueue another systemd stop job from inside their own stop transaction.
set -euo pipefail

systemctl stop crt-splash.service
exec /usr/local/lib/crt-tv/clear-console.sh
