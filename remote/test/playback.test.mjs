import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(execFileCallback);

test('manual Videos play once without broadcast scripts; Channel keeps its rotation', async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'crt-play-test-')));
  const media = path.join(dir, 'media'), run = path.join(dir, 'run'), bin = path.join(dir, 'bin');
  try {
    for (const d of [run, bin, ...['videos', 'commercials', 'on-demand'].map(b => path.join(media, b))]) {
      await fs.mkdir(d, {recursive:true});
    }
    const channel = ['First.mp4', 'Rez.mp4'].map(n => path.join(media, 'videos', n));
    const manual = ['Game.mp4', 'Other.mp4'].map(n => path.join(media, 'on-demand', n));
    for (const f of [...channel, ...manual, path.join(media, 'commercials', 'Ad.mp4')]) await fs.writeFile(f, 'fixture');
    await fs.writeFile(path.join(media, '.playorder.m3u'), channel.join('\n') + '\n');
    await fs.writeFile(path.join(run, 'shuffle'), '');
    await fs.writeFile(path.join(dir, 'env'), `MEDIA_DIR=${media}\n`);
    for (const cmd of ['systemctl', 'xset', 'xsetroot', 'socat', 'amixer']) await fs.writeFile(path.join(bin, cmd), '#!/bin/sh\nexit 0\n', {mode:0o755});
    // Deterministic shuf double (macOS has no coreutils shuf).
    await fs.writeFile(path.join(bin, 'shuf'), '#!/bin/sh\nawk \'{a[NR]=$0} END {for(i=NR;i>0;i--) print a[i]}\' "$@"\n', {mode:0o755});
    await fs.writeFile(path.join(bin, 'mpv'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', {mode:0o755});
    // Redirect fixed OS paths and bypass sudo in the sandbox copy; execute the
    // actual playlist construction and player launcher against real files.
    const tv = (await fs.readFile(new URL('../../scripts/tv', import.meta.url), 'utf8'))
      .replace('RUN_DIR=/run/crt-tv', `RUN_DIR=${run}`)
      .replace('ENV_FILE=/etc/crt-tv/crt-tv.env', `ENV_FILE=${dir}/env`)
      .replace('[[ $EUID -ne 0 ]]', 'false');
    const player = (await fs.readFile(new URL('../../scripts/play-media-x.sh', import.meta.url), 'utf8'))
      .replaceAll('/run/crt-tv', run);
    await fs.writeFile(path.join(dir, 'tv'), tv, {mode:0o755});
    await fs.writeFile(path.join(dir, 'player'), player);
    const env = {...process.env, PATH:`${bin}:${process.env.PATH}`};
    const play = (...args) => execFile('bash', [path.join(dir, 'tv'), 'play', ...args], {env});
    const playlist = async () => (await fs.readFile(path.join(run, 'playlist.m3u'), 'utf8')).trim().split('\n');
    const flags = async () => (await execFile('bash', [path.join(dir, 'player')], {env})).stdout;
    await play(manual[0]);
    assert.deepEqual(await playlist(), [manual[0]]);
    assert.doesNotMatch(await flags(), /commercials\.lua|reshuffle\.lua|--loop-playlist/);
    assert.match(await flags(), /loudness\.lua/);
    await play(manual[1], channel[1], manual[0]);
    assert.deepEqual(await playlist(), [manual[1], channel[1], manual[0]]);
    assert.doesNotMatch(await flags(), /commercials\.lua|--loop-playlist/);
    await play(path.join(media, 'on-demand'));
    assert.deepEqual(await playlist(), manual);
    await play();
    assert.deepEqual(new Set(await playlist()), new Set(channel));
    assert.match(await flags(), /commercials\.lua/);
    assert.match(await flags(), /reshuffle\.lua/);
    assert.match(await flags(), /--loop-playlist=inf/);
    await play(channel[1]);
    assert.equal((await playlist())[0], channel[1]);
    assert.deepEqual(new Set(await playlist()), new Set(channel));
    // Autostart queues Channel behind a native loader. The flag is consumed
    // once; subsequent manual playback/resumes must not replay the opening.
    await execFile('bash', [path.join(dir, 'tv'), 'autostart'], {env});
    assert.deepEqual(new Set(await playlist()), new Set(channel));
    const bootFlags = await flags();
    assert.match(bootFlags, /--pause/);
    assert.match(bootFlags, /--force-window=immediate/);
    assert.match(bootFlags, /crt-tv\/startup/);
    assert.doesNotMatch(await flags(), /crt-tv\/startup|--pause/);
    await fs.writeFile(path.join(run, 'kiosk.env'), 'manual Weather');
    await execFile('bash', [path.join(dir, 'tv'), 'autostart'], {env});
    assert.doesNotMatch(await flags(), /crt-tv\/startup/);
    await fs.rm(path.join(run, 'kiosk.env'));
    // Even a broad media-root request must not sweep in manual clips or ads.
    await fs.rm(path.join(media, '.playorder.m3u'));
    await play(media);
    assert.deepEqual(new Set(await playlist()), new Set(channel));
  } finally {
    await fs.rm(dir, {recursive:true,force:true});
  }
});
