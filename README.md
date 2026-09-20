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

The default is the PVM-9045Q's own datasheet number: normal scan is **6%
overscan of the effective screen area** (the Q/QM family manual), so the tube
shows 1/1.06 ≈ 94.3% of the raster per axis — `KIOSK_FIT=0.943`. Individual
tubes drift from spec and rarely crop both axes alike, so it's tunable in
`/etc/crt-tv/crt-tv.env`: `KIOSK_FIT_X`/`KIOSK_FIT_Y` (fractions), and
`KIOSK_SHIFT_X`/`KIOSK_SHIFT_Y` (raster pixels) for an off-centre scan.

To dial it in, run `tv pattern`: a calibration grid with percent rulers on
all four edges and a green box drawn exactly where the current settings put
the picture. The smallest ruler number readable on the tube is that edge's
crop; tune the env values until the green box just kisses all four visible
edges, re-running `tv pattern` after each change, then `tv weather`. Set
`KIOSK_FIT=1` to switch compensation off. It covers both browser channels;
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
tv normalize        # reset the TV jack volume to 50%
tv shuffle          # toggle shuffled playback — videos only, on at boot (lit in the web remote)
tv commercials      # toggle whether commercials play (on by default)
tv next / tv prev   # skip within the playlist
tv stop             # blank the screen
tv status           # what's running
tv reboot           # reboot the Pi (also a button on the web remote)
```

The media library is two buckets: **videos** (the channel — plays top to
bottom in your saved order and loops) and **commercials** (after every 4th
video, one plays at random, picked fresh each time by the player itself).
Shuffle is on by default at boot and affects the videos only — the
commercial cadence is by count, so it holds either way — and the
"No commercials" toggle suspends the spots entirely until turned off (or
the next boot). A shuffled channel re-rolls itself on every full pass:
when the looping playlist wraps around, the order is shuffled fresh, so
no two passes play the same sequence.
Playing a single bucket video continues through the bucket from that point;
a multi-file list (the web remote's queue) plays exactly as given — the
commercial rotation applies either way. `tv break` still cuts to the weather
manually and resumes the video where it left off.

**On boot** a lightweight signal-lock animation takes over tty1: the raster
snaps into place, RGB channels converge, and a compact MASIPAH TV station ident
runs through color bursts, raster tunnels, vertical roll, chromatic echoes, and
signal breakup. The full sequence loops for however long the WeatherStar needs.
There is no animation timeout: it runs throughout the complete readiness wait
and is stopped only when Chromium is about to claim the display, so it cannot
delay boot or leave a black loading gap. The TV then stays on the WeatherStar —
videos roll when you ask for them, from the web remote or `tv play`.

Boot is **muted**. Unmute when you want sound — one toggle covers the weather
music and the videos alike, and it comes up at the default 50% jack level with
the slider showing it, so there's headroom to raise it (the PVM's own volume
sits at full). Once you move the slider, your level is the one that sticks.

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
remote control: switch channels (weather, scope, videos, off), upload into
either bucket (videos or commercials) straight from your phone or laptop,
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
plays when you hit Play videos. The play queue, by contrast, is a one-off
list for live mixing and vanishes when replaced.

No authentication — it's meant for your LAN. Don't port-forward it.

### AirPlay video audio

The **AirPlay · video audio** panel sends the Pi's currently playing video's
audio to one receiver, including the Eversolo DMP-A8 Gen 2. Metadata comes from
the video automatically: embedded title/artist/album tags take priority, then
`Artist - Title.ext`, then the filename with `CRT-TV` as artist/album. It updates
on skips, commercials, and when connecting partway through a video. Track
position/duration is forwarded about every ten seconds. Artwork is not sent.

Enable the sender on the Pi by adding `AIRPLAY_ENABLED=1` to
`/etc/crt-tv/crt-tv.env`, then run `sudo setup/install.sh` from this checkout.
The installer uses the [official OwnTone Pi repository](https://owntone.github.io/owntone-server/installation/),
adds OwnTone and Avahi, and checks the kernel's `snd-aloop` module. It does not
restore PipeWire, global audio routing, or the old OwnTone capture bridge.
AirPlay is opt-in and starts disconnected after reboot or remote restart.

1. Play a video from the web remote.
2. Under AirPlay, enter your name, refresh receivers, select the Eversolo, and
   choose **Send video audio**. Receiver volume starts at 10%; unmute and adjust
   with the web remote. The Pi is the AirPlay sender; the browser's computer is
   only a remote control. All browsers can use this flow.
3. Choose **Stop AirPlay & release** to disconnect and return video audio to the
   TV jack. Weather, Scope, Off, and Reboot also end AirPlay first.

Only one website user can control the TV while AirPlay is reserved. The server
serializes claims and playback/volume/mute/seek/reboot requests, rejects other
clients with HTTP 409, and permits only the owner to renew or release. The
browser retains its random token across a same-tab reload. The reservation
renews every 30 seconds and expires after two minutes without renewal (plus a
short cleanup interval); expiry actually stops the Pi's sender. Closing or
suspending the owner tab therefore disconnects AirPlay. Receiver/bridge failure
also disconnects and releases control. Names are labels, not user accounts;
keep the remote on a trusted LAN and use its HTTPS setup to protect tokens.
Uploads and library management remain shared. SSH/root remains administrative
access outside the website lock.

The Eversolo must be powered on, on the Pi's LAN, and reachable by multicast
DNS. Password/pairing-required outputs are listed but unavailable until OwnTone
has the necessary receiver authentication; pairing is not exposed by this UI.
The website prevents competing **Pi** senders and website controls. It cannot
prevent another device on the LAN from connecting directly to the Eversolo.

Audio travels from mpv through an ALSA loopback to a PCM pipe read by OwnTone;
only one OwnTone output is selected. The hardware jack and weather audio retain
their existing ALSA path. OwnTone discovers receivers on the LAN; an nftables
rule blocks external access to its HTTP, websocket, and MPD control ports, so
another LAN browser cannot bypass the website lock through its separate UI.
The service reloads that rule before every start and refuses to start if it
cannot apply it. The web remote accesses OwnTone through localhost.
Release stops the capture and OwnTone stream, then restarts idle discovery.
The mpv routing script detects the removed route and returns to the jack without
restarting the video. The shared mute flag also mutes mpv while it is casting;
the remote volume slider adjusts the selected receiver during AirPlay. `tv
volume` continues to control the local jack; use the remote for receiver volume.
`tv airplay-stop` is an SSH recovery command.

OwnTone/AirPlay buffers audio. `AIRPLAY_LATENCY_MS=2000` shifts video to compensate;
tune this in the env file and restart `crt-remote.service` for your receiver and
network. Receiver buffer and lip-sync need verification on the real Pi/Eversolo.
The UI shows a selected/routed output, not a claim that sound was measured at
the speakers. Titles retry if the metadata pipe is not yet ready. OwnTone logs/cache/database
are in RAM under `/run/crt-owntone`, so discovery does not add SD-card writers;
receiver pairing state is not retained across reboot in this appliance setup.

Development checks: `node --test remote/test/*.test.mjs`,
`node --check remote/server.mjs`, and `bash -n setup/install.sh setup/airplay.sh`.
Tests cover concurrent browsers, expiry, disconnect failure, output selection,
metadata encoding and changes, and missing metadata readers. After installing,
verify actual audio, title changes through a commercial, mute/volume, lip-sync,
and stop/release with the Eversolo before relying on the setup.

References: [OwnTone pipe audio/metadata](https://owntone.github.io/owntone-server/library/),
[OwnTone output API](https://owntone.github.io/owntone-server/json-api/),
[Eversolo AirPlay](https://www.eversolo.com/musicservice/airplay.html).

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

The TV uses the Raspberry Pi's analogue TRRS jack by default. Optional
AirPlay video audio uses OwnTone with metadata (see above); weather remains
on the jack. The retired PipeWire routing stack is not required.

Volume is normalized around the local jack: mpv and the weather music stay at
100%, while the hardware mixer starts at 50%, so the remote's slider is the
one volume control that matters. Levels are set once at boot, and once you
move the slider (or run `tv volume`), your level sticks: unmuting returns to
it instead of the default. `tv normalize` resets the jack to 50%.

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
