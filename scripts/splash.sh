#!/usr/bin/env bash
# Early-boot splash (crt-splash.service): paint tty1 with a German-teletext
# (Videotext) style page — full-screen ANSI colour with CP437 mosaic blocks,
# which the kernel console font renders natively. Picks one of six pages at
# random each boot (pass 0-5 to force one: Videotext 100, Testbild, Wetter,
# Bundesliga, Programm, Sendeschluss).
# Stays up until the weather kiosk takes the display.

TTY=${SPLASH_TTY:-/dev/tty1}
exec >"$TTY" 2>/dev/null || exit 0

ROWS=30 COLS=90 # 720x480 composite console default
if size=$(stty size <"$TTY" 2>/dev/null); then
  ROWS=${size% *} COLS=${size#* }
fi

E=$'\033' RS=$'\033[0m'
# Teletext palette: the classic 8, bold foregrounds on plain backgrounds
fR="${E}[1;31m" fG="${E}[1;32m" fY="${E}[1;33m"
fM="${E}[1;35m" fC="${E}[1;36m" fW="${E}[1;37m"
bK="${E}[40m" bR="${E}[41m" bG="${E}[42m" bY="${E}[43m"
bB="${E}[44m" bM="${E}[45m" bC="${E}[46m" bW="${E}[47m"

BUF="${E}[?25l"

at()   { BUF+="${E}[${1};${2}H"; }
put()  { at "$1" "$2"; BUF+="$3"; }
# ctr row visible-width content — passed explicitly because ${#} counts bytes,
# not columns, once the mosaic glyphs (multi-byte UTF-8) are involved
ctr()  { local c=$(( (COLS - $2) / 2 + 1 )); (( c < 1 )) && c=1; put "$1" "$c" "$3"; }
fill() { at "$1" 1; BUF+="${2}${E}[K"; }
rep()  { printf -v REP '%*s' "$1" ''; REP=${REP// /$2}; }

header() { # $1 page number, $2 title
  local wd=(So Mo Di Mi Do Fr Sa) w d t right
  read -r w d t < <(date '+%w %d.%m.%y %H:%M') || true
  right="${wd[${w:-0}]} $d $t"
  fill 2 "$bK"
  put 2 2 "${bK}${fW}${1} ${fC}${2}"
  put 2 $(( COLS - ${#right} - 1 )) "${bK}${fY}${right}"
}

footer() { # fastext row: coloured labels spread across the bottom
  local names=(Wetter Musik Video Radio) colors=("$fR" "$fG" "$fY" "$fC")
  local q=$(( COLS / 4 )) i c
  fill $(( ROWS - 1 )) "$bK"
  for i in 0 1 2 3; do
    c=$(( i * q + (q - ${#names[i]}) / 2 + 1 ))
    put $(( ROWS - 1 )) "$c" "${bK}${colors[i]}${names[i]}"
  done
}

strip() { # $1 row: full-width band of colour blocks
  local seg=$(( COLS / 6 )) pad b
  printf -v pad '%*s' "$seg" ''
  at "$1" 1
  for b in "$bR" "$bY" "$bG" "$bW" "$bC" "$bM"; do BUF+="${b}${pad}"; done
  BUF+="${E}[K"
}

# 5-row mosaic block font, just the glyphs "CRT-TV" needs (each 6 columns)
gC=('██████' '██    ' '██    ' '██    ' '██████')
gR=('█████ ' '██  ██' '█████ ' '██ ██ ' '██  ██')
gT=('██████' '  ██  ' '  ██  ' '  ██  ' '  ██  ')
gD=('      ' '      ' ' ████ ' '      ' '      ')
gV=('██  ██' '██  ██' '██  ██' ' ████ ' '  ██  ')
banner() { # $1 top row, $2 attrs — "CRT-TV", 41 columns wide
  local i
  for i in 0 1 2 3 4; do
    ctr $(( $1 + i )) 41 "${2}${gC[i]} ${gR[i]} ${gT[i]} ${gD[i]} ${gT[i]} ${gV[i]}"
  done
}

page100() { # Videotext page 100: yellow-on-blue welcome page
  BUF+="${RS}${bB}${E}[2J"
  header 100 "CRT-TV VIDEOTEXT"
  strip 4
  local y=$(( ROWS / 2 - 6 ))
  banner "$y" "${bB}${fY}"
  ctr $(( y + 6 ))  18 "${bB}${fW}*  BITTE WARTEN  *"
  ctr $(( y + 8 ))  15 "${bB}${fC}PLEASE STAND BY"
  ctr $(( y + 10 )) 25 "${bB}${fG}SENDUNG BEGINNT IN KUERZE"
  strip $(( ROWS - 3 ))
  footer
}

testbild() { # full-screen colour bars with a grayscale ramp
  BUF+="${RS}${bK}${E}[2J"
  header 199 "TESTBILD * FBAS 720x480i"
  local bars=("$bW" "$bY" "$bC" "$bG" "$bM" "$bR" "$bB" "$bK")
  local w=$(( COLS / 8 )) pad r b ch line=''
  printf -v pad '%*s' "$w" ''
  for (( r = 3; r <= ROWS - 6; r++ )); do
    at "$r" 1
    for b in "${bars[@]}"; do BUF+="${b}${pad}"; done
    BUF+="${E}[K"
  done
  for ch in ░ ▒ ▓ █; do rep $(( COLS / 4 )) "$ch"; line+="$REP"; done
  for (( r = ROWS - 5; r <= ROWS - 3; r++ )); do
    fill "$r" "$bK"
    put "$r" 1 "${bK}${fW}${line}"
  done
  local m=$(( (ROWS - 4) / 2 )) boxpad
  printf -v boxpad '%*s' 44 ''
  for r in -1 0 1 2; do ctr $(( m + r )) 44 "${bK}${boxpad}"; done
  ctr "$m"         11 "${bK}${fW}C R T - T V"
  ctr $(( m + 1 )) 30 "${bK}${fY}BITTE WARTEN * PLEASE STAND BY"
  footer
}

wetter() { # Videotext weather page, mosaic sun and cloud
  BUF+="${RS}${bB}${E}[2J"
  header 170 "WETTER + REISE"
  rep "$COLS" '▄'; put 4 1 "${bB}${fY}${REP}"
  local sun=('▄  ▄█▄  ▄' ' ▄█████▄ ' '█████████' ' ▀█████▀ ' '▀  ▀█▀  ▀')
  local cloud=('    ▄▄███▄▄     ' '  ▄█████████▄   ' ' ██████████████ ' '  ▀▀▀▀▀▀▀▀▀▀▀▀  ')
  local i sl=$(( COLS / 2 - 22 )) cl=$(( COLS / 2 + 4 ))
  (( sl < 1 )) && sl=1
  for i in 0 1 2 3 4; do put $(( 6 + i )) "$sl" "${bB}${fY}${sun[i]}"; done
  for i in 0 1 2 3;   do put $(( 8 + i )) "$cl" "${bB}${fW}${cloud[i]}"; done
  ctr 14 25 "${bB}${fY}W E T T E R B E R I C H T"
  ctr 16 16 "${bB}${fW}WIRD GELADEN ..."
  rep 14 '█'; local bar=$REP
  rep 10 '░'; ctr 18 26 "${bB}${fW}[${fG}${bar}${fC}${REP}${fW}]"
  ctr 20 23 "${bB}${fR}HEUTE 24°${fW} ** ${fC}MORGEN 19°"
  strip $(( ROWS - 3 ))
  footer
}

fussball() { # Videotext sport results, cyan and white rows on black
  BUF+="${RS}${bK}${E}[2J"
  header 251 "SPORT * FUSSBALL"
  ctr 4 28 "${bK}${fY}1. BUNDESLIGA * 34. SPIELTAG"
  local i color line home away score
  local matches=(
    'BAYERN MUENCHEN|WERDER BREMEN|2:1 (1:0)'
    '1. FC KOELN|HAMBURGER SV|0:0'
    'BOR. MGLADBACH|VFB STUTTGART|3:2 (1:1)'
    'EINTRACHT FFM|SCHALKE 04|1:1 (0:1)'
    '1. FC KAISERSL.|FC ST. PAULI|4:0 (2:0)'
    'KARLSRUHER SC|DYNAMO DRESDEN|2:2 (0:2)'
    'SC CRT-TV|FC OWNTONE|6:3 (3:0)'
  )
  for i in "${!matches[@]}"; do
    IFS='|' read -r home away score <<<"${matches[i]}"
    printf -v line '%-17s- %-16s%-9s' "$home" "$away" "$score"
    (( i % 2 )) && color=$fC || color=$fW
    ctr $(( 6 + i * 2 )) 44 "${bK}${color}${line}"
  done
  ctr $(( 6 + ${#matches[@]} * 2 )) 25 "${bK}${fG}ALLE ANGABEN OHNE GEWAEHR"
  strip $(( ROWS - 3 ))
  footer
}

programm() { # Videotext programme guide for channel CRT-TV
  BUF+="${RS}${bB}${E}[2J"
  header 300 "PROGRAMM HEUTE"
  ctr 4 20 "${bB}${fY}CRT-TV * 1. PROGRAMM"
  local i color t title
  local shows=(
    '06.00|TESTBILD MIT MUSIK'
    '09.30|VIDEOTEXT-SCHLEIFE'
    '12.00|WETTER AM MITTAG'
    '15.30|MUSIK NACH WUNSCH'
    '20.15|SPIELFILM: DER GROSSE REGEN'
    '23.45|NACHTPROGRAMM'
    '02.00|SENDESCHLUSS'
  )
  for i in "${!shows[@]}"; do
    IFS='|' read -r t title <<<"${shows[i]}"
    [[ $t == 20.15 ]] && color=$fY || color=$fW
    ctr $(( 6 + i * 2 )) 34 "${bB}${fC}${t}  ${color}${title}"
  done
  strip $(( ROWS - 3 ))
  footer
}

sendeschluss() { # closedown card: quiet black screen, good night
  BUF+="${RS}${bK}${E}[2J"
  header 000 "SENDESCHLUSS"
  local star=(' ▄█▄ ' '█████' ' ▀█▀ ') i
  local y=$(( ROWS / 2 - 5 ))
  for i in 0 1 2; do ctr $(( y + i )) 5 "${bK}${fY}${star[i]}"; done
  ctr $(( y + 4 )) 23 "${bK}${fW}S E N D E S C H L U S S"
  ctr $(( y + 6 )) 19 "${bK}${fC}G U T E   N A C H T"
  ctr $(( y + 8 )) 24 "${bK}${fG}BITTE GERAET AUSSCHALTEN"
  strip $(( ROWS - 3 ))
  footer
}

case "${1:-$(( RANDOM % 6 ))}" in
  1) testbild ;;
  2) wetter ;;
  3) fussball ;;
  4) programm ;;
  5) sendeschluss ;;
  *) page100 ;;
esac

printf '%s' "${BUF}${RS}"
