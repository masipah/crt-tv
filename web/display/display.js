// Display controller. Connects to /ws, listens for state changes, and swaps the
// active mode (teletext / weather / video). Reconnects automatically so the CRT
// recovers on its own if the service restarts.

import { renderTeletext, stopTeletext } from "./teletext.js";
import { renderWeather, stopWeather } from "./weather.js";
import { startVideo, stopVideo } from "./video.js";

const sections = {
  teletext: document.getElementById("teletext"),
  weather: document.getElementById("weather"),
  video: document.getElementById("video"),
};

let activeMode = null;

function applyMode(state) {
  const mode = state.mode;
  if (mode === activeMode && mode !== "video") return; // avoid re-render churn

  // tear down whatever was running
  stopTeletext();
  stopWeather();
  stopVideo(sections.video);

  for (const [name, el] of Object.entries(sections)) {
    el.hidden = name !== mode;
  }

  if (mode === "teletext") renderTeletext(sections.teletext);
  else if (mode === "weather") renderWeather(sections.weather);
  else if (mode === "video") startVideo(sections.video, state.video_index || 0);

  activeMode = mode;
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state") applyMode(msg.state);
    } catch (err) {
      console.error("bad ws message", err);
    }
  };

  ws.onclose = () => {
    console.warn("ws closed; reconnecting in 2s");
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}

connect();
