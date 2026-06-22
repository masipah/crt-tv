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

function screenExtended(w, start = 1) {
  const days = w.forecast.slice(start, start + 3);
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

function screenHourly(w) {
  const rows = w.hourly
    .slice(0, 12)
    .map(
      (h) => `
      <div class="ws-hr">
        <span class="t">${h.time}</span>
        ${icon(h.icon, h.label)}
        <span class="tp">${h.temp}&deg;</span>
        <span class="pp">${h.precip == null ? "" : h.precip + "%"}</span>
      </div>`
    )
    .join("");
  return `<div class="ws-hourly ws-box">${rows}</div>`;
}

function screenLocalForecast(w) {
  const periods = w.local_forecast
    .slice(0, 3)
    .map(
      (p) => `
      <div class="ws-lf">
        <div class="lf-title">${p.title}</div>
        <div class="lf-text">${p.text}</div>
      </div>`
    )
    .join("");
  return `<div class="ws-localfc ws-box">${periods}</div>`;
}

function screenRegional(w) {
  const u = w.units;
  const rows = w.regional
    .map(
      (c) => `
      <div class="ws-city">
        <span class="cn">${c.name}</span>
        ${icon(c.icon, c.label)}
        <span class="rc">${c.label}</span>
        <span class="tp">${c.temp}&deg;${u.temp}</span>
      </div>`
    )
    .join("");
  return `<div class="ws-cities ws-box">${rows}</div>`;
}

function screenTravel(w) {
  const rows = w.regional
    .map(
      (c) => `
      <div class="ws-city">
        <span class="cn">${c.name}</span>
        ${icon(c.icon, c.label)}
        <span class="lo">${c.low == null ? "--" : c.low}</span>
        <span class="hi">${c.high == null ? "--" : c.high}</span>
      </div>`
    )
    .join("");
  return `<div class="ws-cities ws-box">
      <div class="ws-city ws-city-head"><span class="cn"></span><span></span><span class="lo">LO</span><span class="hi">HI</span></div>
      ${rows}
    </div>`;
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

// The cycle of screens, built from the data plus the user's enabled-screen
// selection (from /api/weather/options). City screens also need regional_cities.
const ALL_KEYS = ["current", "regional", "hourly", "local", "extended", "travel", "almanac"];

function buildScreens(w, opts) {
  const on = new Set((opts && opts.enabled_keys) || ALL_KEYS);
  const screens = [];
  if (on.has("current")) screens.push({ title: "Current<br>Conditions", build: screenCurrent });
  if (on.has("regional") && w.regional && w.regional.length)
    screens.push({ title: "Latest<br>Observations", build: screenRegional });
  if (on.has("hourly") && w.hourly && w.hourly.length)
    screens.push({ title: "Hourly<br>Forecast", build: screenHourly });
  if (on.has("local") && w.local_forecast && w.local_forecast.length)
    screens.push({ title: "Local<br>Forecast", build: screenLocalForecast });
  if (on.has("extended")) {
    screens.push({ title: "Extended<br>Forecast", build: (d) => screenExtended(d, 1) });
    if (w.forecast && w.forecast.length > 4)
      screens.push({ title: "Extended<br>Forecast", build: (d) => screenExtended(d, 4) });
  }
  if (on.has("travel") && w.regional && w.regional.length)
    screens.push({ title: "Travel<br>Forecast", build: screenTravel });
  if (on.has("almanac")) screens.push({ title: "Almanac", build: screenAlmanac });
  // never leave the channel blank
  if (!screens.length) screens.push({ title: "Current<br>Conditions", build: screenCurrent });
  return screens;
}

// ---- controller ----
let data = null;
let screens = [];
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
  if (!data || !screens.length) return;
  const s = screens[screenIndex % screens.length];
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
    const [wResp, oResp] = await Promise.all([
      fetch("/api/weather"),
      fetch("/api/weather/options"),
    ]);
    if (!wResp.ok) throw new Error(`HTTP ${wResp.status}`);
    data = await wResp.json();
    const opts = oResp.ok ? await oResp.json() : null;
    screens = buildScreens(data, opts);
    if (screenIndex >= screens.length) screenIndex = 0;
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
