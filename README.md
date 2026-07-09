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

   **Updating later is the same command** — it re-syncs `/opt/crt-tv` to the
   latest `main` and reinstalls, from any directory.

   Developers can run `sudo setup/install.sh` from their own checkout
   instead; that installs the checkout as-is, without syncing.

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
tv airplay          # toggle audio output: AirPlay speakers <-> TV jack
tv volume [0-100]   # show or set the volume of the active output
tv normalize        # reset output levels (jack 50%, AirPlay 10%)
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

**On boot** the TV shows the WeatherStar, muted, for 3 minutes — then
rolls the videos channel by itself, shuffled, commercials every 4th video
as always. Tap any control on the web remote before then (mute, volume,
a mode button…) and the rotation stands down: the TV is yours. Unmute
when you want sound — one toggle covers the weather music and the videos
alike, and it comes up at the default level (jack at 50%, AirPlay at 10%)
with the slider showing it, so there's headroom to raise it (the PVM's
own volume sits at full). Once you move the slider, your level is the one
that sticks.

`tv play` accepts bare names relative to `MEDIA_DIR` (default `/srv/media`,
set in `/etc/crt-tv/crt-tv.env`). Switching between weather and video is
seamless — starting one stops the other via systemd `Conflicts=`.

### Web remote

Open `http://<pi-address>:8090/` from any browser on your network for a
remote control: switch channels, upload into either bucket (videos or
commercials) straight from your phone or laptop, drag to reorder the
channel, and tap any row for actions (play, queue, rename, move between
buckets, delete) — plus transport, a draggable position bar to skip or
rewind within the playing video, mute/shuffle/no-commercials toggles,
and a Pi reboot. Styled like a native iOS app, dark mode included. It's the same `tv` command underneath, so the
CLI and the web UI never disagree.

The remote is a mobile web app: open it on your phone and use **Add to Home
Screen** (Safari share menu on iOS, browser menu on Android) to get it as an
app with its own icon, running fullscreen.

**The videos bucket order is the broadcast schedule**: it persists (hidden
`.order.json`/`.playorder.m3u` files in `MEDIA_DIR`) and is exactly what
plays when you hit Play videos. The play queue, by contrast, is a one-off
list for live mixing and vanishes when replaced.

No authentication — it's meant for your LAN. Don't port-forward it.

### HTTPS for the web remote

The remote can be served as `https://tv.example.com/` with a real
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
3. Set `HTTPS_DOMAIN=tv.example.com` in `/etc/crt-tv/crt-tv.env`
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
docs/       hardware wiring, composite video deep-dive & troubleshooting
```

## AirPlay audio

The TV's sound (weather music and video audio alike) can play through
AirPlay speakers instead of the PVM: PipeWire's RAOP module discovers
AirPlay receivers on the LAN (an EverSolo, HomePod, AirPort amp, …) and the
**AirPlay chip in the web remote** opens a picker listing the receivers by
name — tap one and the audio moves there live, no restart. The TV's own
speaker isn't in the list: it's the home state, returned to via
"Stop AirPlay". The chip stays lit while casting, and the Mute chip and
volume slider follow whichever output is active. (`tv airplay` on the CLI
toggles between the jack and the first receiver found.)

Boot always lands on the TV jack: AirPlay needs the receiver awake and a
fresh handshake, so after a reboot or power cycle the TV never sits waiting
on one — re-pick the AirPlay output when you want it. Every time an AirPlay
device is engaged it starts at **10% volume** (they usually feed amplified
speakers); raise the slider from there. The jack starts at 50%.

**Track titles on the receiver**: each device also appears as a
"(with titles)" variant, which routes through an OwnTone bridge instead of
PipeWire's sender — the receiver's display then shows artist/title parsed
from the `Artist - Title.ext` filename, updating on every track change.
PipeWire's own sender can't carry metadata, so this is a parallel path:
audio flows into a bridge sink, a feeder pipes it to OwnTone, and the
player pushes metadata alongside. Slightly different plumbing, same
controls (volume slider, mute, 10% engage) — pick whichever variant of
your speaker you prefer.

Volume is normalized: the software stages (mpv, the weather music, the
hardware mixer) are pinned to 100% at boot and each output starts at its
default level (jack 50%, AirPlay 10%), so switching outputs never jumps
loudness and the slider is the one volume control that matters. Levels are
set once at boot — nothing re-writes them behind your back — and once you
move the slider (or run `tv volume`), your level sticks: unmuting returns
to it instead of the defaults. `tv normalize` resets to the defaults.

Widescreen handling: 16:9 videos zoom to fill the 4:3 screen (center-cut,
sides cropped — the broadcast way). Set `CRT_PANSCAN=0` in
`/etc/crt-tv/crt-tv.env` for letterboxing instead. The player also knows the
720×480 raster displays as 4:3, so nothing renders squeezed.

Files are loudness-normalized too: each upload gets a one-time EBU R128
analysis (ffmpeg, in the background) and the player applies a per-file gain
toward −16 LUFS with true-peak headroom — so quiet rips and loud commercials
come out at the same level, dynamics untouched. Fresh uploads play at unity
until their analysis finishes (seconds per file).

Notes: the receiver must be powered on and on the same network (discovery
is via mDNS/avahi). AirPlay buffers about two seconds — the RAOP latency is
pinned (`raop.latency.ms`) and the player shifts video by the same amount
(`AIRPLAY_LATENCY_MS` in `crt-tv.env`), so lip-sync holds while casting;
expect a few silent seconds right after selecting a device while the
session handshakes. RAOP streams never suspend (idle-resume silently fails
on many receivers). Tweak both latency values together if your receiver
needs it.

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
