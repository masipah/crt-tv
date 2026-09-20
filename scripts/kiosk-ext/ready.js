// Loading and the progress screen do not count toward the weather intro.
// Report once the presentation is running and a real weather screen is visible.
(() => {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname) || location.port !== '8080') return;
  const params = new URLSearchParams(location.search);
  const reportIntro = params.get('crtWeatherIntro') === '1';
  let pending = false;
  const timer = setInterval(async () => {
    const screen = document.querySelector('.weather-display.show:not(#progress-html)');
    const loading = document.querySelector('#loading');
    const playing = document.querySelector('#NavigatePlay')?.title === 'Pause';
    if (pending || !playing || !screen || !screen.getClientRects().length
      || (loading && getComputedStyle(loading).display !== 'none')) return;
    globalThis.crtFinishSplash?.();
    if (!reportIntro) { clearInterval(timer); return; }
    pending = true;
    try {
      const response = await fetch(`http://127.0.0.1:${params.get('crtRemotePort') || '8090'}/api/weather/started`, { method: 'POST', signal: AbortSignal.timeout(3000) });
      if (response.status === 200) clearInterval(timer);
    } catch { /* The web remote may still be starting. Retry while visible. */ }
    finally { pending = false; }
  }, 500);
})();
