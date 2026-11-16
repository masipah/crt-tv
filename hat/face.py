#!/usr/bin/env python3
"""Play the Waveshare OLED/LCD HAT (A) face alongside the CRT player."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
import json
import math
from pathlib import Path
import random
import signal
import struct
import subprocess
import sys
from threading import Event
from time import monotonic, sleep

from PIL import Image, ImageDraw, ImageOps


MOUTH_WIDTH = 320
MOUTH_HEIGHT = 180
MOUTH_FPS = 20
MOUTH_SELECTION_FILE = Path("/run/crt-tv/hat-mouth-mode.json")
MOUTH_STATUS_FILE = Path("/run/crt-face/mouth.json")
MOUTH_KINDS = ("closed", "lick", "idle", "talk")
MOUTH_WEIGHTS = {
    "random": (48, 42, 7, 3),
    "more-licking": (6, 92, 1, 1),
    "more-talking": (6, 1, 1, 92),
    "less-idle": (0, 47, 0, 53),  # Licks run longer than talks on average.
    "idle": (68, 0, 32, 0),
}
EYE_SIZE = (128, 64)
EYE_ADDRESSES = (0x3C, 0x3D)
EYE_STYLE_INTERVAL = 10 * 60
EYE_SELECTION_FILE = Path("/run/crt-tv/hat-eye-style.json")
EYE_STATUS_FILE = Path("/run/crt-face/eyes.json")
EYE_BRIGHTNESS_FILE = Path("/run/crt-tv/hat-eye-brightness.json")
MOUTH_BRIGHTNESS_FILE = Path("/run/crt-tv/hat-mouth-brightness.json")
BRIGHTNESS_STATUS_FILE = Path("/run/crt-face/brightness.json")


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


def draw_winged_liner(x, y, _elapsed, side):
    eye = Image.new("1", EYE_SIZE)
    draw = ImageDraw.Draw(eye)
    draw.polygon(
        [(9, 17), (21, 25), (36, 28), (56, 29), (79, 30), (99, 34),
         (114, 39), (100, 45), (83, 50), (63, 52), (43, 49), (25, 40), (15, 28)],
        fill=1,
    )
    mask = eye.copy()
    direction = 1 if side < 0 else -1
    cx, cy = 63 + direction * x * 0.72, 37 + y * 0.45
    draw.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill=0)
    draw.ellipse((cx - 8, cy - 7, cx - 2, cy - 1), fill=1)
    sclera = Image.new("1", EYE_SIZE)
    sclera.paste(eye, mask=mask)
    draw = ImageDraw.Draw(sclera)
    draw.polygon(
        [(16, 16), (28, 10), (43, 8), (60, 9), (76, 12), (87, 16),
         (70, 14), (53, 15), (33, 18), (20, 21)],
        fill=1,
    )
    draw.line([(13, 12), (19, 22), (26, 29)], fill=1, width=3)
    draw.line([(28, 17), (33, 26), (39, 30)], fill=1, width=3)
    draw.line([(42, 19), (46, 27), (50, 30)], fill=1, width=3)
    return sclera if side < 0 else ImageOps.mirror(sclera)


def draw_spiral(x, y, elapsed, side):
    eye = Image.new("1", EYE_SIZE)
    draw = ImageDraw.Draw(eye)
    draw.ellipse((22, 7, 105, 57), outline=255, width=2)
    cx, cy = 64 + x * 0.18, 32 + y * 0.22
    turn = side * (0.51 + elapsed * 2.25)
    points = []
    for step in range(241):
        angle = step * 0.071
        radius = 1 + angle * 1.05
        rotation = turn + side * angle
        points.append(
            (cx + math.cos(rotation) * radius * 1.55, cy + math.sin(rotation) * radius)
        )
    draw.line(points, fill=255, width=3)
    return eye


def draw_star(draw, x, y, radius_x, radius_y):
    points = []
    for tip in range(8):
        angle = tip * math.pi / 4
        length = 0.29 if tip % 2 else 1
        points.append(
            (x + radius_x * length * math.cos(angle), y + radius_y * length * math.sin(angle))
        )
    draw.polygon(points, fill=1)


def draw_star_pupils(x, y, elapsed, side):
    eye = Image.new("1", EYE_SIZE)
    draw = ImageDraw.Draw(eye)
    upper = [(column, 11 + (column - 64) ** 2 / 96) for column in range(16, 114, 2)]
    lower = [(column, 54 - (column - 64) ** 2 / 140) for column in range(24, 106, 2)]
    draw.line(upper, fill=1, width=3)
    draw.line(lower, fill=1, width=3)
    shine = 1 + math.sin(elapsed * 3 + side) * 0.11
    draw_star(draw, 63 + x * 0.68, 33 + y * 0.5, 19 * shine, 20 * shine)
    draw_star(draw, 21 if side < 0 else 107, 17, 5, 6)
    return eye


EYE_RENDERERS = {
    "Winged liner": draw_winged_liner,
    "Spirals": draw_spiral,
    "Star pupils": draw_star_pupils,
}
EYE_STYLES = ("Original", *EYE_RENDERERS)


def boot_eye_style(boot_id):
    # The kernel's boot ID stays stable through service restarts.
    return random.Random(boot_id).choice(EYE_STYLES)


def read_runtime_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def publish_runtime_json(path, value):
    temporary = path.with_suffix(".tmp")
    try:
        temporary.write_text(json.dumps(value))
        temporary.replace(path)
    except OSError as error:
        print(f"Could not publish HAT status ({path.name}): {error}", file=sys.stderr)


def requested_brightness(path, default):
    level = read_runtime_json(path)
    return level if type(level) is int and 1 <= level <= 100 else default


def apply_brightness(displays, backlight, previous):
    eyes = requested_brightness(EYE_BRIGHTNESS_FILE, 50)
    contrast = round(eyes * 255 / 100)
    mouth = requested_brightness(MOUTH_BRIGHTNESS_FILE, 75)
    levels = (contrast, mouth)
    if levels != previous:
        if previous is None or contrast != previous[0]:
            for display in displays:
                display.contrast(contrast)
        if previous is None or mouth != previous[1]:
            # LGPIO truncates the normalized value to a whole duty percentage.
            backlight.value = math.nextafter(mouth / 100, 1)
        publish_runtime_json(BRIGHTNESS_STATUS_FILE, {
            "eyes": round(contrast * 100 / 255),
            "mouth": round(backlight.value * 100),
        })
    return levels


def requested_eye_style():
    request = read_runtime_json(EYE_SELECTION_FILE)
    # Earlier remotes stored only the chosen style.
    if isinstance(request, str):
        request = {"id": request, "style": request}
    if (
        isinstance(request, dict)
        and isinstance(request.get("id"), str)
        and request.get("style") in ("auto", *EYE_STYLES)
    ):
        return request
    return None


def initial_eye_rotation(boot_style, now):
    previous = read_runtime_json(EYE_STATUS_FILE)
    if (
        isinstance(previous, dict)
        and previous.get("current") in EYE_STYLES
        and previous.get("selection") in ("auto", *EYE_STYLES)
        and isinstance(previous.get("switchAt"), (int, float))
        and 0 <= previous["switchAt"] <= now + EYE_STYLE_INTERVAL
        and "requestId" in previous
    ):
        return previous
    return {
        "current": boot_style,
        "selection": "auto",
        "requestId": None,
        "switchAt": now + EYE_STYLE_INTERVAL,
    }


def update_eye_rotation(rotation, request, boot_style, now):
    if request is not None and request["id"] != rotation["requestId"]:
        selection = request["style"]
        return {
            "current": boot_style if selection == "auto" else selection,
            "selection": selection,
            "requestId": request["id"],
            "switchAt": now + EYE_STYLE_INTERVAL,
        }
    if now >= rotation["switchAt"]:
        alternatives = [style for style in EYE_STYLES if style != rotation["current"]]
        return {
            **rotation,
            "current": random.choice(alternatives),
            "selection": "auto",
            "switchAt": now + EYE_STYLE_INTERVAL,
        }
    return rotation


def publish_eye_style(rotation):
    publish_runtime_json(EYE_STATUS_FILE, {**rotation, "styles": EYE_STYLES})


def draw_eye_pair(style, x, y, openness, elapsed):
    if style == "Original":
        eye = draw_eye(x, y, openness)
        return eye, eye

    renderer = EYE_RENDERERS[style]
    eyes = []
    for side in (-1, 1):
        eye = renderer(x, y, elapsed, side)
        if openness < 1:
            height = max(2, round(EYE_SIZE[1] * openness))
            closed = Image.new("1", EYE_SIZE)
            closed.paste(eye.resize((EYE_SIZE[0], height)), (0, (EYE_SIZE[1] - height) // 2))
            eye = closed
        eyes.append(eye)
    return tuple(eyes)


def animate_eyes(displays, backlight, stop, boot_style):
    motion = EyeMotion()
    start = monotonic()
    rotation = initial_eye_rotation(boot_style, start)
    next_selection_check = start
    last_rotation = None
    brightness = None
    last_frames = [None] * len(displays)
    while not stop.is_set():
        now = monotonic()
        if now >= next_selection_check:
            rotation = update_eye_rotation(rotation, requested_eye_style(), boot_style, now)
            brightness = apply_brightness(displays, backlight, brightness)
            next_selection_check = now + 0.25
        style = rotation["current"]
        elapsed = now - start
        eyes = draw_eye_pair(style, *motion.sample(elapsed), elapsed)
        for index, (display, eye) in enumerate(zip(displays, eyes)):
            frame = eye.tobytes()
            if frame != last_frames[index]:
                display.display(eye)
                last_frames[index] = frame
        if rotation is not last_rotation:
            publish_eye_style(rotation)
            if last_rotation is None or style != last_rotation["current"]:
                print(f"HAT eye style: {style}", flush=True)
            last_rotation = rotation
        stop.wait(max(0, 1 / 24 - (monotonic() - now)))


class MouthDisplay:
    """ST7789 on SPI0 CE0, in the panel's native 240 × 320 orientation."""

    def __init__(self, stack):
        from gpiozero import OutputDevice, PWMOutputDevice
        from gpiozero.pins.lgpio import LGPIOFactory
        import spidev

        factory = LGPIOFactory(chip=0)
        stack.callback(factory.close)
        self.dc = stack.enter_context(OutputDevice(22, pin_factory=factory))
        reset = stack.enter_context(OutputDevice(27, initial_value=True, pin_factory=factory))
        self.backlight = stack.enter_context(PWMOutputDevice(18, frequency=1000, pin_factory=factory))
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


class MouthClips:
    def __init__(self, clips):
        self.clips = clips
        self.bags = {kind: [] for kind in clips}
        self.last = {}

    def choose(self, mode):
        if not isinstance(mode, str) or mode not in MOUTH_WEIGHTS:
            mode = "random"
        kind = random.choices(MOUTH_KINDS, weights=MOUTH_WEIGHTS[mode])[0]

        bag = self.bags[kind]
        if not bag:
            bag.extend(self.clips[kind])
            random.shuffle(bag)
            if len(bag) > 1 and bag[-1] == self.last.get(kind):
                other = random.randrange(len(bag) - 1)
                bag[-1], bag[other] = bag[other], bag[-1]
        path = bag.pop()
        self.last[kind] = path
        return path


def load_mouth_clips(clip):
    directory = clip.with_name("mouth-clips")
    clips = {
        kind: sorted(path for path in directory.glob(f"{kind}-*.mp4") if path.is_file())
        for kind in MOUTH_KINDS
    }
    return MouthClips(clips) if all(clips.values()) else None


def mouth_decoder(path, *, loop):
    # ROTATE_270 in the Waveshare demo is a 90° counterclockwise frame rotation.
    filters = (
        f"fps={MOUTH_FPS},scale={MOUTH_WIDTH}:{MOUTH_HEIGHT}:"
        "force_original_aspect_ratio=decrease:force_divisible_by=2,"
        f"pad={MOUTH_WIDTH}:{MOUTH_HEIGHT}:(ow-iw)/2:(oh-ih)/2,"
        # Deepen near-black shadows, lift midtones, and taper the lift toward white.
        "lutyuv=y='if(lte(val,24),max(16,2*val-24),clip(val+54*(1-exp(-(val-24)/45))*(235-val)/211,16,235))'"
        ":u='clip((val-128)*1.12+128,16,240)':v='clip((val-128)*1.12+128,16,240)',"
        "transpose=cclock"
    )
    playback = ["-stream_loop", "-1"] if loop else ["-xerror"]
    return [
        "/usr/bin/ffmpeg", "-nostdin", "-loglevel", "error",
        *playback, "-re", "-threads", "1", "-i", str(path),
        "-map", "0:v:0", "-an", "-sn", "-dn", "-filter_threads", "1", "-vf", filters,
        "-pix_fmt", "rgb565be", "-c:v", "rawvideo", "-threads:v", "1",
        "-f", "rawvideo", "pipe:1",
    ]


class MouthDecodeError(RuntimeError):
    pass


def play_mouth_clip(lcd, path, stop, eyes, *, loop=False):
    frame_bytes = MOUTH_WIDTH * MOUTH_HEIGHT * 2
    command = mouth_decoder(path, loop=loop)
    with subprocess.Popen(command, stdout=subprocess.PIPE) as decoder:
        displayed = False
        try:
            while not stop.is_set():
                frame = decoder.stdout.read(frame_bytes)
                if stop.is_set():
                    return
                if eyes.done():
                    eyes.result()
                if len(frame) != frame_bytes:
                    if not loop and not frame and displayed and decoder.wait() == 0:
                        return
                    raise MouthDecodeError(f"FFmpeg stopped producing LCD frames for {path.name}")
                lcd.display(frame)
                displayed = True
        finally:
            if decoder.poll() is None:
                decoder.terminate()


def animate_mouth(lcd, clip, stop, eyes):
    clips = load_mouth_clips(clip)
    try:
        if clips is not None:
            publish_runtime_json(MOUTH_STATUS_FILE, True)
            print("Playing shuffled mouth clips", flush=True)
            while not stop.is_set():
                # The LCD holds the last closed frame while the next clip opens.
                mode = read_runtime_json(MOUTH_SELECTION_FILE)
                play_mouth_clip(lcd, clips.choose(mode), stop, eyes)
    except MouthDecodeError as error:
        print(f"{error}; playing the original mouth loop", file=sys.stderr)
    finally:
        publish_runtime_json(MOUTH_STATUS_FILE, False)
    if not stop.is_set():
        play_mouth_clip(lcd, clip, stop, eyes, loop=True)


def play(displays, lcd, clip, stop, boot_style):
    with ThreadPoolExecutor(max_workers=1) as pool:
        eyes = pool.submit(animate_eyes, displays, lcd.backlight, stop, boot_style)
        try:
            animate_mouth(lcd, clip, stop, eyes)
        finally:
            stop.set()


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
        publish_runtime_json(BRIGHTNESS_STATUS_FILE, None)
        stack.callback(publish_runtime_json, BRIGHTNESS_STATUS_FILE, None)
        displays = []
        for address in EYE_ADDRESSES:
            try:
                serial = i2c(port=1, address=address)
                display = ssd1306(serial, width=128, height=64)
            except DeviceNotFoundError:
                print(f"Waveshare HAT OLED at {address:#04x} did not respond", file=sys.stderr)
                return
            stack.callback(display.cleanup)
            displays.append(display)
        lcd = MouthDisplay(stack)
        boot_id = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        boot_style = boot_eye_style(boot_id)
        print("Playing the Waveshare HAT face", flush=True)
        play(displays, lcd, args.clip, stop, boot_style)


if __name__ == "__main__":
    main()
