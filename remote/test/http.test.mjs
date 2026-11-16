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
  const hatStatusFile = path.join(dir, 'hat-status.json');
  const hatSelectionFile = path.join(dir, 'hat-selection.json');
  const mouthStatusFile = path.join(dir, 'mouth-status.json');
  const mouthSelectionFile = path.join(dir, 'mouth-selection.json');
  const brightnessStatusFile = path.join(dir, 'brightness-status.json');
  const eyeBrightnessFile = path.join(dir, 'eye-brightness.json');
  const mouthBrightnessFile = path.join(dir, 'mouth-brightness.json');
  process.env.CRT_HAT_EYE_STATUS_FILE = hatStatusFile;
  process.env.CRT_HAT_EYE_SELECTION_FILE = hatSelectionFile;
  process.env.CRT_HAT_MOUTH_STATUS_FILE = mouthStatusFile;
  process.env.CRT_HAT_MOUTH_SELECTION_FILE = mouthSelectionFile;
  process.env.CRT_HAT_BRIGHTNESS_STATUS_FILE = brightnessStatusFile;
  process.env.CRT_HAT_EYE_BRIGHTNESS_FILE = eyeBrightnessFile;
  process.env.CRT_HAT_MOUTH_BRIGHTNESS_FILE = mouthBrightnessFile;
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
    const hatEyes = async () => (await (await fetch(base + '/api/status')).json()).hatEyes;
    assert.equal(await hatEyes(), null);
    assert.equal((await post('/api/hat/eye-style', { style: 'Original' })).status, 409);
    const hatState = { current: 'Star pupils', styles: ['Original', 'Winged liner', 'Spirals', 'Star pupils'] };
    await fs.writeFile(hatStatusFile, JSON.stringify(hatState));
    assert.deepEqual(await hatEyes(), { ...hatState, selection: 'auto' });
    assert.equal((await post('/api/hat/eye-style', { style: 'Unknown' })).status, 400);
    assert.equal((await post('/api/hat/eye-style', { style: 'Winged liner' })).status, 200);
    assert.equal(JSON.parse(await fs.readFile(hatSelectionFile, 'utf8')), 'Winged liner');
    assert.deepEqual(await hatEyes(), { ...hatState, selection: 'Winged liner' });
    await fs.writeFile(hatStatusFile, JSON.stringify({
      ...hatState, selection: 'auto', requestId: null, switchAt: 600,
    }));
    assert.equal((await post('/api/hat/eye-style', { style: 'Spirals' })).status, 200);
    const firstEyeRequest = JSON.parse(await fs.readFile(hatSelectionFile, 'utf8'));
    assert.equal(firstEyeRequest.style, 'Spirals');
    assert.deepEqual(await hatEyes(), { ...hatState, selection: 'Spirals' });
    // The HAT has rotated. Reading the old request must not select it again.
    await fs.writeFile(hatStatusFile, JSON.stringify({
      ...hatState, selection: 'auto', requestId: firstEyeRequest.id, switchAt: 1200,
    }));
    assert.deepEqual(await hatEyes(), { ...hatState, selection: 'auto' });
    assert.equal((await post('/api/hat/eye-style', { style: 'Spirals' })).status, 200);
    const secondEyeRequest = JSON.parse(await fs.readFile(hatSelectionFile, 'utf8'));
    assert.notEqual(secondEyeRequest.id, firstEyeRequest.id);
    assert.deepEqual(await hatEyes(), { ...hatState, selection: 'Spirals' });
    assert.equal((await post('/api/hat/eye-style', { style: 'auto' })).status, 200);
    assert.deepEqual(await hatEyes(), { ...hatState, selection: 'auto' });
    const hatMouth = async () => (await (await fetch(base + '/api/status')).json()).hatMouth;
    assert.equal(await hatMouth(), null);
    assert.equal((await post('/api/hat/mouth-mode', { mode: 'idle' })).status, 409);
    await fs.writeFile(mouthStatusFile, 'true');
    assert.deepEqual(await hatMouth(), { mode: 'random' });
    for (const mode of ['more-licking', 'more-talking', 'less-idle', 'idle', 'random']) {
      assert.equal((await post('/api/hat/mouth-mode', { mode })).status, 200);
      assert.equal(JSON.parse(await fs.readFile(mouthSelectionFile, 'utf8')), mode);
      assert.deepEqual(await hatMouth(), { mode });
    }
    assert.equal((await post('/api/hat/mouth-mode', { mode: 'unknown' })).status, 400);
    assert.deepEqual(await hatMouth(), { mode: 'random' });
    await fs.writeFile(mouthStatusFile, 'false');
    assert.equal(await hatMouth(), null);
    const hatBrightness = async () => (await (await fetch(base + '/api/status')).json()).hatBrightness;
    const setBrightness = (screen, brightness) => post('/api/hat/brightness', { screen, brightness });
    assert.equal(await hatBrightness(), null);
    assert.equal((await setBrightness('eyes', 30)).status, 409);
    await fs.writeFile(brightnessStatusFile, JSON.stringify({ mouth: 100 }));
    assert.deepEqual(await hatBrightness(), { eyes: null, mouth: 100 });
    assert.equal((await setBrightness('eyes', 30)).status, 409);
    // Backlight control remains available during original-loop playback.
    assert.equal((await setBrightness('mouth', 29)).status, 200);
    await fs.writeFile(brightnessStatusFile, JSON.stringify({ eyes: 41, mouth: 100 }));
    assert.equal((await setBrightness('eyes', 30)).status, 200);
    assert.equal(JSON.parse(await fs.readFile(eyeBrightnessFile, 'utf8')), 30);
    assert.equal(JSON.parse(await fs.readFile(mouthBrightnessFile, 'utf8')), 29);
    assert.deepEqual(await hatBrightness(), { eyes: 41, mouth: 100 });
    for (const invalid of [0, 101, 25.5, '30', true]) {
      assert.equal((await setBrightness('eyes', invalid)).status, 400);
    }
    assert.equal((await setBrightness('crt', 30)).status, 400);
    await fs.writeFile(brightnessStatusFile, JSON.stringify({ eyes: 30, mouth: 29 }));
    assert.deepEqual(await hatBrightness(), { eyes: 30, mouth: 29 });
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
    delete process.env.CRT_HAT_EYE_STATUS_FILE;
    delete process.env.CRT_HAT_EYE_SELECTION_FILE;
    delete process.env.CRT_HAT_MOUTH_STATUS_FILE;
    delete process.env.CRT_HAT_MOUTH_SELECTION_FILE;
    delete process.env.CRT_HAT_BRIGHTNESS_STATUS_FILE;
    delete process.env.CRT_HAT_EYE_BRIGHTNESS_FILE;
    delete process.env.CRT_HAT_MOUTH_BRIGHTNESS_FILE;
    await fs.rm(dir, {recursive:true,force:true});
  }
});
