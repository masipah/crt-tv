# Composite 480i on the Pi 4 (Trixie / full KMS)

What `setup/enable-composite.sh` changes and why. All paths are under
`/boot/firmware/` (Bookworm/Trixie moved boot files there).

## config.txt

```ini
dtoverlay=vc4-kms-v3d,composite

[pi4]
enable_tvout=1
```

- **`,composite` on the KMS overlay** — the vc4 full-KMS driver only exposes
  one of HDMI/composite on the Pi 4. Adding the `composite` parameter enables
  the composite encoder and **disables both HDMI ports**. This is a hardware
  clocking constraint, not a config choice: you can't have both.
- **`enable_tvout=1`** — the Pi 4 ships with the composite DAC disabled
  because enabling it forces a lower core clock (slightly reduced GPU/memory
  performance). Harmless for this project; Chromium at 640×480 barely works up
  a sweat.

`sdtv_mode=` / `sdtv_aspect=` are **legacy firmware options and are ignored
under full KMS** — don't bother with them.

## cmdline.txt

Arguments appended to the single kernel command line:

```text
vc4.tv_norm=NTSC video=Composite-1:720x480@60i quiet loglevel=3
vt.global_cursor_default=0 logo.nologo systemd.show_status=false console=tty3
```

- **`vc4.tv_norm=NTSC`** — selects the TV standard. The PVM-9045Q is an NTSC
  monitor, so NTSC it is. (Other accepted values: `NTSC-J`, `PAL`, `PAL-M`,
  `PAL-N`, `SECAM` — useful if the monitor ever changes.)
- **`video=Composite-1:720x480@60i`** — forces the 480 interlaced mode on the
  composite connector at boot, so the console and everything after it comes up
  in 480i without waiting for userspace to set a mode.
- **`quiet loglevel=3 systemd.show_status=false logo.nologo`** — no kernel log
  scroll, no systemd unit status lines, no Tux logo during boot.
- **`vt.global_cursor_default=0`** — no blinking cursor on the splash.
- **`console=tty3`** — whatever still insists on printing to the console
  (kernel errors, fsck, systemd emergencies) lands on tty3, not on top of the
  teletext splash on tty1. Switch VTs or use `journalctl` to read it.

The install script also disables `getty@tty1` — the boot sequence on tty1 is
splash → weather kiosk, with no login prompt in between. Console logins remain
available on tty2+ (Ctrl+Alt+F2) and over SSH.

## Verifying after reboot

```sh
# Connector known to the kernel and its current mode
cat /sys/class/drm/card*-Composite-1/status          # "connected"
cat /sys/class/drm/card*-Composite-1/modes            # 720x480i

# What the display stack negotiated
journalctl -b | grep -iE 'composite|vc4'
```

If the screen is black but `tv status` shows weather-kiosk running, check
`journalctl -u weather-kiosk -b` — the usual suspects are Chromium missing or
the `crt` user lacking `video`/`render` group membership (re-run
`setup/install.sh`). Run `tv doctor` for a full diagnostic dump.

**Why X11 and not Wayland (or direct KMS) for the display?** wlroots-based
compositors (cage, sway, labwc) refuse interlaced modes outright — on a
connector that only offers 480i/576i they hang without ever presenting a
frame. mpv's direct-KMS output (`--gpu-context=drm`) also failed to
initialize video on this connector (audio kept playing, screen stayed put).
X's modesetting driver sets interlaced modes without complaint, so both the
Chromium kiosk and the mpv player run in bare X sessions on tty1 — no
desktop, one fullscreen app each.

## Audio

Analog audio rides the same TRRS jack (`dtparam=audio=on`, already the RPi OS
default). With HDMI disabled by composite mode, the headphone jack is the only
ALSA output, so mpv and Chromium find it without configuration. Volume:
`alsamixer` as the `crt` user.

## Reverting to HDMI

The install script leaves timestamped backups next to the originals:

```sh
ls /boot/firmware/*.bak-*
sudo cp /boot/firmware/config.txt.bak-<ts> /boot/firmware/config.txt
sudo cp /boot/firmware/cmdline.txt.bak-<ts> /boot/firmware/cmdline.txt
sudo reboot
```

Or by hand: remove `,composite` from the `dtoverlay=vc4-kms-v3d` line, delete
`enable_tvout=1`, and strip the two `vc4.tv_norm=`/`video=` arguments from
cmdline.txt.
