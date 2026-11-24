/** Money helpers. All sums go through integer paise to avoid 0.1+0.2 style drift on bills. */
export const toPaise = (rupees: number): number => Math.round((Number(rupees) || 0) * 100);
export const fromPaise = (paise: number): number => paise / 100;
export const round2 = (n: number): number => fromPaise(toPaise(n));

export function sumMoney(values: Array<number | null | undefined>): number {
  let p = 0;
  for (const v of values) p += toPaise(v || 0);
  return fromPaise(p);
}

/** Indian digit grouping: 1234567.5 -> 12,34,567.50 */
export function formatINR(n: number, decimals = 2): string {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  let out = int;
  if (int.length > 3) {
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    out = `${rest},${last3}`;
  }
  return `${neg ? '-' : ''}₹${out}${frac ? '.' + frac : ''}`;
}

export function toNum(v: any, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}
