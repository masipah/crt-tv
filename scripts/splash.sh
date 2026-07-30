#!/usr/bin/env bash
# Early-boot signal animation for tty1. It runs independently of the boot
# transaction and loops continuously until the kiosk claims the VT.

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

draw_lock_bar() { # colour, width, optional row
  local color=$1 width=$2 row=${3:-16}
  center_col "$width"
  rep "$width" '▀'
  put "$row" "$CENTER_COL" "${color}${REP}"
}

draw_burst_bar() { # row, palette phase
  local row=$1 phase=$2 segment=8 i color
  local colors=("$fB" "$fC" "$fW" "$fM" "$fR" "$fY" "$fW" "$fC")
  center_col 64
  rep "$segment" '▀'
  for i in 0 1 2 3 4 5 6 7; do
    color=${colors[$(( (i + phase) % 8 ))]}
    put "$row" $(( CENTER_COL + i * segment )) "${color}${REP}"
  done
}

draw_box() { # top row, height, width, colour
  local top=$1 height=$2 width=$3 color=$4 row bottom left right
  center_col "$width"
  left=$CENTER_COL
  right=$(( left + width - 1 ))
  bottom=$(( top + height - 1 ))
  rep "$width" '▄'
  put "$top" "$left" "${color}${REP}"
  put "$bottom" "$left" "${color}${REP}"
  for (( row = top + 1; row < bottom; row++ )); do
    put "$row" "$left" "${color}█"
    put "$row" "$right" "${color}█"
  done
}

draw_logo_split() { # row displacement strength
  local spread=$1 i shift color
  center_col "$LOGO_W"
  local base=$CENTER_COL
  for i in 0 1 2 3 4; do
    case $i in
      0) shift=$(( -2 * spread )); color=$fC ;;
      1) shift=$(( -1 * spread )); color=$fB ;;
      2) shift=0; color=$fW ;;
      3) shift=$spread; color=$fM ;;
      *) shift=$(( 2 * spread )); color=$fR ;;
    esac
    (( spread == 0 )) && color=$fW
    put $(( 9 + i )) $(( base + shift )) "${color}${LOGO[i]}"
  done
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

color_burst() {
  local row phase

  phase=0
  for row in 7 8 9 10 11 12 13 14 15 16 17 18; do
    blank_frame
    draw_logo "$fD" 0 0
    draw_lock_bar "$fD" 56
    draw_burst_bar "$row" "$phase"
    present
    pause 0.08
    phase=$(( (phase + 1) % 8 ))
  done

  for phase in 0 1 2 3 4 5 6 7; do
    blank_frame
    draw_burst_bar 7 "$phase"
    draw_burst_bar 16 $(( 7 - phase ))
    draw_logo "$fW" 0 0
    present
    pause 0.08
  done
}

raster_tunnel() {
  local step ring
  local widths=(14 24 34 46 58 70 82)
  local heights=(3 5 7 9 11 13 15)
  local colors=("$fM" "$fB" "$fC" "$fW" "$fY" "$fR" "$fM")

  for step in 0 1 2 3 4 5 6 5 4 3 2 1 0; do
    blank_frame
    for (( ring = 0; ring <= step; ring++ )); do
      draw_box $(( 12 - heights[ring] / 2 )) \
        "${heights[ring]}" "${widths[ring]}" "${colors[ring]}"
    done
    (( step >= 3 )) && draw_logo "$fW" 0 0
    present
    pause 0.09
  done
}

vertical_roll() {
  local yoff
  for yoff in 7 5 3 1 0 -1 -3 -5 -7 5 3 1 0; do
    blank_frame
    draw_logo "$fC" -1 "$yoff"
    draw_logo "$fM" 1 "$yoff"
    draw_logo "$fW" 0 "$yoff"
    draw_lock_bar "$fB" 56 $(( 16 + yoff ))
    present
    pause 0.09
  done
}

chromatic_echo() {
  local offset
  for offset in 0 2 4 6 8 10 8 6 4 2 0; do
    blank_frame
    draw_logo "$fB" "-$offset" 0
    draw_logo "$fC" $(( -offset / 2 )) 0
    draw_logo "$fR" "$offset" 0
    draw_logo "$fM" $(( offset / 2 )) 0
    draw_logo "$fW" 0 0
    draw_lock_bar "$fY" $(( 56 + offset ))
    present
    pause 0.10
  done
}

logo_breakup() {
  local spread
  for spread in 0 1 2 3 4 5 7 5 3 1 0; do
    blank_frame
    draw_logo_split "$spread"
    draw_lock_bar "$fW" $(( 56 - spread * 4 ))
    present
    pause 0.10
  done
}

phosphor_collapse() {
  local width
  for width in 82 68 54 40 28 16 8 2; do
    blank_frame
    draw_line 11 "$(( width * 3 / 4 ))" "$fB"
    draw_line 12 "$width" "$fW"
    draw_line 13 "$(( width * 3 / 4 ))" "$fC"
    present
    pause 0.07
  done
  blank_frame
  present
  pause 0.16
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

animation_cycle() {
  sync_acquire
  rgb_converge
  scan_logo
  final_frame
  pause 0.45
  color_burst
  raster_tunnel
  vertical_roll
  chromatic_echo
  logo_breakup
  final_frame
  pause 0.45
  phosphor_collapse
}

animation_cycle
if [[ ${1:-} == --once ]]; then
  final_frame
  exit 0
fi

# Loop the entire broadcast sequence for however long WeatherStar needs.
# clear-console.sh stops this service before Chromium takes over tty1.
while :; do
  animation_cycle
done
