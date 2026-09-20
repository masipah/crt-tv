// One website owner and one Pi-to-receiver AirPlay output at a time.
const fail = (status, message) => Object.assign(new Error(message), { status });
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

export class AirplayTurns {
  constructor({ output, now = Date.now, leaseMs = 120_000, defaultId = '' } = {}) {
    Object.assign(this, { output, now, leaseMs, defaultId });
    this.autoStopped = false;
    this.nextRetry = 0;
    this.turn = null;
    this.problem = '';
    this.waitingForReceiver = false;
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
      automatic: !!this.output?.output && !this.turn,
      defaultId: this.defaultId, autoStopped: this.autoStopped,
      waitingForReceiver: this.waitingForReceiver,
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
    if (!this.turn) {
      if (this.defaultId) {
        await this.end();
        this.autoStopped = true;
      }
      return this.state(token);
    }
    this.requireOwner(token);
    await this.end();
    this.autoStopped = true;
    return this.state(token);
  }

  async automatic(token) {
    this.guard(token);
    await this.end();
    this.autoStopped = false;
    this.nextRetry = 0;
    this.problem = '';
    await this.refresh();
    return this.state(token);
  }

  async refresh() {
    if (!this.output?.enabled) return;
    try {
      if (!this.turn && this.defaultId) {
        if (!await this.output.hasVideo()) {
          if (this.output.output) await this.end();
          this.autoStopped = false;
          this.waitingForReceiver = false;
          return;
        }
        if (!this.output.output && !this.autoStopped && this.now() >= this.nextRetry) {
          this.nextRetry = this.now() + 10_000;
          const target = (await this.output.outputs()).find(o => o.id === this.defaultId);
          this.waitingForReceiver = !target;
          if (target) {
            await this.output.connect(target.id);
            await this.output.prepareAutomatic();
            this.problem = '';
          }
        }
      }
      if (this.output.output || this.turn) await this.output.refresh();
    }
    catch (error) {
      this.problem = error.message;
      this.nextRetry = this.now() + 10_000;
      await this.end();
    }
  }

  async end() {
    if (this.output && (this.turn || this.output.output)) await this.output.disconnect();
    this.turn = null;
    this.waitingForReceiver = false;
  }
}
