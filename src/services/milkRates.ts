import { list, raw, update, Row } from '../db/repo';
import { pickRate, ratePerLitre, milkAmount, RateRow } from '../lib/milk';

export const milkTypeOf = (species?: string | null): string =>
  species === 'cow' ? 'cow' : species === 'buffalo' ? 'buffalo' : 'any';

export async function allRates(): Promise<RateRow[]> {
  return list<RateRow & Row>('buyer_rates', { orderBy: 'effective_date DESC' });
}

export interface Priced { rate: number | null; amount: number | null }

export async function priceEntry(
  buyerId: string | null | undefined, date: string, litres: number, fat: number | null, snf: number | null, milkType: string,
  rates?: RateRow[],
): Promise<Priced> {
  if (!buyerId) return { rate: null, amount: null };
  const rr = rates ?? await allRates();
  const card = pickRate(rr, buyerId, date, milkType);
  if (!card) return { rate: null, amount: null };
  const rate = ratePerLitre(card, fat, snf);
  return { rate, amount: milkAmount(litres, rate) };
}

/** After a new rate card is saved, price entries that were saved without a rate. */
export async function repriceUnpriced(buyerId: string): Promise<number> {
  const rates = await allRates();
  const rows = await raw<Row>(
    `SELECT m.*, a.species FROM milk_entries m LEFT JOIN animals a ON a.id = m.animal_id
      WHERE m.buyer_id = ? AND m.amount IS NULL AND m.deleted_at IS NULL AND m.sold = 1`, [buyerId]);
  let n = 0;
  for (const m of rows) {
    const p = await priceEntry(buyerId, m.date, m.litres, m.fat, m.snf, m.milk_type || milkTypeOf(m.species), rates);
    if (p.amount != null) { await update('milk_entries', m.id, { rate_per_litre: p.rate, amount: p.amount }); n++; }
  }
  return n;
}
