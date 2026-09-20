import test from 'node:test';
import assert from 'node:assert/strict';
import { AirplayTurns } from '../airplay.mjs';

function fixture() {
  let time = 0, video = false, available = false, failed = false;
  const calls = [];
  const output = {
    enabled: true, output: null,
    hasVideo: async () => video,
    outputs: async () => { calls.push('discover'); return available ? [{ id: 'receiver', name: 'DMP-A8 (renamed)' }] : []; },
    connect: async id => { calls.push(id); output.output = { id }; },
    prepareAutomatic: async () => { calls.push('boot-unmute'); },
    refresh: async () => { if (failed) throw new Error('receiver off'); },
    disconnect: async () => { calls.push('disconnect'); output.output = null; },
  };
  const turns = new AirplayTurns({ output, defaultId: 'receiver', now: () => time });
  return { turns, output, calls, tick: () => turns.run(() => turns.refresh()),
    video: v => { video = v; }, available: v => { available = v; },
    fail: v => { failed = v; }, advance: ms => { time += ms; } };
}

test('weather stays local; videos reconnect when the default receiver appears, without a browser lease', async () => {
  const f = fixture();
  await f.tick();
  assert.deepEqual(f.calls, []);
  f.video(true);
  await f.tick();
  f.available(true);
  await f.tick();
  assert.equal(f.output.output, null, 'discovery is throttled');
  f.advance(10_000);
  await f.tick();
  assert.equal(f.turns.state().automatic, true);
  assert.equal(f.turns.state().busy, false);
  assert.doesNotThrow(() => f.turns.guard());
  f.advance(300_000);
  await f.tick();
  assert.equal(f.output.output.id, 'receiver');
  f.video(false);
  await f.tick();
  assert.equal(f.output.output, null);
});

test('explicit stop pauses auto routing; resume and returning to videos can re-enable it', async () => {
  const f = fixture();
  f.video(true); f.available(true);
  await f.tick();
  await f.turns.run(() => f.turns.release());
  f.advance(20_000);
  await f.tick();
  assert.equal(f.output.output, null);
  assert.equal(f.turns.state().autoStopped, true);
  await f.turns.run(() => f.turns.automatic());
  assert.equal(f.output.output.id, 'receiver');
  await f.turns.run(() => f.turns.release());
  f.video(false); await f.tick();
  f.video(true); f.advance(10_000); await f.tick();
  assert.equal(f.output.output.id, 'receiver');
});

test('receiver failure returns audio locally and retries after backoff', async () => {
  const f = fixture();
  f.video(true); f.available(true); await f.tick();
  f.fail(true); await f.tick();
  assert.equal(f.output.output, null);
  assert.equal(f.turns.state().problem, 'receiver off');
  f.fail(false); await f.tick();
  assert.equal(f.output.output, null);
  f.advance(10_000); await f.tick();
  assert.equal(f.output.output.id, 'receiver');
  assert.equal(f.turns.state().problem, '');
});

test('automatic mode cannot override a manual owner or a user mute via repeated refreshes', async () => {
  const f = fixture(), token = 'a'.repeat(64);
  f.video(true); f.available(true); await f.tick();
  await f.tick();
  assert.equal(f.calls.filter(x => x === 'boot-unmute').length, 1);
  await f.turns.run(() => f.turns.claim(token, 'Alice', 'other'));
  await assert.rejects(f.turns.run(() => f.turns.automatic('b'.repeat(64))), { status: 409 });
  await f.tick();
  assert.equal(f.output.output.id, 'other');
  assert.equal(f.turns.state(token).mine, true);
});
