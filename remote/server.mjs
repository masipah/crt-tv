// crt-tv web remote — zero-dependency Node server.
// Runs as user 'crt'; privileged actions go through `sudo -n tv ...`
// (see setup/sudoers-crt-tv), so the CLI and the web UI share one code path.
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.CRT_REMOTE_PORT ?? 8090);
const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR ?? '/srv/media');
const MPV_SOCK = '/run/crt-tv/mpv.sock';
const KIOSK_ENV_FILES = ['/run/crt-tv/kiosk.env', '/etc/crt-tv/crt-tv.env'];
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const VIDEO_EXT = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.mpg', '.mpeg', '.ts', '.webm',
]);
const TV_COMMANDS = new Set(['weather', 'retro', 'stop', 'pause', 'next', 'prev']);

const tv = (...args) => new Promise((resolve, reject) => {
  execFile('sudo', ['-n', '/usr/local/bin/tv', ...args], { timeout: 30_000 },
    (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout);
    });
});

const isActive = (unit) => new Promise((resolve) => {
  execFile('systemctl', ['is-active', unit],
    (err, stdout) => resolve(stdout.trim() === 'active'));
});

// Ask mpv for properties over its IPC socket; null if the player isn't up.
function mpvQuery(props) {
  return new Promise((resolve) => {
    const sock = net.createConnection(MPV_SOCK);
    const out = {};
    let buf = '';
    let pending = props.length;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(value);
    };
    sock.setTimeout(1000, () => finish(out));
    sock.on('error', () => finish(null));
    sock.on('connect', () => {
      props.forEach((p, i) => {
        sock.write(`${JSON.stringify({ command: ['get_property', p], request_id: i })}\n`);
      });
    });
    sock.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.request_id === undefined) continue; // event, not a reply
        if (msg.error === 'success') out[props[msg.request_id]] = msg.data;
        if (--pending === 0) finish(out);
      }
    });
  });
}

async function kioskUrl() {
  for (const file of KIOSK_ENV_FILES) {
    try {
      const m = (await fs.readFile(file, 'utf8')).match(/^KIOSK_URL=(.+)$/m);
      if (m) return m[1].trim();
    } catch { /* next file */ }
  }
  return 'http://127.0.0.1:8080/';
}

async function status() {
  const [ws4kp, ws3kp, kiosk, player, url] = await Promise.all([
    isActive('ws4kp.service'),
    isActive('ws3kp.service'),
    isActive('weather-kiosk.service'),
    isActive('crt-player.service'),
    kioskUrl(),
  ]);
  let mode = 'off';
  if (player) mode = 'video';
  else if (kiosk) mode = url.includes(':8083') ? 'retro' : 'weather';

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
  return { units: { ws4kp, ws3kp, kiosk, player }, mode, playing };
}

async function listMedia() {
  const out = [];
  async function walk(dir, rel) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out.push({ path: relPath, dir: true });
        await walk(path.join(dir, e.name), relPath);
      } else if (VIDEO_EXT.has(path.extname(e.name).toLowerCase())) {
        out.push({ path: relPath, dir: false });
      }
    }
  }
  await walk(MEDIA_DIR, '');
  return out;
}

// The web UI only plays what lives under MEDIA_DIR (the CLI has no such limit).
function resolveMedia(rel) {
  const abs = path.resolve(MEDIA_DIR, rel);
  if (abs !== MEDIA_DIR && !abs.startsWith(MEDIA_DIR + path.sep)) {
    throw new Error(`path escapes media dir: ${rel}`);
  }
  return abs;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else if (req.method === 'GET' && pathname === '/api/status') {
      sendJson(res, 200, await status());
    } else if (req.method === 'GET' && pathname === '/api/media') {
      sendJson(res, 200, { mediaDir: MEDIA_DIR, files: await listMedia() });
    } else if (req.method === 'POST' && pathname.startsWith('/api/tv/')) {
      const cmd = pathname.slice('/api/tv/'.length);
      if (!TV_COMMANDS.has(cmd)) return sendJson(res, 404, { error: `unknown command: ${cmd}` });
      await tv(cmd);
      sendJson(res, 200, { ok: true });
    } else if (req.method === 'POST' && pathname === '/api/play') {
      const { paths } = JSON.parse(await readBody(req) || '{}');
      if (!Array.isArray(paths) || paths.length === 0) {
        return sendJson(res, 400, { error: 'paths: non-empty array required' });
      }
      await tv('play', ...paths.map(resolveMedia));
      sendJson(res, 200, { ok: true });
    } else {
      sendJson(res, 404, { error: 'not found' });
    }
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`crt-tv remote listening on :${PORT}, media dir ${MEDIA_DIR}`);
});
