# crt-tv

Drive a CRT — specifically a **Sony PVM-9045Q** — from a **headless Raspberry Pi 4**
over composite (NTSC) video. The Pi continuously outputs one of three modes:

- **Teletext** — a Ceefax-style page
- **Weather** — a **WeatherStar 4000**-style forecast (the 1990s Weather Channel
  look), cycling Current Conditions → Extended Forecast → Almanac with a
  scrolling ticker. Data from Open-Meteo (no API key, works worldwide).
- **Video** — a continuous 480i playlist from a local folder

A **web dashboard** on your local network picks what's on screen, manages the
video library, and lets you **upload clips** straight from the browser.

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

Both apps and the display are served by one FastAPI process. The display is a
full-screen web page shown by Chromium in kiosk mode; the Pi's composite DAC
mirrors it to the PVM as a 480i NTSC signal.

## Layout

```
crt_tv/              FastAPI service
  main.py            app wiring: API, /ws, static mounts
  config.py          TOML config loader (+ defaults)
  state.py           shared mode state + WebSocket broadcast
  services/
    weather.py       Open-Meteo fetch, shaped for the page (cached)
    playlist.py      scans media/, persists play order (.order.json)
web/
  display/           full-screen app shown on the CRT (teletext/weather/video)
    ws4000.css       WeatherStar 4000 styling + Star4000 @font-face
    weather.js       WeatherStar 4000 screen cycle + ticker
    assets/          fetched fonts + icons (git-ignored; see fetch-assets.sh)
  control/           control dashboard (mode picker, upload, drag-reorder)
  preview/           CRT-bezel preview of /display (test before the real TV)
deploy/
  bootstrap.sh       one-line installer (clones from GitHub, runs install.sh)
  install.sh         per-host setup (venv, services, assets)
  vercel/            masipah.com rewrite that proxies /crt-tv/install.sh
  config.txt.snippet composite NTSC settings · *.service systemd units · kiosk.sh
media/               drop video files here (gitignored)
scripts/dev.sh       run locally with autoreload
```

## Develop locally (macOS / Linux)

No Pi needed to work on the apps:

```bash
# one-off: fetch the WeatherStar 4000 fonts + icons for the weather mode
./web/display/assets/fetch-assets.sh

./scripts/dev.sh
```

Then open:

- Dashboard: <http://localhost:8000/>
- **Preview** (simulated CRT): <http://localhost:8000/preview>
- Raw display: <http://localhost:8000/display>

The **preview** page is the easiest way to play with this before any hardware:
it embeds the real display app in a simulated PVM bezel and lets you switch
modes. Changes propagate live over WebSocket, so the dashboard, preview, and the
actual CRT all stay in sync. Upload a couple of `.mp4`s from the dashboard (or
drop them into `media/`) to exercise video mode.

## Configure

```bash
cp config.example.toml config.toml
```

Edit `config.toml` for your weather location, units, port, and media folder.
The service runs fine with no config file (defaults to London / metric).

## Deploy to the Raspberry Pi 4

### One-line install

The code is hosted on GitHub (`github.com/masipah/crt-tv`); masipah.com just
proxies the installer. On a fresh Raspberry Pi OS, SSH in and run:

```bash
curl -sSL https://masipah.com/crt-tv/install.sh | bash
```

This `git clone`s the repo to `~/crt-tv`, runs `deploy/install.sh` (Chromium + X,
the venv, `config.toml`, the WeatherStar assets, and the `crt-tv` +
`crt-tv-kiosk` services), and prints your dashboard URL. Re-running it updates an
existing checkout. Static IP isn't handled here — set it on your router/network.

> **Hosting.** Push this repo to `github.com/masipah/crt-tv`, then add the Vercel
> rewrite in [`deploy/vercel/`](deploy/vercel/) to your masipah.com project so
> `/crt-tv/install.sh` proxies to `deploy/bootstrap.sh` on GitHub raw. Nothing to
> copy or rebuild — it always serves the latest script. Different repo owner?
> Update `CRT_TV_REPO` in `deploy/bootstrap.sh` and the rewrite destination, or
> pass `… | CRT_TV_REPO=https://github.com/you/crt-tv.git bash`.

### Manual install

1. Clone the repo to `/home/pi/crt-tv` and run the installer:

   ```bash
   git clone https://github.com/masipah/crt-tv.git ~/crt-tv
   cd ~/crt-tv && bash deploy/install.sh
   ```

   This installs Chromium + X, builds the venv, writes `config.toml`, fetches the
   WeatherStar assets, and enables two services: `crt-tv` (the FastAPI service)
   and `crt-tv-kiosk` (Chromium showing `/display`).

2. **Enable composite NTSC output** (one-off). Append
   [`deploy/config.txt.snippet`](deploy/config.txt.snippet) to
   `/boot/firmware/config.txt` and reboot.

   > ⚠️ On the Pi 4, enabling composite (`enable_tvout=1`) **disables HDMI**.
   > Manage the Pi over SSH from this point on.

   Key settings: `sdtv_mode=0` (NTSC, for the PVM), `sdtv_aspect=1` (4:3),
   `dtoverlay=vc4-fkms-v3d` (the composite DAC needs firmware-KMS, not full-KMS).

### Wiring (Pi 4 → PVM-9045Q composite BNC)

The Pi 4 outputs composite + audio on the 4-pole **3.5 mm TRRS** A/V jack. Use a
TRRS breakout or A/V cable — but mind the pinout, Raspberry Pi uses **video on
the sleeve**, not the convention some cheap cables assume:

| TRRS contact | Signal        |
|--------------|---------------|
| Tip          | Audio left    |
| Ring 1       | Audio right   |
| Ring 2       | Ground        |
| Sleeve       | **Composite video** |

Take the composite (yellow RCA) line into a **RCA→BNC** adapter and feed the
PVM-9045Q's composite **VIDEO IN** (BNC). Set the monitor's input to LINE. If the
other input has a 75Ω termination switch, leave the unused one terminated.

## Usage

Open the dashboard at `http://<pi-ip>:8000/` from any browser on your network.

- **Display** — pick **Teletext**, **Weather**, or **Video**; the PVM switches
  instantly. "Now showing" reflects the live state (and updates if changed from
  another browser).
- **Video library** — drag-and-drop or browse to **upload** clips (with a
  progress bar); they save to the Pi's `media/` folder. Hit **Play** on any clip
  to put it on the CRT (switches to Video mode and jumps to it); **Delete** to
  remove it. **Drag the ⠿ handle to reorder** the playlist — the order persists
  (in `media/.order.json`) and is the order the CRT loops through. The CRT
  refreshes its playlist automatically on upload/delete/reorder.
- **Preview** (`/preview`) — a simulated PVM bezel showing the live display, so
  you can pick modes and check things before the real monitor is connected.

Logs: `journalctl -u crt-tv -f` and `journalctl -u crt-tv-kiosk -f`.

## Weather mode (WeatherStar 4000)

The weather display is modelled on the **WeatherStar 4000+** project
([github.com/netbymatt/ws4kp](https://github.com/netbymatt/ws4kp), MIT) — the
Star4000 font, the blue gradient panels, the current-conditions icon set, and
the rotating Current Conditions → Extended Forecast → Almanac cycle with a
scrolling lower ticker. Two deliberate differences:

- **Data source is Open-Meteo, not NWS.** ws4kp pulls from `api.weather.gov`,
  which is US-only; Open-Meteo works for any `latitude`/`longitude` in
  `config.toml`, so this runs for London (the default) or anywhere.
- **Fonts and icons are fetched, not committed.** They're TWCClassics assets
  (see [`web/display/assets/CREDITS.md`](web/display/assets/CREDITS.md)).
  `deploy/install.sh` runs the fetch automatically; for local dev run
  `web/display/assets/fetch-assets.sh` once. Without them the weather mode still
  works, falling back to a monospace font and text labels.

Not affiliated with or endorsed by The Weather Channel.

## Notes & tuning

- **Overscan / safe area.** The display keeps content in a title-safe box
  (`#overscan` in `display.css`, inset ~6–7%). If the PVM crops more or less,
  adjust those insets.
- **Teletext font.** For an authentic look, install a teletext font such as
  *Bedstead* on the Pi; `display.css` already prefers it and falls back to a
  heavy monospace.
- **Video format.** The output is inherently 480i (composite NTSC). Source files
  play most reliably as **progressive H.264, 4:3** (or 16:9 letterboxed).
  Re-encode oddballs with `ffmpeg -i in.mkv -vf scale=720:480 -c:v libx264 out.mp4`.
- **Video backend.** v1 plays video in the browser (`<video>`), keeping a single
  render surface. If Chromium decode struggles on heavy files, an `mpv`-based
  player is the natural next step (see roadmap).
- **Uploads** are streamed to disk in chunks, so large files are fine. You can
  also bypass the browser entirely and drop/`scp` files straight into `media/` —
  the library picks them up. Uploads land in the configured `[video] media_dir`.

## Roadmap

- `mpv` video backend option (hardware decode, better interlaced handling)
- More WeatherStar 4000 screens: Hourly, Local Forecast narrative, Radar
- Multiple teletext pages / a page-number entry on the remote
- Optional real broadcast teletext in the VBI via `raspi-teletext`
- Now/next clock + screensaver, brightness/scanline toggles from the remote
