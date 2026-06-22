// Remote control. Sends mode changes to the API and reflects live state from
// /ws so multiple controllers (and the display) stay in sync.

const statusEl = document.getElementById("status");
const modeButtons = [...document.querySelectorAll(".mode")];
const videoPanel = document.getElementById("video-panel");
const playlistEl = document.getElementById("playlist");

let current = { mode: null, video_index: 0 };

function setStatus(connected) {
  statusEl.textContent = connected ? "online" : "offline";
  statusEl.classList.toggle("on", connected);
  statusEl.classList.toggle("off", !connected);
}

function reflect(state) {
  current = state;
  for (const btn of modeButtons) {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
  }
  videoPanel.hidden = state.mode !== "video";
  if (state.mode === "video") loadPlaylist();
  markPlaying();
}

async function api(path, body) {
  const resp = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) console.error(`${path} failed: ${resp.status}`);
}

for (const btn of modeButtons) {
  btn.addEventListener("click", () => api("/api/mode", { mode: btn.dataset.mode }));
}

// ---- playlist ----
let playlistLoaded = false;

function markPlaying() {
  [...playlistEl.children].forEach((li, i) => {
    li.classList.toggle("playing", current.mode === "video" && i === current.video_index);
  });
}

async function loadPlaylist() {
  if (playlistLoaded) return markPlaying();
  try {
    const resp = await fetch("/api/playlist");
    const { videos } = await resp.json();
    playlistEl.innerHTML = "";
    if (!videos.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No videos — add files to media/";
      playlistEl.appendChild(li);
    } else {
      videos.forEach((v, i) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${v.name}</span><span class="num">${String(i + 1).padStart(2, "0")}</span>`;
        li.addEventListener("click", () => api("/api/video/index", { index: i }));
        playlistEl.appendChild(li);
      });
    }
    playlistLoaded = true;
    markPlaying();
  } catch (err) {
    console.error("playlist load failed", err);
  }
}

// ---- websocket ----
function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => setStatus(true);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "state") reflect(msg.state);
  };
  ws.onclose = () => {
    setStatus(false);
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}

connect();
