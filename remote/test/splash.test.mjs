import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('browser continuation renders every original splash frame and stops cleanly', () => {
  let removed = false, rectangles = 0;
  const timers = new Map(); let id = 0;
  const canvas = { style: {}, remove: () => { removed = true; }, getContext: () => ({
    fillRect: () => { rectangles++; }, fillText: () => {},
  }) };
  const window = {}; window.top = window;
  const context = vm.createContext({ window, location: { port: '8080' },
    document: { createElement: () => canvas, documentElement: { appendChild: () => {} } },
    setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    clearTimeout: n => timers.delete(n),
  });
  for (const name of ['splash-frames.js', 'splash.js']) {
    vm.runInContext(readFileSync(new URL(`../../scripts/kiosk-ext/${name}`, import.meta.url), 'utf8'), context);
  }
  assert.ok(context.crtSplashFrames.length > 50);
  for (let i = 0; i < context.crtSplashFrames.length; i++) {
    const [key, timer] = [...timers].find(([, t]) => t.ms < 60000);
    assert.ok(timer.ms > 0);
    timers.delete(key); timer.fn();
  }
  assert.ok(rectangles > 1000);
  context.crtFinishSplash();
  assert.equal(removed, true);
  assert.equal(timers.size, 0);
});
