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
  // WeatherStar reserves 30 empty source pixels above its header. Trim 16
  // of those on the small CRT, keeping 14 for overscan and the footer pinned.
  const TOP_TRIM = 16;
  const applied = new Map();

  // Overscan compensation (kiosk.sh's crtFit/crtShift, from KIOSK_FIT*):
  // the CRT crops the outer few percent of the raster, so fill a fraction of
  // the screen and let the black remainder fall into the cropped margin —
  // the whole picture, bottom scroll included, then lands inside the visible
  // area. Per-axis ("0.94x0.95", a bare "0.94" covers both), because real
  // tubes never crop the two axes alike, plus a raster-pixel nudge for
  // off-centre scans. Position against the viewport so upstream wrapper padding
  // cannot move the weather canvas or leave an uneven vertical gap.
  const {fitX,fitY,shiftX,shiftY} = globalThis.crtDisplayFit(location.search);

  const apply = () => {
    if (!document.body || !document.body.classList.contains('kiosk')) return;
    const el = document.querySelector('#divTwcMain');
    if (!el) return;
    const sx = (window.innerWidth * fitX) / BASE_W;
    const sy = (window.innerHeight * fitY) / (BASE_H - TOP_TRIM);
    const styles = {
      position: 'fixed', left: `${window.innerWidth * (1 - fitX) / 2 + shiftX}px`,
      top: `${window.innerHeight * (1 - fitY) / 2 + shiftY - TOP_TRIM * sy}px`,
      width: `${BASE_W}px`, height: `${BASE_H}px`, margin: '0px',
      padding: '0px', 'transform-origin': '0px 0px', transform: `scale(${sx}, ${sy})`,
    };
    for (const [name, value] of Object.entries(styles)) {
      const last = applied.get(name);
      if (!last || last.value !== value || el.style.getPropertyValue(name) !== last.serialized
        || el.style.getPropertyPriority(name) !== 'important') {
        el.style.setProperty(name, value, 'important');
        applied.set(name, { value, serialized: el.style.getPropertyValue(name) });
      }
    }

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
