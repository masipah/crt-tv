#!/usr/bin/env bash
# Continuous station loader for tty1; the same frames run inside the player.
# Never clear between frames: the logo stays visible while the loading rail moves.

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
  FRAME="${RS}${bK}${E}[H${E}[?25l"
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

loading_frame() {
  local phase=$1 x step color
  blank_frame
  draw_logo "$fW"
  center_col "$LOGO_W"
  # A triangular wave reverses gently at both ends with no wrap/reset jump.
  step=$phase
  (( step > 48 )) && step=$(( 96 - step ))
  for (( x=0; x<LOGO_W; x++ )); do
    color=$fD
    if (( x >= step && x < step + 8 )); then color=$fC; fi
    put 16 "$(( CENTER_COL + x ))" "${color}▀"
  done
}

final_frame() {
  loading_frame 0
  present
}

# The first clear belongs to initial setup, never to an animation frame.
printf '%s' "${RS}${bK}${E}[2J${E}[?25l"
trap 'final_frame; exit 0' INT TERM HUP
while true; do
  for (( phase=0; phase<96; phase++ )); do
    loading_frame "$phase"
    present
    pause 0.04
  done
  if [[ ${1:-} == --once ]]; then final_frame; exit 0; fi
done
