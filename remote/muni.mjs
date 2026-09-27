import { readFileSync } from 'node:fs';

export const STOPS = JSON.parse(readFileSync(new URL('./muni-stops.json', import.meta.url))).stops;
const CONFIG = 'https://www.sfmta.com/find-a-stop';
const BASE = 'https://webservices.umoiq.com/api/pub/v1/agencies/sfmta-cis';
const TTL = 15_000;
const numeric = n => n !== null && n !== '' && Number.isFinite(Number(n));

// Match the boarding platform, including replacement and Owl buses. Use the
// upstream clock so a skewed Pi clock cannot alter the predicted wait.
export function normalizePredictions(rows, stopId, now) {
  if (!Array.isArray(rows)) throw Error('Invalid prediction feed');
  const services = new Map();
  for (const row of rows) {
    if (String(row?.stop?.code) !== stopId) throw Error('Wrong boarding platform');
    if (!Array.isArray(row.values)) throw Error('Invalid predictions');
    const route = String(row.route?.id || '');
    if (!/^[A-Z0-9]{1,12}$/.test(route) || row.route.hidden === true) continue;
    for (const value of row.values) {
      const destination = String(value.direction?.destinationName || value.direction?.name || '').trim().replaceAll('`', "'");
      if (!destination || !numeric(value.minutes) || Number(value.minutes) < 0) continue;
      let wait = Number(value.minutes) * 60_000;
      if (value.timestamp != null) {
        if (!numeric(value.timestamp) || !numeric(row.serverTimestamp)) continue;
        wait = Number(value.timestamp) - Number(row.serverTimestamp);
      }
      if (wait < 0 || wait > 6 * 60 * 60_000) continue;
      const key = `${route}:${destination}`;
      if (!services.has(key)) services.set(key, { route, destination: destination.slice(0,100), arrivals: [], ids: {} });
      const arrival = now + wait, arrivals = services.get(key).arrivals;
      if (!arrivals.some(a => Math.abs(a - arrival) < 1000)) {
        arrivals.push(arrival);
        services.get(key).ids[arrival] = `${value.tripId || ''}:${value.vehicleId || ''}`.replace(/^:$/, `time:${value.timestamp || arrival}`);
      }
    }
  }
  return [...services.values()].map(s => ({ ...s, arrivals: s.arrivals.sort((a,b) => a-b).slice(0,3) }))
    .sort((a,b) => a.arrivals[0]-b.arrivals[0]);
}

export function createMuniFeed({ fetchImpl = fetch, now = Date.now } = {}) {
  let settings, settingsAt = 0, nextPoll = 0, pending;
  const cached = new Map();
  async function request(url, json = true) {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { Accept: json ? 'application/json' : 'text/html' } });
    if (!r.ok) throw Error('Feed unavailable');
    return json ? r.json() : r.text();
  }
  async function refresh() {
    try {
      if (!settings || now() - settingsAt > 6 * 60 * 60_000) {
        const html = await request(CONFIG, false);
        const text = html.match(/<script\b[^>]*data-drupal-selector="drupal-settings-json"[^>]*>([\s\S]*?)<\/script>/)?.[1];
        const candidate = JSON.parse(text || '{}').umo;
        if (!candidate?.key || candidate.base !== BASE) throw Error('Invalid public feed configuration');
        settings = candidate; settingsAt = now();
      }
      await Promise.all(STOPS.map(async stop => {
        try {
          const url = new URL(`${BASE}/stopcodes/${stop.id}/predictions`);
          url.searchParams.set('key', settings.key);
          const rows = await request(url);
          cached.set(stop.id, { services: normalizePredictions(rows, stop.id, now()), fetchedAt: now(), stale: false });
        } catch {
          // Suppress old countdowns immediately; one failed stop must not hide its neighbors.
          cached.set(stop.id, { services: [], fetchedAt: cached.get(stop.id)?.fetchedAt ?? null, stale: true });
        }
      }));
    } catch {
      settings = null;
      for (const stop of STOPS) cached.set(stop.id, { services: [], fetchedAt: cached.get(stop.id)?.fetchedAt ?? null, stale: true });
    } finally { nextPoll = now() + TTL; }
  }
  return async function get() {
    if (!pending && now() >= nextPoll) pending = refresh().finally(() => { pending = null; });
    if (pending) await pending;
    const time = now();
    return { source: 'SFMTA / Umo IQ', serverTime: time, refreshSeconds: TTL / 1000,
      stops: STOPS.map(stop => {
        const state = cached.get(stop.id);
        const stale = !state || state.stale || time - state.fetchedAt > 45_000;
        return { ...stop, fetchedAt: state?.fetchedAt ?? null, stale,
          services: stale ? [] : state.services.map(s => ({ ...s, arrivals: s.arrivals.filter(a => a >= time) })).filter(s => s.arrivals.length) };
      }) };
  };
}
