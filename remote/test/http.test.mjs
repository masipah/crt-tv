import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

test('shared TV controls, local volume, kiosk readiness and Muni work without receiver ownership', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'crt-http-test-'));
  const oldPath = process.env.PATH;
  // Stub only the operating-system boundary: never run real TV commands here.
  const bin = path.join(dir, 'bin');
  await fs.mkdir(bin);
  process.env.CRT_TEST_LOG = path.join(dir, 'commands');
  for (const cmd of ['sudo', 'amixer']) {
    await fs.writeFile(path.join(bin, cmd), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CRT_TEST_LOG"\n', { mode: 0o755 });
  }
  process.env.PATH = `${bin}:${oldPath}`;
  process.env.MEDIA_DIR = dir;
  process.env.CRT_REMOTE_PORT = '0';
  const { server } = await import('../server.mjs');
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body = {}) => fetch(base + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    const controls = await Promise.all([post('/api/tv/pause'), post('/api/tv/next')]);
    assert.deepEqual(controls.map(r => r.status), [200, 200]);
    assert.equal((await post('/api/audio/volume', {volume:25})).status, 200);
    const commands = await fs.readFile(process.env.CRT_TEST_LOG, 'utf8');
    assert.match(commands, /\/usr\/local\/bin\/tv pause/);
    assert.match(commands, /\/usr\/local\/bin\/tv next/);
    assert.match(commands, /tv volume 25/);
    assert.equal((await post('/api/audio/volume', {volume:101})).status, 400);
    assert.equal((await post('/api/audio/volume', {volume:1.5})).status, 400);
    for(const asset of ['/remote.css','/remote.mjs','/display-fit.mjs'])assert.equal((await fetch(base+asset)).status,200);
    assert.equal((await post('/api/player/seek', {seconds:-1})).status, 400);
    assert.equal((await post('/api/play', {paths:[]})).status, 400);
    assert.equal((await post('/api/tv/not-a-command')).status, 404);
    // Removed sender endpoints cannot claim a lock or start a connection.
    for (const route of ['/api/airplay', '/api/airplay/outputs']) {
      assert.equal((await fetch(base + route)).status, 404);
    }
    assert.equal((await post('/api/airplay/claim')).status, 404);
    assert.equal((await post('/api/weather/started')).status, 403);
    assert.equal((await post('/api/boot/channel')).status, 404);
    assert.equal((await fetch(base + '/boot.html')).status, 404);
    assert.equal((await fetch(base + '/api/weather/started', { method: 'POST', headers: {
      Origin:'http://127.0.0.1:8080', 'X-Forwarded-For':'10.0.0.123',
    }})).status, 403);
    // The schedule includes only Channel, regardless of filenames. Moves into
    // manual Videos remove a clip; moving it back restores normal broadcast.
    for (const [bucket, name] of [['videos', 'Rez.mp4'], ['commercials', 'ad.mp4'], ['on-demand', 'manual.mp4']]) {
      const uploaded = await fetch(base + `/api/upload?dir=${bucket}&name=${name}`, {method:'PUT', body:'test video'});
      assert.equal(uploaded.status, 200);
    }
    let media = await (await fetch(base + '/api/media')).json();
    assert.deepEqual(media['on-demand'], ['manual.mp4']);
    const schedule = () => fs.readFile(path.join(dir, '.playorder.m3u'), 'utf8');
    assert.equal((await schedule()).trim(), path.join(dir, 'videos', 'Rez.mp4'));
    assert.equal((await post('/api/move', {from:'videos/Rez.mp4', to:'on-demand'})).status, 200);
    assert.equal((await schedule()).trim(), '');
    assert.equal((await post('/api/play', {paths:['on-demand/Rez.mp4']})).status, 200);
    assert.match(await fs.readFile(process.env.CRT_TEST_LOG, 'utf8'), /tv play .*on-demand\/Rez\.mp4/);
    assert.equal((await post('/api/move', {from:'on-demand/Rez.mp4', to:'videos'})).status, 200);
    assert.equal((await schedule()).trim(), path.join(dir, 'videos', 'Rez.mp4'));
    media = await (await fetch(base + '/api/media')).json();
    assert.deepEqual(media.videos, ['Rez.mp4']);
    assert.deepEqual(media.commercials, ['ad.mp4']);
    assert.deepEqual(media['on-demand'], ['manual.mp4']);
    const page = await (await fetch(base)).text();
    assert.doesNotMatch(page, /airplay|owntone|receiver|turnHeaders/i);
    assert.match(page, /btn-muni/);
    const boardPage = await fetch(base + '/muni.html');
    assert.equal(boardPage.status, 200);
    assert.equal(boardPage.headers.get('cache-control'), 'no-cache');
    const boardHtml = await boardPage.text();
    assert.match(boardHtml, /Haight and Gough/);
    assert.doesNotMatch(boardHtml, /<button|<canvas|<aside|<header|<footer/);
    const boardScript = await fetch(base + '/muni/board.mjs');
    assert.equal(boardScript.status, 200);
    assert.match(boardScript.headers.get('content-type'), /javascript/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    process.env.PATH = oldPath;
    delete process.env.CRT_TEST_LOG;
    await fs.rm(dir, {recursive:true,force:true});
  }
});
