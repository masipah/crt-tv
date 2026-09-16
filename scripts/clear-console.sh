#!/usr/bin/env bash
# Blank tty1 so no console frame flashes in the gap between display sessions.
# This must not call systemctl: it also runs from display-unit stop hooks, where
# waiting on another ordered unit can deadlock the current stop transaction.
printf '\033[2J\033[H\033[?25l' >/dev/tty1 2>/dev/null || true
