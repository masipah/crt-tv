// Background music for the weather channel — the WeatherStar 4000 smooth jazz.
// Plays a shuffled, continuous loop while weather mode is showing. Tracks come
// from /api/music (populated by the opt-in fetch-audio.sh). On the Pi kiosk,
// autoplay-with-sound is enabled via the --autoplay-policy Chromium flag.

let audioEl = null;
let tracks = [];
let index = 0;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function playAt(i) {
  if (!tracks.length || !audioEl) return;
  index = ((i % tracks.length) + tracks.length) % tracks.length;
  audioEl.src = tracks[index];
  audioEl.play().catch((err) => console.warn("music autoplay blocked / error", err));
}

export async function startMusic() {
  try {
    const resp = await fetch("/api/music");
    const data = await resp.json();
    if (!data.enabled || !data.tracks || !data.tracks.length) return;

    tracks = shuffle(data.tracks.slice());
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.id = "ws-music";
      document.body.appendChild(audioEl);
      audioEl.addEventListener("ended", () => playAt(index + 1));
      audioEl.addEventListener("error", () => playAt(index + 1));
    }
    audioEl.volume = typeof data.volume === "number" ? data.volume : 0.7;
    index = 0;
    playAt(0);
  } catch (err) {
    console.error("music start failed", err);
  }
}

export function stopMusic() {
  if (!audioEl) return;
  audioEl.pause();
  audioEl.removeAttribute("src");
  audioEl.load();
}
