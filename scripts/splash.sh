#!/usr/bin/env bash
# Early-boot splash (crt-splash.service): clear tty1, hide the cursor, draw
# the ASCII test card. Stays up until the weather kiosk takes the display.
printf '\033[2J\033[H\033[?25l' >/dev/tty1 2>/dev/null || true
cat /usr/local/lib/crt-tv/splash.txt >/dev/tty1 2>/dev/null || true
