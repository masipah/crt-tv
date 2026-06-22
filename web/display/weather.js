// WeatherStar 4000-style weather display.
//
// Presentation is modelled on the WeatherStar 4000+ project
// (github.com/netbymatt/ws4kp, MIT); data comes from /api/weather (Open-Meteo).
// It cycles Current Conditions -> Extended Forecast -> Almanac, with a live
// clock and a scrolling "lower display line" ticker. Icons fall back to text if
// the ws4kp asset set hasn't been fetched into assets/.

const ICON_BASE = "assets/icons/current-conditions/";
const CYCLE_MS = 12000;

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateTimeStrings(d = new Date()) {
  const wd = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()];
  const dd = `${wd} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  let h = d.getHours();
  const ampm = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return { date: dd, time: `${h}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${ampm}` };
}

// <img> with a text fallback if the asset is missing.
function icon(file, alt) {
  return `<img src="${ICON_BASE}${encodeURIComponent(file)}" alt="${alt}"
            onerror="this.replaceWith(document.createTextNode('${alt}'))" />`;
}

function ticker(w) {
  const c = w.current;
  const u = w.units;
  const today = w.forecast[0];
  const parts = [
    `CONDITIONS AT ${w.location.toUpperCase()}...`,
    `${c.label.toUpperCase()}   TEMP ${c.temp}°${u.temp}   FEELS LIKE ${c.feels_like}°`,
    `HUMIDITY ${c.humidity}%   DEWPOINT ${c.dewpoint}°   WIND ${c.wind_dir} ${c.wind_speed} ${u.wind}`,
    `PRESSURE ${c.pressure} ${u.pressure}`,
  ];
  if (today) parts.push(`TODAY: ${today.label.toUpperCase()}  HIGH ${today.high}°  LOW ${today.low}°`);
  return parts.join("      ");
}

// ---- screens ----
function screenCurrent(w) {
  const c = w.current;
  const u = w.units;
  return `
    <div class="ws-cc ws-box">
      <div class="ws-cc-left">
        ${icon(c.icon, c.label)}
        <div class="ws-cc-temp">${c.temp}&deg;</div>
        <div class="ws-cc-label">${c.label}</div>
      </div>
      <div class="ws-cc-right">
        <div class="ws-row"><span class="k">Humidity:</span><span class="v">${c.humidity}%</span></div>
        <div class="ws-row"><span class="k">Dewpoint:</span><span class="v">${c.dewpoint}&deg;${u.temp}</span></div>
        <div class="ws-row"><span class="k">Feels Like:</span><span class="v">${c.feels_like}&deg;${u.temp}</span></div>
        <div class="ws-row"><span class="k">Wind:</span><span class="v">${c.wind_dir} ${c.wind_speed}</span></div>
        <div class="ws-row"><span class="k">Gusts:</span><span class="v">${c.wind_gust} ${u.wind}</span></div>
        <div class="ws-row"><span class="k">Pressure:</span><span class="v">${c.pressure} ${u.pressure}</span></div>
      </div>
    </div>`;
}

function screenExtended(w) {
  // first three forecast days, skipping today if we have enough
  const days = (w.forecast.length > 3 ? w.forecast.slice(1, 4) : w.forecast.slice(0, 3));
  const cols = days
    .map(
      (d) => `
      <div class="ws-ext-day ws-box">
        <div class="name">${d.day}</div>
        ${icon(d.icon, d.label)}
        <div class="cond">${d.label}</div>
        <div class="temps"><span class="lo">Lo ${d.low}</span><span class="hi">Hi ${d.high}</span></div>
      </div>`
    )
    .join("");
  return `<div class="ws-ext">${cols}</div>`;
}

function screenAlmanac(w) {
  const a = w.almanac;
  const u = w.units;
  const today = w.forecast[0] || {};
  return `
    <div class="ws-alm ws-box">
      <div class="ws-row"><span class="k">Sunrise:</span><span class="v">${a.sunrise}</span></div>
      <div class="ws-row"><span class="k">Sunset:</span><span class="v">${a.sunset}</span></div>
      <div class="ws-row"><span class="k">Moon:</span><span class="v">${a.moon_phase}</span></div>
      <div class="ws-row"><span class="k">Today High:</span><span class="v">${today.high ?? "--"}&deg;${u.temp}</span></div>
      <div class="ws-row"><span class="k">Today Low:</span><span class="v">${today.low ?? "--"}&deg;${u.temp}</span></div>
    </div>`;
}

const SCREENS = [
  { title: "Current<br>Conditions", build: screenCurrent },
  { title: "Extended<br>Forecast", build: screenExtended },
  { title: "Almanac", build: screenAlmanac },
];

// ---- controller ----
let data = null;
let screenIndex = 0;
let clockTimer = null;
let cycleTimer = null;
let refreshTimer = null;
let retryTimer = null;
let titleEl = null;
let metaEl = null;
let bodyEl = null;
let ldlEl = null;

function paintScreen() {
  if (!data) return;
  const s = SCREENS[screenIndex % SCREENS.length];
  titleEl.innerHTML = s.title;
  bodyEl.innerHTML = `<div class="ws-screen">${s.build(data)}</div>`;
}

function updateClock() {
  const { date, time } = dateTimeStrings();
  metaEl.innerHTML =
    `<div class="loc">${(data ? data.location : "").toUpperCase()}</div>` +
    `<div>${date}</div><div>${time}</div>`;
}

function scaffold(root) {
  root.innerHTML = `
    <div class="ws">
      <div class="ws-header">
        <div class="ws-title" id="ws-title">Weather</div>
        <div class="ws-meta" id="ws-meta"></div>
      </div>
      <div class="ws-body" id="ws-body"></div>
      <div class="ws-ldl"><div class="track" id="ws-ldl">Loading weather&hellip;</div></div>
    </div>`;
  titleEl = root.querySelector("#ws-title");
  metaEl = root.querySelector("#ws-meta");
  bodyEl = root.querySelector("#ws-body");
  ldlEl = root.querySelector("#ws-ldl");
}

async function load() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  try {
    const resp = await fetch("/api/weather");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = await resp.json();
    ldlEl.textContent = ticker(data);
    paintScreen();
    updateClock();
  } catch (err) {
    console.error("weather load failed", err);
    // On a cold boot the network may not be up yet — show a waiting message and
    // retry soon instead of waiting for the 5-minute refresh.
    if (bodyEl)
      bodyEl.innerHTML = `<div class="ws-screen"><div class="ws-box" style="height:100%;display:flex;align-items:center;justify-content:center">WAITING FOR WEATHER&hellip;</div></div>`;
    retryTimer = setTimeout(load, 15000);
  }
}

export function renderWeather(root) {
  stopWeather();
  scaffold(root);
  screenIndex = 0;
  load();
  updateClock();

  clockTimer = setInterval(updateClock, 1000);
  cycleTimer = setInterval(() => {
    screenIndex += 1;
    paintScreen();
  }, CYCLE_MS);
  refreshTimer = setInterval(load, 5 * 60 * 1000);
}

export function stopWeather() {
  for (const t of [clockTimer, cycleTimer, refreshTimer]) if (t) clearInterval(t);
  if (retryTimer) clearTimeout(retryTimer);
  clockTimer = cycleTimer = refreshTimer = retryTimer = null;
}
