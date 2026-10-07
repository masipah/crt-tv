# crt-tv

An analogue weather station and video player for a Sony PVM, driven by a
Raspberry Pi 4B over composite video (480i NTSC).

- **Weather**: runs the real [WeatherStar 4000+](https://github.com/netbymatt/ws4kp)
  locally, rendered fullscreen by Chromium — scroll effect, background music,
  and all.
- **Video**: mpv playing straight to the composite output, no desktop involved.
- **Oscilloscope**: an HP 54600B-style scope screen — one mint beam morphing
  through wave, flower, globe, butterflies and cube, with live Vp-p/Vrms/Freq
  readouts. Nothing to fetch or buffer: it's on screen the instant you pick it.
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

   **Updating later is the same command** — it re-syncs `/opt/crt-tv` to the
   latest `main` and reinstalls, from any directory.

   Developers can run `sudo setup/install.sh` from their own checkout
   instead; that installs the checkout as-is, without syncing.

3. After reboot the Pi switches to composite out and the PVM shows the
   WeatherStar 4000+.

### Setting your location

The weather is at **San Francisco (94102)**. Set `KIOSK_LOCATION` in
`/etc/crt-tv/crt-tv.env` to move it — a ZIP code or `City, ST`, whatever
ws4kp's search box accepts — then `tv weather`:

```sh
KIOSK_LOCATION=11201
```

The kiosk appends it to the URL as ws4kp's own `latLonQuery`, **forcing** it
past anything else: a location cached in the kiosk's Chromium profile, or one
baked into a permalink. The location belongs to the appliance, so every boot
lands in the same city — which also means configuring ws4kp with a keyboard on
the Pi only holds until the kiosk restarts. `KIOSK_LATLON` optionally supplies
the coordinates, skipping ws4kp's geocoder lookup at startup (the default
94102 has them built in).

A **permalink** still carries display settings: open `http://<pi-address>:8080/`
from your laptop, set the options you want, copy the permalink/share URL, and
put it in `/etc/crt-tv/crt-tv.env` as `KIOSK_URL` (change the host to
`127.0.0.1:8080`). Fullscreen (`kiosk=true`) and background music
(`mediaPlaying=true`) are forced regardless of what it says; set
`KIOSK_MUSIC=off` to silence the weather channel.

### Overscan

The CRT throws away the outer edge of the raster, which eats the
WeatherStar's bottom scroll. Rather than reach for the monitor's UNDERSCAN
button (which shrinks the raster ~3% and leaves black borders in view), the
kiosk scales its page down and keeps it centred, so the black remainder lands
in the margin the tube crops and the whole picture stays visible.

The horizontal fit defaults to 0.943. The supplied config sets
`KIOSK_FIT_Y=1` to use the full raster height: shrinking both axes to 0.943
left visible black bars above and below the weather on this PVM-9045Q.
The launcher falls back to 0.943 on either axis without a configured fit.
Tune each axis for the actual screen in `/etc/crt-tv/crt-tv.env` using
`KIOSK_FIT_X`/`KIOSK_FIT_Y` (fractions), and
`KIOSK_SHIFT_X`/`KIOSK_SHIFT_Y` (raster pixels) for an off-centre scan.

To dial it in, run `tv pattern`: a calibration grid with percent rulers on
all four edges and a green box drawn exactly where the current settings put
the picture. The smallest ruler number readable on the tube is that edge's
crop; tune the env values until the green box just kisses all four visible
edges, re-running `tv pattern` after each change, then `tv weather`. Set
`KIOSK_FIT_X=1` and `KIOSK_FIT_Y=1` to switch compensation off. It covers both browser channels;
video keeps its own `CRT_PANSCAN` fit.

## Usage

Everything is driven by the `tv` command (installed to `/usr/local/bin/tv`):

```text
tv weather          # WeatherStar 4000+
tv scope            # oscilloscope channel
tv pattern          # overscan calibration grid (see "Overscan")
tv play [path]...   # play the videos bucket in order (or given files/folders)
tv break [secs]     # cut to the weather now, then back to the video (default 2 min)
tv pause            # toggle pause
tv mute             # toggle mute — whole TV (weather music and videos)
tv volume [0-100]   # show or set the TV jack volume
tv normalize        # reset the TV jack volume to 75%
tv shuffle          # toggle shuffled playback — videos only, on at boot (lit in the web remote)
tv commercials      # toggle whether commercials play (on by default)
tv next / tv prev   # skip within the playlist
tv stop             # blank the screen
tv status           # what's running
tv reboot           # reboot the Pi (also a button on the web remote)
```

The media library has three sections: **Channel** (`videos/`, plays in your
saved order and loops), **Commercials** (`commercials/`, one random spot after
every 4th channel video), and **Videos** (`on-demand/`, manual playback only).
Upload or move clips into Videos to keep them out of the boot/channel rotation.
Playing these clips (or a queue containing any of them) plays the selected files
once, in order, without commercials. There are no filename-specific exclusions;
putting a clip back in Channel makes it part of the broadcast again.
Shuffle is on by default at boot and affects the Channel only — the
commercial cadence is by count, so it holds either way — and the
"No commercials" toggle suspends the spots entirely until turned off (or
the next boot). A shuffled channel re-rolls itself on every full pass:
when the looping playlist wraps around, the order is shuffled fresh, so
no two passes play the same sequence.
Playing a single bucket video continues through the bucket from that point;
a multi-file list (the web remote's queue) plays exactly as given — the
commercial rotation applies unless the list includes manual Videos. `tv break`
still cuts to the weather manually and resumes the video where it left off.

**On boot** a lightweight signal-lock animation takes over tty1: the raster
snaps into place, RGB channels converge, and a compact MASIPAH TV station ident
runs through color bursts, raster tunnels, vertical roll, chromatic echoes, and
signal breakup. Chromium continues the same animation on a local opening page
for at least 12 seconds (`CRT_SPLASH_MIN_SECONDS`), finishes on the full station
ident, and holds it until the player takes over.

The default boot sequence is animation → shuffled **Channel**, with the normal
commercial rotation. Weather is selected manually using the remote or `tv weather`.
Starting Channel needs only the local media and web remote, with no weather or
internet data dependency. Manual Videos never join this boot rotation.

For the optional weather-first sequence, set `CRT_BOOT_MODE=weather` and
`CRT_VIDEO_DELAY_SECONDS=120`. This counts two minutes after visible weather;
set the delay to 0 to keep weather on until a channel is selected manually.
Manual channel switches do not replay the opening.

Boot starts **unmuted**, at `CRT_BOOT_VOLUME` (75% by default). Set
`CRT_BOOT_MUTED=1` for silent startup or `CRT_BOOT_VOLUME=100` when controlling
the listening level on the TV itself. The current setup pairs 75% Pi output
with the TV at 80%. One mute toggle covers weather and video audio. Once you move the slider, your level stays in effect until the next boot.

`tv play` accepts bare names relative to `MEDIA_DIR` (default `/srv/media`,
set in `/etc/crt-tv/crt-tv.env`). Switching between the browser channels
(weather, oscilloscope) and video is seamless — starting one stops the other
via systemd `Conflicts=`.

### Oscilloscope channel

`tv scope` (or **Scope** on the web remote) points the same Chromium kiosk at
`remote/public/oscilloscope.html` instead of ws4kp: an HP 54600B screen with a
dashed graticule, front-panel readouts and softkey menu, and one mint beam
that holds a figure for a few seconds before morphing into the next — wave
sweep, harmonic flower, wireframe globe, butterfly garden, tumbling cube.
Brightness is dwell time per pixel, so slow curves burn hot and fast slews
fade out, and the Vp-p/Vrms/Freq row is measured off the trace actually on
screen. It's served by the web remote, so it also runs in any browser at
`http://<pi-address>:8090/oscilloscope.html`. Silent, instant, and it never
needs the network — which is what makes it the good fallback when the weather
is still loading.

### Web remote

Open `http://<pi-address>:8090/` from any browser on your network for a
remote control: switch channels (weather, Muni, scope, Channel, off), upload into
Channel, Commercials or manual Videos straight from your phone or laptop,
drag to reorder the channel, and tap any row for actions (play, queue,
rename, move between buckets, delete) — plus transport, a draggable position
bar to skip or rewind within the playing video, mute/shuffle/no-commercials
toggles, and a Pi reboot. Styled like a native iOS app, dark mode included.
It's the same `tv` command underneath, so the CLI and the web UI never
disagree.

The remote is a mobile web app: open it on your phone and use **Add to Home
Screen** (Safari share menu on iOS, browser menu on Android) to get it as an
app with its own icon, running fullscreen.

**The videos bucket order is the broadcast schedule**: it persists (hidden
`.order.json`/`.playorder.m3u` files in `MEDIA_DIR`) and is exactly what
plays when you select Channel. The play queue, by contrast, is a one-off
list for live mixing and vanishes when replaced.

No authentication — it's meant for your LAN. Don't port-forward it.

### Boot sequence and local audio

Boot opens directly into Channel after the MASIPAH ident. Weather can be selected
manually at any time. For the optional weather-first startup, set
`CRT_BOOT_MODE=weather` and `CRT_VIDEO_DELAY_SECONDS=120` for two minutes of weather
presentation followed by Channel. The kiosk signals when the first real weather screen is
visible and playing, after the boot animation is removed; animation time,
loading time and the progress screen do not count. The animation finishes on
the complete station logo, then cuts to weather after its visible images, fonts
and layout have settled. Chromium opens at the X display size so its default
window cannot leave unused strips along the bottom and right. If
weather never becomes ready, it stays on weather. With a delay of 0, weather
stays on until someone selects Channel.
Choosing a channel manually cancels the pending boot transition.
Weather music uses the TV's analogue jack and starts unmuted at boot. Set
`CRT_BOOT_MUTED=1` to request silent boot.
Local volume uses ALSA's perceptual (`amixer -M`) scale, so the default 75%
is an audible level rather than the Pi mixer's almost-silent raw midpoint.
Set `CRT_BOOT_VOLUME=100` in `/etc/crt-tv/crt-tv.env` to start the TV jack at
full volume instead. This accepts 0–100.
The installer masks desktop audio services so their saved mixer settings cannot
overwrite the TV's startup volume, including when an administrator logs in.

The installer also removes the network-online boot wait and disables cloud-init
after first-boot provisioning has finished and persistent network settings exist.
To reapply these settings without a full install, run `sudo bash setup/fast-boot.sh`
from the project checkout. Networking still starts normally; the weather intro
still lasts the configured time after weather becomes ready.

### HTTPS for the web remote

The remote can be served as `https://tv.masipah.com/` with a real
Let's Encrypt certificate — no browser warnings — even though the Pi is
LAN-only. Ownership is proven with the **DNS-01 challenge**: certbot
places a TXT record in the domain's public zone through the Cloudflare
API, so the Pi is never exposed to the internet and no port-forward is
involved. The hostname itself doesn't need a public record — a local DNS
entry on your router (UniFi, Pi-hole, …) pointing at the Pi's LAN IP is
enough. (A public record for a private IP works too — keep it DNS-only /
grey-cloud in Cloudflare, and note some routers' DNS-rebind protection
blocks public names resolving to LAN addresses.)

1. In Cloudflare (My Profile → API Tokens) create a token with exactly
   one permission: **Zone → DNS → Edit**, scoped to your domain's zone.
2. On the Pi, copy [setup/cloudflare.ini.example](setup/cloudflare.ini.example)
   to `/etc/crt-tv/cloudflare.ini` and paste the token in.
3. Set `HTTPS_DOMAIN=tv.masipah.com` in `/etc/crt-tv/crt-tv.env`
   (optionally `LETSENCRYPT_EMAIL=` for expiry notices).
4. Re-run the installer one-liner.

nginx terminates TLS on 443 and proxies to the remote on :8090; port 80
redirects to HTTPS, plain `http://<pi>:8090/` keeps working as before,
and uploads stream through unbuffered. Renewal is automatic (certbot's
systemd timer, ~30 days before expiry) with an nginx reload on each new
certificate.

## Layout

```text
setup/      install.sh (run once with sudo) + boot config for composite 480i
systemd/    ws4kp, weather-kiosk (chromium kiosk under X), crt-player (mpv), crt-remote
scripts/    tv control command, kiosk launcher
remote/     web remote (zero-dependency Node server + single-page UI on :8090)
            plus oscilloscope.html, the scope channel the kiosk shows
docs/       hardware wiring, composite video deep-dive & troubleshooting
```

## Audio

Weather, videos, and commercials use the Raspberry Pi's analogue TRRS jack
connected to the TV. No network audio sender or desktop audio stack is needed.

Volume is normalized around the local jack: mpv and the weather music stay at
100%, while the hardware mixer starts at 75%, so the remote's slider is the
one volume control that matters. Levels are set once at boot, and once you
move the slider (or run `tv volume`), your level sticks: unmuting returns to
it instead of the default. `tv normalize` resets the jack to 75%.

Widescreen handling: 16:9 videos zoom to fill the 4:3 screen (center-cut,
sides cropped — the broadcast way). Set `CRT_PANSCAN=0` in
`/etc/crt-tv/crt-tv.env` for letterboxing instead. The player also knows the
720×480 raster displays as 4:3, so nothing renders squeezed.

Files are loudness-normalized too: each upload gets a one-time EBU R128
analysis (ffmpeg, in the background) and the player applies a per-file gain
toward −16 LUFS with true-peak headroom — so quiet rips and loud commercials
come out at the same level, dynamics untouched. Fresh uploads play at unity
until their analysis finishes (seconds per file).

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

### Muni departure board

Choose **Muni** in the web remote, or run `tv muni`, for a silent, 1997 Japanese
station-inspired departure board. A single screen shows the next four departures from the four closest active
boarding stops to 8 Octavia Street: Haight/Gough inbound and outbound, and
Market/Gough inbound and outbound. All routes are merged and ordered by arrival
time. Japanese service labels and large 24-hour arrival times resemble a Shinkansen
board; destinations and stop names remain in English, while column headings and
inbound/outbound direction labels are Japanese. There is no station header, footer, screen
rotation or interaction. When a departure leaves, the remaining rows slide up
smoothly and the next arrival enters from below. Stable trip identities retain
rows across prediction updates. Countdown minutes sit beneath the clock times.

Stop selection uses SFMTA's stop finder, ranked by straight-line distance from
its geocoded address (not walking distance). Coordinates, IDs and provenance
are recorded in `remote/muni-stops.json`. These four platforms serve the 7 and F,
plus Owl and replacement buses when reported by Muni. The four earliest predictions win regardless of line; replacement buses and
streetcars are labeled separately. Destinations use the English source names.

The Pi polls the same public prediction source used by
[SFMTA's stop finder](https://www.sfmta.com/find-a-stop) every 15 seconds while
the board is open. Concurrent viewers share cached requests. Countdown times
use the source's clock and the browser's elapsed time. Departed predictions
are removed, and errors or data older than 45 seconds suppress countdowns.
“No live predictions” is distinct from “Updates unavailable”; neither claims
that service has ended. Each platform can recover independently.

No personal API key or account is required. The agency's public browser
configuration is discovered on the server and never included in API responses.
The board honors CRT fit/overscan settings. Selecting it cancels the pending
weather-to-video transition. Boot still starts with weather.
