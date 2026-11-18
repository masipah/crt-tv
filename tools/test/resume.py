"""Exercise a weather break against an isolated, headless mpv playlist."""
from pathlib import Path
import os
import subprocess
import tempfile
import time
import wave

root = Path(__file__).resolve().parents[2]
flags = ['mpv', '--no-config', '--load-scripts=no', '--resume-playback=no',
         '--save-position-on-quit=no', '--video=no', '--audio-display=no', '--ao=null']
with tempfile.TemporaryDirectory() as folder:
    run = Path(folder)
    tracks = [run / name for name in ('Third.wav', '東京.wav', 'First.wav')]
    for track in tracks:
        with wave.open(str(track), 'wb') as audio:
            audio.setparams((1, 2, 8000, 0, 'NONE', 'not compressed'))
            audio.writeframes(bytes(2 * 8000 * 4))
    playlist = run / 'playlist.m3u'
    playlist.write_text('\n'.join(map(str, reversed(tracks))) + '\n')
    player = subprocess.Popen([*flags, '--no-terminal', '--pause', '--start=2',
                               '--playlist-start=1', f'--input-ipc-server={run}/mpv.sock', *tracks])
    try:
        deadline = time.monotonic() + 10
        while True:
            snapshot = subprocess.run(['node', root / 'remote/save-resume.mjs', run], capture_output=True)
            if snapshot.returncode == 0:
                break
            if player.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError(snapshot.stderr.decode())
            time.sleep(.05)
    finally:
        player.terminate()
        player.wait(timeout=5)

    assert playlist.read_text().splitlines() == list(map(str, tracks))
    position, seconds = (run / 'resume').read_text().split()
    assert position == '1' and float(seconds) == 2
    result = subprocess.run([*flags, '--terminal=yes', '--length=0.2',
                             '--term-playing-msg=TRACK=${playlist-pos} TIME=${time-pos/full}',
                             f'--script={root}/scripts/resume.lua',
                             f'--playlist-start={position}', f'--playlist={playlist}'],
                            env={**os.environ, 'CRT_RESUME_SECONDS': seconds},
                            capture_output=True, text=True, timeout=10, check=True)
    output = result.stdout + result.stderr
    assert 'TRACK=1 TIME=00:00:02.000' in output, output
    assert 'TRACK=2 TIME=00:00:00.000' in output, output
print('Weather break restored the live playlist and sought only the interrupted track.')
