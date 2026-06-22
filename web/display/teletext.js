// Renders a Ceefax-style teletext "front page".
// Header (service + page number + live clock), a coloured news-ish body, and a
// Fastext footer. The clock updates every second.

const SERVICE = "CRT1";
const PAGE = "100";

function pad(n) {
  return String(n).padStart(2, "0");
}

function clockString(d = new Date()) {
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const day = days[d.getDay()];
  return `${day} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let clockTimer = null;

export function renderTeletext(root) {
  root.innerHTML = `
    <div class="ttx">
      <div class="ttx-header">
        <span class="page">${SERVICE} ${PAGE}</span>
        <span class="clock" id="ttx-clock">${clockString()}</span>
      </div>
      <div class="ttx-title">C R T &nbsp; T E L E T E X T</div>
      <div class="ttx-body">
        <div class="ttx-row"><span class="c-green">WELCOME TO CRT-TV</span></div>
        <div class="ttx-row"><span class="c-white">A HEADLESS PI DRIVING A SONY PVM.</span></div>
        <div class="ttx-row">&nbsp;</div>
        <div class="ttx-row"><span class="c-cyan">100&nbsp;</span><span class="c-white">INDEX</span></div>
        <div class="ttx-row"><span class="c-cyan">200&nbsp;</span><span class="c-white">WEATHER</span></div>
        <div class="ttx-row"><span class="c-cyan">300&nbsp;</span><span class="c-white">VIDEO PLAYLIST</span></div>
        <div class="ttx-row">&nbsp;</div>
        <div class="ttx-row"><span class="c-yellow">USE THE CONTROL APP TO SWITCH</span></div>
        <div class="ttx-row"><span class="c-yellow">BETWEEN PAGES AND VIDEO.</span></div>
      </div>
      <div class="ttx-footer">
        <span class="c-red">INDEX</span>
        <span class="c-green">WEATHER</span>
        <span class="c-yellow">VIDEO</span>
        <span class="c-cyan">CRT-TV</span>
      </div>
    </div>`;

  const clockEl = root.querySelector("#ttx-clock");
  stopTeletext();
  clockTimer = setInterval(() => {
    clockEl.textContent = clockString();
  }, 1000);
}

export function stopTeletext() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}
