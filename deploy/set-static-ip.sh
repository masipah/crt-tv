#!/usr/bin/env bash
# Assign a static IP to the Pi using NetworkManager (default on Raspberry Pi OS
# Bookworm). Configure via environment variables:
#
#   CRT_TV_STATIC_IP   required, e.g. 192.168.1.50/24  (CIDR)
#   CRT_TV_GATEWAY     e.g. 192.168.1.1   (default: derived as .1 of the subnet)
#   CRT_TV_DNS         e.g. "192.168.1.1 1.1.1.1"      (default: the gateway)
#   CRT_TV_IFACE       e.g. eth0          (default: the active interface)
#
# WARNING: changing the address can drop the SSH session you're using. Reconnect
# on the new IP afterwards.
set -euo pipefail

IP="${CRT_TV_STATIC_IP:-}"
if [ -z "$IP" ]; then
  echo "CRT_TV_STATIC_IP is required (e.g. 192.168.1.50/24)" >&2
  exit 1
fi

if ! command -v nmcli >/dev/null 2>&1; then
  cat >&2 <<'EOF'
nmcli (NetworkManager) not found. On older Raspberry Pi OS using dhcpcd, add to
/etc/dhcpcd.conf instead, e.g.:

  interface eth0
  static ip_address=192.168.1.50/24
  static routers=192.168.1.1
  static domain_name_servers=192.168.1.1 1.1.1.1

then: sudo systemctl restart dhcpcd
EOF
  exit 1
fi

# pick the interface: explicit, else the first connected device
IFACE="${CRT_TV_IFACE:-$(nmcli -t -f DEVICE,STATE device | awk -F: '$2=="connected"{print $1; exit}')}"
if [ -z "$IFACE" ]; then
  echo "Could not determine a connected interface; set CRT_TV_IFACE." >&2
  exit 1
fi

# default gateway = .1 of the given subnet; default DNS = gateway
SUBNET="${IP%.*}"
GW="${CRT_TV_GATEWAY:-${SUBNET}.1}"
DNS="${CRT_TV_DNS:-$GW}"

# the active connection name on that interface
CON="$(nmcli -t -f NAME,DEVICE connection show --active | awk -F: -v d="$IFACE" '$2==d{print $1; exit}')"
if [ -z "$CON" ]; then
  echo "No active NetworkManager connection on $IFACE." >&2
  exit 1
fi

echo "==> Setting $CON ($IFACE) to static $IP  gw=$GW  dns=$DNS"
sudo nmcli connection modify "$CON" \
  ipv4.method manual \
  ipv4.addresses "$IP" \
  ipv4.gateway "$GW" \
  ipv4.dns "$DNS"
sudo nmcli connection up "$CON"
echo "==> Static IP applied. Reconnect on ${IP%%/*} if your session drops."
