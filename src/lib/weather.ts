/** Heat-stress and rain alert logic. Pure functions; the fetch lives in services/weather.ts. */
export interface WeatherNow { tempC: number; humidity: number; precipMm?: number }
export interface WeatherForecast {
  maxTempC: number;
  /** 0-100, highest probability in the next 24h */
  rainProbPct: number;
  rainMm: number;
}

/** Temperature-Humidity Index used for dairy cattle (NRC 1971 form). */
export function thi(tempC: number, humidityPct: number): number {
  const f = 1.8 * tempC + 32;
  return f - (0.55 - 0.0055 * humidityPct) * (f - 58);
}

export type Severity = 'ok' | 'watch' | 'warning' | 'danger';

export function cattleStress(tempC: number, humidityPct: number): { thi: number; level: Severity } {
  const v = Math.round(thi(tempC, humidityPct) * 10) / 10;
  // 72 comfort limit, 72-78 mild, 79-88 moderate, 89+ severe (Armstrong 1994)
  const level: Severity = v < 72 ? 'ok' : v < 79 ? 'watch' : v < 89 ? 'warning' : 'danger';
  return { thi: v, level };
}

export function poultryStress(tempC: number, humidityPct: number): Severity {
  // Heat index flavour: humid heat is worse. Layers/broilers suffer above ~30-32C.
  const eff = tempC + (humidityPct > 70 ? 2 : 0);
  if (eff < 28) return 'ok';
  if (eff < 32) return 'watch';
  if (eff < 35) return 'warning';
  return 'danger';
}

export interface WeatherAlert { id: string; severity: Severity; message: string; tips: string[] }

export function buildAlerts(now: WeatherNow, fc: WeatherForecast, hasCattle: boolean, hasPoultry: boolean, hasSmall: boolean): WeatherAlert[] {
  const out: WeatherAlert[] = [];
  const peakT = Math.max(now.tempC, fc.maxTempC);
  if (hasCattle || hasSmall) {
    const c = cattleStress(peakT, Math.max(now.humidity, 40));
    if (c.level !== 'ok') {
      out.push({
        id: 'cattle-heat',
        severity: c.level,
        message: `Heat stress for cattle (THI ${c.thi})`,
        tips: [
          'Give cool clean water all day',
          'Keep animals in shade, wet floor or use fans in the afternoon',
          'Feed more at night and early morning',
          'Milk yield can drop, this is normal in heat',
        ],
      });
    }
  }
  if (hasPoultry) {
    const p = poultryStress(peakT, now.humidity);
    if (p !== 'ok') {
      out.push({
        id: 'poultry-heat',
        severity: p,
        message: `Heat stress for poultry (${Math.round(peakT)}°C)`,
        tips: [
          'Add electrolytes / vitamin C to drinking water',
          'Open curtains, wet the roof, give more water points',
          'Avoid handling birds in the afternoon',
        ],
      });
    }
  }
  if (fc.rainProbPct >= 60 || fc.rainMm >= 5) {
    out.push({
      id: 'rain',
      severity: fc.rainMm >= 20 || fc.rainProbPct >= 85 ? 'warning' : 'watch',
      message: `Rain expected (${Math.round(fc.rainProbPct)}% chance, ${fc.rainMm.toFixed(1)} mm)`,
      tips: [
        'Cover straw, hay and feed stock',
        'Bring grazing animals to shed before rain',
        'Check shed roof and drainage',
      ],
    });
  }
  if (peakT <= 12) {
    out.push({
      id: 'cold', severity: 'watch', message: `Cold weather (${Math.round(peakT)}°C)`,
      tips: ['Keep calves, kids and chicks warm', 'Avoid cold water for newborns'],
    });
  }
  return out;
}

export const SEVERITY_RANK: Record<Severity, number> = { ok: 0, watch: 1, warning: 2, danger: 3 };
