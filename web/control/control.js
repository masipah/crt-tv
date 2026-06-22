// crt-tv control page. Picks the channel (weather/teletext/video), the weather
// "Selected displays" + settings (ws4kp-style), manages the video library, and
// shows Headend Information. Live state arrives over /ws.

const statusEl = document.getElementById("status");
const nowModeEl = document.getElementById("now-mode");
const modeButtons = [...document.querySelectorAll(".mode")];

const wxLocation = document.getElementById("wx-location");
const wxLocSet = document.getElementById("wx-loc-set");
const wxUnits = document.getElementById("wx-units");
const wxSpeed = document.getElementById("wx-speed");
const wxMusic = document.getElementById("wx-music");
const wxVol = document.getElementById("wx-vol");
const wxStatus = document.getElementById("wx-status");
const wxScreens = document.getElementById("wx-screens");

const dropEl = document.getElementById("drop");
const fileInput = document.getElementById("file-input");
const uploadsEl = document.getElementById("uploads");
const playlistEl = document.getElementById("playlist");
const headendEl = document.getElementById("headend");

let current = { mode: null, video_index: 0 };

async function post(path, body) {
  const resp = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) console.error(`${path} -> ${resp.status}`);
  return resp;
}

function setStatus(connected) {
  statusEl.textContent = connected ? "online" : "offline";
  statusEl.classList.toggle("on", connected);
  statusEl.classList.toggle("off", !connected);
}

// ---- channel (mode) ----
function reflect(state) {
  current = state;
  for (const btn of modeButtons) btn.classList.toggle("active", btn.dataset.mode === state.mode);
  nowModeEl.textContent = state.mode || "—";
  markPlaying();
}
for (const btn of modeButtons) {
  btn.addEventListener("click", () => post("/api/mode", { mode: btn.dataset.mode }));
}

// ---- weather location + units ----
async function setLocation() {
  const location = wxLocation.value.trim();
  if (!location) return;
  wxStatus.className = "wx-status";
  wxStatus.textContent = "Saving…";
  try {
    const resp = await post("/api/weather/location", { location, units: wxUnits.value });
    const data = await resp.json();
    if (resp.ok) {
      wxStatus.className = "wx-status ok";
      wxStatus.textContent = `Saved: ${data.location}`;
      loadHeadend();
    } else {
      wxStatus.className = "wx-status err";
      wxStatus.textContent = data.detail || "Could not find that location.";
    }
  } catch (err) {
    wxStatus.className = "wx-status err";
    wxStatus.textContent = "Save failed.";
  }
}
wxLocSet.addEventListener("click", setLocation);
wxLocation.addEventListener("keydown", (e) => { if (e.key === "Enter") setLocation(); });
wxUnits.addEventListener("change", setLocation);

async function loadWeatherSettings() {
  try {
    const s = await (await fetch("/api/weather/settings")).json();
    wxLocation.value = s.location || "";
    wxUnits.value = s.units === "metric" ? "metric" : "imperial";
  } catch (err) {
    console.error("weather settings load failed", err);
  }
}

// ---- Selected displays + speed + music ----
function renderOptions(opts) {
  wxScreens.innerHTML = "";
  for (const s of opts.screens) {
    const label = document.createElement("label");
    label.className = "ck" + (s.available ? "" : " unavailable");
    label.innerHTML = `<input type="checkbox" data-key="${s.key}" ${s.enabled ? "checked" : ""} ${s.available ? "" : "disabled"}> ${s.label}`;
    if (s.available) label.querySelector("input").addEventListener("change", saveOptions);
    wxScreens.appendChild(label);
  }
  wxSpeed.value = opts.speed || "normal";
  wxMusic.checked = !!opts.music;
  wxVol.value = Math.round((opts.music_volume ?? 0.7) * 100);
}

async function saveOptions() {
  const screens = [...wxScreens.querySelectorAll("input[data-key]:not(:disabled)")]
    .filter((c) => c.checked)
    .map((c) => c.dataset.key);
  const body = {
    screens,
    speed: wxSpeed.value,
    music: wxMusic.checked,
    music_volume: Number(wxVol.value) / 100,
  };
  try {
    const resp = await post("/api/weather/options", body);
    if (resp.ok) renderOptions(await resp.json());
    loadHeadend();
  } catch (err) {
    console.error("save options failed", err);
  }
}
wxSpeed.addEventListener("change", saveOptions);
wxMusic.addEventListener("change", saveOptions);
wxVol.addEventListener("change", saveOptions);

async function loadOptions() {
  try {
    renderOptions(await (await fetch("/api/weather/options")).json());
  } catch (err) {
    console.error("options load failed", err);
  }
}

// ---- Headend Information ----
function hrow(k, v) {
  return `<span class="k">${k}</span><span class="v">${v}</span>`;
}
async function loadHeadend() {
  try {
    const resp = await fetch("/api/weather");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const w = await resp.json();
    const h = w.headend || {};
    headendEl.innerHTML =
      hrow("Location:", w.location || "—") +
      hrow("Coordinates:", h.latitude != null ? `${h.latitude}, ${h.longitude}` : "—") +
      hrow("Timezone:", h.timezone || "—") +
      hrow("Data source:", h.source || "Open-Meteo") +
      hrow("Music:", wxMusic.checked ? "On" : "Off") +
      hrow("crt-tv version:", h.version || "—");
  } catch (err) {
    headendEl.innerHTML = hrow("Status:", "weather unavailable");
  }
}

// ---- video library ----
function markPlaying() {
  [...playlistEl.querySelectorAll("li[data-index]")].forEach((li) => {
    const i = Number(li.dataset.index);
    const playing = current.mode === "video" && i === current.video_index;
    li.classList.toggle("playing", playing);
    const tag = li.querySelector(".playing-tag");
    if (tag) tag.hidden = !playing;
  });
}
async function playVideo(index) {
  await post("/api/video/index", { index });
  if (current.mode !== "video") await post("/api/mode", { mode: "video" });
}
async function deleteVideo(file) {
  if (!confirm(`Delete "${file}"?`)) return;
  const resp = await fetch(`/api/video/${encodeURIComponent(file)}`, { method: "DELETE" });
  if (resp.ok) renderLibrary((await resp.json()).videos);
}
function renderLibrary(videos) {
  playlistEl.innerHTML = "";
  if (!videos.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No videos yet — upload some above.";
    playlistEl.appendChild(li);
    return;
  }
  videos.forEach((v, i) => {
    const li = document.createElement("li");
    li.dataset.index = i;
    li.dataset.file = v.file;
    li.draggable = true;
    li.innerHTML = `
      <span class="handle" title="Drag to reorder">⠿</span>
      <span class="vname">${v.name}</span>
      <span class="playing-tag" hidden>on air</span>
      <button class="play">Play</button>
      <button class="del">Delete</button>`;
    li.querySelector(".play").addEventListener("click", () => playVideo(i));
    li.querySelector(".del").addEventListener("click", () => deleteVideo(v.file));
    li.addEventListener("dragstart", (e) => {
      if (e.target.tagName === "BUTTON") return e.preventDefault();
      dragEl = li;
      li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      persistOrder();
    });
    playlistEl.appendChild(li);
  });
  markPlaying();
}
let dragEl = null;
function afterElement(y) {
  const items = [...playlistEl.querySelectorAll("li[data-file]:not(.dragging)")];
  return items.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      return offset < 0 && offset > closest.offset ? { offset, el: child } : closest;
    },
    { offset: -Infinity, el: null }
  ).el;
}
playlistEl.addEventListener("dragover", (e) => {
  if (!dragEl) return;
  e.preventDefault();
  const after = afterElement(e.clientY);
  if (after == null) playlistEl.appendChild(dragEl);
  else playlistEl.insertBefore(dragEl, after);
});
async function persistOrder() {
  const order = [...playlistEl.querySelectorAll("li[data-file]")].map((li) => li.dataset.file);
  const resp = await post("/api/playlist/order", { order });
  if (resp.ok) renderLibrary((await resp.json()).videos);
}
async function loadLibrary() {
  try {
    renderLibrary((await (await fetch("/api/playlist")).json()).videos);
  } catch (err) {
    console.error("library load failed", err);
  }
}

// ---- uploads ----
function uploadOne(file) {
  const li = document.createElement("li");
  li.innerHTML = `<div class="name"><span>${file.name}</span><span class="pct">0%</span></div><div class="bar"><span></span></div>`;
  uploadsEl.appendChild(li);
  const pct = li.querySelector(".pct");
  const bar = li.querySelector(".bar > span");
  const form = new FormData();
  form.append("files", file);
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/upload");
  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const p = Math.round((e.loaded / e.total) * 100);
    pct.textContent = `${p}%`;
    bar.style.width = `${p}%`;
  };
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      const data = JSON.parse(xhr.responseText);
      pct.textContent = data.saved.length ? "done" : "rejected";
      if (!data.saved.length) li.classList.add("error");
      renderLibrary(data.videos);
      setTimeout(() => li.remove(), 1500);
    } else {
      li.classList.add("error");
      pct.textContent = "failed";
    }
  };
  xhr.onerror = () => { li.classList.add("error"); pct.textContent = "failed"; };
  xhr.send(form);
}
function handleFiles(list) { for (const f of list) uploadOne(f); }
fileInput.addEventListener("change", () => { handleFiles(fileInput.files); fileInput.value = ""; });
["dragenter", "dragover"].forEach((evt) =>
  dropEl.addEventListener(evt, (e) => { e.preventDefault(); dropEl.classList.add("dragover"); }));
["dragleave", "drop"].forEach((evt) =>
  dropEl.addEventListener(evt, (e) => { e.preventDefault(); dropEl.classList.remove("dragover"); }));
dropEl.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });

// ---- websocket ----
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => setStatus(true);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "state") reflect(msg.state);
    else if (msg.type === "playlist") loadLibrary();
    else if (msg.type === "weather") { loadWeatherSettings(); loadOptions(); loadHeadend(); }
  };
  ws.onclose = () => { setStatus(false); setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();
}

loadWeatherSettings();
loadOptions();
loadHeadend();
loadLibrary();
connect();
