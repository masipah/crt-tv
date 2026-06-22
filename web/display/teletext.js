// Ceefax-style teletext. Rotates through "pages" like real teletext rotated
// subpages: the index (100) and a tongue-in-cheek 90s "after dark" chatline-ad
// page (660) — pure nostalgia parody, nothing explicit.

const SERVICE = "CRT1";

function pad(n) {
  return String(n).padStart(2, "0");
}

function clockString(d = new Date()) {
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return `${days[d.getDay()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function header(num) {
  return `<div class="ttx-header">
      <span class="page">${SERVICE} ${num}</span>
      <span class="clock" id="ttx-clock">${clockString()}</span>
    </div>`;
}

const footer = `<div class="ttx-footer">
    <span class="c-red">INDEX</span>
    <span class="c-green">WEATHER</span>
    <span class="c-yellow">VIDEO</span>
    <span class="c-magenta">660</span>
  </div>`;

function pageIndex(num) {
  return `<div class="ttx">
      ${header(num)}
      <div class="ttx-title">C R T &nbsp; T E L E T E X T</div>
      <div class="ttx-body">
        <div class="ttx-row"><span class="c-green">WELCOME TO CRT-TV</span></div>
        <div class="ttx-row"><span class="c-white">A HEADLESS PI DRIVING A SONY PVM.</span></div>
        <div class="ttx-row">&nbsp;</div>
        <div class="ttx-row"><span class="c-cyan">100&nbsp;</span><span class="c-white">INDEX</span></div>
        <div class="ttx-row"><span class="c-cyan">200&nbsp;</span><span class="c-white">WEATHER</span></div>
        <div class="ttx-row"><span class="c-cyan">300&nbsp;</span><span class="c-white">VIDEO PLAYLIST</span></div>
        <div class="ttx-row"><span class="c-cyan">660&nbsp;</span><span class="c-magenta">AFTER DARK</span> <span class="c-red ttx-flash">NEW</span></div>
        <div class="ttx-row">&nbsp;</div>
        <div class="ttx-row"><span class="c-yellow">USE THE CONTROL APP TO SWITCH</span></div>
      </div>
      ${footer}
    </div>`;
}

function pageAfterDark(num) {
  return `<div class="ttx">
      ${header(num)}
      <div class="ttx-title ttx-title-pink">A F T E R &nbsp; D A R K</div>
      <div class="ttx-body ttx-center-body">
        <div class="ttx-row ttx-flash"><span class="c-red">*** ADULTS ONLY — 18+ ***</span></div>
        <div class="ttx-row">&nbsp;</div>
        <div class="ttx-row"><span class="c-magenta">&hearts; LONELY TONIGHT? &hearts;</span></div>
        <div class="ttx-row"><span class="c-cyan">LIVE 1-2-1 CHATLINE</span></div>
        <div class="ttx-row big"><span class="c-yellow">CALL 0898 21 21 21</span></div>
        <div class="ttx-row"><span class="c-magenta">MEET SINGLES NEAR YOU</span></div>
        <div class="ttx-row"><span class="c-green">FLIRTY FUN ALL NITE LONG</span></div>
        <div class="ttx-row">&nbsp;</div>
        <div class="ttx-row smallprint"><span class="c-white">Calls &pound;1.50/min + network extras. 18+ only.
          Bill payer's permission required. Entertainment
          purposes only. CRT-TV, PO BOX 4000.</span></div>
      </div>
      ${footer}
    </div>`;
}

const PAGES = [
  { num: "100", build: pageIndex },
  { num: "660", build: pageAfterDark },
];

let clockTimer = null;
let rotateTimer = null;
let pageIdx = 0;
let rootEl = null;
let clockEl = null;

function renderPage() {
  const p = PAGES[pageIdx % PAGES.length];
  rootEl.innerHTML = p.build(p.num);
  clockEl = rootEl.querySelector("#ttx-clock");
}

export function renderTeletext(root) {
  stopTeletext();
  rootEl = root;
  pageIdx = 0;
  renderPage();
  clockTimer = setInterval(() => {
    if (clockEl) clockEl.textContent = clockString();
  }, 1000);
  rotateTimer = setInterval(() => {
    pageIdx += 1;
    renderPage();
  }, 12000);
}

export function stopTeletext() {
  if (clockTimer) clearInterval(clockTimer);
  if (rotateTimer) clearInterval(rotateTimer);
  clockTimer = rotateTimer = null;
}
