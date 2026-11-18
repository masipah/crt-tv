// Capture mpv's live order, including reshuffles and inserted commercials.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mpvQuery } from './control.mjs';

const dir = process.argv[2] ?? '/run/crt-tv';
const state = await mpvQuery(['playlist', 'time-pos'], path.join(dir, 'mpv.sock'));
const entries = state?.playlist;
const playing = entries?.findIndex(entry => entry.playing) ?? -1;
const index = playing >= 0 ? playing : (entries?.findIndex(entry => entry.current) ?? -1);
if (index < 0 || !Number.isFinite(state['time-pos'])
    || entries.some(entry => typeof entry.filename !== 'string' || /[\r\n]/.test(entry.filename))) {
  throw new Error('The player has no current file to resume');
}

async function replace(name, contents) {
  const file = path.join(dir, name);
  const temp = file + '.' + randomUUID();
  try {
    await fs.writeFile(temp, contents, {flag: 'wx'});
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, {force: true}); }
}
await replace('playlist.m3u', entries.map(entry => entry.filename).join('\n') + '\n');
await replace('resume', `${index} ${Math.max(0, state['time-pos'])}\n`);
