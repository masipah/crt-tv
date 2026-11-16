#!/usr/bin/env python3
"""Cut the full source video into matching, silent mouth clips."""

import argparse
import math
from pathlib import Path
import subprocess

from PIL import Image, ImageChops

from face import MOUTH_FPS, MOUTH_HEIGHT, MOUTH_WIDTH


SIZE = (MOUTH_WIDTH, MOUTH_HEIGHT)
NEUTRAL_FRAME = 2932  # 2:26.60, closed lips
CLOSED_POSES = [(2934, 4.0), (3034, 5.2), (3197, 6.2), (344, 4.8)]
# Absolute 20 fps source frame bounds are inclusive. Speed is relative to source.
# These excerpts avoid the black/green and isolated-teeth sequences in the video.
GESTURES = [
    ("idle-01", 2854, 2865, 0.55),
    ("idle-02", 2908, 2920, 0.60),
    ("idle-03", 608, 616, 0.50),
    ("lick-01", 2578, 2622, 0.72),
    ("lick-02", 2731, 2748, 0.63),
    ("lick-03", 2481, 2497, 0.68),
    ("lick-04", 616, 643, 0.70),
    ("lick-05", 1048, 1070, 0.72),
    ("talk-01", 2455, 2475, 0.88),
    ("talk-02", 2940, 2966, 0.88),
    ("talk-03", 344, 370, 0.80),
    ("talk-04", 910, 940, 0.80),
]


def decode(source):
    needed = {NEUTRAL_FRAME, *(number for number, _ in CLOSED_POSES)}
    for _, first, last, _ in GESTURES:
        needed.update(range(first, last + 1))
    numbers = sorted(needed)
    # Decode once, retaining only selected frames to avoid holding the entire
    # four-minute video as raw RGB in memory.
    ranges = []
    first = last = numbers[0]
    for number in numbers[1:]:
        if number == last + 1:
            last = number
        else:
            ranges.append((first, last))
            first = last = number
    ranges.append((first, last))
    selection = "+".join(f"between(n,{first},{last})" for first, last in ranges)
    raw = subprocess.check_output([
        "ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(source),
        "-map", "0:v:0", "-an",
        "-vf", f"fps={MOUTH_FPS},select='{selection}',scale={MOUTH_WIDTH}:{MOUTH_HEIGHT}:flags=lanczos",
        "-vsync", "0",
        "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1",
    ])
    stride = MOUTH_WIDTH * MOUTH_HEIGHT * 3
    if len(raw) != len(numbers) * stride:
        raise ValueError("Use the complete source video, including the passage through 2:40")
    return {number: Image.frombytes("RGB", SIZE, raw[i * stride:(i + 1) * stride])
            for i, number in enumerate(numbers)}


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
        "-preset", "fast", "-qp", "0", "-pix_fmt", "yuv420p", "-bf", "0",
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
        clip = gesture_frames([frames[number] for number in range(first, last + 1)],
                              neutral, neutral_box, speed)
        encode(clip, args.output_directory / f"{name}.mp4")


if __name__ == "__main__":
    main()
