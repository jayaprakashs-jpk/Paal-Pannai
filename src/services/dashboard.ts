import { raw, Row } from '../db/repo';
import { today, addDays, firstDayOfMonth, lastDayOfMonth, daysBetween, fmtDate, isoToLocalDate } from '../lib/dates';
import { profileFor } from '../lib/breeding';
import { summarize } from '../lib/finance';
import { dueAmount } from '../lib/billing';
import { cachedWeather } from './weather';
import { buildAlerts } from '../lib/weather';

export interface AlertItem {
  id: string;
  icon: string;
  tone: 'warn' | 'danger' | 'info' | 'ok';
  title: string;
  subtitle: string;
  href?: string;
}

type T = (s: string, v?: Record<string, string | number>) => string;

export interface HomeData {
  todayLitres: number;
  todayIncome: number;
  monthNet: number;
  animalCount: number;
  alerts: AlertItem[];
}

export async function loadHome(t: T): Promise<HomeData> {
  const d = today();
  const m0 = firstDayOfMonth(d);
  const m1 = lastDayOfMonth(d);

  const tm = await raw<{ l: number | null; a: number | null }>(
    `SELECT SUM(litres) AS l, SUM(CASE WHEN sold = 1 THEN amount ELSE 0 END) AS a
       FROM milk_entries WHERE date = ? AND deleted_at IS NULL`, [d]);
  const milk = await raw<Row>(`SELECT date, amount, sold FROM milk_entries WHERE date BETWEEN ? AND ? AND deleted_at IS NULL`, [m0, m1]);
  const inc = await raw<Row>(`SELECT date, kind, amount FROM incomes WHERE date BETWEEN ? AND ? AND deleted_at IS NULL`, [m0, m1]);
  const exp = await raw<Row>(`SELECT date, category, amount FROM expenses WHERE date BETWEEN ? AND ? AND deleted_at IS NULL`, [m0, m1]);
  const s = summarize({ from: m0, to: m1 }, milk as any, inc as any, exp as any, []);
  const ac = await raw<{ c: number }>(`SELECT COUNT(*) AS c FROM animals WHERE status = 'active' AND deleted_at IS NULL`);

  const alerts: AlertItem[] = [];

  // Vaccination / deworming due (overdue up to 30 days, or due within 7 days)
  const due = await raw<Row>(
    `SELECT h.id, h.title, h.next_due_date, a.nickname, a.id AS aid FROM health_records h
       JOIN animals a ON a.id = h.animal_id AND a.deleted_at IS NULL AND a.status = 'active'
      WHERE h.deleted_at IS NULL AND h.next_due_date IS NOT NULL AND h.kind != 'mortality'
        AND h.next_due_date BETWEEN ? AND ? ORDER BY h.next_due_date LIMIT 8`, [addDays(d, -30), addDays(d, 7)]);
  for (const r of due) {
    const late = r.next_due_date < d;
    alerts.push({
      id: `h${r.id}`, icon: 'needle', tone: late ? 'danger' : 'warn',
      title: `${r.title}: ${r.nickname}`,
      subtitle: late ? t('Overdue since {date}', { date: fmtDate(r.next_due_date) }) : t('Due {date}', { date: fmtDate(r.next_due_date) }),
      href: `/animal/${r.aid}`,
    });
  }

  // Breeding: expected heat soon, pregnancy check due, delivery soon
  const ev = await raw<Row>(
    `SELECT b.*, a.nickname, a.species FROM breeding_events b
       JOIN animals a ON a.id = b.animal_id AND a.deleted_at IS NULL AND a.status = 'active'
      WHERE b.deleted_at IS NULL AND b.status IN ('pending','confirmed','failed')`);
  for (const e of ev) {
    const sd = isoToLocalDate(e.done_at);
    const p = profileFor(e.species);
    if (e.status === 'pending' && p) {
      const checkDay = addDays(sd, p.confirmDays);
      if (checkDay <= addDays(d, 3) && checkDay >= addDays(d, -20)) {
        alerts.push({ id: `c${e.id}`, icon: 'stethoscope', tone: 'warn', title: t('Pregnancy check: {name}', { name: e.nickname }),
          subtitle: t('Ask vet to confirm. Service was {date}', { date: fmtDate(sd) }), href: `/breeding/check?id=${e.id}` });
      }
    }
    if ((e.status === 'pending' || e.status === 'failed') && e.expected_heat_date) {
      const diff = daysBetween(d, e.expected_heat_date);
      if (diff >= -2 && diff <= 3) {
        alerts.push({ id: `e${e.id}`, icon: 'heart-pulse', tone: diff <= 0 ? 'danger' : 'warn',
          title: t('Heat expected: {name}', { name: e.nickname }),
          subtitle: diff === 0 ? t('Today') : diff < 0 ? t('{n} days ago', { n: -diff }) : t('In {n} days', { n: diff }),
          href: '/breeding' });
      }
    }
    if (e.status === 'confirmed' && e.expected_delivery_date) {
      const diff = daysBetween(d, e.expected_delivery_date);
      if (diff >= -3 && diff <= 14) {
        alerts.push({ id: `d${e.id}`, icon: 'baby-carriage', tone: 'info', title: t('Delivery soon: {name}', { name: e.nickname }),
          subtitle: t('Expected {date}', { date: fmtDate(e.expected_delivery_date) }), href: '/breeding' });
      }
    }
  }

  // Unpaid bills + open queries
  const bills = await raw<Row>(`SELECT total, paid_amount, period_end FROM bills WHERE deleted_at IS NULL AND status != 'paid'`);
  const overdue = bills.filter(b => b.period_end < d && dueAmount(b.total, b.paid_amount) > 0);
  if (overdue.length) {
    const sum = overdue.reduce((a, b) => a + dueAmount(b.total, b.paid_amount), 0);
    alerts.push({ id: 'bills', icon: 'cash-clock', tone: 'warn', title: t('{n} unpaid bills', { n: overdue.length }),
      subtitle: t('Pending amount: ₹{amt}', { amt: Math.round(sum) }), href: '/billing' });
  }
  const q = await raw<{ c: number }>(`SELECT COUNT(*) AS c FROM payment_queries WHERE deleted_at IS NULL AND status IN ('open','in_progress')`);
  if (q[0]?.c) alerts.push({ id: 'q', icon: 'help-circle', tone: 'warn', title: t('{n} missing amount queries open', { n: q[0].c }), subtitle: t('Tap to follow up'), href: '/billing/queries' });

  // Weather (cached, no network call here)
  try {
    const w = await cachedWeather();
    if (w && Date.now() - Date.parse(w.fetchedAt) < 6 * 3600 * 1000) {
      const sp = await raw<{ species: string }>(`SELECT DISTINCT species FROM animals WHERE status='active' AND deleted_at IS NULL`);
      const set = new Set(sp.map(x => x.species));
      const wa = buildAlerts(w.now, w.forecast,
        set.has('cow') || set.has('buffalo'), set.has('poultry'), set.has('goat') || set.has('sheep'));
      for (const a of wa.filter(x => x.severity !== 'watch').slice(0, 2)) {
        alerts.push({ id: `w${a.id}`, icon: a.id === 'rain' ? 'weather-pouring' : 'thermometer-alert', tone: a.severity === 'danger' ? 'danger' : 'warn',
          title: t(a.message.replace(/\(.*\)/, '').trim()), subtitle: t(a.tips[0]), href: '/weather' });
      }
    }
  } catch { /* weather is optional */ }

  return {
    todayLitres: Math.round((tm[0]?.l ?? 0) * 10) / 10,
    todayIncome: tm[0]?.a ?? 0,
    monthNet: s.net,
    animalCount: ac[0]?.c ?? 0,
    alerts,
  };
}
