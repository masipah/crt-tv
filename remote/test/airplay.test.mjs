import test from 'node:test';
import assert from 'node:assert/strict';
import { AirplayTurns } from '../airplay.mjs';

const alice = 'a'.repeat(64), bob = 'b'.repeat(64);
function fixture() {
  let time = 0;
  return { turns: new AirplayTurns({ now: () => time }), advance: (ms) => { time += ms; } };
}
const claim = (turns, token = alice, name = 'Alice') => turns.run(() => turns.claim(token, name));

test('simultaneous claims grant one turn and never expose the bearer token', async () => {
  const { turns } = fixture();
  const [a, b] = await Promise.allSettled([claim(turns), claim(turns, bob, 'Bob')]);
  assert.equal(a.status, 'fulfilled');
  assert.equal(b.reason.status, 409);
  assert.equal(turns.state(alice).mine, true);
  assert.equal(turns.state(bob).mine, false);
  assert.equal(turns.state().token, undefined);
  assert.equal(turns.state().owner, 'Alice');
  assert.equal((await claim(turns)).owner, 'Alice');
});

test('owner has web controls; other clients are blocked until release', async () => {
  const { turns } = fixture();
  await claim(turns);
  assert.doesNotThrow(() => turns.guard(alice));
  assert.throws(() => turns.guard(bob), { status: 409 });
  assert.throws(() => turns.guard(), { status: 409 });
  await turns.run(() => turns.release(alice));
  assert.doesNotThrow(() => turns.guard(bob));
});

test('only owner can renew/release; late releases cannot end a newer turn', async () => {
  const { turns, advance } = fixture();
  await claim(turns);
  advance(60_000);
  assert.throws(() => turns.heartbeat(bob), { status: 409 });
  await assert.rejects(turns.run(() => turns.release(bob)), { status: 409 });
  assert.equal((await turns.run(() => turns.heartbeat(alice))).expiresAt, 180_000);
  await turns.run(() => turns.release(alice));
  await turns.run(() => turns.release(alice));
  await claim(turns, bob, 'Bob');
  await assert.rejects(turns.run(() => turns.release(alice)), { status: 409 });
});

test('closed/disconnected tabs expire and cannot revive an old turn', async () => {
  const { turns, advance } = fixture();
  await claim(turns);
  advance(120_000);
  await turns.run(() => {});
  assert.equal(turns.state().busy, false);
  await assert.rejects(turns.run(() => turns.heartbeat(alice)), { status: 409 });
  await claim(turns, bob, 'Bob');
  assert.equal(turns.state().owner, 'Bob');
});

test('invalid input does not reserve a turn; queue survives failures', async () => {
  const { turns } = fixture();
  await assert.rejects(claim(turns, 'bad'), { status: 400 });
  for (const name of ['', ' ', 'x'.repeat(41), 'a\nb', 42]) await assert.rejects(claim(turns, alice, name), { status: 400 });
  assert.equal(turns.state().busy, false);
  assert.equal((await claim(turns, bob, '  Bob  ')).owner, 'Bob');
});
