// crt-tv control dashboard.
//
// Runs on any browser on your LAN. Picks what the CRT shows (teletext / weather
// / video), manages the video library, and uploads new clips to the Pi. Live
// state arrives over /ws so the picker and "now showing" stay accurate.

const statusEl = document.getElementById("status");
const nowModeEl = document.getElementById("now-mode");
const modeButtons = [...document.querySelectorAll(".mode")];
const dropEl = document.getElementById("drop");
const fileInput = document.getElementById("file-input");
const uploadsEl = document.getElementById("uploads");
const playlistEl = document.getElementById("playlist");

let current = { mode: null, video_index: 0 };

// ----------------------------------------------------------------- helpers
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

// ----------------------------------------------------------------- mode picker
function reflect(state) {
  current = state;
  for (const btn of modeButtons) {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
  }
  nowModeEl.textContent = state.mode || "—";
  markPlaying();
}

for (const btn of modeButtons) {
  btn.addEventListener("click", () => post("/api/mode", { mode: btn.dataset.mode }));
}

// ----------------------------------------------------------------- library
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
  else console.error("delete failed", resp.status);
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
    li.innerHTML = `
      <span class="vname">${v.name}</span>
      <span class="playing-tag" hidden>on air</span>
      <button class="play">Play</button>
      <button class="del">Delete</button>`;
    li.querySelector(".play").addEventListener("click", () => playVideo(i));
    li.querySelector(".del").addEventListener("click", () => deleteVideo(v.file));
    playlistEl.appendChild(li);
  });
  markPlaying();
}

async function loadLibrary() {
  try {
    const resp = await fetch("/api/playlist");
    renderLibrary((await resp.json()).videos);
  } catch (err) {
    console.error("library load failed", err);
  }
}

// ----------------------------------------------------------------- uploads
function uploadOne(file) {
  const li = document.createElement("li");
  li.innerHTML = `
    <div class="name"><span>${file.name}</span><span class="pct">0%</span></div>
    <div class="bar"><span></span></div>`;
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
  xhr.onerror = () => {
    li.classList.add("error");
    pct.textContent = "failed";
  };
  xhr.send(form);
}

function handleFiles(fileList) {
  for (const f of fileList) uploadOne(f);
}

fileInput.addEventListener("change", () => {
  handleFiles(fileInput.files);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((evt) =>
  dropEl.addEventListener(evt, (e) => {
    e.preventDefault();
    dropEl.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropEl.addEventListener(evt, (e) => {
    e.preventDefault();
    dropEl.classList.remove("dragover");
  })
);
dropEl.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
});

// ----------------------------------------------------------------- websocket
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => setStatus(true);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "state") reflect(msg.state);
    else if (msg.type === "playlist") loadLibrary();
  };
  ws.onclose = () => {
    setStatus(false);
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}

loadLibrary();
connect();
