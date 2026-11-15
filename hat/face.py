#!/usr/bin/env python3
"""Play the Waveshare OLED/LCD HAT (A) face alongside the CRT player."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
import math
from pathlib import Path
import random
import signal
import struct
import subprocess
import sys
from threading import Event
from time import monotonic, sleep

from PIL import Image, ImageDraw


MOUTH_WIDTH = 320
MOUTH_HEIGHT = 180
MOUTH_FPS = 20
EYE_SIZE = (128, 64)
EYE_ADDRESSES = (0x3C, 0x3D)


class EyeMotion:
    def __init__(self, seed=None):
        self.random = random.Random(seed)
        self.gaze_from = self.gaze_to = (0, 0)
        self.gaze_start = self.next_gaze = 0.0
        self.next_blink = self.random.uniform(1.2, 2.4)

    def sample(self, time):
        fraction = min(1.0, (time - self.gaze_start) / 0.24)
        ease = fraction * fraction * (3 - 2 * fraction)
        x, y = (
            start + (end - start) * ease
            for start, end in zip(self.gaze_from, self.gaze_to)
        )
        if time >= self.next_gaze:
            self.gaze_from = (x, y)
            self.gaze_to = (self.random.randint(-23, 23), self.random.randint(-8, 8))
            self.gaze_start = time
            self.next_gaze = time + self.random.uniform(0.65, 2.1)

        openness = 1.0
        since_blink = time - self.next_blink
        if 0 <= since_blink < 0.36:
            openness = (1 + math.cos(math.tau * since_blink / 0.36)) / 2
        elif since_blink >= 0.36:
            self.next_blink = time + self.random.uniform(1.8, 5.6)
        return round(x), round(y), openness


def draw_eye(x, y, openness):
    eye = Image.new("1", EYE_SIZE)
    upper, lower = [], []
    for column in range(13, 116, 2):
        arch = 1 - ((column - 64) / 51) ** 2
        lid = 32 + round(3 * arch)
        upper.append((column, lid - round(24 * arch * openness)))
        lower.append((column, lid + round(17 * arch * openness)))
    rim = upper + lower[::-1]

    iris = Image.new("1", EYE_SIZE)
    draw = ImageDraw.Draw(iris)
    cx, cy = 64 + x, 32 + y
    draw.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), outline=1, width=3)
    draw.ellipse((cx - 9, cy - 9, cx - 3, cy - 3), fill=1)
    mask = Image.new("1", EYE_SIZE)
    ImageDraw.Draw(mask).polygon(rim, fill=1)
    eye.paste(iris, mask=mask)
    ImageDraw.Draw(eye).line(rim + [rim[0]], fill=1, width=2)
    return eye


def animate_eyes(displays, stop):
    motion = EyeMotion()
    start = monotonic()
    last_frame = None
    while not stop.is_set():
        now = monotonic()
        eye = draw_eye(*motion.sample(now - start))
        frame = eye.tobytes()
        if frame != last_frame:
            for display in displays:
                display.display(eye)
            last_frame = frame
        stop.wait(max(0, 1 / 24 - (monotonic() - now)))


class MouthDisplay:
    """ST7789 on SPI0 CE0, in the panel's native 240 × 320 orientation."""

    def __init__(self, stack):
        from gpiozero import OutputDevice
        from gpiozero.pins.lgpio import LGPIOFactory
        import spidev

        factory = LGPIOFactory(chip=0)
        stack.callback(factory.close)
        self.dc = stack.enter_context(OutputDevice(22, pin_factory=factory))
        reset = stack.enter_context(OutputDevice(27, initial_value=True, pin_factory=factory))
        self.backlight = stack.enter_context(OutputDevice(18, pin_factory=factory))
        stack.callback(self.backlight.off)

        self.spi = spidev.SpiDev(0, 0)
        stack.callback(self.spi.close)
        self.spi.mode = 0
        self.spi.max_speed_hz = 32_000_000

        reset.off()
        sleep(0.1)
        reset.on()
        sleep(0.12)

        # RGB565 and panel timing from Waveshare's OLED/LCD HAT (A) demo.
        self.command(0x11)
        sleep(0.12)
        for code, parameters in (
            (0x36, "00"),
            (0x3A, "05"),
            (0xB2, "0c 0c 00 33 33"),
            (0xB7, "35"),
            (0xBB, "1f"),
            (0xC0, "2c"),
            (0xC2, "01"),
            (0xC3, "12"),
            (0xC4, "20"),
            (0xC6, "0f"),
            (0xD0, "a4 a1"),
            (0xE0, "d0 08 11 08 0c 15 39 33 50 36 13 14 29 2d"),
            (0xE1, "d0 08 10 08 06 06 39 44 51 0b 16 14 2f 31"),
        ):
            self.command(code, bytes.fromhex(parameters))
        self.command(0x21)
        self.window(0, 0, 240, 320)
        self.spi.writebytes2(bytes(240 * 320 * 2))
        self.command(0x29)

    def command(self, code, parameters=b""):
        self.dc.off()
        self.spi.writebytes([code])
        if parameters:
            self.dc.on()
            self.spi.writebytes2(parameters)

    def window(self, x, y, width, height):
        self.command(0x2A, struct.pack(">HH", x, x + width - 1))
        self.command(0x2B, struct.pack(">HH", y, y + height - 1))
        self.command(0x2C)
        self.dc.on()

    def display(self, frame):
        # The 16:9 video leaves a 30 px black band above and below in landscape.
        self.window(30, 0, MOUTH_HEIGHT, MOUTH_WIDTH)
        self.spi.writebytes2(frame)


def mouth_decoder(path):
    # ROTATE_270 in the Waveshare demo is a 90° counterclockwise frame rotation.
    filters = (
        f"fps={MOUTH_FPS},scale={MOUTH_WIDTH}:{MOUTH_HEIGHT}:"
        "force_original_aspect_ratio=decrease:force_divisible_by=2,"
        f"pad={MOUTH_WIDTH}:{MOUTH_HEIGHT}:(ow-iw)/2:(oh-ih)/2,transpose=cclock"
    )
    return [
        "/usr/bin/ffmpeg", "-nostdin", "-loglevel", "error",
        "-stream_loop", "-1", "-re", "-threads", "1", "-i", str(path),
        "-map", "0:v:0", "-an", "-sn", "-dn", "-filter_threads", "1", "-vf", filters,
        "-pix_fmt", "rgb565be", "-c:v", "rawvideo", "-threads:v", "1",
        "-f", "rawvideo", "pipe:1",
    ]


def play(displays, lcd, clip, stop):
    frame_bytes = MOUTH_WIDTH * MOUTH_HEIGHT * 2
    command = mouth_decoder(clip)
    with subprocess.Popen(command, stdout=subprocess.PIPE) as decoder:
        with ThreadPoolExecutor(max_workers=1) as pool:
            eyes = pool.submit(animate_eyes, displays, stop)
            try:
                lcd.backlight.on()
                while not stop.is_set():
                    frame = decoder.stdout.read(frame_bytes)
                    if stop.is_set():
                        break
                    if eyes.done():
                        eyes.result()
                    if len(frame) != frame_bytes:
                        raise RuntimeError("FFmpeg stopped producing LCD frames")
                    lcd.display(frame)
            finally:
                stop.set()
                decoder.terminate()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clip", type=Path)
    args = parser.parse_args()
    if not args.clip.is_file():
        parser.error(f"mouth clip missing: {args.clip}")

    from luma.core.error import DeviceNotFoundError
    from luma.core.interface.serial import i2c
    from luma.oled.device import ssd1306

    stop = Event()

    def shutdown(_signal, _frame):
        stop.set()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    with ExitStack() as stack:
        displays = []
        for address in EYE_ADDRESSES:
            try:
                serial = i2c(port=1, address=address)
                display = ssd1306(serial, width=128, height=64)
                display.contrast(0x68)
            except DeviceNotFoundError:
                print(f"Waveshare HAT OLED at {address:#04x} did not respond", file=sys.stderr)
                return
            stack.callback(display.cleanup)
            displays.append(display)
        lcd = MouthDisplay(stack)
        print("Playing the Waveshare HAT face", flush=True)
        play(displays, lcd, args.clip, stop)


if __name__ == "__main__":
    main()
