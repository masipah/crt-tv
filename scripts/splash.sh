#!/usr/bin/env bash
# Early-boot splash (crt-splash.service): paint tty1 with a German late-night
# teletext (Videotext) ad page — full-screen ANSI colour with CP437 mosaic
# blocks, in the spirit of the infamous 0190 pay-line pages on RTL-Text.
# Picks one of six pages at random each boot (pass 0-5 to force one:
# Heisse Linie, Kuss-Hotline, Traumfrauen, Astro-Linie, Nachtprogramm,
# Sendeschluss). Stays up until the weather kiosk takes the display.

TTY=${SPLASH_TTY:-/dev/tty1}
exec >"$TTY" 2>/dev/null || exit 0

ROWS=30 COLS=90 # 720x480 composite console default
if size=$(stty size <"$TTY" 2>/dev/null); then
  ROWS=${size% *} COLS=${size#* }
fi

# Pages are laid out on a virtual 24-row teletext page, vertically centred on
# the console — the CRT's overscan then crops blank margin, not content
VOFF=$(( (ROWS - 24) / 2 ))
(( VOFF < 0 )) && VOFF=0
# Same idea horizontally: edge-anchored text (header, clock, footer labels)
# stays HM columns clear of the sides. ~7% per side, in line with typical
# overscan; centred content is already well inside. Colour strips and bar
# fills still bleed edge-to-edge on purpose — cropped colour looks right.
HM=$(( COLS * 7 / 100 ))

E=$'\033' RS=$'\033[0m'
# Teletext palette: the classic 8, bold foregrounds on plain backgrounds
fR="${E}[1;31m" fG="${E}[1;32m" fY="${E}[1;33m"
fM="${E}[1;35m" fC="${E}[1;36m" fW="${E}[1;37m"
bK="${E}[40m" bR="${E}[41m" bG="${E}[42m" bY="${E}[43m"
bB="${E}[44m" bM="${E}[45m" bC="${E}[46m" bW="${E}[47m"

BUF="${E}[?25l"

at()   { BUF+="${E}[$(( $1 + VOFF ));${2}H"; }
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
  fill 1 "$bK"
  put 1 $(( HM + 1 )) "${bK}${fW}${1} ${fM}${2}"
  put 1 $(( COLS - ${#right} - HM + 1 )) "${bK}${fY}${right}"
}

footer() { # fastext row: coloured labels spread across the bottom
  local names=(Flirt Astro Dates 'AB 18') colors=("$fR" "$fG" "$fY" "$fC")
  local q=$(( (COLS - 2 * HM) / 4 )) i c
  fill 24 "$bK"
  for i in 0 1 2 3; do
    c=$(( HM + i * q + (q - ${#names[i]}) / 2 + 1 ))
    put 24 "$c" "${bK}${colors[i]}${names[i]}"
  done
}

strip() { # $1 row: full-width band of colour blocks, magenta forward
  local seg=$(( COLS / 6 )) pad b
  printf -v pad '%*s' "$seg" ''
  at "$1" 1
  for b in "$bM" "$bR" "$bY" "$bW" "$bC" "$bB"; do BUF+="${b}${pad}"; done
  BUF+="${E}[K"
}

bignum() { # $1 top row, $2 attrs, $3 digits/dashes — 5-row mosaic numerals
  local top=$1 attrs=$2 s=$3 r c ch line
  local width=$(( ${#3} * 5 - 1 ))
  for r in 0 1 2 3 4; do
    line=''
    for (( c = 0; c < ${#s}; c++ )); do
      ch=${s:c:1}
      case $ch in
        0) set -- '████' '█  █' '█  █' '█  █' '████' ;;
        1) set -- '  █ ' ' ██ ' '  █ ' '  █ ' ' ███' ;;
        6) set -- '████' '█   ' '████' '█  █' '████' ;;
        8) set -- '████' '█  █' '████' '█  █' '████' ;;
        9) set -- '████' '█  █' '████' '   █' '████' ;;
        -) set -- '    ' '    ' ' ██ ' '    ' '    ' ;;
        *) set -- '    ' '    ' '    ' '    ' '    ' ;;
      esac
      shift "$r"
      line+="$1 "
    done
    ctr $(( top + r )) "$width" "${attrs}${line% }"
  done
}

heart=(' ▄██▄ ▄██▄ ' '███████████' '▀█████████▀' ' ▀███████▀ ' '   ▀███▀   ' '     ▀     ')
draw_heart() { # $1 top row, $2 left col, $3 attrs
  local i
  for i in 0 1 2 3 4 5; do put $(( $1 + i )) "$2" "${3}${heart[i]}"; done
}

heisse_linie() { # the main ad page: hearts and a huge 0190 number
  BUF+="${RS}${bK}${E}[2J"
  header 666 "DIE HEISSE LINIE * AB 18"
  ctr 3 23 "${bK}${fM}H E I S S E   L I N I E"
  draw_heart 5 $(( COLS / 2 - 15 )) "${bK}${fR}"
  draw_heart 5 $(( COLS / 2 + 5 ))  "${bK}${fM}"
  ctr 12 23 "${bK}${fW}LIVE + PRIVAT + TABULOS"
  bignum 14 "${bK}${fY}" '0190-696969'
  ctr 20 30 "${bK}${fR}(1,86 DM/MIN.) ${fC}* RUF JETZT AN!"
  strip 22
  footer
}

kuss_hotline() { # big mosaic lips
  BUF+="${RS}${bK}${E}[2J"
  header 616 "KUSS-HOTLINE * AB 18"
  ctr 3 26 "${bK}${fY}DER HEISSE DRAHT ZU NICOLE"
  local lips=('  ▄▄██▄▄ ▄▄██▄▄  ' '█████████████████' '▀▀█████████████▀▀' '   ▀▀███████▀▀   ') i
  for i in 0 1 2 3; do ctr $(( 5 + i )) 17 "${bK}${fR}${lips[i]}"; done
  ctr 10 27 "${bK}${fM}SIE WARTET AUF DEINEN ANRUF"
  bignum 12 "${bK}${fY}" '0190-616161'
  ctr 18 25 "${bK}${fW}DISKRET + PRIVAT + SOFORT"
  ctr 20 20 "${bK}${fG}1,86 DM/MIN. * AB 18"
  strip 22
  footer
}

traumfrauen() { # the listing page: who is waiting by which phone
  BUF+="${RS}${bK}${E}[2J"
  header 677 "TRAUMFRAUEN PRIVAT"
  ctr 3 30 "${bK}${fM}HEISSE DRAEHTE IN DEINER STADT"
  local i color line name age city nr
  local ads=(
    'NICOLE|21|KOELN|0190-661166'
    'SANDRA|19|HAMBURG|0190-662266'
    'JACQUELINE|22|BERLIN|0190-663366'
    'BEATE|34|MUENCHEN|0190-664466'
    'GISELA|57|BOTTROP|0190-665566'
    'CHANTAL|25|WUPPERTAL|0190-666666'
  )
  for i in "${!ads[@]}"; do
    IFS='|' read -r name age city nr <<<"${ads[i]}"
    printf -v line '%-12s%-4s%-11s%s' "$name" "$age" "$city" "$nr"
    (( i % 2 )) && color=$fM || color=$fW
    ctr $(( 5 + i * 2 )) 38 "${bK}${color}${line}"
  done
  ctr 17 21 "${bK}${fG}DISKRETION GARANTIERT"
  ctr 19 20 "${bK}${fR}1,86 DM/MIN. * AB 18"
  strip 22
  footer
}

astro_linie() { # the other late-night staple: fate by the minute
  BUF+="${RS}${bK}${E}[2J"
  header 680 "ASTRO-LINIE"
  ctr 3 23 "${bK}${fY}MADAME ZORA WEISS ALLES"
  local ball=('  ▄█████▄  ' ' █████████ ' '███████████' ' █████████ ' '  ▀█████▀  ') i
  for i in 0 1 2 3 4; do ctr $(( 5 + i )) 11 "${bK}${fC}${ball[i]}"; done
  ctr 10 11 "${bK}${fY}▄▄▄▄▄▄▄▄▄▄▄"
  ctr 12 24 "${bK}${fW}LIEBE * GELD * SCHICKSAL"
  bignum 14 "${bK}${fM}" '0190-808080'
  ctr 20 19 "${bK}${fC}TAROT LIVE 0-24 UHR"
  strip 22
  footer
}

nachtprogramm() { # tonight after dark on CRT-TV
  BUF+="${RS}${bK}${E}[2J"
  header 615 "PROGRAMM HEUTE NACHT"
  ctr 3 26 "${bK}${fM}CRT-TV * DAS NACHTPROGRAMM"
  local i color t title
  local shows=(
    '22.00|WETTER FUER VERLIEBTE'
    '23.00|HEISSER DRAHT LIVE'
    '23.30|TUTTI FRUTTI (WHLG.)'
    '00.30|EROTIK-CLIPS NONSTOP'
    '02.00|SEXY SPORT CLIPS'
    '04.00|SENDESCHLUSS'
  )
  for i in "${!shows[@]}"; do
    IFS='|' read -r t title <<<"${shows[i]}"
    [[ $t == 23.30 ]] && color=$fY || color=$fW
    ctr $(( 5 + i * 2 )) 28 "${bK}${fC}${t}  ${color}${title}"
  done
  ctr 18 20 "${bK}${fR}ALLE SENDUNGEN AB 18"
  strip 22
  footer
}

gute_nacht() { # closedown card, but the hotline never sleeps
  BUF+="${RS}${bK}${E}[2J"
  header 000 "SENDESCHLUSS"
  local mini=('▄█▄ ▄█▄' '███████' ' ▀███▀ ' '   ▀   ') i
  for i in 0 1 2 3; do ctr $(( 6 + i )) 7 "${bK}${fM}${mini[i]}"; done
  ctr 12 35 "${bK}${fW}T R A E U M   W A S   S U E S S E S"
  ctr 14 26 "${bK}${fC}BIS MORGEN NACHT AB 23 UHR"
  ctr 16 32 "${bK}${fM}0190-696969 * IMMER FUER DICH DA"
  strip 22
  footer
}

case "${1:-$(( RANDOM % 6 ))}" in
  1) kuss_hotline ;;
  2) traumfrauen ;;
  3) astro_linie ;;
  4) nachtprogramm ;;
  5) gute_nacht ;;
  *) heisse_linie ;;
esac

printf '%s' "${BUF}${RS}"
