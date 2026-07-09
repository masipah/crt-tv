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
  put 2 2 "${bK}${fW}${1} ${fM}${2}"
  put 2 $(( COLS - ${#right} - 1 )) "${bK}${fY}${right}"
}

footer() { # fastext row: coloured labels spread across the bottom
  local names=(Flirt Astro Dates 'AB 18') colors=("$fR" "$fG" "$fY" "$fC")
  local q=$(( COLS / 4 )) i c
  fill $(( ROWS - 1 )) "$bK"
  for i in 0 1 2 3; do
    c=$(( i * q + (q - ${#names[i]}) / 2 + 1 ))
    put $(( ROWS - 1 )) "$c" "${bK}${colors[i]}${names[i]}"
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
  ctr 4 23 "${bK}${fM}H E I S S E   L I N I E"
  draw_heart 6 $(( COLS / 2 - 15 )) "${bK}${fR}"
  draw_heart 6 $(( COLS / 2 + 5 ))  "${bK}${fM}"
  ctr 13 23 "${bK}${fW}LIVE + PRIVAT + TABULOS"
  bignum 15 "${bK}${fY}" '0190-696969'
  ctr 21 14 "${bK}${fR}(1,86 DM/MIN.)"
  ctr 23 13 "${bK}${fC}RUF JETZT AN!"
  strip $(( ROWS - 3 ))
  footer
}

kuss_hotline() { # big mosaic lips
  BUF+="${RS}${bK}${E}[2J"
  header 616 "KUSS-HOTLINE * AB 18"
  ctr 4 26 "${bK}${fY}DER HEISSE DRAHT ZU NICOLE"
  local lips=('  ▄▄██▄▄ ▄▄██▄▄  ' '█████████████████' '▀▀█████████████▀▀' '   ▀▀███████▀▀   ') i
  for i in 0 1 2 3; do ctr $(( 6 + i )) 17 "${bK}${fR}${lips[i]}"; done
  ctr 11 27 "${bK}${fM}SIE WARTET AUF DEINEN ANRUF"
  bignum 13 "${bK}${fY}" '0190-616161'
  ctr 19 25 "${bK}${fW}DISKRET + PRIVAT + SOFORT"
  ctr 21 20 "${bK}${fG}1,86 DM/MIN. * AB 18"
  strip $(( ROWS - 3 ))
  footer
}

traumfrauen() { # the listing page: who is waiting by which phone
  BUF+="${RS}${bK}${E}[2J"
  header 677 "TRAUMFRAUEN PRIVAT"
  ctr 4 30 "${bK}${fM}HEISSE DRAEHTE IN DEINER STADT"
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
    ctr $(( 6 + i * 2 )) 38 "${bK}${color}${line}"
  done
  ctr 18 21 "${bK}${fG}DISKRETION GARANTIERT"
  ctr 20 20 "${bK}${fR}1,86 DM/MIN. * AB 18"
  strip $(( ROWS - 3 ))
  footer
}

astro_linie() { # the other late-night staple: fate by the minute
  BUF+="${RS}${bK}${E}[2J"
  header 680 "ASTRO-LINIE"
  ctr 4 23 "${bK}${fY}MADAME ZORA WEISS ALLES"
  local ball=('  ▄█████▄  ' ' █████████ ' '███████████' ' █████████ ' '  ▀█████▀  ') i
  for i in 0 1 2 3 4; do ctr $(( 6 + i )) 11 "${bK}${fC}${ball[i]}"; done
  ctr 11 11 "${bK}${fY}▄▄▄▄▄▄▄▄▄▄▄"
  ctr 13 24 "${bK}${fW}LIEBE * GELD * SCHICKSAL"
  bignum 15 "${bK}${fM}" '0190-808080'
  ctr 21 19 "${bK}${fC}TAROT LIVE 0-24 UHR"
  strip $(( ROWS - 3 ))
  footer
}

nachtprogramm() { # tonight after dark on CRT-TV
  BUF+="${RS}${bK}${E}[2J"
  header 615 "PROGRAMM HEUTE NACHT"
  ctr 4 26 "${bK}${fM}CRT-TV * DAS NACHTPROGRAMM"
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
    ctr $(( 6 + i * 2 )) 28 "${bK}${fC}${t}  ${color}${title}"
  done
  ctr 18 20 "${bK}${fR}ALLE SENDUNGEN AB 18"
  strip $(( ROWS - 3 ))
  footer
}

gute_nacht() { # closedown card, but the hotline never sleeps
  BUF+="${RS}${bK}${E}[2J"
  header 000 "SENDESCHLUSS"
  local mini=('▄█▄ ▄█▄' '███████' ' ▀███▀ ' '   ▀   ') i
  local y=$(( ROWS / 2 - 6 ))
  for i in 0 1 2 3; do ctr $(( y + i )) 7 "${bK}${fM}${mini[i]}"; done
  ctr $(( y + 5 )) 35 "${bK}${fW}T R A E U M   W A S   S U E S S E S"
  ctr $(( y + 7 )) 26 "${bK}${fC}BIS MORGEN NACHT AB 23 UHR"
  ctr $(( y + 9 )) 32 "${bK}${fM}0190-696969 * IMMER FUER DICH DA"
  strip $(( ROWS - 3 ))
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
