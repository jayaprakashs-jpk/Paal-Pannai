import { first, insert, list, Row } from '../db/repo';
import { round2, toNum } from '../lib/money';

export interface AddonItem { product: string; name: string; qty: number; unit: string; price: number }

export const DEFAULT_ADDONS = [
  { product: 'curd', name: 'Curd', unit: 'cup', price: 0 },
  { product: 'ghee', name: 'Ghee', unit: '100 g', price: 0 },
  { product: 'eggs', name: 'Country eggs', unit: 'dozen', price: 0 },
  { product: 'chicken', name: 'Country chicken', unit: 'kg', price: 0 },
];

export function orderItems(sub: Row): { items: any[]; amount: number } {
  const items: any[] = [{ product: 'milk', name: 'Milk', qty: sub.litres, unit: 'L', price: sub.price_per_litre ?? 0 }];
  const add: AddonItem[] = Array.isArray(sub.addons) ? sub.addons : [];
  for (const a of add) if (a.qty > 0) items.push({ product: a.product, name: a.name, qty: a.qty, unit: a.unit, price: a.price });
  const amount = round2(items.reduce((s, i) => s + toNum(i.qty) * toNum(i.price), 0));
  return { items, amount };
}

/** Creates today's order for every active subscription that does not have one yet. */
export async function generateOrders(date: string): Promise<number> {
  const subs = await list('delivery_subscriptions', {
    where: `status = 'active' AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)`, params: [date, date],
  });
  let n = 0;
  for (const s of subs) {
    const exists = await first('delivery_orders', { where: 'subscription_id = ? AND date = ?', params: [s.id, date] });
    if (exists) continue;
    const { items, amount } = orderItems(s);
    await insert('delivery_orders', { subscription_id: s.id, date, slot: s.slot, items, amount, status: 'scheduled' });
    n++;
  }
  return n;
}

export const mapsLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

export const itemsText = (items: any[]) => (items ?? []).map(i => `${i.name ?? i.product} ${i.qty}${i.unit ?? ''}`).join(', ');
