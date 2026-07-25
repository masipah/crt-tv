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

  // Overscan compensation (kiosk.sh's crtFit, from KIOSK_FIT): the CRT crops
  // the outer few percent of the raster, so fill a fraction of the screen and
  // let the black remainder fall into the cropped margin — the whole picture,
  // bottom scroll included, then lands inside the visible area. #divTwcMain
  // keeps the default centre transform-origin, so scaling down stays centred.
  const fit = Math.min(1, Math.max(0.5,
    parseFloat(new URLSearchParams(window.location.search).get('crtFit')) || 1));

  const apply = () => {
    if (!document.body || !document.body.classList.contains('kiosk')) return;
    const el = document.querySelector('#divTwcMain');
    if (!el) return;
    const cur = el.style.getPropertyValue('transform');
    if (expected !== null && cur === expected) return; // already ours
    const sx = (window.innerWidth * fit) / BASE_W;
    const sy = (window.innerHeight * fit) / BASE_H;
    el.style.setProperty('transform', `scale(${sx}, ${sy})`, 'important');
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
