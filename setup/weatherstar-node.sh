#!/bin/bash
# Install the tested private runtime for WeatherStar on the 64-bit Pi.
set -euo pipefail
version=v24.22.3
runtime=/opt/ws4kp-node-$version
if [[ ! -x $runtime/bin/node ]]; then
  [[ $(dpkg --print-architecture) == arm64 ]] || { echo 'WeatherStar requires the arm64 Pi image' >&2; exit 1; }
  stage=$(mktemp -d /opt/.ws4kp-node.XXXXXX)
  trap 'rm -rf -- "$stage"' EXIT
  archive=node-$version-linux-arm64.tar.xz
  curl -fsSL --retry 3 "https://nodejs.org/dist/$version/$archive" -o "$stage/$archive"
  (cd "$stage" && printf '%s  %s\n' 6e51a2ada00f0011cc266f65d98922b403d7ad88f809ca2aa615a5fe1ce6e86c "$archive" | sha256sum -c - >&2)
  tar -xJf "$stage/$archive" -C "$stage" --no-same-owner
  mv -T "$stage/node-$version-linux-arm64" "$runtime"
fi
[[ $("$runtime/bin/node" --version) == "$version" ]]
printf '%s\n' "$runtime"
