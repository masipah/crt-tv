const $ = (id) => document.getElementById(id);
  const err = (msg) => { $('error').textContent = msg || ''; };

  async function post(url, body) {
    err('');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
    } catch (e) {
      err(e.message);
    }
    setTimeout(refresh, 500);
  }

  const play = (path) => post('/api/play', { paths: [path] });

  const MODE_LABEL = {
    weather: 'Now showing: WeatherStar 4000+',
    scope: 'Now showing: oscilloscope',
    muni: 'Now showing: Muni departures',
    pattern: 'Now showing: fit pattern (tv pattern)',
    video: 'Now showing: videos',
    off: 'Screen off',
  };

  const fmt = (s) => {
    if (s == null) return '';
    s = Math.floor(s);
    const m = Math.floor(s / 60), h = Math.floor(m / 60);
    const pad = (n) => String(n).padStart(2, '0');
    return (h ? h + ':' + pad(m % 60) : m) + ':' + pad(s % 60);
  };

  let libraryVersion;
  async function refresh() {
    let st;
    try {
      st = await (await fetch('/api/status')).json();
    } catch {
      err('Remote unreachable — is the Pi up?');
      return;
    }
    if (libraryVersion !== st.libraryVersion) {
      try { await loadMedia(); libraryVersion = st.libraryVersion; }
      catch (e) { err(e.message); }
    }
    $('mode').textContent = st.mode === 'video'
      ? (st.manualPlayback ? 'Now showing: Videos' : 'Now showing: Channel') : MODE_LABEL[st.mode];
    $('btn-weather').classList.toggle('active', st.mode === 'weather');
    $('btn-muni').classList.toggle('active', st.mode === 'muni');
    $('btn-scope').classList.toggle('active', st.mode === 'scope');
    $('btn-video').classList.toggle('active', st.mode === 'video' && !st.manualPlayback);
    $('btn-off').classList.toggle('active', st.mode === 'off');
    for (const b of ['btn-prev', 'btn-pause', 'btn-next']) {
      $(b).disabled = st.mode !== 'video';
    }
    for (const b of ['btn-shuffle', 'btn-nocomm']) {
      $(b).disabled = st.mode !== 'video' || st.manualPlayback;
    }
    $('btn-mute').classList.toggle('on', !!st.muted);
    if (st.volume != null && Date.now() > volHold && document.activeElement !== $('vol')) {
      $('vol').value = st.volume;
    }
    $('btn-shuffle').classList.toggle('on', !!st.shuffled);
    $('btn-nocomm').classList.toggle('on', !!st.noCommercials);
    const p = st.playing;
    if (p) {
      const pos = p.playlistCount > 1 ? ` (${p.playlistPos} of ${p.playlistCount})` : '';
      const time = p.duration ? ` — ${fmt(p.timePos)} / ${fmt(p.duration)}` : '';
      $('now-title').textContent = (p.paused ? '⏸ ' : '') + p.title + pos + time;
      $('pos').style.display = p.duration ? 'block' : 'none';
      posDuration = p.duration ?? null;
      if (p.duration && Date.now() > posHold && document.activeElement !== $('pos')) {
        $('pos').value = 100 * p.timePos / p.duration;
      }
    } else {
      $('now-title').textContent = '';
      $('pos').style.display = 'none';
    }
  }

  // ---- bottom action sheet ------------------------------------------------
  function openSheet(title, actions) {
    const root = $('sheet-root');
    root.hidden = false;
    root.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const group = document.createElement('div');
    group.className = 'sheet-group';
    const t = document.createElement('div');
    t.className = 'sheet-title';
    t.textContent = title;
    group.append(t);
    for (const a of actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      if (a.danger) b.className = 'danger';
      b.onclick = () => { closeSheet(); a.fn(); };
      group.append(b);
    }
    const cancel = document.createElement('button');
    cancel.className = 'sheet-cancel';
    cancel.textContent = 'Cancel';
    cancel.onclick = closeSheet;
    sheet.append(group, cancel);
    backdrop.onclick = (e) => { if (e.target === backdrop) closeSheet(); };
    root.append(backdrop, sheet);
    requestAnimationFrame(() => root.classList.add('open'));
  }

  function closeSheet() {
    const root = $('sheet-root');
    root.classList.remove('open');
    setTimeout(() => { root.hidden = true; root.innerHTML = ''; }, 220);
  }

  // ---- volume -----------------------------------------------------------
  // Sends are throttled while dragging; refresh() leaves the slider alone
  // for a moment after any local change so polling can't fight the thumb.
  let volHold = 0;
  const sendVolume = (() => {
    let pending = false;
    const fire = async () => {
      pending = false;
      try {
        const res = await fetch('/api/audio/volume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ volume: Number($('vol').value) }),
        });
        if (!res.ok) err((await res.json()).error);
      } catch (e) { err(e.message); }
    };
    return () => {
      if (pending) return;
      pending = true;
      setTimeout(fire, 150);
    };
  })();
  $('vol').addEventListener('input', () => {
    volHold = Date.now() + 1500;
    sendVolume();
  });

  // ---- seek ---------------------------------------------------------------
  // The position bar is draggable: the seek fires on release, and refresh()
  // leaves the thumb alone while dragging (posHold, same pattern as volume).
  // posDuration is the playing video's length from the last status poll.
  let posHold = 0;
  let posDuration = null;
  $('pos').addEventListener('input', () => {
    posHold = Date.now() + 1500;
  });
  $('pos').addEventListener('change', async () => {
    posHold = Date.now() + 1500;
    if (!posDuration) return;
    post('/api/player/seek', { seconds: (Number($('pos').value) / 100) * posDuration });
  });

  // ---- library ------------------------------------------------------------
  const bucketLabels = { videos: 'Channel', commercials: 'Commercials', 'on-demand': 'Videos' };
  const buckets = Object.keys(bucketLabels);
  let lib = { videos: [], commercials: [], 'on-demand': [] };

  async function loadMedia() {
    lib = await (await fetch('/api/media')).json();
    buckets.forEach(renderBucket);
  }

  function rowActions(bucket, rel, n) {
    openSheet(n, [
      { label: 'Play now', fn: () => play(rel) },
      { label: 'Add to queue', fn: () => addToQueue(rel) },
      { label: 'Rename…', fn: () => renameFile(rel, n) },
      ...buckets.filter((b) => b !== bucket).map((b) => ({
        label: `Move to ${bucketLabels[b]}`, fn: () => libAction('/api/move', { from: rel, to: b }),
      })),
      { label: 'Delete…', danger: true, fn: () => del(rel) },
    ]);
  }

  // Desktop (wide) shows inline hover actions on rows; mobile taps a row
  // to open the action sheet instead.
  const desktopMQ = matchMedia('(min-width: 880px)');
  desktopMQ.addEventListener('change', () => {
    buckets.forEach(renderBucket);
    renderQueue();
    $('channel-hint').textContent = hintText();
  });

  const hintText = () => 'Loops in this order, one random commercial after '
    + 'every 4th video. Drag ≡ to reorder, '
    + (desktopMQ.matches ? 'hover a row for actions.' : 'tap a row for actions.');

  function inlineActions(bucket, rel, n) {
    const acts = document.createElement('span');
    acts.className = 'acts';
    const mk = (label, fn, cls) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.onclick = (e) => { e.stopPropagation(); fn(); };
      return b;
    };
    acts.append(
      mk('Play', () => play(rel)),
      mk('Queue', () => addToQueue(rel)),
      mk('Rename', () => renameFile(rel, n)),
      ...buckets.filter((b) => b !== bucket).map((b) =>
        mk('→ ' + bucketLabels[b], () => libAction('/api/move', { from: rel, to: b }))),
      mk('✕', () => del(rel), 'danger'),
    );
    return acts;
  }

  function renderBucket(bucket) {
    const names = lib[bucket] ?? [];
    $(bucket + '-empty').hidden = names.length > 0;
    const list = $(bucket + '-list');
    list.innerHTML = '';
    for (const n of names) {
      const rel = bucket + '/' + n;
      const li = document.createElement('li');
      li.dataset.name = n;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = n;
      li.append(name, inlineActions(bucket, rel, n));
      if (bucket === 'videos') {
        li.append(dragHandle(li, () => {
          const order = [...list.children].map((el) => el.dataset.name);
          if (order.join('\n') !== (lib.videos ?? []).join('\n')) {
            libAction('/api/order', { dir: 'videos', names: order });
          }
        }));
      }
      li.onclick = desktopMQ.matches ? null : () => rowActions(bucket, rel, n);
      list.append(li);
    }
  }

  async function libAction(url, body) {
    err('');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
    } catch (e) {
      err(e.message);
    }
    loadMedia();
  }

  function renameFile(rel, current) {
    const name = prompt('Rename to:', current);
    if (name === null || !name.trim() || name.trim() === current) return;
    libAction('/api/rename', { from: rel, name: name.trim() });
  }

  async function del(path) {
    if (!confirm(`Delete "${path}" from the Pi? This can't be undone.`)) return;
    err('');
    try {
      const res = await fetch('/api/media?path=' + encodeURIComponent(path), { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
    } catch (e) {
      err(e.message);
    }
    queue = queue.filter((q) => q !== path);
    renderQueue();
    loadMedia();
  }

  // ---- drag to reorder ----------------------------------------------------
  // Geometry cached at grab, transform-only movement rendered once per
  // frame, single DOM write on release, edge auto-scroll.
  function dragHandle(li, onDrop) {
    const h = document.createElement('span');
    h.className = 'drag';
    h.textContent = '≡';
    h.onclick = (e) => e.stopPropagation();
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { h.setPointerCapture(e.pointerId); } catch {}
      const list = li.parentElement;
      const rows = [...list.children];
      const from = rows.indexOf(li);
      const others = rows.filter((r) => r !== li);
      const scroll0 = window.scrollY;
      const rects = rows.map((r) => r.getBoundingClientRect());
      const top = rects.map((r) => r.top + scroll0);
      const hgt = rects.map((r) => r.height);
      const startDocY = e.clientY + scroll0;
      let clientY = e.clientY;
      let target = from;
      let active = true;

      li.classList.add('dragging');
      others.forEach((r) => r.classList.add('drag-shift'));

      const render = () => {
        const dy = clientY + window.scrollY - startDocY;
        li.style.transform = `translateY(${dy}px)`;
        const center = top[from] + hgt[from] / 2 + dy;
        let t = 0;
        rows.forEach((r, i) => {
          if (i !== from && center > top[i] + hgt[i] / 2) t += 1;
        });
        target = t;
        rows.forEach((r, i) => {
          if (i === from) return;
          const oi = i < from ? i : i - 1;
          let shift = 0;
          if (i > from && oi < t) shift = -hgt[from];
          if (i < from && oi >= t) shift = hgt[from];
          r.style.transform = shift ? `translateY(${shift}px)` : '';
        });
      };

      const tick = () => {
        if (!active) return;
        const m = 70;
        if (clientY < m) window.scrollBy(0, -Math.ceil((m - clientY) / 4));
        else if (clientY > window.innerHeight - m) {
          window.scrollBy(0, Math.ceil((clientY - (window.innerHeight - m)) / 4));
        }
        render();
        requestAnimationFrame(tick);
      };

      const move = (ev) => { clientY = ev.clientY; };
      const finish = () => {
        if (!active) return;
        active = false;
        h.removeEventListener('pointerup', finish);
        h.removeEventListener('pointercancel', finish);
        render();
        h.removeEventListener('pointermove', move);
        li.classList.remove('dragging');
        rows.forEach((r) => {
          r.classList.remove('drag-shift');
          r.style.transform = '';
        });
        if (target !== from) list.insertBefore(li, others[target] ?? null);
        onDrop();
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', finish, { once: true });
      h.addEventListener('pointercancel', finish, { once: true });
      requestAnimationFrame(tick);
    });
    return h;
  }

  // ---- queue ----------------------------------------------------------
  let queue = [];

  function renderQueue() {
    $('queue-sec').hidden = queue.length === 0;
    const list = $('queue-list');
    list.innerHTML = '';
    queue.forEach((path, i) => {
      const li = document.createElement('li');
      li.dataset.path = path;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = `${i + 1}.  ${path.split('/').pop()}`;
      const x = document.createElement('button');
      x.className = 'row-x';
      x.textContent = '✕';
      x.onclick = (e) => {
        e.stopPropagation();
        queue.splice(i, 1);
        renderQueue();
      };
      li.append(
        name,
        x,
        dragHandle(li, () => {
          queue = [...list.children].map((el) => el.dataset.path);
          renderQueue();
        }),
      );
      list.append(li);
    });
  }

  function addToQueue(path) {
    queue.push(path);
    renderQueue();
  }

  function clearQueue() {
    queue = [];
    renderQueue();
  }

  function playQueue() {
    post('/api/play', { paths: queue });
  }

  // ---- upload ---------------------------------------------------------
  let uploadBucket = 'videos';
  $('upload-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    uploadBucket = b.dataset.bucket;
    for (const btn of $('upload-seg').children) {
      btn.classList.toggle('active', btn === b);
    }
  });

  function uploadOne(file, label, bucket) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', '/api/upload?name=' + encodeURIComponent(file.name)
        + '&dir=' + encodeURIComponent(bucket));
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round(100 * ev.loaded / ev.total);
          $('upload-status').textContent = `Uploading ${label}: ${file.name} — ${pct}%`;
          $('upload-bar').value = pct;
        }
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        $('upload-status').textContent = xhr.status === 200
          ? `Uploaded ${data.name} to ${bucket}`
          : `Upload failed: ${data.error || xhr.statusText}`;
        resolve();
      };
      xhr.onerror = () => {
        $('upload-status').textContent = `Upload failed: connection lost during ${file.name}`;
        resolve();
      };
      xhr.send(file);
    });
  }

  $('file-input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    const bucket = uploadBucket;
    $('file-input').disabled = true;
    $('upload-bar').hidden = false;
    for (let i = 0; i < files.length; i += 1) {
      await uploadOne(files[i], `${i + 1} of ${files.length}`, bucket);
      await loadMedia();
    }
    $('upload-bar').hidden = true;
    $('file-input').disabled = false;
    e.target.value = '';
  });

  $('channel-hint').textContent = hintText();
  refresh();
  setInterval(()=>{if(!document.hidden)refresh();}, 3000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
