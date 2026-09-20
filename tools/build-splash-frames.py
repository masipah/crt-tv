#!/usr/bin/env python3
"""Export the existing console animation, with its original frame timing."""
import json
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
source = (root / 'scripts/splash.sh').read_text()
source = source.replace('exec >"$TTY" 2>/dev/null || exit 0', ':')
source = source.replace('if size=$(stty size <"$TTY" 2>/dev/null); then', 'if false; then')
source = source.replace('printf \'%s\' "$FRAME"', 'printf \'%s\\0\' "$FRAME"')
source = source.replace('[[ ${SPLASH_FAST:-0} == 1 ]] && sleep 0.01 || sleep "$1"', 'printf \'%s\\0\' "$1"')
result = subprocess.run(['bash', '-s', '--', '--once'], input=source, text=True,
                        capture_output=True, check=True)
parts = result.stdout.split('\0')
frames = [[parts[i], float(parts[i + 1])] for i in range(0, len(parts) - 2, 2)]
assert len(frames) > 50
(root / 'scripts/kiosk-ext/splash-frames.js').write_text(
    '// Generated from scripts/splash.sh by tools/build-splash-frames.py.\n'
    'globalThis.crtSplashFrames = ' + json.dumps(frames, ensure_ascii=False, separators=(',', ':')) + ';\n')
