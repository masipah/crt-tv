# crt-tv

Turn a little **Raspberry Pi** computer into a tiny TV station that plays on an
old **CRT television** (the classic tube kind — this project is built around the
**Sony PVM-9045Q**). Plug it in and the TV shows a 1990s-style weather channel.
From your phone or laptop you can switch it to a teletext page or your own home
videos, and change the weather city — all from a simple web page on your home
network.

You don't need a keyboard, mouse, or modern monitor once it's set up. You leave
the Pi plugged into the old TV, and control everything from a browser.

## What it shows on the TV

- **Weather** — a faithful throwback to the old **Weather Channel "WeatherStar
  4000"**: blue screens, the chunky retro font, and pages that rotate through
  current conditions, an hour-by-hour forecast, the next few days, nearby cities,
  and sunrise/sunset — with a scrolling ticker along the bottom and, optionally,
  the classic **smooth-jazz background music**. This is what shows when you turn
  it on.
- **Teletext** — an old-school text "page 100" with a live clock, like Ceefax.
- **Video** — your own video files, played back-to-back on a loop. You upload
  them from the web page.

## What you need

- A **Raspberry Pi 4** (the "Model B").
- A **microSD card** (8 GB or bigger) for the Pi's software.
- A cable to get the picture from the Pi to the TV: a **3.5 mm AV cable** (the
  4-ring kind) plus an **RCA-to-BNC adapter** to plug into the PVM. (Details in
  [Plugging into the TV](#plugging-into-the-tv).)
- An **old composite/NTSC CRT TV** — the Sony PVM-9045Q is the target.
- Your home **Wi-Fi or Ethernet** (the Pi needs internet for the weather).

## Setting it up (first time)

You do this once. It takes about 15 minutes, most of it waiting.

**1. Put the software on the SD card.**
Download the official **Raspberry Pi Imager** from
<https://www.raspberrypi.com/software/> and run it. Choose **Raspberry Pi OS
(64-bit) Lite** and your SD card. Before it writes, click the **gear / Edit
Settings** button and set:

- a **username and password** (remember these),
- **enable SSH** (this lets you type commands into the Pi from your computer),
- your **Wi-Fi name and password** (if not using an Ethernet cable).

Write the card, put it in the Pi, and power it on.

**2. Connect to the Pi from your computer.**
On your computer, open a terminal and type (use the username you picked):

```bash
ssh <your-username>@<pi-address>
```

`<pi-address>` is the Pi's name with `.local` (e.g. `crt-tv.local`) or its IP
address (you can find it in your router's device list). Tip: give the Pi a
**fixed/reserved address** in your router so it's always the same.

**3. Install crt-tv with one command.**
Once connected to the Pi, paste this and press Enter:

```bash
curl -sSL https://raw.githubusercontent.com/masipah/crt-tv/main/deploy/bootstrap.sh | bash
```

It downloads everything and sets it up automatically. When it finishes it prints
a web address.

**4. Open the control page.**
On your phone or laptop (same Wi-Fi), open `http://<pi-address>:8000/`. You'll
see a live picture of what's on the TV plus buttons to control it. Type your
**city or ZIP code** into the Weather box and Save.

**5. Turn on the TV picture (one-time switch).**
By default the Pi sends its picture out the modern HDMI port. To send it to the
old TV instead, you flip one setting. Run this on the Pi:

```bash
echo -e "\n# crt-tv composite video" | sudo tee -a /boot/firmware/config.txt
cat ~/crt-tv/deploy/config.txt.snippet | sudo tee -a /boot/firmware/config.txt
sudo reboot
```

> **Heads up:** this turns **off** the HDMI port, so a modern monitor will go
> blank. That's expected — from now on you control the Pi from the web page (and
> over SSH if needed). See [Plugging into the TV](#plugging-into-the-tv) for the
> cable.

That's it. The Pi now powers on into the weather channel on your TV.

**Optional: add the WeatherStar music.** For the full effect, the weather channel
can play the original smooth-jazz background music. The tracks aren't included
(they're copyrighted), but one command on the Pi fetches them for personal use:

```bash
bash ~/crt-tv/web/display/assets/fetch-audio.sh   # ~160 MB
sudo systemctl restart crt-tv-kiosk
```

Sound comes out the same AV cable as the picture (turn the TV's volume up). If
you don't run this, weather plays silently.

## Using it day to day

Open `http://<pi-address>:8000/` from any phone or computer on your network:

- **See the picture.** The top of the page mirrors exactly what's on the TV,
  live.
- **Switch what's showing.** Tap **Weather**, **Teletext**, or **Video**.
- **Change the weather city.** Type a city or ZIP and Save. It updates the TV
  right away and is remembered forever (even after unplugging).
- **Pick which weather screens show.** Tick/untick screens (Current Conditions,
  Hourly, Local Forecast, Extended, Almanac, and — if you list nearby cities —
  Latest Observations and Travel), and turn the background **music** on/off and
  set its volume. Changes apply to the TV instantly and stick across reboots.
- **Add videos.** Drag video files onto the page (or tap to browse). Tap **Play**
  on one to put it on the TV, drag the **⠿** handle to reorder the loop, or
  **Delete** to remove it.

## If the power goes out

**Nothing to worry about — just plug it back in.** A power cut doesn't erase
anything. The Pi remembers your weather city and your videos, and when it gets
power again it boots straight back into the weather channel on its own. You don't
need to touch the web page or reinstall anything.

(The only time you'd reinstall is if the SD card itself dies or you reformat it —
see [Reinstalling on a fresh card](#reinstalling-on-a-fresh-card).)

## Updating to the latest version

To pull the newest version onto the Pi and restart it, run this on the Pi:

```bash
bash ~/crt-tv/deploy/update.sh
```

(If that file doesn't exist yet because you installed an older version, just run
the install command from [step 3](#setting-it-up-first-time) again — it updates
in place.)

## If something looks wrong

| What you see | What to do |
|---|---|
| TV is blank | Make sure you did the [one-time picture switch](#setting-it-up-first-time) and rebooted. Check the cable (see below) and that the TV input is set to **LINE**. |
| Modern monitor went blank | That's expected after the picture switch — HDMI is off on purpose. Use the web page / SSH. |
| Weather says "WAITING FOR WEATHER…" | The Pi isn't online yet, or the city wasn't found. It keeps retrying. Check your Wi-Fi and the city name. |
| Web page won't load | Confirm the Pi is on and you used the right address and `:8000`. On the Pi: `systemctl status crt-tv`. |
| It didn't update | Re-run `bash ~/crt-tv/deploy/update.sh`, or the install command again. |

To watch what the Pi is doing (on the Pi): `journalctl -u crt-tv -f`.

## Plugging into the TV

The Pi 4 sends both video and audio out its **3.5 mm AV jack** (the round
headphone-looking socket). Use a **4-pole (TRRS) AV cable**. One important
gotcha: the Raspberry Pi puts the **video on the longest pin (the sleeve)**,
which some cheap cables get wrong.

| Cable pin | Carries |
|---|---|
| Tip | Left audio |
| Ring 1 | Right audio |
| Ring 2 | Ground |
| Sleeve (longest) | **Video** |

Take the **yellow video plug** into an **RCA-to-BNC adapter** and connect it to
the PVM's composite **VIDEO IN** (the BNC connector). Set the TV's input to
**LINE**. If the spare input has a 75 Ω switch, leave it set to terminated.

## Reinstalling on a fresh card

> You only need this if the SD card is dead or reformatted. **A power cut is not
> this** — see [If the power goes out](#if-the-power-goes-out).

Repeat [Setting it up](#setting-it-up-first-time) from step 1. Everything needed
lives online, so it's the same flash-and-one-command process. The two things a
brand-new card won't have are your **weather city** (re-type it on the web page)
and your **uploaded videos** (re-upload them). If you want to keep those, copy
them off the Pi first:

```bash
scp -r <user>@<pi-address>:~/crt-tv/{config.toml,data,media} ./crt-tv-backup/
```

and copy them back into `~/crt-tv/` after reinstalling, then
`sudo systemctl restart crt-tv`.

---

# Technical reference

The rest of this document is the detailed/technical reference — you don't need it
to use the project.

## Requirements

**Hardware:** Raspberry Pi **4 Model B**; microSD (8 GB+); a 4-pole 3.5 mm TRRS
A/V cable + RCA→BNC adapter; a composite **NTSC** CRT (target: Sony PVM-9045Q).

**Software on the Pi** (all installed by `deploy/install.sh` except the OS):

| Component       | Version / notes                                          |
|-----------------|----------------------------------------------------------|
| Raspberry Pi OS | **Bookworm** (64-bit, **Lite**)                          |
| Python          | **3.11+** (ships with Bookworm)                          |
| Python packages | pinned in [`requirements.txt`](requirements.txt)         |
| Chromium        | `chromium-browser` (the on-screen browser)               |
| X server        | `xserver-xorg` + `xinit` (runs Chromium on tty1)         |

**Local development (no Pi):** Python **3.9+** is enough; the web apps are
dependency-free vanilla JS (no Node build step). This repo is **crt-tv v0.1.0**.

## How it works (architecture)

One **FastAPI** process (`crt_tv.main:app`, run by `uvicorn`) serves everything:

| Surface   | Path       | Who uses it                                      |
|-----------|------------|--------------------------------------------------|
| Display   | `/display` | The on-CRT app, shown full-screen by Chromium    |
| Dashboard | `/`        | You — controls + a live preview                  |
| Preview   | `/preview` | You — the display inside a simulated PVM bezel    |
| Media     | `/media`   | Video files (HTTP Range, so `<video>` streams)   |

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

- **Single render surface.** All three modes render in the browser (`/display`);
  video plays in an HTML5 `<video>` so there's never a player/web-view z-order
  fight. **The TV output is a clean signal — no software CRT effects** (the real
  tube provides the look). The Pi's composite DAC does the 480i/NTSC conversion.
- **The kiosk is just a browser.** `crt-tv-kiosk` runs `xinit` on **tty1** (the
  framebuffer console = the composite output) and opens Chromium in `--kiosk` at
  `localhost:8000/display`.
- **One source of truth, pushed live.** Current mode lives in `state.py`; every
  client holds a WebSocket to `/ws` and gets the full state on every change.
- **Crash-safe saves.** The weather location and playlist order are written
  atomically (temp file → fsync → rename → fsync dir) so a power cut can't
  corrupt them.

## Repository layout

```
crt_tv/                FastAPI service (Python)
  main.py              REST API, /ws, static mounts, redirects
  config.py            config.toml loader + dataclass defaults
  state.py             in-memory mode state + WebSocket broadcast hub
  services/
    weather.py         Open-Meteo fetch + geocoding (city/ZIP), shaped & cached
    playlist.py        scans media/, persists play order (.order.json)
    store.py           persisted runtime state (state.json) + atomic_write_text
web/
  display/             the full-screen app shown on the CRT (+ ws4000.css, assets/)
  control/             the dashboard (live preview, mode picker, weather, library)
  preview/             /display inside a simulated PVM-9045Q bezel
deploy/
  bootstrap.sh         one-line installer (clones from GitHub, runs install.sh)
  install.sh           per-host setup: packages, venv, assets, systemd units
  update.sh            fast updater for an existing install
  crt-tv*.service      systemd units (templated to the install user/dir)
  kiosk.sh             waits for the service, launches Chromium --kiosk
  config.txt.snippet   composite NTSC settings for /boot/firmware/config.txt
media/                 video files (git-ignored)
data/                  persisted runtime state, e.g. state.json (git-ignored)
config.example.toml    copy to config.toml to override defaults
scripts/dev.sh         run locally with autoreload
```

## Quick start (local dev, no Pi)

```bash
./web/display/assets/fetch-assets.sh   # one-off: WeatherStar fonts + icons
./scripts/dev.sh                       # venv + uvicorn with autoreload
```

Open <http://localhost:8000/> (dashboard with live preview),
<http://localhost:8000/preview> (PVM bezel), <http://localhost:8000/display>
(raw display). Switching modes in one tab updates the others live over WebSocket.

## Configuration reference

Three layers, increasing precedence: built-in defaults (`config.py`) →
`config.toml` (install-time) → `data/state.json` (set in the UI, survives
reboots, overrides `config.toml`).

### `config.toml`

| Key                        | Default     | Meaning                                                |
|----------------------------|-------------|--------------------------------------------------------|
| `default_mode`             | `"weather"` | Mode on boot: `weather` \| `teletext` \| `video`       |
| `[server] host`            | `"0.0.0.0"` | Bind address (`0.0.0.0` = reachable on the LAN)        |
| `[server] port`            | `8000`      | HTTP port                                              |
| `[weather] location`       | `"London"`  | City name or US ZIP — geocoded automatically           |
| `[weather] country`        | `""`        | Optional ISO code (`"US"`) to disambiguate city names  |
| `[weather] units`          | `"metric"`  | `metric` (°C, km/h) or `imperial` (°F, mph)            |
| `[weather] latitude`       | _(unset)_   | Pin an exact point; with `longitude` skips geocoding   |
| `[weather] longitude`      | _(unset)_   | See `latitude`                                         |
| `[weather] location_name`  | `""`        | Display-name override                                  |
| `[weather] timezone`       | `"auto"`    | IANA tz, or `"auto"` from coordinates                  |
| `[weather] regional_cities`| `[]`        | Cities/ZIPs for Latest Observations + Travel screens   |
| `[weather] music`          | `true`      | Play background music during weather (needs fetch-audio.sh) |
| `[weather] music_volume`   | `0.7`       | Music volume, 0.0–1.0                                   |
| `[video] media_dir`        | `"media"`   | Folder of video files                                  |
| `[video] shuffle`          | `false`     | Randomise play order (ignores the saved manual order)  |

### `data/state.json` (managed by the UI)

`weather_location`, `weather_country`, `weather_units` — set from the dashboard,
override the `[weather]` equivalents. Playlist order is in `media/.order.json`.

### Environment variables

`CRT_TV_CONFIG` (config path), `CRT_TV_DISPLAY_URL` (kiosk URL), and for the
installer: `CRT_TV_DIR`, `CRT_TV_REPO`, `CRT_TV_REF`, `CRT_TV_TARBALL`.

## HTTP & WebSocket API

| Method & path               | Body                              | Effect                                          |
|-----------------------------|-----------------------------------|-------------------------------------------------|
| `GET /api/health`           | —                                 | `{ ok, mode }`                                  |
| `GET /api/state`            | —                                 | `{ state: { mode, video_index }, modes }`       |
| `POST /api/mode`            | `{ "mode": "weather" }`           | Switch mode (400 if invalid)                    |
| `POST /api/video/index`     | `{ "index": 2 }`                  | Jump the playlist                               |
| `GET /api/weather`          | —                                 | Full shaped forecast (cached 10 min)            |
| `GET /api/weather/settings` | —                                 | `{ location, country, units }`                  |
| `POST /api/weather/location`| `{ location, country?, units? }`  | Validate + persist (502 if unresolvable; old value kept) |
| `GET /api/weather/options`  | —                                 | `{ screens: [{key,label,enabled}], enabled_keys, music, music_volume }` |
| `POST /api/weather/options` | `{ screens?, music?, music_volume? }` | Persist which screens show + music settings (live) |
| `GET /api/music`            | —                                 | `{ enabled, volume, tracks: [url] }`            |
| `GET /api/playlist`         | —                                 | `{ videos: [ { name, file, url } ] }`           |
| `POST /api/playlist/order`  | `{ "order": ["b.mp4","a.mp4"] }`  | Persist a new order                             |
| `POST /api/upload`          | `multipart/form-data` `files`     | Save videos (non-video rejected)                |
| `DELETE /api/video/{name}`  | —                                 | Delete a clip (confined to media dir)           |

**WebSocket `/ws`** pushes JSON messages: `state` (mode/index changed),
`playlist` (library changed), `weather` (location changed). The client auto-
reconnects every 2 s.

## The weather screens (WeatherStar 4000)

Modelled on **WeatherStar 4000+** ([netbymatt/ws4kp](https://github.com/netbymatt/ws4kp),
MIT). The rotation:

| Screen              | Source                        | Shown when…                  |
|---------------------|-------------------------------|------------------------------|
| Current Conditions  | current obs                   | always                       |
| Latest Observations | `regional_cities` current     | `regional_cities` configured |
| Hourly Forecast     | next 12 hours                 | always                       |
| Local Forecast      | daily narrative               | always                       |
| Extended Forecast   | days 1–3 and 4–6 (two pages)  | always                       |
| Travel Forecast     | `regional_cities` hi/lo       | `regional_cities` configured |
| Almanac             | sunrise/sunset/moon           | always                       |

**Each screen is toggleable from the dashboard** ("Weather screens & music"
card); the selection persists in `data/state.json` and applies to the CRT live
(via `GET`/`POST /api/weather/options`). City screens additionally need
`[weather] regional_cities`. The same card toggles the background music and
volume.

Differences from ws4kp: **data is Open-Meteo, not the US-only NWS** (so it works
anywhere; US ZIPs via Zippopotam, cities via Open-Meteo geocoding), and the
**Star4000 fonts/icons are fetched at install, not committed** (TWCClassics —
see [`web/display/assets/CREDITS.md`](web/display/assets/CREDITS.md); without them
the weather mode falls back to a monospace font). Not affiliated with The Weather
Channel.

**Background music.** The weather channel can play the original WeatherStar
smooth-jazz on a shuffled loop (an `<audio>` element fed by `/api/music`). The
tracks come from [vbguyny/ws4kp](https://github.com/vbguyny/ws4kp) and are
**copyrighted by the artists/labels** — so they're **not committed**; run
`web/display/assets/fetch-audio.sh` to fetch them (~160 MB, personal use,
git-ignored — see [CREDITS.md](web/display/assets/CREDITS.md)). On the Pi, the
kiosk's `--autoplay-policy` flag lets it start without a click, `pulseaudio`
gives Chromium a sink, and `dtparam=audio=on` plus the disabled HDMI route sound
out the analog A/V jack to the TV. Music plays only in weather mode; toggle it
with `[weather] music`.

## systemd operations (on the Pi)

```bash
systemctl status crt-tv             # is the service running?
journalctl -u crt-tv -f             # follow service logs
journalctl -u crt-tv-kiosk -f       # follow kiosk (Chromium/X) logs
sudo systemctl restart crt-tv       # restart after a config.toml change
sudo systemctl disable --now crt-tv-kiosk   # silence the kiosk before the CRT is connected
```

## Tuning & notes

- **Overscan / safe area.** The display keeps content in a title-safe box
  (`#overscan` in `display.css`, inset ~6–7 %). Adjust if the PVM crops more/less.
- **Video format.** Output is 480i (composite NTSC). Files play most reliably as
  progressive H.264, 4:3. `ffmpeg -i in.mkv -vf scale=720:480 -c:v libx264 out.mp4`.
- **Uploads** stream to disk in chunks (large files are fine); you can also `scp`
  files straight into `media/`.

## Roadmap

- `mpv` video backend option (hardware decode, better interlaced handling)
- Animated radar screen (e.g. RainViewer tiles)
- Multiple teletext pages / page-number entry on the dashboard
- A dashboard control for `default_mode` and `regional_cities`

## Credits & licensing

- **WeatherStar 4000+** — <https://github.com/netbymatt/ws4kp> (MIT) — the look,
  screen cycle, and icon naming are modelled on it.
- **Star4000 fonts & weather icons** — TWCClassics (icons by Charles Abel, Nick
  Smith, Malek Masoud); fetched at install, not redistributed here.
- **Weather data** — [Open-Meteo](https://open-meteo.com); **US ZIP geocoding** —
  [Zippopotam.us](https://www.zippopotam.us).

A non-commercial hobby build, not affiliated with The Weather Channel, Sony, or
the Raspberry Pi Foundation.
