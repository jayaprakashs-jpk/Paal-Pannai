import { kvGet, kvSet } from '../db/client';
import { WeatherForecast, WeatherNow } from '../lib/weather';

/** Open-Meteo: free, no API key. Cached so the last reading shows offline. */
export interface WeatherData {
  fetchedAt: string;
  lat: number;
  lng: number;
  now: WeatherNow & { apparentC: number };
  forecast: WeatherForecast;
  days: { date: string; maxC: number; minC: number; rainMm: number; rainProb: number }[];
}

const CACHE_KEY = 'weather.cache';

export async function fetchWeather(lat: number, lng: number): Promise<WeatherData> {
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lng),
    current: 'temperature_2m,relative_humidity_2m,precipitation,apparent_temperature',
    hourly: 'temperature_2m,precipitation_probability,precipitation',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
    forecast_days: '3', timezone: 'auto',
  });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q.toString()}`, { signal: ctl.signal });
    if (!res.ok) throw new Error(`Weather service error ${res.status}`);
    const j = await res.json();
    const cur = j.current;
    const hourTimes: string[] = j.hourly.time;
    // current.time looks like 2026-11-24T14:15 ; hourly like 2026-11-24T14:00
    const curHour = String(cur.time).slice(0, 13);
    let i0 = hourTimes.findIndex(t => t.startsWith(curHour));
    if (i0 < 0) i0 = 0;
    const slice = <T,>(a: T[]) => a.slice(i0, i0 + 24);
    const temps = slice<number>(j.hourly.temperature_2m).filter(v => v != null);
    const probs = slice<number>(j.hourly.precipitation_probability).filter(v => v != null);
    const rain = slice<number>(j.hourly.precipitation).filter(v => v != null);
    const data: WeatherData = {
      fetchedAt: new Date().toISOString(), lat, lng,
      now: {
        tempC: cur.temperature_2m, humidity: cur.relative_humidity_2m,
        precipMm: cur.precipitation, apparentC: cur.apparent_temperature,
      },
      forecast: {
        maxTempC: temps.length ? Math.max(...temps) : cur.temperature_2m,
        rainProbPct: probs.length ? Math.max(...probs) : 0,
        rainMm: rain.reduce((s, v) => s + v, 0),
      },
      days: (j.daily.time as string[]).map((d, i) => ({
        date: d,
        maxC: j.daily.temperature_2m_max[i], minC: j.daily.temperature_2m_min[i],
        rainMm: j.daily.precipitation_sum[i], rainProb: j.daily.precipitation_probability_max[i] ?? 0,
      })),
    };
    await kvSet(CACHE_KEY, JSON.stringify(data));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function cachedWeather(): Promise<WeatherData | null> {
  const raw = await kvGet(CACHE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as WeatherData; } catch { return null; }
}
