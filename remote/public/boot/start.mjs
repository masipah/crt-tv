// The final station ident stays up while mpv takes over. No weather page,
// external data, or internet connection is needed to start the local Channel.
if (['127.0.0.1', 'localhost'].includes(location.hostname)) {
  let pending = false;
  const timer = setInterval(async () => {
    if (pending || globalThis.crtFinishSplash?.(true, true) !== true) return;
    pending = true;
    try {
      const response = await fetch('/api/boot/channel', {method:'POST', signal:AbortSignal.timeout(10000)});
      if (response.status === 200) clearInterval(timer);
    } catch { /* Hold the ident and retry if the boot controller is not ready. */ }
    finally { pending = false; }
  }, 250);
}
