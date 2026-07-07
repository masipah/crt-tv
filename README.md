# crt-tv

An analogue weather station and video player for a Sony PVM, driven by a
Raspberry Pi 4B over composite video (480i NTSC).

- **Weather**: runs the real [WeatherStar 4000+](https://github.com/netbymatt/ws4kp)
  locally, rendered fullscreen by Chromium — scroll effect, background music,
  and all.
- **Video**: mpv playing straight to the composite output, no desktop involved.
- **Display**: Sony PVM-9045Q fed from the Pi's 3.5mm TRRS jack (yellow RCA).

## Hardware

| Part | Notes |
|---|---|
| Raspberry Pi 4B | Raspberry Pi OS **Lite 64-bit (Trixie)** |
| Sony PVM-9045Q | 9" NTSC monitor, composite in |
| 3.5mm TRRS → RCA AV cable | Must be the *camcorder/Zune* pinout — see [docs/hardware.md](docs/hardware.md) |

Wiring: yellow RCA → PVM video LINE IN (75Ω termination ON), white/red → audio in.
Composite and HDMI are mutually exclusive on the Pi 4 — once installed, this Pi
is composite-only until you revert (see [docs/composite-video.md](docs/composite-video.md)).

## Install

1. Flash **Raspberry Pi OS Lite (64-bit)** with Raspberry Pi Imager. Enable SSH
   and set up Wi-Fi/user in the Imager settings.
2. SSH in and run the installer (no GitHub account needed — it clones itself
   to `/opt/crt-tv`):

   ```sh
   curl -fsSL https://raw.githubusercontent.com/masipah/crt-tv/main/setup/install.sh | sudo bash
   sudo reboot
   ```

   Or the manual way:

   ```sh
   sudo apt update && sudo apt install -y git
   git clone https://github.com/masipah/crt-tv
   cd crt-tv
   sudo setup/install.sh
   sudo reboot
   ```

3. After reboot the Pi switches to composite out and the PVM shows the
   WeatherStar 4000+.

### Setting your location

ws4kp stores its settings in the browser. Two ways to set them:

- **Keyboard on the Pi**: plug a keyboard/mouse into the Pi and configure
  directly on the PVM. Settings persist in the kiosk's Chromium profile.
- **Permalink** (headless): open `http://<pi-address>:8080/` from your laptop,
  configure everything, copy the permalink/share URL, then put it in
  `/etc/crt-tv/crt-tv.env` as `KIOSK_URL` (change the host to `127.0.0.1:8080`)
  and run `tv weather`.

The kiosk always forces fullscreen (`kiosk=true`) and background music
(`mediaPlaying=true`) regardless of what the permalink says; set
`KIOSK_MUSIC=off` in `/etc/crt-tv/crt-tv.env` to silence the weather channel.

## Usage

Everything is driven by the `tv` command (installed to `/usr/local/bin/tv`):

```text
tv weather          # WeatherStar 4000+
tv play [path]...   # play the videos bucket in order (or given files/folders)
tv break [secs]     # cut to the weather now, then back to the video (default 2 min)
tv pause            # toggle pause
tv mute             # toggle mute — whole TV (weather music and videos)
tv shuffle          # shuffle the playlist order
tv next / tv prev   # skip within the playlist
tv stop             # blank the screen
tv status           # what's running
tv reboot           # reboot the Pi (also a button on the web remote)
```

The media library is two buckets: **videos** (the channel — plays top to
bottom in your saved order and loops) and **commercials** (after every 4th
video, one plays at random, picked fresh each time by the player itself).
Playing a single bucket video continues through the bucket from that point;
a multi-file list (the web remote's queue) plays exactly as given — the
commercial rotation applies either way. `tv break` still cuts to the weather
manually and resumes the video where it left off.

**On boot** the TV shows the WeatherStar, muted — and stays there. Take
control from the web remote: unmute (one hardware-mixer toggle covers the
weather music and the videos alike) and hit Play videos when you want the
channel rolling.

`tv play` accepts bare names relative to `MEDIA_DIR` (default `/srv/media`,
set in `/etc/crt-tv/crt-tv.env`). Switching between weather and video is
seamless — starting one stops the other via systemd `Conflicts=`.

### Web remote

Open `http://<pi-address>:8090/` from any browser on your network for a
remote control: switch channels, upload into either bucket (videos or
commercials) straight from your phone or laptop, reorder the channel with
↑↓, move files between buckets, delete, pause/skip/mute/shuffle what's
playing, and reboot the Pi. It's the same `tv` command underneath, so the
CLI and the web UI never disagree.

**The videos bucket order is the broadcast schedule**: it persists (hidden
`.order.json`/`.playorder.m3u` files in `MEDIA_DIR`) and is exactly what
plays when you hit Play videos. The play queue, by contrast, is a one-off
list for live mixing and vanishes when replaced.

No authentication — it's meant for your LAN. Don't port-forward it.

## Layout

```text
setup/      install.sh (run once with sudo) + boot config for composite 480i
systemd/    ws4kp, weather-kiosk (chromium kiosk under X), crt-player (mpv), crt-remote
scripts/    tv control command, kiosk launcher
remote/     web remote (zero-dependency Node server + single-page UI on :8090)
docs/       hardware wiring, composite video deep-dive & troubleshooting
```

## Power-loss safety

This is an appliance: it gets unplugged, not shut down, and the install is
built around that. ext4's journal plus RPi OS's `fsck.repair=yes` handle the
crash itself; the installer minimizes what's ever being written to the SD
card so there's (almost) nothing to corrupt:

- logs live in RAM (`journald Storage=volatile`) — they reset each boot
- no swapfile, no unattended-apt background writers
- Chromium's caches live in tmpfs; only its small settings profile touches disk
- runtime state (playlists, resume points, mpv log/socket) is already in `/run`
- uploads stream to a hidden temp file, are fsynced, then atomically renamed —
  a power cut mid-upload leaves no broken video, and orphaned temp files are
  swept at startup

Steady-state (weather or video showing), pulling the plug is a non-event. The
only vulnerable moments are while an upload is in flight (that upload is lost,
nothing else) and during `install.sh`/`apt` runs — don't unplug mid-update.

For maximum paranoia there's `raspi-config` → Performance → Overlay FS, which
makes the whole root filesystem read-only — but that freezes uploads and
config changes until you turn it off, so it's not enabled by default.

## Docs

- [docs/hardware.md](docs/hardware.md) — TRRS pinout, PVM hookup, wrong-cable symptoms
- [docs/composite-video.md](docs/composite-video.md) — how 480i output works on
  the Pi 4 with KMS, verification, and how to revert to HDMI
