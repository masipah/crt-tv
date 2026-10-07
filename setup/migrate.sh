#!/usr/bin/env bash
# Historical upgrade actions run once, with a marker only after success.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'migrate.sh: run with sudo' >&2; exit 1; }
state=/var/lib/crt-tv/migrations
install -d "$state"
for migration in "$(dirname "$0")"/migrations/*.sh; do
  name=$(basename "$migration" .sh)
  [[ -e $state/$name ]] && continue
  bash "$migration"
  touch "$state/$name"
done
