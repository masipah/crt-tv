#!/usr/bin/env python3
"""Cut the prepared 2:00–2:40 mouth loop into matching video clips."""

import argparse
import math
from pathlib import Path
import subprocess

from PIL import Image, ImageChops

from face import MOUTH_FPS, MOUTH_HEIGHT, MOUTH_WIDTH


SIZE = (MOUTH_WIDTH, MOUTH_HEIGHT)
NEUTRAL_FRAME = 532
CLOSED_POSES = [(534, 4.0), (634, 5.2), (797, 6.2)]
# Source frame bounds are inclusive. The speed is relative to the original.
GESTURES = [
    ("idle-01", 454, 465, 0.55),
    ("idle-02", 508, 520, 0.6),
    ("lick-01", 178, 222, 0.72),
    ("lick-02", 331, 348, 0.63),
    ("lick-03", 81, 97, 0.68),
    ("talk-01", 55, 75, 0.88),
    ("talk-02", 540, 566, 0.88),
]


def decode(source):
    raw = subprocess.check_output([
        "ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(source),
        "-map", "0:v:0", "-an",
        "-vf", f"fps={MOUTH_FPS},scale={MOUTH_WIDTH}:{MOUTH_HEIGHT}:flags=lanczos",
        "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1",
    ])
    stride = MOUTH_WIDTH * MOUTH_HEIGHT * 3
    if len(raw) != 40 * MOUTH_FPS * stride:
        raise ValueError("Use the 40-second mouth.mp4 from hat/prepare-mouth.sh")
    return [Image.frombytes("RGB", SIZE, raw[i:i + stride]) for i in range(0, len(raw), stride)]


def lip_box(frame):
    red, green, _ = frame.split()
    bright = red.point(lambda value: 255 if value > 62 else 0)
    saturated = ImageChops.subtract(red, green).point(lambda value: 255 if value > 35 else 0)
    box = ImageChops.multiply(bright, saturated).getbbox()
    if box is None:
        raise ValueError("A clip boundary has no visible lips")
    left, top, right, bottom = box
    return right - left, (left + right) / 2, (top + bottom) / 2


def placement(frame, neutral_box):
    width, x, y = lip_box(frame)
    neutral_width, neutral_x, neutral_y = neutral_box
    scale = width / neutral_width
    return scale, x - scale * neutral_x, y - scale * neutral_y


def align(frame, transform):
    scale, x, y = transform
    return frame.transform(
        SIZE, Image.Transform.AFFINE, (scale, 0, x, 0, scale, y),
        Image.Resampling.BICUBIC,
    )


def transition(start, end, count):
    for step in range(count):
        fraction = step / (count - 1)
        yield Image.blend(start, end, fraction * fraction * (3 - 2 * fraction))


def closed_frames(neutral, pose, seconds):
    count = int(seconds * MOUTH_FPS)
    for step in range(count):
        weight = (1 - math.cos(math.tau * step / (count - 1))) / 2
        yield Image.blend(neutral, pose, weight)


def gesture_frames(frames, neutral, neutral_box, speed):
    first = placement(frames[0], neutral_box)
    last = placement(frames[-1], neutral_box)
    aligned = []
    for index, frame in enumerate(frames):
        fraction = index / (len(frames) - 1)
        transform = tuple(a + (b - a) * fraction for a, b in zip(first, last))
        aligned.append(align(frame, transform))
    yield from transition(neutral, aligned[0], 6)
    count = round((len(aligned) - 1) / speed)
    for index in range(1, count):
        position = index * (len(aligned) - 1) / count
        whole = int(position)
        yield Image.blend(aligned[whole], aligned[whole + 1], position - whole)
    yield from transition(aligned[-1], neutral, 6)


def encode(frames, output):
    subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-xerror", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{MOUTH_WIDTH}x{MOUTH_HEIGHT}",
        "-r", str(MOUTH_FPS), "-i", "pipe:0", "-an", "-c:v", "libx264",
        "-preset", "fast", "-crf", "15", "-pix_fmt", "yuv420p", "-bf", "0",
        "-video_track_timescale", "20000", "-movflags", "+faststart", str(output),
    ], input=b"".join(frame.tobytes() for frame in frames), check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()
    frames = decode(args.source)
    args.output_directory.mkdir(parents=True, exist_ok=True)
    neutral = frames[NEUTRAL_FRAME]
    neutral_box = lip_box(neutral)
    for index, (number, length) in enumerate(CLOSED_POSES, 1):
        pose = align(frames[number], placement(frames[number], neutral_box))
        encode(closed_frames(neutral, pose, length), args.output_directory / f"closed-{index:02d}.mp4")
    for name, first, last, speed in GESTURES:
        clip = gesture_frames(frames[first:last + 1], neutral, neutral_box, speed)
        encode(clip, args.output_directory / f"{name}.mp4")


if __name__ == "__main__":
    main()
