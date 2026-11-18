// OS and mpv boundaries shared by the web remote.
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
const MPV_SOCK = '/run/crt-tv/mpv.sock';
const tv = (...args) => new Promise((resolve, reject) => {
  execFile('tv', args, { timeout: 30_000 },
    (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else { invalidateStatus(); resolve(stdout); }
    });
});

const isActive = (unit) => new Promise((resolve) => {
  execFile('systemctl', ['is-active', unit], {timeout:2000},
    (err, stdout) => resolve(stdout.trim() === 'active'));
});

const mixerGet = () => new Promise((resolve) => {
  const attempts = [
    ['-c', 'Headphones', 'sget', 'PCM'],
    ['sget', 'Headphone'],
    ['sget', 'PCM'],
  ];
  const run = (i) => {
    if (i >= attempts.length) return resolve(null);
    execFile('amixer', ['-M', ...attempts[i]], {timeout:2000}, (err, stdout) => (err ? run(i + 1) : resolve(stdout)));
  };
  run(0);
});

const audioState = async () => {
  const out = String(await mixerGet() ?? '');
  const p = out.match(/\[(\d+)%\]/);
  return {
    muted: out.includes('[off]'),
    volume: p ? Number(p[1]) : null,
  };
};

// The TV's mute intent of record — created by tv mute (and boot), removed
// by unmute. Status reads this alongside the hardware mixer state.
const MUTED_FLAG = '/run/crt-tv/muted';

// Which page the Chromium kiosk is showing. `tv weather` and `tv scope`
// write the URL here, so the file — not the unit — is the channel of record;
// no file (fresh boot) means the unit's own default, the weather.
const KIOSK_ENV = '/run/crt-tv/kiosk.env';

const kioskPage = async () => {
  const env = await fs.readFile(KIOSK_ENV, 'utf8').catch(() => '');
  if (/oscilloscope/.test(env)) return 'scope';
  if (/muni\.html/.test(env)) return 'muni';
  if (/fit\.html/.test(env)) return 'pattern';
  return 'weather';
};

const mpvSet = async (prop, value, socketPath = MPV_SOCK) => {
  const reply = await mpvRequest(['set_property', prop, value], socketPath);
  if (reply?.error !== 'success') return false;
  invalidateStatus(); return true;
};
// A single socket keeps replies ordered against the same running player. A
// player can exit between any two replies, including before the first one.
function playerReplies(commands, socketPath) {
  return new Promise(resolve => {
    const socket = net.createConnection(socketPath);
    const replies = new Map();
    let buffer = '';
    const finish = () => {
      clearTimeout(deadline);
      socket.destroy();
      resolve(replies);
    };
    const deadline = setTimeout(finish, 1000);
    socket.setEncoding('utf8');
    socket.once('error', finish);
    socket.once('close', finish);
    socket.once('connect', () => {
      socket.write(commands.map((command, i) =>
        JSON.stringify({ command, request_id: i + 1 }) + '\n').join(''));
    });
    socket.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let reply;
        try { reply = JSON.parse(line); } catch { continue; }
        const id = reply?.request_id;
        if (!Number.isInteger(id) || id < 1 || id > commands.length) continue;
        replies.set(id, reply);
        if (replies.size === commands.length) return finish();
      }
    });
  });
}

export async function mpvRequest(command, socketPath = MPV_SOCK) {
  return (await playerReplies([command], socketPath)).get(1) ?? null;
}

export async function mpvQuery(props, socketPath = MPV_SOCK) {
  const replies = await playerReplies(props.map(p => ['get_property', p]), socketPath);
  if (!replies.size) return null;
  const values = {};
  for (const [id, reply] of replies) {
    if (reply.error === 'success') values[props[id - 1]] = reply.data;
  }
  return values;
}

async function readStatus() {
  const [ws4kp, kiosk, player, audio, shuffled, noCommercials] = await Promise.all([
    isActive('ws4kp.service'),
    isActive('weather-kiosk.service'),
    isActive('crt-player.service'),
    audioState(),
    fs.access('/run/crt-tv/shuffle').then(() => true, () => false),
    fs.access('/run/crt-tv/no-commercials').then(() => true, () => false),
  ]);
  let mode = 'off';
  if (player) mode = 'video';
  else if (kiosk) mode = await kioskPage(); // 'weather' or 'scope'

  let playing = null;
  if (player) {
    const p = await mpvQuery([
      'media-title', 'pause', 'time-pos', 'duration', 'playlist-pos-1', 'playlist-count',
    ]);
    if (p) {
      playing = {
        title: p['media-title'] ?? '',
        paused: p.pause ?? false,
        timePos: p['time-pos'] ?? null,
        duration: p.duration ?? null,
        playlistPos: p['playlist-pos-1'] ?? null,
        playlistCount: p['playlist-count'] ?? null,
      };
    }
  }
  return {
    units: { ws4kp, kiosk, player },
    mode,
    playing,
    manualPlayback: player && await fs.access('/run/crt-tv/manual-playback').then(() => true, () => false),
    muted: audio.muted
      || await fs.access(MUTED_FLAG).then(() => true, () => false),
    volume: audio.volume,
    shuffled,
    noCommercials,
  };
}


let cached, expires=0, pending, generation=0;
function invalidateStatus() { generation++; expires=0; pending=null; }
async function status() {
  if (cached && Date.now()<expires) return cached;
  if (pending) return pending;
  const version=generation;
  const request=readStatus().then(value => {
    if(version===generation){cached=value;expires=Date.now()+500;}
    return value;
  }).finally(()=>{if(pending===request)pending=null;});
  pending=request;return request;
}
export { tv, mpvSet, status };
