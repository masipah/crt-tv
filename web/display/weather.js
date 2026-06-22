// WeatherStar 4000-style weather display.
//
// Presentation is modelled on the WeatherStar 4000+ project
// (github.com/netbymatt/ws4kp, MIT); data comes from /api/weather (Open-Meteo).
// It cycles Current Conditions -> Extended Forecast -> Almanac, with a live
// clock and a scrolling "lower display line" ticker. Icons fall back to text if
// the ws4kp asset set hasn't been fetched into assets/.

import { startRadar, startRegionalForecast, stopMap } from "./radar.js";

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

function screenHourlyGraph(w) {
  const hrs = w.hourly.slice(0, 12);
  const temps = hrs.map((h) => h.temp);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = Math.max(1, max - min);
  const bars = hrs
    .map((h) => {
      const pct = 12 + ((h.temp - min) / span) * 76; // 12%..88% tall
      return `<div class="ws-bar"><span class="bt">${h.temp}&deg;</span>
        <span class="bcol" style="height:${pct}%"></span>
        <span class="bh">${h.time.replace(/(AM|PM)/, "")}</span></div>`;
    })
    .join("");
  return `<div class="ws-graph ws-box">${bars}</div>`;
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
const ALL_KEYS = ["hazards", "current", "regional", "hourly", "hourly_graph", "travel", "regional_forecast", "local", "extended", "almanac", "spc", "radar"];

function screenRadar() {
  return `<div class="ws-radar"></div>`;
}

function screenRegionalForecast() {
  return `<div class="ws-radar"></div>`;
}

function screenSpc() {
  return `<img class="ws-spc" alt="SPC Day 1 Outlook" src="https://www.spc.noaa.gov/products/outlook/day1otlk.gif" />`;
}

function screenHazards(w) {
  const items = (w.hazards || [])
    .map((h) => `<div class="hz"><div class="hz-event">${h.event}</div><div class="hz-head">${h.headline || ""}</div></div>`)
    .join("");
  return `<div class="ws-hazards">${items || '<div class="hz-none">NO ACTIVE WATCHES OR WARNINGS</div>'}</div>`;
}

function buildScreens(w, opts) {
  const on = new Set((opts && opts.enabled_keys) || ALL_KEYS);
  const s = [];
  // Hazards only appears when there's actually an active alert (like ws4kp).
  if (on.has("hazards") && w.hazards && w.hazards.length)
    s.push({ key: "hazards", title: "Hazards", bg: "BackGround1.png", zone: "bg1", build: screenHazards });
  if (on.has("current")) s.push({ title: "Current<br>Conditions", bg: "BackGround1.png", zone: "bg1", build: screenCurrent });
  if (on.has("regional") && w.regional && w.regional.length)
    s.push({ title: "Latest<br>Observations", bg: "BackGround6.png", zone: "bg6", build: screenRegional });
  if (on.has("hourly") && w.hourly && w.hourly.length)
    s.push({ title: "Hourly<br>Forecast", bg: "BackGround6.png", zone: "bg6", build: screenHourly });
  if (on.has("hourly_graph") && w.hourly && w.hourly.length)
    s.push({ title: "Hourly<br>Graph", bg: "BackGround6.png", zone: "bg6", build: screenHourlyGraph });
  if (on.has("local") && w.local_forecast && w.local_forecast.length)
    s.push({ title: "Local<br>Forecast", bg: "BackGround6.png", zone: "bg6", build: screenLocalForecast });
  if (on.has("extended")) {
    s.push({ title: "Extended<br>Forecast", bg: "BackGround2.png", zone: "bg2", build: (d) => screenExtended(d, 1) });
    if (w.forecast && w.forecast.length > 4)
      s.push({ title: "Extended<br>Forecast", bg: "BackGround2.png", zone: "bg2", build: (d) => screenExtended(d, 4) });
  }
  if (on.has("travel") && w.regional && w.regional.length)
    s.push({ title: "Travel<br>Forecast", bg: "BackGround6.png", zone: "bg6", build: screenTravel });
  if (on.has("regional_forecast") && w.regional && w.regional.length)
    s.push({ key: "regional_forecast", title: "Regional<br>Forecast", bg: "BackGround6.png", zone: "bg6", build: screenRegionalForecast });
  if (on.has("almanac")) s.push({ title: "Almanac", bg: "BackGround1.png", zone: "bg1", build: screenAlmanac });
  if (on.has("spc"))
    s.push({ key: "spc", title: "SPC<br>Outlook", bg: "BackGround6.png", zone: "bg6", build: screenSpc });
  if (on.has("radar"))
    s.push({ key: "radar", title: "Local<br>Radar", bg: "BackGround6.png", zone: "bg6", build: screenRadar });
  if (!s.length) s.push({ title: "Current<br>Conditions", bg: "BackGround1.png", zone: "bg1", build: screenCurrent });
  return s;
}

// ---- controller ----
let data = null;
let screens = [];
let screenIndex = 0;
let cycleMs = 12000;
let currentOpts = null;
let paused = false;
let mapActive = false;

const THEME_FILTER = {
  classic: "none",
  dark: "brightness(0.78)",
  seafoam: "hue-rotate(115deg) saturate(1.1)",
  cosmic: "hue-rotate(265deg) saturate(1.25)",
};
let clockTimer = null;
let cycleTimer = null;
let refreshTimer = null;
let retryTimer = null;
let stageEl = null;
let titleEl = null;
let metaEl = null;
let contentEl = null;
let ldlEl = null;
let fitHandler = null;

function paintScreen() {
  if (!data || !screens.length) return;
  if (mapActive) { stopMap(); mapActive = false; }
  const idx = ((screenIndex % screens.length) + screens.length) % screens.length;
  const s = screens[idx];
  titleEl.innerHTML = s.title;
  stageEl.style.backgroundImage = `url("assets/backgrounds/${s.bg}")`;
  stageEl.style.filter = THEME_FILTER[(currentOpts && currentOpts.theme) || "classic"] || "none";
  contentEl.className = `ws-content ${s.zone}`;
  contentEl.innerHTML = s.build(data);
  const h = data.headend || {};
  if (s.key === "radar") {
    startRadar(contentEl.querySelector(".ws-radar"), h.latitude, h.longitude);
    mapActive = true;
  } else if (s.key === "regional_forecast") {
    const cities = (data.regional || []).map((c) => ({ ...c, icon: ICON_BASE + c.icon }));
    startRegionalForecast(contentEl.querySelector(".ws-radar"), [h.latitude, h.longitude], cities);
    mapActive = true;
  }
}

function restartCycle() {
  if (cycleTimer) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
  if (!paused) {
    cycleTimer = setInterval(() => {
      screenIndex += 1;
      paintScreen();
    }, cycleMs);
  }
}

// Control-bar commands from the dashboard.
export function weatherCommand(action) {
  if (action === "next") { screenIndex += 1; paintScreen(); restartCycle(); }
  else if (action === "prev") { screenIndex -= 1; paintScreen(); restartCycle(); }
  else if (action === "pause") { paused = true; restartCycle(); }
  else if (action === "play") { paused = false; restartCycle(); }
  else if (action === "refresh") { load(); }
}

function updateClock() {
  const { date, time } = dateTimeStrings();
  metaEl.innerHTML =
    `<div class="loc">${(data ? data.location : "").toUpperCase()}</div>` +
    `<div>${date}</div><div>${time}</div>`;
}

// scale the fixed 640x480 stage to fill the CRT area
function fitStage() {
  if (!stageEl) return;
  const wrap = stageEl.parentElement;
  const scale = Math.min(wrap.clientWidth / 640, wrap.clientHeight / 480);
  stageEl.style.transform = `scale(${scale})`;
}

function scaffold(root) {
  root.innerHTML = `
    <div class="ws-fit">
      <div class="ws" id="ws-stage">
        <div class="ws-head">
          <div class="ws-title" id="ws-title">Weather</div>
          <div class="ws-meta" id="ws-meta"></div>
        </div>
        <div class="ws-content bg1" id="ws-content"></div>
        <div class="ws-ldl"><div class="track" id="ws-ldl">Loading weather&hellip;</div></div>
      </div>
    </div>`;
  stageEl = root.querySelector("#ws-stage");
  titleEl = root.querySelector("#ws-title");
  metaEl = root.querySelector("#ws-meta");
  contentEl = root.querySelector("#ws-content");
  ldlEl = root.querySelector("#ws-ldl");
  fitStage();
  fitHandler = () => fitStage();
  window.addEventListener("resize", fitHandler);
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
    currentOpts = oResp.ok ? await oResp.json() : null;
    screens = buildScreens(data, currentOpts);
    if (screenIndex >= screens.length) screenIndex = 0;
    cycleMs = (currentOpts && currentOpts.speed_ms) || 12000;
    restartCycle();
    const custom = currentOpts && currentOpts.ticker === "custom" && currentOpts.ticker_text;
    ldlEl.textContent = custom ? currentOpts.ticker_text : ticker(data);
    paintScreen();
    updateClock();
    fitStage();
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
  load(); // load() starts the cycle timer using the configured speed
  updateClock();

  clockTimer = setInterval(updateClock, 1000);
  refreshTimer = setInterval(load, 5 * 60 * 1000);
}

export function stopWeather() {
  for (const t of [clockTimer, cycleTimer, refreshTimer]) if (t) clearInterval(t);
  if (retryTimer) clearTimeout(retryTimer);
  if (fitHandler) window.removeEventListener("resize", fitHandler);
  if (mapActive) { stopMap(); mapActive = false; }
  clockTimer = cycleTimer = refreshTimer = retryTimer = fitHandler = null;
}
