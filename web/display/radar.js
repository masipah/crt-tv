// Local Radar screen — an animated RainViewer radar overlay on a dark base map
// (Leaflet, loaded from CDN on demand). Frame list comes from /api/radar (a
// server-side proxy of api.rainviewer.com). Worldwide coverage varies; areas
// with no radar just show the base map.

let leafletPromise = null;
function ensureLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => resolve();
    js.onerror = reject;
    document.head.appendChild(js);
  });
  return leafletPromise;
}

let map = null;
let layers = [];
let frame = 0;
let timer = null;

export async function startRadar(el, lat, lon) {
  if (!el) return;
  if (lat == null || lon == null) {
    el.innerHTML = '<div class="ws-radar-msg">RADAR UNAVAILABLE</div>';
    return;
  }
  try {
    await ensureLeaflet();
  } catch (err) {
    el.innerHTML = '<div class="ws-radar-msg">RADAR OFFLINE</div>';
    return;
  }
  el.innerHTML = "";
  map = L.map(el, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
  }).setView([lat, lon], 7);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", { subdomains: "abcd" }).addTo(map);

  try {
    const data = await (await fetch("/api/radar")).json();
    const host = data.host;
    const past = (data.radar && data.radar.past) || [];
    const frames = past.slice(-8);
    layers = frames.map((f) =>
      L.tileLayer(`${host}${f.path}/256/{z}/{x}/{y}/4/1_1.png`, { opacity: 0, zIndex: 5 }).addTo(map)
    );
    if (layers.length) {
      frame = 0;
      layers[0].setOpacity(0.8);
      play();
    }
  } catch (err) {
    console.error("radar frames failed", err);
  }
}

function play() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (!layers.length) return;
    layers[frame].setOpacity(0);
    frame = (frame + 1) % layers.length;
    layers[frame].setOpacity(0.8);
  }, 550);
}

export function stopRadar() {
  if (timer) { clearInterval(timer); timer = null; }
  if (map) { map.remove(); map = null; }
  layers = [];
  frame = 0;
}
