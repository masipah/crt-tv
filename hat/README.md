# Waveshare face

The Waveshare OLED/LCD HAT (A) rides on the Pi 4's 40-pin header. Its color
LCD loops the local mouth clip. Both blue OLEDs blink and follow a shared
random gaze. Each boot picks one matching pair from Original, Winged liner,
Spirals, and Star pupils. The HAT switches to a different random pair every
10 minutes. **Betty Davis' Eyes** in the TV remote shows the active pair and
lets you switch styles while the mouth plays. A manual pick starts a fresh
10-minute interval.
The HAT uses SPI and I²C. The Sony PVM uses composite and its existing
Masipah TV remote.

## Restore the face on the TV Pi

Install Masipah TV first using [the main install instructions](../README.md#install).
You can use a saved `mouth.mp4` or rebuild it on a workstation with FFmpeg.
The script takes 2:00–2:40 from the linked Rocky Horror video and makes a silent,
LCD-sized clip. Downloading the source requires an up-to-date [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation)
with its JavaScript components and either Node 22+ or Deno. Pass the original
video file as the second argument if you already have it.

```sh
bash hat/prepare-mouth.sh mouth.mp4
scp mouth.mp4 your-user@tv.masipah.com:~/
```

Run the installer on the Pi.

```sh
sudo bash /opt/crt-tv/hat/install.sh "$HOME/mouth.mp4"
```

The installer enables SPI, I²C, and the face service for the next boot.
Shut down the Pi and unplug its power. Seat the HAT on the 40-pin header
using its standoffs, with pin 1 aligned. Reconnect power. The face starts on
the HAT and Channel starts on the PVM.

The face reads `/var/lib/crt-face/mouth.mp4` and runs continuously while the Pi
is on. It starts over at every power-up and requires no network for playback.
Keep a copy of `mouth.mp4` with your backups for offline restores.

To restore randomized mouth movement, copy the `mouth-clips` folder
alongside `mouth.mp4` in `/var/lib/crt-face`. You can rebuild the clips
from the full source video on a workstation with FFmpeg and Pillow:

```sh
python3 hat/prepare-mouth-clips.py source.mp4 mouth-clips
```

**Idle** spends the most time with the mouth closed or making small idle
movements. **Random**, the boot default, spends about 70% of clip time in
those two states. The rest is mostly licking, with occasional talking.

Every clip starts and ends at the same closed pose, so it can join any
other clip. **Mouth** below **Betty Davis' Eyes** selects **More licking**,
**More talking**, **Less idle**, or **Idle** for the current boot. Less idle
mixes licking and talking clips continuously. Changes apply at a
closed-mouth join. Playback uses every clip in a category before reshuffling
that category. The original clip plays when the set is absent or incomplete.

The **Brightness** sliders adjust both eye OLEDs together and the mouth LCD
backlight separately. Both start at 50% on boot. The selected levels last until
the Pi reboots.

```sh
systemctl status crt-face.service
journalctl -u crt-face.service -b
sudo systemctl disable --now crt-face.service
```

Use the last command to turn off the face and remove it from boot.

Waveshare documents SPI0 CE0 for the ST7789 and I²C addresses `0x3c` and
`0x3d` for the SSD1315 pair. The LCD control pins are BCM 22 (data/command),
27 (reset), and 18 (backlight). [Waveshare manual and demo](https://www.waveshare.com/wiki/OLED/LCD_HAT_(A))
