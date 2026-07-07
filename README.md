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
tv play <path>...   # play file(s) or a folder with mpv, loops forever
tv pause            # toggle pause
tv mute             # toggle mute
tv shuffle          # shuffle the playlist order
tv next / tv prev   # skip within the playlist
tv stop             # blank the screen
tv status           # what's running
```

`tv play` accepts bare names relative to `MEDIA_DIR` (default `/srv/media`,
set in `/etc/crt-tv/crt-tv.env`). Switching between weather and video is
seamless — starting one stops the other via systemd `Conflicts=`.

### Web remote

Open `http://<pi-address>:8090/` from any browser on your network for a
remote control: switch channels, browse/play/delete the video library
(`MEDIA_DIR`), build a play queue in whatever order you like, upload videos
straight from your phone or laptop, and pause/skip/mute/shuffle what's
playing. It's the same `tv` command underneath, so the CLI and the web UI
never disagree.

No authentication — it's meant for your LAN. Don't port-forward it.

## Layout

```text
setup/      install.sh (run once with sudo) + boot config for composite 480i
systemd/    ws4kp, weather-kiosk (chromium kiosk under X), crt-player (mpv), crt-remote
scripts/    tv control command, kiosk launcher
remote/     web remote (zero-dependency Node server + single-page UI on :8090)
docs/       hardware wiring, composite video deep-dive & troubleshooting
```

## Docs

- [docs/hardware.md](docs/hardware.md) — TRRS pinout, PVM hookup, wrong-cable symptoms
- [docs/composite-video.md](docs/composite-video.md) — how 480i output works on
  the Pi 4 with KMS, verification, and how to revert to HDMI
