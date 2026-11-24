import { round2, toNum } from './money';

export type RateType = 'flat' | 'fat_snf';

export interface RateConfig {
  rate_type: RateType | string;
  base_rate: number;
  std_fat?: number | null;
  std_snf?: number | null;
  /** ₹ per litre for every 1.0 percentage point of fat above/below standard */
  fat_rate?: number | null;
  /** ₹ per litre for every 1.0 percentage point of SNF above/below standard */
  snf_rate?: number | null;
  min_rate?: number | null;
  bonus_per_litre?: number | null;
}

export interface RateRow extends RateConfig {
  id?: string;
  buyer_id: string;
  effective_date: string;
  milk_type?: string | null;
}

/** Rate per litre including the buyer's per-litre bonus. */
export function ratePerLitre(cfg: RateConfig, fat?: number | null, snf?: number | null): number {
  let rate = toNum(cfg.base_rate);
  if (cfg.rate_type === 'fat_snf') {
    const stdFat = toNum(cfg.std_fat, 3.5);
    const stdSnf = toNum(cfg.std_snf, 8.5);
    if (fat != null && Number.isFinite(fat)) rate += (fat - stdFat) * toNum(cfg.fat_rate);
    if (snf != null && Number.isFinite(snf)) rate += (snf - stdSnf) * toNum(cfg.snf_rate);
    const min = toNum(cfg.min_rate);
    if (rate < min) rate = min;
  }
  if (rate < 0) rate = 0;
  return round2(rate + toNum(cfg.bonus_per_litre));
}

export function milkAmount(litres: number, rate: number): number {
  return round2(toNum(litres) * toNum(rate));
}

/** The rate card in force on `date` for this buyer (latest effective_date <= date). */
export function pickRate(rates: RateRow[], buyerId: string, date: string, milkType?: string | null): RateRow | null {
  const mine = rates
    .filter(r => r.buyer_id === buyerId && r.effective_date <= date)
    .filter(r => !milkType || !r.milk_type || r.milk_type === 'any' || r.milk_type === milkType)
    .sort((a, b) => {
      if (a.effective_date !== b.effective_date) return b.effective_date.localeCompare(a.effective_date);
      // same day: a specific milk type beats 'any'
      const sa = a.milk_type && a.milk_type !== 'any' ? 1 : 0;
      const sb = b.milk_type && b.milk_type !== 'any' ? 1 : 0;
      return sb - sa;
    });
  return mine[0] ?? null;
}

export interface BuyerLite { id: string; name: string; kind: string; org?: string | null }

export interface CompareRow {
  buyer: BuyerLite;
  rate: RateRow;
  perLitre: number;
  monthlyEstimate: number;
  diffFromBest: number;       // ₹/litre, 0 for the best
  isBest: boolean;
}

/** Ranks buyers by effective ₹/litre for the given fat/SNF. */
export function compareBuyers(
  buyers: BuyerLite[], rates: RateRow[], date: string, fat: number | null, snf: number | null,
  litresPerDay: number, milkType?: string | null,
): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const b of buyers) {
    const rate = pickRate(rates, b.id, date, milkType);
    if (!rate) continue;
    const perLitre = ratePerLitre(rate, fat, snf);
    rows.push({
      buyer: b, rate, perLitre,
      monthlyEstimate: round2(perLitre * litresPerDay * 30),
      diffFromBest: 0, isBest: false,
    });
  }
  rows.sort((a, b) => b.perLitre - a.perLitre);
  const best = rows[0]?.perLitre ?? 0;
  rows.forEach((r, i) => {
    r.diffFromBest = round2(best - r.perLitre);
    r.isBest = i === 0 || r.perLitre === best;
  });
  return rows;
}

export interface SocietyVsPrivate {
  society: CompareRow | null;
  privateBest: CompareRow | null;
  perLitreDiff: number;       // society - private (negative => private pays more)
  monthlyDiff: number;
  winner: 'society' | 'private' | 'tie' | null;
}

export function societyVsPrivate(rows: CompareRow[], litresPerDay: number): SocietyVsPrivate {
  const society = rows.find(r => r.buyer.kind === 'society') ?? null;
  const privateBest = rows.find(r => r.buyer.kind !== 'society') ?? null;
  if (!society || !privateBest) {
    return { society, privateBest, perLitreDiff: 0, monthlyDiff: 0, winner: null };
  }
  const diff = round2(society.perLitre - privateBest.perLitre);
  return {
    society, privateBest, perLitreDiff: diff,
    monthlyDiff: round2(diff * litresPerDay * 30),
    winner: diff > 0 ? 'society' : diff < 0 ? 'private' : 'tie',
  };
}

/** Weighted average fat/SNF of recent entries (weighted by litres). */
export function weightedQuality(entries: { litres: number; fat?: number | null; snf?: number | null }[]) {
  let lf = 0, ls = 0, wf = 0, ws = 0;
  for (const e of entries) {
    if (e.fat != null && e.litres > 0) { wf += e.fat * e.litres; lf += e.litres; }
    if (e.snf != null && e.litres > 0) { ws += e.snf * e.litres; ls += e.litres; }
  }
  return {
    fat: lf > 0 ? Math.round((wf / lf) * 100) / 100 : null,
    snf: ls > 0 ? Math.round((ws / ls) * 100) / 100 : null,
  };
}
