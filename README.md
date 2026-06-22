# crt-tv

Drive a CRT — specifically a **Sony PVM-9045Q** — from a **headless Raspberry
Pi 4** over composite (NTSC) video. The Pi powers on into a continuous,
TV-station-style output and you steer it from a web dashboard on your LAN. No
keyboard, mouse, or HDMI monitor required after setup.

The Pi continuously shows one of three **modes**:

- **Weather** — a **WeatherStar 4000**-style forecast (the 1990s Weather Channel
  look): blue gradient panels, the Star4000 font, and a rotating cycle of screens
  — Current Conditions, Latest Observations, Hourly Forecast, Local Forecast,
  Extended Forecast (two pages), Travel Forecast, and Almanac — with a scrolling
  lower ticker. Data comes from Open-Meteo (no API key, works worldwide). **This
  is the default mode shown on boot.**
- **Teletext** — a Ceefax-style page with a live clock and the classic 8-colour
  teletext palette.
- **Video** — a continuous 480i playlist from a local folder, uploaded and
  reordered from the dashboard.

A **web dashboard** on your local network picks what's on screen, shows a live
preview of the output, manages the video library (upload / reorder / delete),
and sets the weather location — all of which persist across reboots.

---

## Contents

- [Requirements](#requirements)
- [How it works (architecture)](#how-it-works-architecture)
- [Repository layout](#repository-layout)
- [Quick start (local dev, no Pi)](#quick-start-local-dev-no-pi)
- [Deploy to the Raspberry Pi 4](#deploy-to-the-raspberry-pi-4)
  - [One-line install](#one-line-install)
  - [Reinstall from a wiped SD card](#reinstall-from-a-wiped-sd-card)
  - [Manual install](#manual-install)
  - [Enable composite NTSC output](#enable-composite-ntsc-output)
  - [Wiring (Pi 4 → PVM-9045Q)](#wiring-pi-4--pvm-9045q-composite-bnc)
- [Boot & power behaviour](#boot--power-behaviour)
- [Operating it](#operating-it)
- [Configuration reference](#configuration-reference)
- [HTTP & WebSocket API reference](#http--websocket-api-reference)
- [Modes in depth](#modes-in-depth)
- [Troubleshooting](#troubleshooting)
- [Tuning & notes](#tuning--notes)
- [Roadmap](#roadmap)
- [Credits & licensing](#credits--licensing)

---

## Requirements

**Hardware**

- **Raspberry Pi 4 Model B** (the composite/`enable_tvout` path and the
  `vc4-fkms-v3d` overlay are specific to it).
- A microSD card (8 GB+), a 4-pole **3.5 mm TRRS** A/V cable, and an **RCA→BNC**
  adapter — see [Wiring](#wiring-pi-4--pvm-9045q-composite-bnc).
- A composite **NTSC** CRT (this project targets the **Sony PVM-9045Q**).

**Software (on the Pi)** — all installed automatically by `deploy/install.sh`
except the OS:

| Component            | Version / notes                                              |
|----------------------|--------------------------------------------------------------|
| Raspberry Pi OS      | **Bookworm** (64-bit, **Lite** is fine — no desktop needed)   |
| Python               | **3.11+** (ships with Bookworm)                              |
| Python packages      | pinned in [`requirements.txt`](requirements.txt) (FastAPI, uvicorn, httpx, python-multipart) |
| Chromium             | `chromium-browser` (kiosk display)                          |
| X server             | `xserver-xorg` + `xinit` (runs Chromium on tty1)            |
| Network              | internet access for weather (Open-Meteo) + the install      |

**For local development (no Pi)** — see [Quick start](#quick-start-local-dev-no-pi):
Python **3.9+** is enough (the apps are dependency-free vanilla JS, no Node build
step). This repo is **crt-tv v0.1.0**.

## How it works (architecture)

Everything is served by **one FastAPI process** (`crt_tv.main:app`, run by
`uvicorn`). That single process exposes four web surfaces and a small JSON/REST
+ WebSocket API:

| Surface     | Path        | Who uses it                                            |
|-------------|-------------|--------------------------------------------------------|
| Display     | `/display`  | The on-CRT app (full-screen), shown by Chromium kiosk  |
| Dashboard   | `/`         | You, from any LAN browser — controls + live preview    |
| Preview     | `/preview`  | You — the display inside a simulated PVM bezel          |
| Media       | `/media`    | Static video files (HTTP Range, so `<video>` streams)  |

```
┌─────────────┐  /api/mode, /api/upload  ┌────────────────────────────┐
│  Dashboard  │ ───────────────────────▶ │  FastAPI service (Pi)      │
│ (any LAN    │ ◀──────── /ws state ───  │  • state + WebSocket hub   │
│  browser)   │                          │  • weather/playlist/upload │
└─────────────┘                          └──────────────┬─────────────┘
                                                     │ /ws state
                                          ┌──────────▼───────────┐      composite
                                          │ Chromium kiosk        │  ───────────────▶  Sony
                                          │ /display (full-screen)│      NTSC 480i      PVM-9045Q
                                          └───────────────────────┘
```

Key design decisions, and why:

- **Single render surface.** All three modes render in the **browser**
  (`/display`). Video plays via an HTML5 `<video>` element rather than a separate
  player, so there's never a z-order fight between a media player and a web view —
  one Chromium window is the entire picture. (If browser decode ever struggles on
  heavy files, an `mpv` backend is the planned alternative; see Roadmap.)
- **The kiosk is just a browser.** `crt-tv-kiosk` runs `xinit` on **tty1** (the
  framebuffer console, which is the composite output) and launches Chromium in
  `--kiosk` mode pointed at `http://localhost:8000/display`. The Pi's composite
  DAC mirrors that framebuffer to the PVM as a 480i NTSC signal.
- **One source of truth, pushed live.** The current mode lives in a tiny
  in-memory `StateManager` (`state.py`). Every connected client — the CRT
  display, the dashboard, the preview, multiple browsers — holds a WebSocket to
  `/ws` and receives the full state whenever it changes, so they never drift.
- **Persistence is deliberate and crash-safe.** Things you set from the UI (the
  weather location) and the playlist order are written to disk **atomically**
  (temp file → `fsync` → rename) so an abrupt power cut can't leave a
  half-written file. See [Configuration reference](#configuration-reference) for
  the precedence rules.

## Repository layout

```
crt_tv/                FastAPI service (Python)
  main.py              app wiring: REST API, /ws, static mounts, redirects
  config.py            config.toml loader + dataclass defaults
  state.py             in-memory mode state + WebSocket broadcast hub
  services/
    weather.py         Open-Meteo fetch + geocoding (city/ZIP), shaped & cached
    playlist.py        scans media/, persists play order (.order.json)
    store.py           persisted runtime state (state.json) + atomic_write_text
web/
  display/             the full-screen app shown on the CRT
    index.html         three layers: #teletext, #weather, #video
    display.js         /ws controller — swaps the active mode
    teletext.js        Ceefax page + live clock
    weather.js         WeatherStar 4000 screen cycle + ticker + cold-boot retry
    ws4000.css         WeatherStar styling + Star4000 @font-face
    video.js           HTML5 playlist playback, loops continuously
    assets/            fetched fonts + icons (git-ignored; see fetch-assets.sh)
  control/             the dashboard (live preview, mode picker, weather, library)
  preview/             /display inside a simulated PVM-9045Q bezel
deploy/
  bootstrap.sh         one-line installer (clones from GitHub, runs install.sh)
  install.sh           per-host setup: packages, venv, assets, systemd units
  crt-tv.service       FastAPI service unit (templated to the install user/dir)
  crt-tv-kiosk.service Chromium kiosk unit (takes over tty1)
  kiosk.sh             waits for the service, launches Chromium --kiosk
  config.txt.snippet   composite NTSC settings for /boot/firmware/config.txt
media/                 drop video files here (git-ignored)
data/                  persisted runtime state, e.g. state.json (git-ignored)
config.example.toml    copy to config.toml to override defaults
scripts/dev.sh         run locally with autoreload
```

## Quick start (local dev, no Pi)

You can develop and play with everything on macOS or Linux — no Raspberry Pi and
no hardware needed.

```bash
# one-off: fetch the WeatherStar 4000 fonts + icons for the weather mode
./web/display/assets/fetch-assets.sh

# create a venv (first run) and start uvicorn with autoreload
./scripts/dev.sh
```

Then open:

- Dashboard: <http://localhost:8000/> — controls **plus a live preview** of the
  output embedded at the top of the page
- Preview (full PVM bezel): <http://localhost:8000/preview>
- Raw display (what the kiosk shows): <http://localhost:8000/display>

Switching modes in one tab updates every other tab live over WebSocket. Drop a
couple of `.mp4` files into `media/` (or upload them from the dashboard) to
exercise video mode. Requires Python 3.9+ (the Pi runs 3.11); dependencies are in
`requirements.txt`.

## Deploy to the Raspberry Pi 4

Target: **Raspberry Pi OS Bookworm** (Lite is fine — no desktop needed).

### One-line install

The installer is hosted on GitHub. SSH into the Pi and run:

```bash
curl -sSL https://raw.githubusercontent.com/masipah/crt-tv/main/deploy/bootstrap.sh | bash
```

What it does:

1. `apt-get install` git + curl, then **`git clone`** `github.com/masipah/crt-tv`
   to `~/crt-tv` (re-running instead **updates** the existing checkout).
2. Runs `deploy/install.sh`, which installs Chromium + X, builds the Python venv,
   writes `config.toml` (only if missing), fetches the WeatherStar fonts/icons,
   and installs + enables the two systemd services.
3. Prints your dashboard / preview / display URLs.

The systemd units are **generated for the user that runs the installer** and the
repo path it lives in — there's no hardcoded `pi`, so any username works.
**Re-running the one-liner updates the checkout and restarts the services**,
which is how you pull a fix onto a running Pi. (Static IP is intentionally not
handled — set a DHCP reservation on your router instead.)

> Different repo owner/name? Set `CRT_TV_REPO`, e.g.
> `… | CRT_TV_REPO=https://github.com/you/crt-tv.git bash`. The repo must be
> **public** for the unauthenticated clone, or use `CRT_TV_TARBALL=<url>`.

### Reinstall from a wiped SD card

Everything needed is in the GitHub repo, so a from-scratch rebuild is a flash and
one command. Full procedure:

1. **Flash Raspberry Pi OS** with [Raspberry Pi Imager](https://www.raspberrypi.com/software/):
   choose **Raspberry Pi OS (64-bit) — Lite** (Bookworm). Before writing, open the
   **gear / Edit Settings** and set:
   - **hostname** (e.g. `crt-tv`)
   - **enable SSH** (password or key)
   - **username + password** — any username works; the installer configures the
     services for whoever runs it.
   - **Wi-Fi + locale** if not on Ethernet.
2. **Boot and SSH in.** Give the Pi a **DHCP reservation** on your router so its IP
   is stable, then `ssh <user>@<pi-ip>`.
3. **Run the installer:**
   ```bash
   curl -sSL https://raw.githubusercontent.com/masipah/crt-tv/main/deploy/bootstrap.sh | bash
   ```
   A fresh install writes a default `config.toml`, so it already **boots into
   Weather**.
4. **Set your weather location** from the dashboard at `http://<pi-ip>:8000/`
   (city or ZIP) — this is the one thing a wipe loses (see below).
5. **Re-enable composite** (one-off): append
   [`deploy/config.txt.snippet`](deploy/config.txt.snippet) to
   `/boot/firmware/config.txt` and reboot. *(This disables HDMI — manage over SSH.)*

**What a wipe loses** (these are local, not in git — back them up first if you
want to skip re-entering them):

| File / folder        | Holds                          | Restore                              |
|----------------------|--------------------------------|--------------------------------------|
| `~/crt-tv/config.toml` | port, units, `regional_cities` | re-created from defaults, or copy back |
| `~/crt-tv/data/state.json` | UI-set weather location    | re-enter in the dashboard, or copy back |
| `~/crt-tv/media/`    | uploaded videos                | re-upload, or copy back              |

To preserve them across a wipe, before reformatting:
`scp -r <user>@<pi-ip>:~/crt-tv/{config.toml,data,media} ./crt-tv-backup/`, then
copy them back into `~/crt-tv/` after step 3 and `sudo systemctl restart crt-tv`.

### Manual install

```bash
git clone https://github.com/masipah/crt-tv.git ~/crt-tv
cd ~/crt-tv && bash deploy/install.sh
```

Same effect as the one-liner minus the bootstrap. The script is idempotent — run
it again any time to update + restart.

### Enable composite NTSC output

This is a **one-off** firmware change. Append
[`deploy/config.txt.snippet`](deploy/config.txt.snippet) to
`/boot/firmware/config.txt` and reboot.

```ini
enable_tvout=1            # turn on the composite DAC (off by default on Pi 4)
sdtv_mode=0              # 0 = NTSC (the PVM-9045Q is NTSC)
sdtv_aspect=1            # 4:3
dtoverlay=vc4-fkms-v3d   # composite needs firmware-KMS, not the default full-KMS
hdmi_ignore_hotplug=1
disable_overscan=1       # crt-tv keeps content in its own title-safe box
disable_splash=1         # skip the rainbow → boot console reads as "code"
```

> ⚠️ **On the Pi 4, enabling composite disables HDMI output.** From this point on
> manage the Pi over SSH. Keep `/boot/firmware/cmdline.txt` free of `quiet` so
> the Linux boot text stays visible on the CRT (see
> [Boot & power behaviour](#boot--power-behaviour)).

### Wiring (Pi 4 → PVM-9045Q composite BNC)

The Pi 4 outputs composite + audio on the 4-pole **3.5 mm TRRS** A/V jack. Use a
TRRS breakout or A/V cable — but mind the pinout: Raspberry Pi puts **video on
the sleeve**, not where some cheap cables assume.

| TRRS contact | Signal              |
|--------------|---------------------|
| Tip          | Audio left          |
| Ring 1       | Audio right         |
| Ring 2       | Ground              |
| Sleeve       | **Composite video** |

Take the composite (yellow RCA) line into an **RCA→BNC** adapter and feed the
PVM-9045Q's composite **VIDEO IN** (BNC). Set the monitor's input to LINE. If the
unused input has a 75 Ω termination switch, leave it terminated.

## Boot & power behaviour

Designed to be left plugged in and to survive being switched off at the wall:

- **Starts on every boot.** Both services are systemd-`enable`d, so power-on (or
  any unexpected reboot) brings the app back with zero intervention.
- **Boots into Weather, on your saved location.** `default_mode = "weather"` and
  the location lives in `data/state.json`, so the CRT comes up showing
  WeatherStar 4000 for your city without anyone touching the dashboard.
- **What the CRT shows on power-up:** the Linux boot console (kernel/systemd text
  on tty1 = the composite output), then `crt-tv-kiosk` takes over tty1
  (`Conflicts=getty@tty1.service`) and Chromium fills it with the display — so it
  reads as **boot code → WeatherStar**. `disable_splash=1` skips the rainbow.
- **Survives abrupt power loss.** `state.json` and the playlist `.order.json` are
  written atomically (temp file → `fsync` → rename), so a yank mid-write can't
  corrupt them. Services use `Restart=on-failure`. If the network isn't up yet at
  boot, the weather screen shows “WAITING FOR WEATHER…” and retries every 15 s.

> For maximum resilience against SD-card wear you can enable the read-only
> overlay filesystem (`raspi-config` → Performance → Overlay FS) — but then
> `media/` uploads and location changes won't persist. Leave it off if you want
> those saved.

## Operating it

Open the dashboard at `http://<pi-ip>:8000/` from any browser on your network.
On boot it's already showing **Weather**; Teletext and Video are opt-in (and
Video needs clips uploaded first).

- **Live output** — the top of the dashboard embeds the real `/display`, so you
  see exactly what the CRT is showing and watch it change as you switch modes —
  no monitor required.
- **Display** — pick **Teletext**, **Weather**, or **Video**; the PVM switches
  instantly. "Now showing" reflects live state across all browsers.
- **Weather location** — type a **city or US ZIP**, choose °F/°C, Save. It's
  geocoded, applied to the CRT immediately, and saved across reboots. A bad entry
  is rejected without losing your last good location.
- **Video library** — drag-and-drop or browse to **upload** (with a progress
  bar). **Play** any clip (switches to Video and jumps to it), **Delete** it, or
  **drag the ⠿ handle to reorder** the loop. The CRT refreshes automatically on
  upload / delete / reorder.

### systemd operations (on the Pi)

```bash
systemctl status crt-tv             # is the service running?
journalctl -u crt-tv -f             # follow service logs
journalctl -u crt-tv-kiosk -f       # follow kiosk (Chromium/X) logs
sudo systemctl restart crt-tv       # restart after a config.toml change
sudo systemctl restart crt-tv-kiosk # reload the on-screen browser
sudo systemctl disable --now crt-tv-kiosk   # silence the kiosk until the CRT is connected
```

## Configuration reference

There are three layers, in increasing precedence:

1. **Built-in defaults** (`crt_tv/config.py`) — used if there's no config file.
2. **`config.toml`** — install-time defaults (copied from `config.example.toml`).
3. **`data/state.json`** — runtime choices made in the UI; **overrides
   `config.toml`** and survives reboots.

### `config.toml`

| Key                      | Default      | Meaning                                                        |
|--------------------------|--------------|----------------------------------------------------------------|
| `default_mode`           | `"weather"`  | Mode shown on boot: `weather` \| `teletext` \| `video`         |
| `[server] host`          | `"0.0.0.0"`  | Bind address (`0.0.0.0` = reachable on the LAN)                |
| `[server] port`          | `8000`       | HTTP port                                                      |
| `[weather] location`     | `"London"`   | **City name or US ZIP** — geocoded automatically              |
| `[weather] country`      | `""`         | Optional ISO code (e.g. `"US"`) to disambiguate city names    |
| `[weather] units`        | `"metric"`   | `metric` (°C, km/h) or `imperial` (°F, mph)                    |
| `[weather] latitude`     | _(unset)_    | Pin an exact point; with `longitude`, **skips geocoding**     |
| `[weather] longitude`    | _(unset)_    | See `latitude`                                                 |
| `[weather] location_name`| `""`         | Display name override (else the geocoded name is used)        |
| `[weather] timezone`     | `"auto"`     | IANA tz, or `"auto"` to derive from coordinates               |
| `[weather] regional_cities`| `[]`       | Cities/ZIPs for the Latest Observations + Travel screens (empty = those screens hidden) |
| `[video] media_dir`      | `"media"`    | Folder of video files (relative to repo root, or absolute)    |
| `[video] shuffle`        | `false`      | Randomise play order (ignores the saved manual order)         |

### `data/state.json` (managed by the UI, do not hand-edit)

| Key                | Set by                          | Effect                                  |
|--------------------|---------------------------------|-----------------------------------------|
| `weather_location` | dashboard → Weather location    | Overrides `[weather] location`          |
| `weather_country`  | dashboard                       | Overrides `[weather] country`           |
| `weather_units`    | dashboard (°F/°C)               | Overrides `[weather] units`             |

The playlist order is stored separately in `media/.order.json`.

### Environment variables

| Variable             | Used by            | Purpose                                             |
|----------------------|--------------------|-----------------------------------------------------|
| `CRT_TV_CONFIG`      | the service        | Path to the config file (default `./config.toml`)   |
| `CRT_TV_DISPLAY_URL` | `kiosk.sh`         | URL Chromium opens (default `localhost:8000/display`)|
| `CRT_TV_DIR`         | `bootstrap.sh`     | Install location (default `$HOME/crt-tv`)           |
| `CRT_TV_REPO`        | `bootstrap.sh`     | Git URL to clone                                    |
| `CRT_TV_REF`         | `bootstrap.sh`     | Git branch/tag (default `main`)                     |
| `CRT_TV_TARBALL`     | `bootstrap.sh`     | Fetch a `.tar.gz` instead of cloning                |

## HTTP & WebSocket API reference

All responses are JSON. The control surfaces use only these endpoints, so the
same API drives any custom client.

| Method & path             | Body                                   | Returns / effect                                                |
|---------------------------|----------------------------------------|-----------------------------------------------------------------|
| `GET /api/health`         | —                                      | `{ ok, mode }`                                                  |
| `GET /api/state`          | —                                      | `{ state: { mode, video_index }, modes: [...] }`               |
| `POST /api/mode`          | `{ "mode": "weather" }`                | Switch mode (400 on invalid); broadcasts state                 |
| `POST /api/video/index`   | `{ "index": 2 }`                       | Jump the playlist to index; broadcasts state                   |
| `GET /api/weather`        | —                                      | Full shaped forecast (current/forecast/almanac), cached 10 min |
| `GET /api/weather/settings`| —                                     | `{ location, country, units }` (the effective values)          |
| `POST /api/weather/location`| `{ location, country?, units? }`     | Validate + persist location (502 if it can't be resolved; the previous value is kept) |
| `GET /api/playlist`       | —                                      | `{ videos: [ { name, file, url } ] }` in play order            |
| `POST /api/playlist/order`| `{ "order": ["b.mp4","a.mp4"] }`       | Persist a new order; broadcasts `playlist`                     |
| `POST /api/upload`        | `multipart/form-data` `files`          | Save videos (non-video rejected, names sanitised + uniquified) |
| `DELETE /api/video/{name}`| —                                      | Delete a clip (confined to the media dir)                      |

### WebSocket `/ws`

On connect you immediately receive the current state. Thereafter the server
pushes a message whenever something changes. Messages are JSON with a `type`:

| `type`     | Payload            | Meaning — clients should…                                  |
|------------|--------------------|------------------------------------------------------------|
| `state`    | `{ state: {...} }` | Mode or video index changed → switch the active display    |
| `playlist` | —                  | Library changed (upload/delete/reorder) → reload playlist  |
| `weather`  | —                  | Weather location changed → re-fetch and re-render weather  |

The client sends nothing meaningful; the socket is server-push only and the
display/dashboard auto-reconnect every 2 s if it drops.

## Modes in depth

### Weather (WeatherStar 4000)

Modelled on the **WeatherStar 4000+** project
([github.com/netbymatt/ws4kp](https://github.com/netbymatt/ws4kp), MIT) — the
Star4000 font, blue gradient panels, the current-conditions icon set, and a
rotating cycle of screens with a scrolling lower ticker:

| Screen               | Source                          | Shown when…                     |
|----------------------|---------------------------------|---------------------------------|
| Current Conditions   | current obs                     | always                          |
| Latest Observations  | `regional_cities` current obs   | `regional_cities` configured    |
| Hourly Forecast      | next 12 hours                   | always                          |
| Local Forecast       | daily narrative (Today/…)       | always                          |
| Extended Forecast    | days 1–3 and 4–6 (two pages)    | always                          |
| Travel Forecast      | `regional_cities` hi/lo         | `regional_cities` configured    |
| Almanac              | sunrise/sunset/moon phase       | always                          |

The city screens (Latest Observations, Travel Forecast) appear only if you set
`[weather] regional_cities` in `config.toml` — they're fetched in a single
multi-coordinate Open-Meteo request. Two deliberate differences from ws4kp:

- **Data source is Open-Meteo, not NWS.** ws4kp uses `api.weather.gov`, which is
  US-only; Open-Meteo works anywhere, so this runs for any city/ZIP. US ZIPs are
  resolved via [Zippopotam](https://api.zippopotam.us); city names via Open-Meteo
  geocoding. Dewpoint, wind direction, pressure, sunrise/sunset and moon phase
  are computed/derived to fill the classic panels.
- **Fonts and icons are fetched, not committed.** They're TWCClassics assets (see
  [`web/display/assets/CREDITS.md`](web/display/assets/CREDITS.md)).
  `deploy/install.sh` fetches them; for local dev run
  `web/display/assets/fetch-assets.sh` once. Without them the weather mode still
  works, falling back to a monospace font and text labels.

Not affiliated with or endorsed by The Weather Channel.

### Teletext

A Ceefax-style "page 100" with a header (service + page number + live clock), a
coloured body, and a Fastext footer, in the 8 teletext colours on black. For an
authentic glyph set, install a teletext font such as *Bedstead* on the Pi —
`display.css` already prefers it and falls back to a heavy monospace.

### Video

A continuous loop over the files in `media/`, played by an HTML5 `<video>`
element. Output is inherently **480i** (composite NTSC); source files play most
reliably as **progressive H.264, 4:3** (or 16:9 letterboxed). Uploads are
streamed to disk in chunks (large files are fine); you can also `scp`/drop files
straight into `media/` and the library will pick them up. Play order is set by
drag-reorder and stored in `media/.order.json`.

## Troubleshooting

| Symptom                                            | Likely cause / fix                                                                                 |
|----------------------------------------------------|----------------------------------------------------------------------------------------------------|
| `{"detail":"Not Found"}` at `/preview`             | Old build without the redirect — use `/preview/` (trailing slash), or update + restart.            |
| Dashboard loads but nothing happens on the CRT     | `crt-tv-kiosk` not running or no composite. `journalctl -u crt-tv-kiosk -f`; check the firmware snippet and reboot. |
| HDMI monitor went black after the firmware change  | Expected — composite disables HDMI on the Pi 4. Manage over SSH.                                    |
| No picture on the PVM at all                       | Verify TRRS pinout (**video on the sleeve**), `sdtv_mode=0` (NTSC), monitor set to LINE, 75 Ω termination on the unused input. |
| Boot text doesn't show on the CRT                  | `quiet` in `/boot/firmware/cmdline.txt` — remove it.                                                |
| Weather shows “WAITING FOR WEATHER…”               | Network not up yet (it retries every 15 s), or a bad location. Check `GET /api/weather` and `journalctl -u crt-tv`. |
| Saved a city but it says it can't be found         | Try adding `country`, or use a US ZIP. The previous good location is preserved.                     |
| Still boots into Teletext                          | An existing `config.toml` predates the new default — set `default_mode = "weather"` and `sudo systemctl restart crt-tv`. |
| Services won't start / wrong paths                 | Re-run `bash deploy/install.sh`; units are regenerated for the current user and repo path.          |
| Weather font looks like plain monospace            | The WeatherStar assets weren't fetched — run `web/display/assets/fetch-assets.sh`, then restart the kiosk. |

## Tuning & notes

- **Overscan / safe area.** The display keeps content in a title-safe box
  (`#overscan` in `display.css`, inset ~6–7 %). If the PVM crops more or less,
  adjust those insets.
- **CRT overlay.** A subtle scanline overlay is layered on the teletext/weather
  pages; add `body.no-crt` to disable it. **Video is exempt** — it plays raw, with
  no software scanlines/filters, since the Pi's composite output already does the
  480i/CRT conversion in hardware. The previews mirror the output as-is too.
- **Re-encoding video.** `ffmpeg -i in.mkv -vf scale=720:480 -c:v libx264 out.mp4`
  produces a CRT-friendly progressive file.
- **Updating.** Re-run the one-liner (or `bash deploy/install.sh`) — it updates
  the checkout and restarts the services in one go.

## Roadmap

- `mpv` video backend option (hardware decode, better interlaced handling)
- Animated radar screen (e.g. RainViewer tiles) — the main ws4kp screen not yet ported
- Multiple teletext pages / a page-number entry on the dashboard
- Optional real broadcast teletext in the VBI via `raspi-teletext`
- A dashboard control for `default_mode` (set the boot mode without editing config)
- Brightness / scanline toggles from the dashboard

## Credits & licensing

- **WeatherStar 4000+** — <https://github.com/netbymatt/ws4kp> (MIT) — the look,
  screen cycle, and current-conditions icon naming are modelled on this project.
- **Star4000 font set & weather icons** — TWCClassics (icons by Charles Abel,
  Nick Smith, Malek Masoud); fetched at install time, not redistributed here. See
  [`web/display/assets/CREDITS.md`](web/display/assets/CREDITS.md).
- **Weather data** — [Open-Meteo](https://open-meteo.com); **US ZIP geocoding** —
  [Zippopotam.us](https://www.zippopotam.us).

A non-commercial hobby build, not affiliated with The Weather Channel, Sony, or
the Raspberry Pi Foundation.
