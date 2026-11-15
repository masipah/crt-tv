#!/usr/bin/env bash
set -euo pipefail

if (( $# < 1 || $# > 2 )); then
  echo 'Usage: bash hat/prepare-mouth.sh mouth.mp4 [source.mp4]' >&2
  exit 1
fi

output=$1
source_video=${2:-}
work=$(mktemp -d "$(dirname "$output")/.mouth-video.XXXXXX")
trap 'rm -rf -- "$work"' EXIT

if [[ -z $source_video ]]; then
  ytdlp=(yt-dlp --ignore-config --no-playlist)
  if command -v node >/dev/null && [[ $(node -p 'Number(process.versions.node.split(".")[0]) >= 22') == true ]]; then
    ytdlp+=(--js-runtimes node)
  fi
  source_video=$("${ytdlp[@]}" -f 'bv[height<=720]/b[height<=720]' \
    -o "$work/source.%(ext)s" --print after_move:filepath \
    'https://www.youtube.com/watch?v=GKhPVHoodrU')
fi

ffmpeg -nostdin -v error -xerror -ss 120 -i "$source_video" -t 40 -map 0:v:0 -an \
  -vf 'fps=20,scale=320:180:flags=lanczos,setsar=1' \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart "$work/mouth.mp4"
frames=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames \
  -of default=noprint_wrappers=1:nokey=1 "$work/mouth.mp4")
if [[ $frames != 800 ]]; then
  echo 'The source must contain the full 2:00–2:40 segment.' >&2
  exit 1
fi
mv -- "$work/mouth.mp4" "$output"
