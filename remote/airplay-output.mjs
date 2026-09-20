// Pi video -> ALSA loopback -> OwnTone PCM/metadata pipes -> one AirPlay receiver.
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';

const failure = (message, status = 503) => Object.assign(new Error(message), { status });
export const LOOPBACK_DEVICE = 'alsa/plughw:CARD=Loopback,DEV=0,SUBDEV=0';

export function videoMetadata(props = {}) {
  const tags = Object.fromEntries(Object.entries(props.metadata || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  for (const [key, value] of Object.entries(tags)) {
    tags[key] = value.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  }
  const filename = path.basename(props.path || props['media-title'] || 'Video').replace(/\.[^.]+$/, '');
  const split = filename.match(/^(.*?)\s+-\s+(.+)$/);
  const clean = (value) => Array.from(value.replace(/[\x00-\x1f\x7f]/g, ' ').trim()).slice(0, 120).join('');
  return {
    title: clean(tags.title || split?.[2] || filename),
    artist: clean(tags.artist || tags.album_artist || split?.[1] || 'CRT-TV'),
    album: clean(tags.album || 'CRT-TV'),
  };
}

export function metadataItem(type, code, value = '') {
  const data = Buffer.from(value, 'utf8');
  // OwnTone reads item/data: closing </item> before <data> silently drops tags.
  return `<item><type>${Buffer.from(type).toString('hex')}</type><code>${Buffer.from(code).toString('hex')}</code><length>${data.length}</length><data encoding="base64">${data.toString('base64')}</data></item>\n`;
}
export function metadataPacket(meta, props = {}) {
  let text = metadataItem('ssnc', 'mdst')
    + metadataItem('core', 'minm', meta.title)
    + metadataItem('core', 'asar', meta.artist)
    + metadataItem('core', 'asal', meta.album)
    + metadataItem('ssnc', 'mden');
  if (Number.isFinite(props.duration) && props.duration > 0 && Number.isFinite(props['time-pos'])) {
    const start = 1_000_000;
    const pos = start + Math.round(Math.max(0, props['time-pos']) * 44100);
    const end = start + Math.round(props.duration * 44100);
    text += metadataItem('ssnc', 'prgr', `${start}/${pos}/${end}`);
  }
  return Buffer.from(text);
}

export class AirplayOutput {
  constructor({ enabled = false, tv, query, fetcher = fetch, runtime = '/run/crt-tv', pipe = '/srv/owntone-pipe/CRT-TV.metadata', delayMs = 2000 } = {}) {
    Object.assign(this, { enabled, tv, query, fetcher, runtime, pipe });
    this.delayMs = Number.isFinite(delayMs) ? Math.max(0, Math.min(5000, delayMs)) : 2000;
    this.output = null;
    this.metadata = null;
    this.metadataError = '';
    this.lastPacket = '';
  }
  async api(route, method = 'GET', body) {
    try {
      const response = await this.fetcher(`http://127.0.0.1:3689${route}`, {
        method, headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch { throw failure('OwnTone is unavailable or rejected the request. Check AirPlay setup on the Pi.'); }
  }
  async outputs() {
    if (!this.enabled) return [];
    const { outputs = [] } = await this.api('/api/outputs');
    return outputs.filter(o => /airplay/i.test(o.type)).map(o => ({
      id: String(o.id), name: o.name, selected: !!o.selected,
      needsAuth: !!(o.requires_auth || o.needs_auth_key || o.has_password),
    }));
  }
  async hasVideo() {
    return !!(await this.query(['path']))?.path;
  }
  async prepareAutomatic() {
    await this.tv('airplay-auto-unmute');
  }
  async connect(id) {
    if (!this.enabled) throw failure('Enable AIRPLAY_ENABLED=1 and run the installer on the Pi.');
    const target = (await this.outputs()).find(o => o.id === id);
    if (!target) throw failure('Receiver is no longer available. Refresh the receiver list.', 409);
    if (target.needsAuth) throw failure('This receiver requires pairing/password setup in OwnTone first.', 409);
    try {
      // Reset the previous stream and never select more than one output.
      await this.api('/api/player/stop', 'PUT');
      await this.api('/api/outputs/set', 'PUT', { outputs: [] });
      await this.api(`/api/outputs/${encodeURIComponent(id)}`, 'PUT', { volume: 10 });
      await this.api('/api/outputs/set', 'PUT', { outputs: [id] });
      await this.tv('airplay-start');
      await fs.writeFile(path.join(this.runtime, 'airplay.json.tmp'), JSON.stringify({ delay: this.delayMs / 1000 }));
      await fs.rename(path.join(this.runtime, 'airplay.json.tmp'), path.join(this.runtime, 'airplay.json'));
      this.output = { ...target, selected: true, volume: 10 };
      this.lastPacket = '';
    } catch (error) {
      await this.disconnect();
      throw error;
    }
    return target;
  }
  async disconnect() {
    // Stop the physical feed before clearing ownership. Errors retain the lock.
    await this.tv('airplay-stop');
    await fs.rm(path.join(this.runtime, 'airplay.json'), { force: true });
    // The helper also stops OwnTone, so this is best-effort cleanup of selection.
    this.output = null;
    this.metadata = null;
    this.metadataError = '';
    this.lastPacket = '';
  }
  async volume(value) {
    if (!this.output) throw failure('No AirPlay output selected.', 409);
    await this.api(`/api/player/volume?volume=${value}&output_id=${encodeURIComponent(this.output.id)}`, 'PUT');
  }
  async refresh() {
    if (!this.output) return;
    await this.tv('airplay-check');
    const { outputs = [] } = await this.api('/api/outputs');
    const output = outputs.find(o => String(o.id) === this.output.id);
    if (!output?.selected) throw failure('The AirPlay receiver disconnected.');
    this.output.volume = output.volume;
    const props = await this.query(['metadata', 'path', 'media-title', 'duration', 'time-pos', 'pause', 'audio-device']);
    const meta = props?.path ? videoMetadata(props) : { title: 'No video playing', artist: 'CRT-TV', album: 'CRT-TV' };
    this.metadata = meta;
    this.output.routing = props?.['audio-device'] === LOOPBACK_DEVICE;
    const packet = metadataPacket(meta, props || {});
    const key = `${JSON.stringify(meta)}:${Math.floor((props?.['time-pos'] || 0) / 10)}`;
    if (key === this.lastPacket) return;
    let handle;
    try {
      // Smaller than Linux PIPE_BUF, so each UTF-8/base64 batch is atomic.
      if (packet.length > 4096) throw new Error('metadata packet too large');
      handle = await fs.open(this.pipe, constants.O_WRONLY | constants.O_NONBLOCK);
      const { bytesWritten } = await handle.write(packet);
      if (bytesWritten !== packet.length) throw new Error('incomplete metadata write');
      this.lastPacket = key;
      this.metadataError = '';
    } catch {
      this.metadataError = 'Waiting for the metadata reader. Titles will retry automatically.';
    } finally { await handle?.close(); }
  }
}
