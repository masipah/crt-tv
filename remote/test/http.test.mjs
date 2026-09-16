import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

test('HTTP turn handoff enforces all web control routes with independent clients', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'crt-http-test-'));
  process.env.MEDIA_DIR = dir;
  process.env.CRT_REMOTE_PORT = '0';
  const { server, airplay } = await import('../server.mjs');
  // Exercise the real HTTP router with a deterministic physical-output adapter.
  airplay.output = { enabled: true, output: null,
    async connect() { this.output = { id: '123', name: 'Eversolo DMP-A8' }; },
    async disconnect() { this.output = null; }, async refresh() {},
  };
  if (!server.listening) await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const a = 'a'.repeat(64), b = 'b'.repeat(64);
  const request = (route, token, body) => fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Airplay-Token': token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    const claims = await Promise.all([request('/api/airplay/claim', a, { name: 'Alice' }), request('/api/airplay/claim', b, { name: 'Bob' })]);
    assert.deepEqual(claims.map(r => r.status).sort(), [200, 409]);
    const owner = claims[0].status === 200 ? a : b;
    const other = owner === a ? b : a;
    const state = await request('/api/airplay', other);
    assert.equal(state.headers.get('cache-control'), 'no-store');
    const publicState = await state.json();
    assert.equal(publicState.mine, false);
    assert.equal(publicState.token, undefined);
    for (const route of ['/api/play', '/api/tv/weather', '/api/tv/scope', '/api/tv/stop', '/api/tv/reboot', '/api/tv/mute', '/api/tv/pause', '/api/tv/next', '/api/tv/prev', '/api/tv/shuffle', '/api/tv/commercials', '/api/player/seek', '/api/audio/volume']) {
      const r = await request(route, other, {});
      assert.equal(r.status, 409, route);
    }
    assert.equal((await request('/api/airplay/release', other, {})).status, 409);
    assert.equal((await request('/api/airplay/heartbeat', other, {})).status, 409);
    assert.equal((await request('/api/airplay/heartbeat', owner, {})).status, 200);
    assert.equal((await request('/api/airplay/release', owner, {})).status, 200);
    assert.equal((await request('/api/airplay/claim', other, { name: 'Next' })).status, 200);
    assert.equal((await request('/api/airplay/release', owner, {})).status, 409);
    const invalid = await fetch(base + '/api/airplay/claim', { method: 'POST', body: '{' });
    assert.equal(invalid.status, 400);
    const page = await (await fetch(base)).text();
    assert.match(page, /Eversolo DMP-A8/);
    assert.match(page, /The Pi sends the video’s audio and title, artist and album/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
