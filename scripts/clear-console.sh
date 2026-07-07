#!/usr/bin/env bash
# Blank tty1 (clear, cursor home, hide cursor) so leftover boot text never
# flashes on the CRT in the gap between X sessions. Hooked as ExecStartPre/
# ExecStopPost (run as root via the '+' prefix) on the kiosk and player units.
printf '\033[2J\033[H\033[?25l' >/dev/tty1 2>/dev/null || true
