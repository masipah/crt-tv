// One website owner and one Pi-to-receiver AirPlay output at a time.
const fail = (status, message) => Object.assign(new Error(message), { status });
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

export class AirplayTurns {
  constructor({ output, now = Date.now, leaseMs = 120_000 } = {}) {
    Object.assign(this, { output, now, leaseMs });
    this.turn = null;
    this.problem = '';
    this.chain = Promise.resolve();
  }

  // Turn mutations and TV playback requests share one queue to prevent races.
  run(action) {
    const result = this.chain.then(async () => {
      if (this.turn && this.now() >= this.turn.expiresAt) await this.end();
      return action();
    });
    this.chain = result.catch(() => {});
    return result;
  }

  state(token) {
    const mine = !!this.turn && this.turn.token === token;
    return {
      enabled: !!this.output?.enabled, busy: !!this.turn, mine, problem: this.problem,
      output: this.output?.output || null, metadata: this.output?.metadata || null,
      metadataError: this.output?.metadataError || null,
      owner: this.turn?.name ?? null, expiresAt: this.turn?.expiresAt ?? null,
      leaseSeconds: this.leaseMs / 1000,
    };
  }

  async claim(token, name, id) {
    if (!validToken(token)) throw fail(400, 'A browser turn token is required. Reload this page.');
    if (this.turn) {
      if (this.turn.token !== token) throw fail(409, `${this.turn.name} has the AirPlay turn. Wait for them to release.`);
      return this.heartbeat(token);
    }
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 40 || /[\x00-\x1f\x7f]/.test(name)) {
      throw fail(400, 'Enter your name (1–40 characters).');
    }
    if (this.output) await this.output.connect(id);
    this.problem = '';
    this.turn = { token, name: name.trim(), expiresAt: this.now() + this.leaseMs };
    return this.state(token);
  }

  heartbeat(token) {
    this.requireOwner(token);
    this.turn.expiresAt = this.now() + this.leaseMs;
    return this.state(token);
  }

  requireOwner(token) {
    if (!this.turn || this.turn.token !== token) throw fail(409, 'This browser does not own the AirPlay turn.');
  }

  guard(token) {
    if (!this.turn) return;
    if (this.turn.token === token) return;
    throw fail(409, `${this.turn.name} has the AirPlay turn. TV controls are reserved until they release it.`);
  }

  async release(token) {
    if (!this.turn) return this.state(token); // safe to retry a lost response
    this.requireOwner(token);
    await this.end();
    return this.state(token);
  }

  async refresh() {
    if (!this.turn || !this.output) return;
    try { await this.output.refresh(); }
    catch (error) {
      this.problem = error.message;
      await this.end();
    }
  }

  async end() {
    if (this.output && (this.turn || this.output.output)) await this.output.disconnect();
    this.turn = null;
  }
}
