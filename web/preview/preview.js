// Preview controls. Switches modes (shared with the real CRT via /ws) and
// reflects live state. The <iframe> is the actual /display app, so the preview
// shows precisely what the monitor will show.

const statusEl = document.getElementById("status");
const nowModeEl = document.getElementById("now-mode");
const tally = document.getElementById("tally");
const modeButtons = [...document.querySelectorAll(".mode")];

function setStatus(connected) {
  statusEl.textContent = connected ? "online" : "offline";
  statusEl.classList.toggle("on", connected);
  statusEl.classList.toggle("off", !connected);
}

function reflect(state) {
  for (const btn of modeButtons) {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
  }
  nowModeEl.textContent = state.mode || "—";
  tally.classList.toggle("live", state.mode === "video");
}

for (const btn of modeButtons) {
  btn.addEventListener("click", async () => {
    await fetch("/api/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: btn.dataset.mode }),
    });
  });
}

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
