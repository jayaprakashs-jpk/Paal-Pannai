/**
 * Body weight from tape measurements (a farmer's tape, no scale needed).
 * Schaeffer / heart-girth formula: kg = girth² × body length / K  (all cm).
 *   Cattle & buffalo K = 10838 (Schaeffer 300 lb-in converted to cm/kg)
 *   Goat & sheep   K = 11880 (common field variant)
 * If body length is not measured we approximate it from withers height.
 * This is an ESTIMATE (typically within 5-10% for adults). A scale beats it.
 */
export interface WeightInput {
  species: string;
  girthCm?: number | null;
  bodyLengthCm?: number | null;
  heightCm?: number | null;
}

export interface WeightEstimate {
  kg: number;
  method: 'girth-length' | 'girth-height';
}

export const inToCm = (i: number) => i * 2.54;
export const cmToIn = (c: number) => c / 2.54;
export const kgToLb = (k: number) => k * 2.2046226;

const K: Record<string, number> = { cow: 10838, buffalo: 10838, goat: 11880, sheep: 11880 };
/** body length ≈ 1.07 × withers height for adult cattle; ≈ 1.0 for goats/sheep */
const LEN_FROM_HEIGHT: Record<string, number> = { cow: 1.07, buffalo: 1.07, goat: 1.0, sheep: 1.0 };

export function estimateWeightKg(i: WeightInput): WeightEstimate | null {
  const k = K[i.species];
  if (!k) return null;
  const g = Number(i.girthCm);
  if (!(g > 20)) return null;
  let len = Number(i.bodyLengthCm);
  let method: WeightEstimate['method'] = 'girth-length';
  if (!(len > 20)) {
    const h = Number(i.heightCm);
    if (!(h > 20)) return null;
    len = h * LEN_FROM_HEIGHT[i.species];
    method = 'girth-height';
  }
  const kg = (g * g * len) / k;
  return { kg: Math.round(kg * 10) / 10, method };
}

/** Average daily gain in kg/day between first and last weigh-in. */
export function averageDailyGain(logs: { date: string; weight_kg: number }[]): number | null {
  if (logs.length < 2) return null;
  const s = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const a = s[0];
  const b = s[s.length - 1];
  const days = (Date.parse(b.date) - Date.parse(a.date)) / 86400000;
  if (days <= 0) return null;
  return Math.round(((b.weight_kg - a.weight_kg) / days) * 1000) / 1000;
}
