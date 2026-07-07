# Hardware setup

## The cable: Pi 3.5mm TRRS → RCA

The Pi 4's 3.5mm jack is a 4-pole TRRS carrying stereo audio **and** composite
video. The pinout, from the tip of the plug:

| Segment | Signal |
|---|---|
| Tip | Audio left (white RCA) |
| Ring 1 | Audio right (red RCA) |
| Ring 2 | Ground |
| Sleeve | **Composite video (yellow RCA)** |

You need a cable wired this way — sold as "camcorder", "Zune", or
"Raspberry Pi AV" cables. Many iPod-era AV cables put video on Ring 2 and
ground on the sleeve instead.

**Wrong-cable symptom**: rolling/tearing picture, black & white noise, or
faint audio buzz on the screen. Before buying another cable, try plugging the
**red or white** plug into the PVM's video input — if one of them shows a
stable picture, the cable is iPod-pinout and you can just relabel the plugs.

## Connecting the PVM-9045Q

- Video: yellow (or whichever plug carries video) → **LINE IN video**. If the
  rear input is BNC, use a cheap BNC↔RCA adapter.
- Termination: set the **75Ω termination switch to ON** (only switch it off if
  you're looping the signal through to another monitor).
- Audio: white/red → audio LINE IN. The PVM's speaker is mono; a Y-adapter that
  sums L+R works, or just connect one channel.
- Press the LINE input select on the front if the PVM doesn't switch over.

## Picture tips

- The PVM's **underscan** button shows the full raster — useful for checking
  that nothing important is cut off; run normal (overscanned) for the
  authentic look.
- **H/V delay** and **blue only** are handy for diagnosing a bad cable vs. a
  bad signal.
- The signal is 480i NTSC (525 lines). The WeatherStar is 640×480 native, so
  it fills the screen 1:1 — exactly what the real hardware sent to headends.
