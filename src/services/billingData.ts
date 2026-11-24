import { raw, Row, insert, update, list } from '../db/repo';
import { Cycle, BillLine, periodFor, totalsFor, billStatus, billNumber } from '../lib/billing';
import { toNum } from '../lib/money';

export interface BillPreview {
  lines: BillLine[];
  unpriced: number;
  totals: ReturnType<typeof totalsFor>;
}

/** Everything the buyer owes for the period: sold milk entries + delivered home-delivery orders. */
export async function previewBill(partyId: string, start: string, end: string, deductions = 0): Promise<BillPreview> {
  const milk = await raw<Row>(
    `SELECT date, session, litres, fat, snf, rate_per_litre, amount FROM milk_entries
      WHERE buyer_id = ? AND sold = 1 AND deleted_at IS NULL AND date BETWEEN ? AND ?
      ORDER BY date, CASE session WHEN 'morning' THEN 0 ELSE 1 END`, [partyId, start, end]);
  const lines: BillLine[] = [];
  let unpriced = 0;
  for (const m of milk) {
    if (m.amount == null) { unpriced++; continue; }
    lines.push({ date: m.date, session: m.session, litres: m.litres, fat: m.fat, snf: m.snf, rate: m.rate_per_litre ?? 0, amount: m.amount });
  }
  const del = await raw<Row>(
    `SELECT o.date, o.slot, o.items, o.amount FROM delivery_orders o
       JOIN delivery_subscriptions s ON s.id = o.subscription_id AND s.deleted_at IS NULL
      WHERE s.customer_id = ? AND o.status = 'delivered' AND o.deleted_at IS NULL AND o.date BETWEEN ? AND ? ORDER BY o.date`,
    [partyId, start, end]);
  for (const o of del) {
    let items: any[] = [];
    try { items = o.items ? JSON.parse(o.items) : []; } catch { /* ignore */ }
    const milkL = items.filter(i => i.product === 'milk').reduce((s, i) => s + toNum(i.qty), 0);
    lines.push({
      date: o.date, session: o.slot, litres: milkL, fat: null, snf: null,
      rate: milkL ? (o.amount ?? 0) / milkL : 0, amount: o.amount ?? 0,
      label: items.map(i => `${i.product} ${i.qty}`).join(', '),
    });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  return { lines, unpriced, totals: totalsFor(lines, deductions) };
}

export async function nextBillSeq(): Promise<number> {
  const r = await raw<{ c: number }>(`SELECT COUNT(*) AS c FROM bills`);
  return (r[0]?.c ?? 0) + 1;
}

export async function createBill(partyId: string, cycle: Cycle, anchor: string, deductions = 0): Promise<Row> {
  const p = periodFor(cycle, anchor);
  const pv = await previewBill(partyId, p.start, p.end, deductions);
  return insert('bills', {
    bill_no: billNumber(await nextBillSeq(), p.start), party_id: partyId, cycle, period_start: p.start, period_end: p.end,
    items: pv.lines, total_litres: pv.totals.totalLitres, subtotal: pv.totals.subtotal, deductions: pv.totals.deductions,
    total: pv.totals.total, paid_amount: 0, status: 'unpaid',
  });
}

/** Re-reads entries into an existing bill (e.g. a late entry was added) and fixes status against payments. */
export async function refreshBill(billId: string): Promise<Row | null> {
  const b = (await list('bills', { where: 'id = ?', params: [billId] }))[0];
  if (!b) return null;
  const pv = await previewBill(b.party_id, b.period_start, b.period_end, b.deductions ?? 0);
  return update('bills', billId, {
    items: pv.lines, total_litres: pv.totals.totalLitres, subtotal: pv.totals.subtotal, total: pv.totals.total,
    status: billStatus(pv.totals.total, b.paid_amount ?? 0),
  });
}

/** Sum of payments linked to the bill; the bill's paid_amount is always derived from payments. */
export async function recomputePaid(billId: string): Promise<Row | null> {
  const bill = (await list('bills', { where: 'id = ?', params: [billId] }))[0];
  if (!bill) return null;
  const s = await raw<{ s: number | null }>(`SELECT SUM(amount) AS s FROM payments WHERE bill_id = ? AND deleted_at IS NULL`, [billId]);
  const paid = Math.round((s[0]?.s ?? 0) * 100) / 100;
  return update('bills', billId, { paid_amount: paid, status: billStatus(bill.total, paid) });
}
