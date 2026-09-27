// The public vehicle source used by SFMTA's own F-line map embed.
// Its browser key is intentionally published by the agency; discover it rather
// than hard-coding it. Never return upstream credentials or errors to clients.
const MAP = 'https://sfmta.gtfs.media/gtfs/display/route/F/map/embed';
const TTL = 15_000;
const MAX_AGE = 300;
const numeric = value => value !== null && value !== '' && Number.isFinite(Number(value));
export function normalizeVehicles(rows, now) {
  if (!Array.isArray(rows)) throw new Error('Invalid vehicle feed');
  return rows.filter(v => v?.route?.id === 'F' && v.predictable === true && String(v.id || '').trim()
    && numeric(v.lat) && numeric(v.lon) && numeric(v.secsSinceReport)
    && Number(v.lat) > 37.70 && Number(v.lat) < 37.84 && Number(v.lon) > -122.52 && Number(v.lon) < -122.35
    && Number(v.secsSinceReport) >= 0 && Number(v.secsSinceReport) <= MAX_AGE
    && ['Historic Street Car', 'Motor Coach', 'Electric Trolley', 'LRV', 'Cable Car'].includes(String(v.vehicleType).split('_')[0].trim()))
    .map(v => ({ id: String(v.id), lon: Number(v.lon), lat: Number(v.lat),
      heading: numeric(v.heading) ? (Number(v.heading) + 360) % 360 : null,
      direction: String(v.dir?.id || '').match(/^F_(\d)_/)?.[1] === '1' ? 'Wharf' : 'Castro',
      reportedAt: now - Number(v.secsSinceReport) * 1000 }));
}
export function createMuniFeed({ fetchImpl = fetch, now = Date.now } = {}) {
  let settings, settingsAt = 0, cached, nextPoll = 0, pending;
  async function request(url, json = true) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000),
      headers: { Accept: json ? 'application/json' : 'text/html' } });
    if (!response.ok) throw new Error('Feed unavailable');
    return json ? response.json() : response.text();
  }
  async function refresh() {
    try {
      if (!settings || now() - settingsAt > 6 * 60 * 60 * 1000) {
        const html = await request(MAP, false);
        const text = html.match(/<script\b[^>]*data-drupal-selector="drupal-settings-json"[^>]*>([\s\S]*?)<\/script>/)?.[1];
        settings = JSON.parse(text || '{}').gtfsRtUmoiq;
        if (!settings?.key || settings.baseUrl !== 'https://webservices.umoiq.com/api/pub/v1' || settings.agency !== 'sfmta-cis') {
          settings = null; throw new Error('Missing public feed configuration');
        }
        settingsAt = now();
      }
      const url = new URL(`${settings.baseUrl}/agencies/${settings.agency}/routes/F/vehicles`);
      url.searchParams.set('key', settings.key);
      const rows = await request(url);
      cached = { vehicles: normalizeVehicles(rows, now()), fetchedAt: now(), stale: false };
    } catch {
      // Keep last known positions briefly, visibly stale; never invent cars.
      cached = { vehicles: cached?.vehicles || [], fetchedAt: cached?.fetchedAt || null, stale: true };
      settingsAt = 0;
    } finally { nextPoll = now() + TTL; }
  }
  return async function get() {
    if (!pending && now() >= nextPoll) pending = refresh().finally(() => { pending = null; });
    if (pending) await pending;
    const time = now();
    return { route: 'F', source: 'SFMTA / Umo IQ', ...cached,
      vehicles: (cached?.vehicles || []).filter(v => time - v.reportedAt <= MAX_AGE * 1000),
      serverTime: time, refreshSeconds: TTL / 1000 };
  };
}
