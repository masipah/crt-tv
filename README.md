# crt-tv

Drive a CRT — specifically a **Sony PVM-9045Q** — from a **headless Raspberry Pi 4**
over composite (NTSC) video. The Pi continuously outputs one of three modes:

- **Teletext** — a Ceefax-style page
- **Weather** — a **WeatherStar 4000**-style forecast (the 1990s Weather Channel
  look), cycling Current Conditions → Extended Forecast → Almanac with a
  scrolling ticker. Data from Open-Meteo (no API key, works worldwide).
- **Video** — a continuous 480i playlist from a local folder

A small **web app** (reachable from your phone or laptop on the same network)
switches between modes live.

```
┌─────────────┐   POST /api/mode      ┌────────────────────────────┐
│ Control app │ ───────────────────▶  │  FastAPI service (Pi)      │
│ (phone/web) │ ◀───── /ws state ───  │  • state + WebSocket hub   │
└─────────────┘                       │  • /api/weather /playlist  │
                                      └──────────────┬─────────────┘
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
    playlist.py      scans the media/ folder
web/
  display/           full-screen app shown on the CRT (teletext/weather/video)
    ws4000.css       WeatherStar 4000 styling + Star4000 @font-face
    weather.js       WeatherStar 4000 screen cycle + ticker
    assets/          fetched fonts + icons (git-ignored; see fetch-assets.sh)
  control/           remote control app (mode buttons + playlist)
deploy/              Pi 4 config.txt snippet, systemd units, kiosk + installer
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

- Control app: <http://localhost:8000/>
- Display app: <http://localhost:8000/display>

Switching modes in one tab updates the other live over WebSocket. Drop a couple
of `.mp4` files into `media/` to exercise the video mode. The CRT scanline
overlay is on by default — it's subtle and intended to layer on top of a real
CRT's own scanlines.

## Configure

```bash
cp config.example.toml config.toml
```

Edit `config.toml` for your weather location, units, port, and media folder.
The service runs fine with no config file (defaults to London / metric).

## Deploy to the Raspberry Pi 4

1. Clone the repo to `/home/pi/crt-tv` and run the installer:

   ```bash
   cd ~/crt-tv
   bash deploy/install.sh
   ```

   This installs Chromium + X, builds the venv, writes `config.toml`, and
   enables two services: `crt-tv` (the FastAPI service) and `crt-tv-kiosk`
   (Chromium showing `/display`).

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

- Open `http://<pi-ip>:8000/` on your phone.
- Tap **Teletext**, **Weather**, or **Video**. The PVM switches instantly.
- In Video, tap a playlist entry to jump to that clip; it loops continuously.

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

## Roadmap

- `mpv` video backend option (hardware decode, better interlaced handling)
- More WeatherStar 4000 screens: Hourly, Local Forecast narrative, Radar
- Multiple teletext pages / a page-number entry on the remote
- Optional real broadcast teletext in the VBI via `raspi-teletext`
- Now/next clock + screensaver, brightness/scanline toggles from the remote
