// Loading and the progress screen do not count toward the weather intro.
// Report once the presentation is running and a real weather screen is visible.
(() => {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname) || location.port !== '8080') return;
  const params = new URLSearchParams(location.search);
  const reportIntro = params.get('crtWeatherIntro') === '1';
  let pending = false, stableKey = null, stableSince = 0;
  const timer = setInterval(async () => {
    const screen = document.querySelector('.weather-display.show:not(#progress-html)');
    const loading = document.querySelector('#loading');
    const playing = document.querySelector('#NavigatePlay')?.title === 'Pause';
    if (pending) return;
    const visible = playing && screen && screen.getClientRects().length
      && (!loading || getComputedStyle(loading).display === 'none');
    const imagesReady = visible && [...screen.querySelectorAll('img')]
      .filter(img => img.getClientRects().length)
      .every(img => img.complete && img.naturalWidth > 0);
    const fontsReady = !document.fonts || document.fonts.status === 'loaded';
    const rect = visible && screen.getBoundingClientRect();
    const key = rect && `${screen.id}:${rect.x},${rect.y},${rect.width},${rect.height}`;
    if (!visible || !imagesReady || !fontsReady || key !== stableKey) {
      stableKey = visible && imagesReady && fontsReady ? key : null;
      stableSince = performance.now();
      globalThis.crtFinishSplash?.(false);
      return;
    }
    // Wait through layout, font and image changes before exposing the screen.
    if (performance.now() - stableSince < 1000) return;
    // A loaded weather page can be ready before the boot ident has finished.
    // Count two minutes only after the overlay has actually been removed.
    if (globalThis.crtFinishSplash?.() === false) return;
    if (!reportIntro) { clearInterval(timer); return; }
    pending = true;
    try {
      const response = await fetch(`http://127.0.0.1:${params.get('crtRemotePort') || '8090'}/api/weather/started`, { method: 'POST', signal: AbortSignal.timeout(3000) });
      if (response.status === 200) clearInterval(timer);
    } catch { /* The web remote may still be starting. Retry while visible. */ }
    finally { pending = false; }
  }, 500);
})();
