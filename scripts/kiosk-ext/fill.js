// Stretch ws4kp's kiosk canvas to fill the whole screen. ws4kp fits its
// 640x480 canvas with a uniform min() scale — on the 720x480 composite
// raster that's scale(1.0), leaving 40px pillarbox bars. The CRT's
// non-square pixels mean the full 720 raster IS 4:3, so filling both axes
// independently is geometrically correct, not a distortion (the same trick
// as mpv's --monitoraspect=4:3 for the videos). ws4kp applies its scale as
// an inline !important style on every resize, which no stylesheet can
// out-rank — so this script re-applies the stretched transform whenever
// ws4kp's own one lands.
(() => {
  // ws4kp's BASE_SIZE (non-wide, non-portrait — the kiosk never uses those)
  const BASE_W = 640;
  const BASE_H = 480;
  let expected = null;

  // Overscan compensation (kiosk.sh's crtFit/crtShift, from KIOSK_FIT*):
  // the CRT crops the outer few percent of the raster, so fill a fraction of
  // the screen and let the black remainder fall into the cropped margin —
  // the whole picture, bottom scroll included, then lands inside the visible
  // area. Per-axis ("0.94x0.95", a bare "0.94" covers both), because real
  // tubes never crop the two axes alike, plus a raster-pixel nudge for
  // off-centre scans. #divTwcMain keeps the default centre transform-origin,
  // so scaling down stays centred and the shift rides on top.
  const q = new URLSearchParams(window.location.search);
  const clampFit = (v) => Math.min(1, Math.max(0.5, v || 1));
  const [rawFx, rawFy] = (q.get('crtFit') || '1').split('x').map(parseFloat);
  const fitX = clampFit(rawFx);
  const fitY = clampFit(rawFy ?? rawFx);
  const clampShift = (v) => Math.min(100, Math.max(-100, v || 0));
  const [shiftX, shiftY] = (q.get('crtShift') || '0,0').split(',')
    .map((v) => clampShift(parseFloat(v)));

  const apply = () => {
    if (!document.body || !document.body.classList.contains('kiosk')) return;
    const el = document.querySelector('#divTwcMain');
    if (!el) return;
    const cur = el.style.getPropertyValue('transform');
    if (expected !== null && cur === expected) return; // already ours
    const sx = (window.innerWidth * fitX) / BASE_W;
    const sy = (window.innerHeight * fitY) / BASE_H;
    // translate is outermost, so the shift is in raster pixels, not scaled
    el.style.setProperty('transform',
      `translate(${shiftX}px, ${shiftY}px) scale(${sx}, ${sy})`, 'important');
    // remember the browser's serialization so the observer can tell our
    // transform from ws4kp's without re-writing (and re-triggering) forever
    expected = el.style.getPropertyValue('transform');
  };

  const observer = new MutationObserver(apply);
  const arm = () => {
    const el = document.querySelector('#divTwcMain');
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['style'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    apply();
  };
  window.addEventListener('resize', apply);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  } else {
    arm();
  }
})();
