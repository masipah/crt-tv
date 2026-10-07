// Shared parsing for browser channels and the calibration pattern.
globalThis.crtDisplayFit = search => {
  const params = new URLSearchParams(search);
  const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  const [x,y] = (params.get('crtFit') || '1').split('x').map(parseFloat);
  const [sx,sy] = (params.get('crtShift') || '0,0').split(',').map(parseFloat);
  return {fitX:clamp(x,.5,1,1),fitY:clamp(y ?? x,.5,1,1),shiftX:clamp(sx,-100,100,0),shiftY:clamp(sy,-100,100,0)};
};
