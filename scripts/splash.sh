#!/usr/bin/env bash
# Early-boot signal animation for tty1. It runs independently of the boot
# transaction and holds a quiet station ident until the kiosk claims the VT.

TTY=${SPLASH_TTY:-/dev/tty1}
exec >"$TTY" 2>/dev/null || exit 0

ROWS=30 COLS=90 # 720x480 composite console default
if size=$(stty size <"$TTY" 2>/dev/null); then
  ROWS=${size% *}
  COLS=${size#* }
fi

# Compose on a virtual 24-row canvas. Typical CRT overscan crops the blank
# margin instead of the animation.
VOFF=$(( (ROWS - 24) / 2 ))
(( VOFF < 0 )) && VOFF=0

E=$'\033'
RS="${E}[0m"
fD="${E}[0;37m"
fR="${E}[1;31m"
fY="${E}[1;33m"
fB="${E}[1;34m"
fM="${E}[1;35m"
fC="${E}[1;36m"
fW="${E}[1;37m"
bK="${E}[40m"

FRAME=''
REP=''

at() {
  FRAME+="${E}[$(( $1 + VOFF ));${2}H"
}

put() {
  at "$1" "$2"
  FRAME+="$3"
}

rep() {
  printf -v REP '%*s' "$1" ''
  REP=${REP// /$2}
}

blank_frame() {
  FRAME="${RS}${bK}${E}[2J${E}[H${E}[?25l"
}

present() {
  printf '%s' "$FRAME"
}

pause() {
  [[ ${SPLASH_FAST:-0} == 1 ]] && sleep 0.01 || sleep "$1"
}

center_col() {
  CENTER_COL=$(( (COLS - $1) / 2 + 1 + ${2:-0} ))
  (( CENTER_COL < 1 )) && CENTER_COL=1
}

draw_line() { # row, width, colour
  local row=$1 width=$2 color=$3
  center_col "$width"
  rep "$width" '▄'
  put "$row" "$CENTER_COL" "${color}${REP}"
}

# MASIPAH TV
LOGO_W=56
LOGO=(
  '█   █  ███  █████ █████ ████   ███  █   █    █████ █   █'
  '██ ██ █   █ █       █   █   █ █   █ █   █      █   █   █'
  '█ █ █ █████ █████   █   ████  █████ █████      █   █   █'
  '█   █ █   █     █   █   █     █   █ █   █      █    █ █ '
  '█   █ █   █ █████ █████ █     █   █ █   █      █     █  '
)

draw_logo() { # colour, horizontal offset, vertical offset
  local color=$1 xoff=${2:-0} yoff=${3:-0} i
  center_col "$LOGO_W" "$xoff"
  for i in 0 1 2 3 4; do
    put $(( 9 + i + yoff )) "$CENTER_COL" "${color}${LOGO[i]}"
  done
}

draw_lock_bar() { # colour, width
  local color=$1 width=$2
  center_col "$width"
  rep "$width" '▀'
  put 16 "$CENTER_COL" "${color}${REP}"
}

noise_flash() { # row, offset, colour
  local row=$1 offset=$2 color=$3
  blank_frame
  center_col 64 "$offset"
  put "$row" "$CENTER_COL" \
    "${color}▄▄   ▀▀▀      ▄▄  ▄      ▀▀▀▀   ▄▄▄       ▀  ▄▄    ▀▀   ▄"
  present
}

sync_acquire() {
  local row offset color width

  blank_frame
  present
  pause 0.28

  noise_flash 7 -5 "$fD"
  pause 0.06
  blank_frame
  present
  pause 0.08
  noise_flash 18 4 "$fB"
  pause 0.05
  blank_frame
  present
  pause 0.10
  noise_flash 12 -2 "$fW"
  pause 0.07

  row=12
  for width in 8 18 32 50 68 82; do
    blank_frame
    draw_line "$row" "$width" "$fW"
    (( row == 12 )) && color=$fC || color=$fB
    draw_line $(( row + 1 )) "$(( width * 3 / 4 ))" "$color"
    present
    pause 0.08
    (( row == 12 )) && row=11 || row=12
  done

  for width in 82 70 54 38 24 12; do
    blank_frame
    draw_line 11 "$width" "$fB"
    draw_line 12 "$(( width + 4 ))" "$fW"
    draw_line 13 "$width" "$fC"
    present
    pause 0.07
  done

  blank_frame
  draw_line 12 4 "$fW"
  present
  pause 0.20
}

rgb_converge() {
  local offset
  for offset in 5 4 3 2 1; do
    blank_frame
    draw_logo "$fC" "-$offset" 0
    draw_logo "$fM" "$offset" 0
    if (( offset <= 3 )); then
      draw_logo "$fW" 0 0
    fi
    draw_lock_bar "$fB" "$(( 40 + (5 - offset) * 4 ))"
    present
    pause 0.14
  done

  blank_frame
  draw_logo "$fC" -1 0
  draw_logo "$fM" 1 0
  draw_logo "$fW" 0 0
  draw_lock_bar "$fW" 56
  present
  pause 0.36
}

scan_logo() {
  local row
  for row in 8 9 10 11 12 13 14 15; do
    blank_frame
    draw_logo "$fD" 0 0
    draw_lock_bar "$fD" 56
    draw_line "$row" 58 "$fC"
    present
    pause 0.07
  done
}

final_frame() { # optional pulse colour
  local pulse=${1:-$fW}
  blank_frame
  draw_logo "$fW" 0 0
  draw_lock_bar "$pulse" 56
  center_col 1
  put 18 "$CENTER_COL" "${pulse}■"
  present
}

stop_animation() {
  printf '%s' "${RS}${bK}${E}[2J${E}[H${E}[?25l"
  exit 0
}
trap stop_animation INT TERM HUP

sync_acquire
rgb_converge
scan_logo
final_frame
pause 0.70

[[ ${1:-} == --once ]] && exit 0

# WeatherStar may take a while on a cold network start. Hold the ident with a
# tiny sync pulse at a very low duty cycle until systemd stops us for the kiosk.
while :; do
  pause 2.40
  final_frame "$fC"
  pause 0.06
  final_frame "$fM"
  pause 0.06
  final_frame "$fW"
done
