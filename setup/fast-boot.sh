#!/usr/bin/env bash
# This appliance uses local servers and direct ALSA, not a desktop audio session.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "fast-boot.sh: run with sudo" >&2
  exit 1
fi

# The web servers can bind before DHCP completes. Weather fetches and AirPlay
# discovery handle the network becoming available after their services start.
if [[ $(systemctl show NetworkManager-wait-online.service -p LoadState --value) != not-found ]]; then
  systemctl disable NetworkManager-wait-online.service
fi

# Leave first-boot provisioning alone. Once it has finished and a persistent
# network profile exists, cloud-init need not run on every appliance boot.
if [[ -f /var/lib/cloud/instance/boot-finished ]] &&
   [[ -n $(find /etc/netplan /etc/NetworkManager/system-connections \
      -maxdepth 1 -type f -size +0c -print -quit 2>/dev/null || true) ]]; then
  install -d /etc/cloud
  touch /etc/cloud/cloud-init.disabled
fi

# Package upgrades can restore global desktop-audio presets. Those services
# also restore their saved mixer level, overriding CRT_BOOT_VOLUME. A global
# mask covers both the kiosk login and subsequent administrator SSH logins.
audio_units=(pipewire.service pipewire.socket pipewire-pulse.service
  pipewire-pulse.socket wireplumber.service filter-chain.service)
systemctl --global mask "${audio_units[@]}"
for runtime in /run/user/[0-9]*; do
  [[ -S $runtime/bus ]] || continue
  uid=${runtime##*/}
  user=$(getent passwd "$uid" | cut -d: -f1) || continue
  [[ -n $user ]] || continue
  runuser -u "$user" -- env XDG_RUNTIME_DIR="$runtime" systemctl --user daemon-reload
  runuser -u "$user" -- env XDG_RUNTIME_DIR="$runtime" \
    systemctl --user stop "${audio_units[@]}" || true
done
