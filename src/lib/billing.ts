import { addDays, firstDayOfMonth, lastDayOfMonth, parseISODate, toISODate, pad2 } from './dates';
import { fromPaise, toPaise } from './money';

export type Cycle = 'daily' | 'weekly' | 'ten_day' | 'fifteen_day' | 'monthly';

export interface Period { start: string; end: string }

/** The billing period (inclusive) that contains `anchor`. */
export function periodFor(cycle: Cycle, anchor: string): Period {
  const d = parseISODate(anchor);
  switch (cycle) {
    case 'daily':
      return { start: anchor, end: anchor };
    case 'weekly': {
      const dow = (d.getDay() + 6) % 7; // Monday = 0
      const start = addDays(anchor, -dow);
      return { start, end: addDays(start, 6) };
    }
    case 'ten_day': {
      const day = d.getDate();
      const ym = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      if (day <= 10) return { start: `${ym}-01`, end: `${ym}-10` };
      if (day <= 20) return { start: `${ym}-11`, end: `${ym}-20` };
      return { start: `${ym}-21`, end: lastDayOfMonth(anchor) };
    }
    case 'fifteen_day': {
      const ym = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      return d.getDate() <= 15
        ? { start: `${ym}-01`, end: `${ym}-15` }
        : { start: `${ym}-16`, end: lastDayOfMonth(anchor) };
    }
    case 'monthly':
      return { start: firstDayOfMonth(anchor), end: lastDayOfMonth(anchor) };
  }
}

export function previousPeriod(cycle: Cycle, p: Period): Period {
  return periodFor(cycle, addDays(p.start, -1));
}

export interface BillLine {
  date: string;
  session: string;
  litres: number;
  fat: number | null;
  snf: number | null;
  rate: number;
  amount: number;
  label?: string;
}

export interface BillTotals {
  totalLitres: number;
  subtotal: number;
  deductions: number;
  total: number;
}

export function totalsFor(lines: { litres: number; amount: number }[], deductions = 0): BillTotals {
  let litres = 0;
  let paise = 0;
  for (const l of lines) {
    litres += l.litres || 0;
    paise += toPaise(l.amount || 0);
  }
  const ded = toPaise(deductions);
  return {
    totalLitres: Math.round(litres * 100) / 100,
    subtotal: fromPaise(paise),
    deductions: fromPaise(ded),
    total: fromPaise(paise - ded),
  };
}

export function billStatus(total: number, paid: number): 'unpaid' | 'part_paid' | 'paid' {
  const t = toPaise(total);
  const p = toPaise(paid);
  if (p <= 0) return 'unpaid';
  if (p >= t) return 'paid';
  return 'part_paid';
}

export const dueAmount = (total: number, paid: number): number =>
  Math.max(0, fromPaise(toPaise(total) - toPaise(paid)));

export function billNumber(seq: number, anchor: string): string {
  const d = parseISODate(anchor);
  return `NP-${d.getFullYear()}${pad2(d.getMonth() + 1)}-${String(seq).padStart(4, '0')}`;
}

/** UPI deep link / QR payload. Amount is optional. */
export function upiUri(vpa: string, name: string, amount?: number, note?: string): string {
  const q = [`pa=${encodeURIComponent(vpa)}`, `pn=${encodeURIComponent(name)}`, 'cu=INR'];
  if (amount && amount > 0) q.push(`am=${amount.toFixed(2)}`);
  if (note) q.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${q.join('&')}`;
}

export const todayPeriodLabel = (p: Period) => (p.start === p.end ? p.start : `${p.start} → ${p.end}`);
export { toISODate };
