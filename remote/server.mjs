// crt-tv web remote — zero-dependency Node server.
// Runs as user 'crt'; privileged actions go through `sudo -n tv ...`
// (see setup/sudoers-crt-tv), so the CLI and the web UI share one code path.
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.CRT_REMOTE_PORT ?? 8090);
const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR ?? '/srv/media');
const MPV_SOCK = '/run/crt-tv/mpv.sock';
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const VIDEO_EXT = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.mpg', '.mpeg', '.ts', '.webm',
]);
const TV_COMMANDS = new Set([
  'weather', 'stop', 'pause', 'next', 'prev', 'mute', 'shuffle',
  'weatherbreak', 'autobreak', 'reboot',
]);

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

// Whole-TV mute lives in the ALSA mixer (see `tv mute`)
const isMuted = () => new Promise((resolve) => {
  execFile('amixer', ['sget', 'Headphone'], (err, stdout) => {
    if (!err && /\[(on|off)\]/.test(stdout)) return resolve(stdout.includes('[off]'));
    execFile('amixer', ['sget', 'PCM'],
      (err2, stdout2) => resolve(String(stdout2 || '').includes('[off]')));
  });
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

async function status() {
  const [ws4kp, kiosk, player, autoBreak, muted] = await Promise.all([
    isActive('ws4kp.service'),
    isActive('weather-kiosk.service'),
    isActive('crt-player.service'),
    fs.access('/run/crt-tv/autobreak').then(() => true, () => false),
    isMuted(),
  ]);
  let mode = 'off';
  if (player) mode = 'video';
  else if (kiosk) mode = 'weather';

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
  return { units: { ws4kp, kiosk, player }, mode, playing, autoBreak, muted };
}

// ---- persistent library order ------------------------------------------
// .order.json holds, per directory, the explicit ordering of its children;
// anything not listed sorts alphabetically after the listed entries.
// .playorder.m3u is the flattened result — the file `tv` plays from
// (boot rotation included). Both live in MEDIA_DIR and survive reboots.
const ORDER_FILE = path.join(MEDIA_DIR, '.order.json');
const PLAYORDER_FILE = path.join(MEDIA_DIR, '.playorder.m3u');

const parentOf = (rel) => rel.split('/').slice(0, -1).join('/');

async function loadOrder() {
  try { return JSON.parse(await fs.readFile(ORDER_FILE, 'utf8')); }
  catch { return {}; }
}

async function saveOrder(order) {
  const tmp = `${ORDER_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(order, null, 1));
  await fs.rename(tmp, ORDER_FILE);
}

async function orderedChildNames(order, dirAbs, dirRel) {
  let entries;
  try { entries = await fs.readdir(dirAbs, { withFileTypes: true }); } catch {
    return { names: [], byName: new Map() };
  }
  const visible = entries.filter((e) => !e.name.startsWith('.'));
  const byName = new Map(visible.map((e) => [e.name, e]));
  const listed = (order[dirRel] ?? []).filter((n) => byName.has(n));
  const rest = visible.map((e) => e.name)
    .filter((n) => !listed.includes(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { names: [...listed, ...rest], byName };
}

async function orderedWalk(order, dirAbs, dirRel, out) {
  const { names, byName } = await orderedChildNames(order, dirAbs, dirRel);
  for (const name of names) {
    const e = byName.get(name);
    const rel = dirRel ? `${dirRel}/${name}` : name;
    if (e.isDirectory()) {
      out.push({ path: rel, dir: true });
      await orderedWalk(order, path.join(dirAbs, name), rel, out);
    } else if (VIDEO_EXT.has(path.extname(name).toLowerCase())) {
      out.push({ path: rel, dir: false });
    }
  }
}

async function listMedia() {
  const out = [];
  await orderedWalk(await loadOrder(), MEDIA_DIR, '', out);
  return out;
}

async function regeneratePlaylist() {
  const files = (await listMedia()).filter((f) => !f.dir)
    .map((f) => path.join(MEDIA_DIR, f.path));
  const tmp = `${PLAYORDER_FILE}.tmp`;
  await fs.writeFile(tmp, files.length ? `${files.join('\n')}\n` : '');
  await fs.rename(tmp, PLAYORDER_FILE);
}

// New/moved entries go to the end of their directory's explicit order
async function appendToDirOrder(dirRel, name) {
  const order = await loadOrder();
  const dirAbs = dirRel ? path.join(MEDIA_DIR, dirRel) : MEDIA_DIR;
  const { names } = await orderedChildNames(order, dirAbs, dirRel);
  order[dirRel] = [...names.filter((n) => n !== name), name];
  await saveOrder(order);
}

async function removeFromOrder(dirRel, name) {
  const order = await loadOrder();
  if (order[dirRel]) {
    order[dirRel] = order[dirRel].filter((n) => n !== name);
    await saveOrder(order);
  }
}

// Never clobber an existing file: name.ext, name-1.ext, name-2.ext, ...
async function uniqueMediaPath(dirAbs, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let candidate = name;
  for (let i = 1; ; i += 1) {
    try {
      await fs.access(path.join(dirAbs, candidate));
      candidate = `${base}-${i}${ext}`;
    } catch {
      return path.join(dirAbs, candidate);
    }
  }
}

// Raw-body upload (PUT with ?name=): streamed to a hidden .part file first so
// in-flight uploads never show up in the library, renamed into place when done.
async function handleUpload(req, res, url) {
  const name = path.basename(url.searchParams.get('name') ?? '').trim();
  const ext = path.extname(name).toLowerCase();
  if (!name || !VIDEO_EXT.has(ext)) {
    return sendJson(res, 400, {
      error: `need a video filename (${[...VIDEO_EXT].join(' ')})`,
    });
  }
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const dirRel = (url.searchParams.get('dir') ?? '').replace(/^\/+|\/+$/g, '');
  const destDir = dirRel ? resolveMedia(dirRel) : MEDIA_DIR;
  const dirStat = await fs.stat(destDir).catch(() => null);
  if (!dirStat?.isDirectory()) {
    return sendJson(res, 400, { error: `no such folder: ${dirRel}` });
  }
  const dest = await uniqueMediaPath(destDir, name);
  const tmp = path.join(MEDIA_DIR, `.upload-${process.pid}-${Date.now()}.part`);
  try {
    await pipeline(req, createWriteStream(tmp, { flags: 'wx' }));
    // Flush to the SD card before the rename makes it visible — a power cut
    // can then only ever leave a (cleaned-up) .part, never a hollow video
    const fh = await fs.open(tmp, 'r+');
    await fh.sync();
    await fh.close();
    await fs.rename(tmp, dest);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
  await appendToDirOrder(dirRel, path.basename(dest));
  await regeneratePlaylist();
  sendJson(res, 200, { ok: true, name: path.basename(dest) });
}

// The web UI only touches what lives under MEDIA_DIR (the CLI has no such
// limit), and never the hidden order/playlist/temp files.
function resolveMedia(rel) {
  if (String(rel).split('/').some((seg) => seg.startsWith('.'))) {
    throw new Error(`hidden paths not allowed: ${rel}`);
  }
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
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  try {
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else if (req.method === 'GET' && pathname === '/api/status') {
      sendJson(res, 200, await status());
    } else if (req.method === 'GET' && pathname === '/api/media') {
      sendJson(res, 200, { mediaDir: MEDIA_DIR, files: await listMedia() });
    } else if (req.method === 'GET' && pathname === '/api/doctor') {
      // Same output as `tv doctor` — read-only, for troubleshooting over the LAN
      const out = await new Promise((resolve) => {
        execFile('sudo', ['-n', '/usr/local/bin/tv', 'doctor'],
          { timeout: 30_000, maxBuffer: 1024 * 1024 },
          (err, stdout, stderr) => resolve(`${stdout}${stderr ? `\n[stderr]\n${stderr}` : ''}`));
      });
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(out);
    } else if (req.method === 'POST' && pathname.startsWith('/api/tv/')) {
      const cmd = pathname.slice('/api/tv/'.length);
      if (!TV_COMMANDS.has(cmd)) return sendJson(res, 404, { error: `unknown command: ${cmd}` });
      await tv(cmd);
      sendJson(res, 200, { ok: true });
    } else if (req.method === 'PUT' && pathname === '/api/upload') {
      await handleUpload(req, res, url);
    } else if (req.method === 'DELETE' && pathname === '/api/media') {
      const rel = url.searchParams.get('path') ?? '';
      const abs = resolveMedia(rel);
      const st = await fs.stat(abs).catch(() => null);
      if (!st) return sendJson(res, 404, { error: `not found: ${rel}` });
      if (st.isDirectory()) {
        try {
          await fs.rmdir(abs);
        } catch {
          return sendJson(res, 400, { error: 'folder not empty — move or delete its videos first' });
        }
      } else {
        await fs.rm(abs);
      }
      await removeFromOrder(parentOf(rel), path.basename(rel));
      await regeneratePlaylist();
      sendJson(res, 200, { ok: true });
    } else if (req.method === 'POST' && pathname === '/api/mkdir') {
      const { path: rel } = JSON.parse(await readBody(req) || '{}');
      if (!rel || typeof rel !== 'string' || !rel.trim()) {
        return sendJson(res, 400, { error: 'path: folder name required' });
      }
      const cleaned = rel.trim().replace(/^\/+|\/+$/g, '');
      await fs.mkdir(resolveMedia(cleaned), { recursive: true });
      await appendToDirOrder(parentOf(cleaned), path.basename(cleaned));
      await regeneratePlaylist();
      sendJson(res, 200, { ok: true });
    } else if (req.method === 'POST' && pathname === '/api/move') {
      const { from, to } = JSON.parse(await readBody(req) || '{}');
      if (!from || typeof from !== 'string') {
        return sendJson(res, 400, { error: 'from: file path required' });
      }
      const fromAbs = resolveMedia(from);
      const st = await fs.stat(fromAbs).catch(() => null);
      if (!st?.isFile()) return sendJson(res, 400, { error: 'only files can be moved' });
      const toRel = String(to ?? '').trim().replace(/^\/+|\/+$/g, '');
      const toAbs = toRel ? resolveMedia(toRel) : MEDIA_DIR;
      const toStat = await fs.stat(toAbs).catch(() => null);
      if (!toStat?.isDirectory()) return sendJson(res, 400, { error: `no such folder: ${toRel}` });
      const dest = await uniqueMediaPath(toAbs, path.basename(from));
      await fs.rename(fromAbs, dest);
      await removeFromOrder(parentOf(from), path.basename(from));
      await appendToDirOrder(toRel, path.basename(dest));
      await regeneratePlaylist();
      sendJson(res, 200, { ok: true, name: path.basename(dest) });
    } else if (req.method === 'POST' && pathname === '/api/order') {
      const { dir, names } = JSON.parse(await readBody(req) || '{}');
      const dirRel = String(dir ?? '').trim().replace(/^\/+|\/+$/g, '');
      if (!Array.isArray(names)
        || names.some((n) => typeof n !== 'string' || n.includes('/') || n.startsWith('.'))) {
        return sendJson(res, 400, { error: 'names: array of child names required' });
      }
      if (dirRel) resolveMedia(dirRel);
      const order = await loadOrder();
      order[dirRel] = names;
      await saveOrder(order);
      await regeneratePlaylist();
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

// Node kills requests after 5 minutes by default — far too short for
// multi-GB video uploads over Wi-Fi.
server.requestTimeout = 0;

// Sweep upload temp files orphaned by a crash or power cut
fs.readdir(MEDIA_DIR)
  .then((names) => Promise.all(names
    .filter((n) => n.startsWith('.upload-') && n.endsWith('.part'))
    .map((n) => fs.rm(path.join(MEDIA_DIR, n), { force: true }))))
  .catch(() => {});

// Sync the persistent play order with reality (files added/removed over
// ssh, etc.) — runs once per boot before the rotation ever plays
regeneratePlaylist().catch(() => {});

server.listen(PORT, () => {
  console.log(`crt-tv remote listening on :${PORT}, media dir ${MEDIA_DIR}`);
});
