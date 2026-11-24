/** Local-date helpers. Never use toISOString().slice(0,10) for "today": it is UTC and
 *  gives the wrong day for farmers in India between midnight and 5:30 am (milking time!). */
export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function toISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export const today = (): string => toISODate(new Date());

/** Parses YYYY-MM-DD as LOCAL midnight (new Date('YYYY-MM-DD') would be UTC). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (b - a). Uses UTC math to be DST-proof. */
export function daysBetween(a: string, b: string): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function lastDayOfMonth(iso: string): string {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function firstDayOfMonth(iso: string): string {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function isoToLocalDate(ts: string): string {
  return toISODate(new Date(ts));
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '-';
  const d = iso.length > 10 ? new Date(iso) : parseISODate(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function fmtDateTime(ts?: string | null): string {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${fmtDate(ts)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function ageText(dobISO?: string | null, nowISO: string = today()): string {
  if (!dobISO) return '-';
  const days = daysBetween(dobISO, nowISO);
  if (days < 0) return '-';
  if (days < 31) return `${days}d`;
  const a = parseISODate(dobISO);
  const b = parseISODate(nowISO);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1; // calendar months, not days/30
  if (months < 24) return `${months}m`;
  const y = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${y}y ${rem}m` : `${y}y`;
}
