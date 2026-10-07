// Keep a seamless loader visible until WeatherStar is ready.
(() => {
  if ((location.port !== '8080' && location.pathname !== '/boot.html') || window.top !== window) return;
  const params = new URLSearchParams(location.search);
  // Only the boot launcher supplies this marker. Manual Weather switches
  // must not create an animation, even with a zero minimum hold.
  if (!params.has('crtSplashMin')) return;
  const canvas = document.createElement('canvas');
  canvas.width = 720; canvas.height = 480;
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;background:black;visibility:visible;pointer-events:none';
  document.documentElement.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const colors = ['#000', '#a00', '#0a0', '#a50', '#00a', '#a0a', '#0aa', '#aaa'];
  const bright = ['#555', '#f55', '#5f5', '#ff5', '#55f', '#f5f', '#5ff', '#fff'];
  const started = performance.now();
  const seconds = Number(params.get('crtSplashMin'));
  const minimum = Number.isFinite(seconds) ? Math.min(60, Math.max(0, seconds)) * 1000 : 12000;
  let frame = 0, timer, finished = false, requested = false, revealing = false;
  function draw() {
    const [ansi, seconds] = globalThis.crtSplashFrames[frame];
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 720, 480);
    ctx.font = '16px monospace'; ctx.textBaseline = 'top';
    let row = 0, col = 0, bold = false, color = 7;
    for (const token of ansi.matchAll(/\x1b\[([?\d;]*)([A-Za-z])|([^\x1b]+)/gu)) {
      if (token[2] === 'H') {
        const coords = token[1].split(';').map(Number);
        row = (coords[0] || 1) - 1; col = (coords[1] || 1) - 1;
      } else if (token[2] === 'm') {
        for (const code of token[1].split(';').map(Number)) {
          if (code === 0) { bold = false; color = 7; }
          if (code === 1) bold = true;
          if (code >= 30 && code <= 37) color = code - 30;
        }
      } else if (token[3]) {
        ctx.fillStyle = (bold ? bright : colors)[color];
        for (const ch of token[3]) {
          const x = col++ * 8, y = row * 16;
          if (ch === '█') ctx.fillRect(x, y, 8, 16);
          else if (ch === '▀') ctx.fillRect(x, y, 8, 8);
          else if (ch === '▄') ctx.fillRect(x, y + 8, 8, 8);
          else if (ch !== ' ') ctx.fillText(ch, x, y, 8);
        }
      }
    }
    frame = (frame + 1) % globalThis.crtSplashFrames.length;
    timer = setTimeout(draw, seconds * 1000);
  }
  // ready.js calls only when a real, playing weather screen is behind us.
  // No timeout may reveal the loading screen or start the video timer early.
  globalThis.crtFinishSplash = (ready = true, hold = false) => {
    if (finished) return true;
    requested = ready && performance.now() - started >= minimum;
    if (!requested) return false;
    // Legacy boot pages keep animating during their handoff.
    if (hold) return true;
    if (!revealing) {
      revealing = true;
      // Give the composed weather frame a paint before the single cut.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        revealing = false;
        if (!requested) return;
        clearTimeout(timer); canvas.remove(); finished = true;
      }));
    }
    return false;
  };
  draw();
})();
