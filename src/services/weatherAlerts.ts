import NetInfo from '@react-native-community/netinfo';
import { getFarm, raw } from '../db/repo';
import { kvGet, kvSet } from '../db/client';
import { cachedWeather, fetchWeather, WeatherData } from './weather';
import { buildAlerts, WeatherAlert } from '../lib/weather';
import { getSettings } from '../store/settings';
import { today } from '../lib/dates';
import { validLatLng } from '../lib/geo';
import { getPosition } from './location';
import { notifyNow } from './notifications';
import { tNow } from '../i18n';

export async function speciesFlags() {
  const sp = await raw<{ species: string }>(`SELECT DISTINCT species FROM animals WHERE status='active' AND deleted_at IS NULL`);
  const set = new Set(sp.map(x => x.species));
  return { cattle: set.has('cow') || set.has('buffalo'), poultry: set.has('poultry'), small: set.has('goat') || set.has('sheep') };
}

export function alertsFor(w: WeatherData, f: { cattle: boolean; poultry: boolean; small: boolean }): WeatherAlert[] {
  // With no animals yet, still show general rain / heat guidance for cattle.
  const any = f.cattle || f.poultry || f.small;
  return buildAlerts(w.now, w.forecast, any ? f.cattle : true, f.poultry, f.small);
}

/** Fetches fresh weather if the cache is older than `maxAgeH`, and pushes a phone alert once per day per warning. */
export async function refreshWeather(opts: { force?: boolean; maxAgeH?: number } = {}): Promise<{ data: WeatherData | null; fresh: boolean; error?: string }> {
  const cached = await cachedWeather();
  const age = cached ? (Date.now() - Date.parse(cached.fetchedAt)) / 3600000 : Infinity;
  if (cached && !opts.force && age < (opts.maxAgeH ?? 3)) return { data: cached, fresh: false };
  const net = await NetInfo.fetch();
  if (!net.isConnected) return { data: cached, fresh: false, error: 'offline' };
  let lat: number | null = null, lng: number | null = null;
  const farm = await getFarm();
  if (farm && validLatLng(farm.lat, farm.lng)) { lat = farm.lat; lng = farm.lng; }
  else { const p = await getPosition(8000); if (p) { lat = p.lat; lng = p.lng; } }
  if (lat == null || lng == null) return { data: cached, fresh: false, error: 'no_location' };
  try {
    const data = await fetchWeather(lat, lng);
    if (getSettings().weatherAlerts) await notifyOncePerDay(data);
    return { data, fresh: true };
  } catch (e: any) {
    return { data: cached, fresh: false, error: String(e?.message ?? e) };
  }
}

async function notifyOncePerDay(w: WeatherData) {
  const alerts = alertsFor(w, await speciesFlags()).filter(a => a.severity === 'warning' || a.severity === 'danger');
  for (const a of alerts) {
    const key = `weather.notified.${today()}.${a.id}`;
    if (await kvGet(key)) continue;
    await kvSet(key, '1');
    await notifyNow(tNow(a.message.replace(/\(.*\)/, '').trim()), tNow(a.tips[0]));
  }
}
