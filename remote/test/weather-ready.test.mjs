import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../../scripts/kiosk-ext/ready.js', import.meta.url), 'utf8');
function fixture(search = '?crtWeatherIntro=1') {
  let tick, loading = true, screen = false, playing = true, status = 202, calls = 0, cleared = false, finished = 0;
  vm.runInNewContext(script, {
    crtFinishSplash: () => { finished++; },
    location: { hostname: '127.0.0.1', port: '8080', search }, URLSearchParams, AbortSignal,
    document: { querySelector(selector) {
      if (selector === '#loading') return {};
      if (selector === '#NavigatePlay') return { title: playing ? 'Pause' : 'Play' };
      assert.equal(selector, '.weather-display.show:not(#progress-html)');
      return screen ? { getClientRects: () => [1] } : null;
    } },
    getComputedStyle: () => ({ display: loading ? 'flex' : 'none' }),
    setInterval: fn => { tick = fn; return 1; }, clearInterval: () => { cleared = true; },
    fetch: async () => { calls++; return { status }; },
  });
  return { tick: () => tick?.(), calls: () => calls, cleared: () => cleared, finished: () => finished,
    set: values => {
      loading = values.loading ?? loading; screen = values.screen ?? screen;
      playing = values.playing ?? playing; status = values.status ?? status;
    } };
}

test('loading, progress-only and paused weather do not start the intro clock', async () => {
  const f = fixture();
  await f.tick();
  f.set({ screen: true }); await f.tick();
  f.set({ loading: false, playing: false }); await f.tick();
  assert.equal(f.calls(), 0);
  assert.equal(f.finished(), 0);
  f.set({ playing: true }); await f.tick();
  assert.equal(f.calls(), 1);
  assert.equal(f.finished(), 1);
});

test('ready weather retries until the boot controller is ready, then reports once', async () => {
  const f = fixture('?crtWeatherIntro=1&crtRemotePort=8090');
  f.set({ loading: false, screen: true });
  await f.tick();
  assert.equal(f.cleared(), false);
  f.set({ status: 200 }); await f.tick();
  assert.equal(f.cleared(), true);
});

test('unconfigured kiosk does not send readiness requests', async () => {
  const f = fixture('');
  f.set({ loading: false, screen: true }); await f.tick();
  assert.equal(f.calls(), 0);
});

test('loading animation finishes even when the video intro is disabled', async () => {
  const f = fixture('');
  f.set({ loading: false, screen: true }); await f.tick();
  assert.equal(f.finished(), 1);
  assert.equal(f.cleared(), true);
  assert.equal(f.calls(), 0);
});
