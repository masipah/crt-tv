// Renders a Ceefax-style weather page from /api/weather, refreshing periodically.

function pad(n) {
  return String(n).padStart(2, "0");
}

function clockString(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function loading(root, msg) {
  root.innerHTML = `<div class="ttx"><div class="ttx-center">${msg}</div></div>`;
}

function render(root, w) {
  const u = w.units;
  const cur = w.current;
  const days = w.forecast
    .map(
      (d) => `
      <div class="wx-day">
        <div class="d">${d.day}</div>
        <div class="g">${d.glyph}</div>
        <div class="hi">${d.high}&deg;</div>
        <div class="lo">${d.low}&deg;</div>
      </div>`
    )
    .join("");

  root.innerHTML = `
    <div class="ttx">
      <div class="ttx-header">
        <span class="page">CRT1 200</span>
        <span class="clock">${clockString()}</span>
      </div>
      <div class="ttx-title">W E A T H E R</div>
      <div class="ttx-body">
        <div class="ttx-row"><span class="c-cyan">${w.location.toUpperCase()}</span></div>
        <div class="wx-current">
          <span class="wx-glyph">${cur.glyph}</span>
          <span class="wx-temp">${cur.temp}&deg;${u.temp}</span>
          <span class="wx-meta">${cur.label}</span>
        </div>
        <div class="ttx-row"><span class="c-white">FEELS ${cur.feels_like}&deg;${u.temp}&nbsp;&nbsp;WIND ${cur.wind} ${u.wind}&nbsp;&nbsp;HUM ${cur.humidity}%</span></div>
        <div class="wx-forecast">${days}</div>
      </div>
      <div class="ttx-footer">
        <span class="c-red">INDEX</span>
        <span class="c-green">WEATHER</span>
        <span class="c-yellow">VIDEO</span>
        <span class="c-cyan">CRT-TV</span>
      </div>
    </div>`;
}

let refreshTimer = null;

async function load(root) {
  try {
    const resp = await fetch("/api/weather");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    render(root, await resp.json());
  } catch (err) {
    loading(root, "WEATHER UNAVAILABLE");
    console.error("weather load failed", err);
  }
}

export function renderWeather(root) {
  loading(root, "LOADING WEATHER…");
  load(root);
  stopWeather();
  // re-render the clock + refetch data every 5 minutes
  refreshTimer = setInterval(() => load(root), 5 * 60 * 1000);
}

export function stopWeather() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
