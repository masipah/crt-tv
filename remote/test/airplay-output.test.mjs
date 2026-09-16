import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { AirplayOutput, videoMetadata, metadataItem, metadataPacket } from '../airplay-output.mjs';
import { AirplayTurns } from '../airplay.mjs';

function parseItems(packet) {
  return [...String(packet).matchAll(/<item><type>([a-f0-9]+)<\/type><code>([a-f0-9]+)<\/code><length>(\d+)<\/length><data encoding="base64">([^<]*)<\/data><\/item>/g)].map(m => {
    const payload = Buffer.from(m[4], 'base64');
    assert.equal(payload.length, Number(m[3]), 'metadata lengths are UTF-8 bytes');
    return { code: Buffer.from(m[2], 'hex').toString(), data: payload.toString() };
  });
}

test('video tags win; title/artist fallback splits filename, never a human turn name', () => {
  assert.deepEqual(videoMetadata({ path: '/srv/media/videos/Artist - Song.mp4' }), { title: 'Song', artist: 'Artist', album: 'CRT-TV' });
  assert.deepEqual(videoMetadata({ path: '/srv/media/videos/clip.mp4', metadata: { TITLE: 'Tagged title', ARTIST: 'Tagged artist', ALBUM: 'Album' } }), { title: 'Tagged title', artist: 'Tagged artist', album: 'Album' });
  assert.equal(videoMetadata({ path: '/video.mp4', metadata: { title: '   ' } }).title, 'video');
  assert.deepEqual(videoMetadata({ path: '/srv/media/videos/No tags.webm' }), { title: 'No tags', artist: 'CRT-TV', album: 'CRT-TV' });
});

test('OwnTone XML contains payload INSIDE each item, handles Unicode and timing', () => {
  const meta = videoMetadata({ path: '/x.mp4', metadata: { title: 'Björk & <東京>', artist: '🎵' } });
  const items = parseItems(metadataPacket(meta, { duration: 60, 'time-pos': 5 }));
  assert.equal(items.find(i => i.code === 'minm').data, 'Björk & <東京>');
  assert.equal(items.find(i => i.code === 'asar').data, '🎵');
  assert.equal(items.find(i => i.code === 'prgr').data, '1000000/1220500/3646000');
  assert.ok(metadataItem('core', 'minm', '<&>').endsWith('</data></item>\n'));
  const huge = videoMetadata({ metadata: { title: '🎵'.repeat(2000), artist: '🎵'.repeat(2000), album: '🎵'.repeat(2000) } });
  assert.ok(metadataPacket(huge, { duration: 1e6, 'time-pos': 1e6 }).length < 4096);
});

async function fixture(t) {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'crt-output-test-'));
  t.after(() => fs.rm(runtime, { recursive: true, force: true }));
  const calls = [], commands = [];
  let selected = false;
  let props = { path: '/srv/media/videos/Artist - Video.mp4', 'audio-device': 'alsa/plughw:CARD=Loopback,DEV=0,SUBDEV=0', duration: 100, 'time-pos': 10 };
  const sender = new AirplayOutput({
    enabled: true, runtime, pipe: path.join(runtime, 'metadata'),
    tv: async (...args) => { commands.push(args); },
    query: async () => props,
    fetcher: async (url, options) => {
      const route = new URL(url).pathname;
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ route, body, method: options.method });
      if (route === '/api/outputs/set') selected = body.outputs.length === 1;
      const data = route === '/api/outputs'
        ? { outputs: [{ id: '123', name: 'DMP-A8', type: 'AirPlay', selected, volume: 10 }] } : null;
      return { ok: true, text: async () => data ? JSON.stringify(data) : '' };
    },
  });
  return { sender, calls, commands, runtime, setProps: value => { props = value; } };
}

test('connect selects exactly one output at 10%, starts feed, stop tears down physical sender', async t => {
  const { sender, calls, commands, runtime } = await fixture(t);
  await sender.connect('123');
  assert.deepEqual(calls.filter(c => c.route === '/api/outputs/set').map(c => c.body), [{ outputs: [] }, { outputs: ['123'] }]);
  const volumeIndex = calls.findIndex(c => c.body?.volume === 10);
  const selectIndex = calls.findIndex(c => c.body?.outputs?.[0] === '123');
  assert.ok(volumeIndex < selectIndex);
  assert.deepEqual(commands[0], ['airplay-start']);
  assert.equal(JSON.parse(await fs.readFile(path.join(runtime, 'airplay.json'))).delay, 2);
  await sender.disconnect();
  assert.deepEqual(commands.at(-1), ['airplay-stop']);
  await assert.rejects(fs.access(path.join(runtime, 'airplay.json')));
  assert.equal(sender.output, null);
});

test('metadata retries without blocking when FIFO has no reader, then updates on next video', async t => {
  const { sender, setProps } = await fixture(t);
  await sender.connect('123');
  execFileSync('mkfifo', [sender.pipe]);
  await sender.refresh();
  assert.match(sender.metadataError, /retry/);
  assert.equal(sender.lastPacket, '');
  await fs.rm(sender.pipe);
  await fs.writeFile(sender.pipe, '');
  await sender.refresh();
  assert.equal(sender.metadataError, '');
  assert.equal(parseItems(await fs.readFile(sender.pipe)).find(i => i.code === 'minm').data, 'Video');
  setProps({ path: '/srv/media/commercials/Spot.mp4', metadata: { title: 'A new commercial' } });
  await fs.writeFile(sender.pipe, '');
  await sender.refresh();
  assert.equal(parseItems(await fs.readFile(sender.pipe)).find(i => i.code === 'minm').data, 'A new commercial');
});

test('unknown/disabled receivers do not start the feed; failed start rolls back', async t => {
  const { sender, commands } = await fixture(t);
  await assert.rejects(sender.connect('wrong'), { status: 409 });
  assert.equal(commands.length, 0);
  sender.enabled = false;
  await assert.rejects(sender.connect('123'), { status: 503 });
  sender.enabled = true;
  sender.tv = async cmd => { commands.push(cmd); if (cmd === 'airplay-start') throw new Error('no module'); };
  await assert.rejects(sender.connect('123'), /no module/);
  assert.equal(commands.at(-1), 'airplay-stop');
  assert.equal(sender.output, null);
});

test('expiry and receiver failure disconnect before another website owner can claim', async () => {
  let now = 0, stopped = 0;
  const output = { enabled: true, async connect() {}, async disconnect() { stopped++; }, async refresh() { throw new Error('receiver gone'); } };
  const turns = new AirplayTurns({ output, now: () => now });
  await turns.run(() => turns.claim('a'.repeat(64), 'Alice', '123'));
  now = 120_000;
  await turns.run(() => turns.claim('b'.repeat(64), 'Bob', '123'));
  assert.equal(stopped, 1);
  await turns.run(() => turns.refresh());
  assert.equal(stopped, 2);
  assert.equal(turns.state().busy, false);
  assert.match(turns.state().problem, /receiver gone/);
});

test('failed physical disconnect keeps the lock', async () => {
  const output = { enabled: true, async connect() {}, async disconnect() { throw new Error('cannot stop'); } };
  const turns = new AirplayTurns({ output });
  await turns.run(() => turns.claim('a'.repeat(64), 'Alice', '123'));
  await assert.rejects(turns.run(() => turns.release('a'.repeat(64))), /cannot stop/);
  await assert.rejects(turns.run(() => turns.claim('b'.repeat(64), 'Bob', '123')), { status: 409 });
});
