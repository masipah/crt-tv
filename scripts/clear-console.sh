#!/usr/bin/env bash
# Stop the early signal animation, then blank tty1 so no console frame flashes
# in the gap between display sessions. Called immediately before X starts and
# from display-unit stop hooks; it always runs as root.
systemctl stop crt-splash.service 2>/dev/null || true
printf '\033[2J\033[H\033[?25l' >/dev/tty1 2>/dev/null || true
