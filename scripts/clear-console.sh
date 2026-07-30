#!/usr/bin/env bash
# Stop the early signal animation, then blank tty1 so no console frame flashes
# in the gap between display sessions. Hooked as ExecStartPre/ExecStopPost
# (run as root via the '+' prefix) on the kiosk and player units.
systemctl stop crt-splash.service 2>/dev/null || true
printf '\033[2J\033[H\033[?25l' >/dev/tty1 2>/dev/null || true
