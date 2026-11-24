import { describe, it, expect } from 'vitest';
import { addDays, daysBetween, toISODate, parseISODate, lastDayOfMonth, ageText } from '../src/lib/dates';
import { sumMoney, formatINR, round2, toNum } from '../src/lib/money';
import { estimateWeightKg, averageDailyGain } from '../src/lib/weight';
import { calcFeed, avgDailyMilk } from '../src/lib/feed';
import { ratePerLitre, milkAmount, pickRate, compareBuyers, societyVsPrivate, weightedQuality, RateRow } from '../src/lib/milk';
import { bestInseminationTime, nextHeatAfterFailure, nextHeatWindow, expectedDelivery, currentPregnancy, layingRatePct, dryOffDate } from '../src/lib/breeding';
import { periodFor, previousPeriod, totalsFor, billStatus, dueAmount, upiUri, billNumber } from '../src/lib/billing';
import { summarize, perAnimalPnL } from '../src/lib/finance';
import { haversineKm, isWithinRadius, validLatLng, orderByNearest, boundingBox } from '../src/lib/geo';
import { thi, cattleStress, poultryStress, buildAlerts } from '../src/lib/weather';
import { SCHEMES, checkEligibility, relevantSchemes } from '../src/data/schemes';

describe('dates', () => {
  it('uses LOCAL date, not UTC', () => {
    // 2026-03-05 00:30 local must still be the 5th
    const d = new Date(2026, 2, 5, 0, 30);
    expect(toISODate(d)).toBe('2026-03-05');
  });
  it('adds days across month and leap year', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('daysBetween', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-03-01', '2026-02-01')).toBe(-28);
  });
  it('last day of month', () => {
    expect(lastDayOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(lastDayOfMonth('2024-02-10')).toBe('2024-02-29');
  });
  it('parse is local midnight', () => {
    const d = parseISODate('2026-06-15');
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });
  it('age', () => {
    expect(ageText('2025-01-01', '2026-01-01')).toBe('12m');
    expect(ageText('2023-01-01', '2026-01-01')).toBe('3y');
    expect(ageText('2025-12-20', '2026-01-19')).toBe('30d');
    expect(ageText('2025-11-20', '2026-01-19')).toBe('1m');
  });
});

describe('money', () => {
  it('sums without float drift', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(Array(10).fill(0.1))).toBe(1);
  });
  it('Indian grouping', () => {
    expect(formatINR(1234567.5)).toBe('₹12,34,567.50');
    expect(formatINR(999)).toBe('₹999.00');
    expect(formatINR(-1500)).toBe('-₹1,500.00');
    expect(formatINR(100000, 0)).toBe('₹1,00,000');
  });
  it('toNum handles comma decimals and junk', () => {
    expect(toNum('3,5')).toBe(3.5);
    expect(toNum('abc', 7)).toBe(7);
    expect(toNum('')).toBe(0);
  });
  it('round2', () => { expect(round2(1.005 * 100)).toBeCloseTo(100.5, 2); });
});

describe('weight', () => {
  it('Holstein-like cow ~570 kg', () => {
    const w = estimateWeightKg({ species: 'cow', girthCm: 200, bodyLengthCm: 155 })!;
    expect(w.kg).toBeGreaterThan(560);
    expect(w.kg).toBeLessThan(585);
  });
  it('falls back to height when length missing', () => {
    const w = estimateWeightKg({ species: 'cow', girthCm: 160, heightCm: 120 })!;
    expect(w.method).toBe('girth-height');
    expect(w.kg).toBeGreaterThan(280);
    expect(w.kg).toBeLessThan(330);
  });
  it('goat', () => {
    const w = estimateWeightKg({ species: 'goat', girthCm: 75, bodyLengthCm: 65 })!;
    expect(w.kg).toBeGreaterThan(28);
    expect(w.kg).toBeLessThan(35);
  });
  it('returns null for unsupported species or bad input', () => {
    expect(estimateWeightKg({ species: 'dog', girthCm: 60, heightCm: 50 })).toBeNull();
    expect(estimateWeightKg({ species: 'cow', girthCm: 0, heightCm: 100 })).toBeNull();
    expect(estimateWeightKg({ species: 'cow', girthCm: 150 })).toBeNull();
  });
  it('ADG', () => {
    expect(averageDailyGain([{ date: '2026-01-01', weight_kg: 20 }, { date: '2026-01-11', weight_kg: 25 }])).toBe(0.5);
    expect(averageDailyGain([{ date: '2026-01-01', weight_kg: 20 }])).toBeNull();
  });
});

describe('feed', () => {
  it('350 kg cow giving 10 L is in a sane range', () => {
    const r = calcFeed({ species: 'cow', category: 'milking', weightKg: 350, milkLitresPerDay: 10 });
    expect(r.concentrateKg).toBeGreaterThan(4);
    expect(r.concentrateKg).toBeLessThan(6);
    expect(r.greenKg).toBeGreaterThan(8);
    expect(r.greenKg).toBeLessThan(20);
    expect(r.dryKg).toBeGreaterThan(2);
    expect(r.maizeKg).toBeCloseTo(r.concentrateKg * 0.4, 1);
    // mix adds back up to the concentrate
    const mix = r.maizeKg + r.brankg + r.oilcakeKg + r.mineralKg + r.saltKg;
    expect(Math.abs(mix - r.concentrateKg)).toBeLessThan(0.06);
  });
  it('late pregnancy adds concentrate', () => {
    const a = calcFeed({ species: 'cow', category: 'dry', weightKg: 400, pregnancy: 'none' });
    const b = calcFeed({ species: 'cow', category: 'pregnant', weightKg: 400, pregnancy: 'late' });
    expect(b.concentrateKg - a.concentrateKg).toBeGreaterThan(1);
  });
  it('never makes concentrate more than half the dry matter', () => {
    const r = calcFeed({ species: 'cow', weightKg: 300, milkLitresPerDay: 30 });
    expect(r.concentrateKg * 0.9).toBeLessThanOrEqual(r.dryMatterKg * 0.5 + 0.01);
    expect(r.notes.map(n => n.text).join(' ')).toMatch(/capped/);
  });
  it('no green fodder means all roughage is dry', () => {
    const r = calcFeed({ species: 'cow', weightKg: 350, milkLitresPerDay: 5, greenAvailability: 'none' });
    expect(r.greenKg).toBe(0);
    expect(r.dryKg).toBeGreaterThan(3);
  });
  it('buffalo needs more concentrate per litre than cow', () => {
    const c = calcFeed({ species: 'cow', weightKg: 400, milkLitresPerDay: 8 });
    const b = calcFeed({ species: 'buffalo', weightKg: 400, milkLitresPerDay: 8 });
    expect(b.concentrateKg).toBeGreaterThan(c.concentrateKg);
  });
  it('layer flock of 100 eats ~11 kg', () => {
    const r = calcFeed({ species: 'poultry', category: 'layer', weightKg: 1.6, headCount: 100 });
    expect(r.concentrateKg).toBe(11);
    expect(r.perAnimal).toBe(false);
  });
  it('broiler feed grows with age', () => {
    const w1 = calcFeed({ species: 'poultry', category: 'broiler', weightKg: 1, headCount: 100, ageWeeks: 0 });
    const w5 = calcFeed({ species: 'poultry', category: 'broiler', weightKg: 1, headCount: 100, ageWeeks: 5 });
    expect(w5.concentrateKg).toBeGreaterThan(w1.concentrateKg * 5);
  });
  it('goat output is small and sane', () => {
    const r = calcFeed({ species: 'goat', category: 'milking', weightKg: 35, milkLitresPerDay: 1.5 });
    expect(r.concentrateKg).toBeGreaterThan(0.3);
    expect(r.concentrateKg).toBeLessThan(1.2);
  });
  it('zero weight gives a message instead of NaN', () => {
    const r = calcFeed({ species: 'cow', weightKg: 0 });
    expect(r.greenKg).toBe(0);
    expect(r.notes.length).toBe(1);
  });
  it('avgDailyMilk groups sessions by day', () => {
    const v = avgDailyMilk([
      { date: '2026-01-02', litres: 5 }, { date: '2026-01-02', litres: 4 }, { date: '2026-01-01', litres: 8 },
    ]);
    expect(v).toBe(8.5);
  });
});

describe('milk rates', () => {
  const society = { rate_type: 'fat_snf', base_rate: 34, std_fat: 3.5, std_snf: 8.5, fat_rate: 4, snf_rate: 2, min_rate: 25, bonus_per_litre: 0 };
  it('flat', () => { expect(ratePerLitre({ rate_type: 'flat', base_rate: 40 })).toBe(40); });
  it('fat/snf above and below standard', () => {
    expect(ratePerLitre(society, 4.0, 8.5)).toBe(36);          // +0.5 fat * 4
    expect(ratePerLitre(society, 3.0, 8.0)).toBe(31);          // -2 -1
  });
  it('min rate floors it', () => { expect(ratePerLitre(society, 1, 6)).toBe(25); });
  it('missing fat/snf falls back to base', () => { expect(ratePerLitre(society, null, null)).toBe(34); });
  it('bonus added after floor', () => {
    expect(ratePerLitre({ ...society, bonus_per_litre: 1.5 }, 3.5, 8.5)).toBe(35.5);
  });
  it('amount', () => { expect(milkAmount(7.5, 36.4)).toBe(273); });

  const rates: RateRow[] = [
    { buyer_id: 'a', effective_date: '2026-01-01', rate_type: 'flat', base_rate: 38 },
    { buyer_id: 'a', effective_date: '2026-02-01', rate_type: 'flat', base_rate: 40 },
    { buyer_id: 'b', effective_date: '2026-01-01', ...society },
    { buyer_id: 'c', effective_date: '2026-03-01', rate_type: 'flat', base_rate: 50 },
  ];
  it('picks the rate in force on that date', () => {
    expect(pickRate(rates, 'a', '2026-01-15')!.base_rate).toBe(38);
    expect(pickRate(rates, 'a', '2026-02-01')!.base_rate).toBe(40);
    expect(pickRate(rates, 'c', '2026-02-15')).toBeNull();
  });
  it('compare ranks and flags best + society gap', () => {
    const buyers = [
      { id: 'a', name: 'Agent Ravi', kind: 'agent' },
      { id: 'b', name: 'Aavin', kind: 'society' },
    ];
    const rows = compareBuyers(buyers, rates, '2026-02-10', 4.0, 8.5, 20);
    expect(rows[0].buyer.id).toBe('a'); // 40 vs 36
    expect(rows[0].isBest).toBe(true);
    expect(rows[1].diffFromBest).toBe(4);
    const sp = societyVsPrivate(rows, 20);
    expect(sp.winner).toBe('private');
    expect(sp.perLitreDiff).toBe(-4);
    expect(sp.monthlyDiff).toBe(-2400);
  });
  it('weighted quality ignores missing values', () => {
    const q = weightedQuality([{ litres: 10, fat: 4, snf: 8 }, { litres: 10, fat: 3, snf: null }]);
    expect(q.fat).toBe(3.5);
    expect(q.snf).toBe(8);
  });
});

describe('breeding', () => {
  it('next heat window for cow from 1 Jan', () => {
    const w = nextHeatWindow('cow', '2026-01-01')!;
    expect(w).toEqual({ start: '2026-01-19', expected: '2026-01-22', end: '2026-01-25' });
  });
  it('failed conception found late projects to the next cycle still ahead', () => {
    // served 1 Jan, scan found open on 1 Mar -> next window must be on/after 1 Mar
    const w = nextHeatAfterFailure('cow', '2026-01-01', '2026-03-01')!;
    expect(w.end >= '2026-03-01').toBe(true);
    expect(w.start <= w.expected && w.expected <= w.end).toBe(true);
    // and it is aligned to the 21-day cycle from the service date
    const k = daysBetween('2026-01-01', w.expected);
    expect(k % 21).toBe(0);
  });
  it('failure found early (day 22) gives the very next cycle', () => {
    const w = nextHeatAfterFailure('cow', '2026-01-01', '2026-01-23')!;
    expect(w.expected).toBe('2026-01-22'); // window end 25th is still ahead of the 23rd
  });
  it('gestation', () => {
    expect(expectedDelivery('cow', '2026-01-01')).toBe('2026-10-11');
    expect(expectedDelivery('goat', '2026-01-01')).toBe('2026-05-31');
    expect(expectedDelivery('poultry', '2026-01-01')).toBeNull();
  });
  it('dry-off is 60 days before calving, cattle only', () => {
    expect(dryOffDate('cow', '2026-10-11')).toBe('2026-08-12');
    expect(dryOffDate('goat', '2026-05-31')).toBeNull();
  });
  it('current pregnancy ignores failed and stale', () => {
    const ev = [
      { animal_id: 'x', done_at: new Date(2026, 0, 1, 9).toISOString(), status: 'failed' },
      { animal_id: 'x', done_at: new Date(2026, 1, 1, 9).toISOString(), status: 'confirmed' },
    ];
    const p = currentPregnancy('cow', ev, '2026-06-01')!;
    expect(p.confirmed).toBe(true);
    expect(p.info.daysPregnant).toBe(120);
    expect(p.info.stage).toBe('early');
    expect(currentPregnancy('cow', [ev[0]], '2026-06-01')).toBeNull();
    expect(currentPregnancy('cow', ev, '2028-06-01')).toBeNull();
  });
  it('AM/PM insemination rule', () => {
    const am = bestInseminationTime(new Date(2026, 5, 10, 6, 30));
    expect([am.getDate(), am.getHours()]).toEqual([10, 17]);
    const pm = bestInseminationTime(new Date(2026, 5, 10, 15, 0));
    expect([pm.getDate(), pm.getHours()]).toEqual([11, 7]);
    const late = bestInseminationTime(new Date(2026, 5, 30, 20, 0));
    expect([late.getMonth(), late.getDate(), late.getHours()]).toEqual([6, 1, 7]);
  });
  it('laying rate', () => {
    expect(layingRatePct(82, 100)).toBe(82);
    expect(layingRatePct(5, 0)).toBe(0);
  });
});

describe('billing', () => {
  it('weekly is Monday to Sunday', () => {
    // 2026-06-17 is a Wednesday
    expect(periodFor('weekly', '2026-06-17')).toEqual({ start: '2026-06-15', end: '2026-06-21' });
    expect(periodFor('weekly', '2026-06-21')).toEqual({ start: '2026-06-15', end: '2026-06-21' });
    expect(periodFor('weekly', '2026-06-22').start).toBe('2026-06-22');
  });
  it('10-day cycle with 28/31 day months', () => {
    expect(periodFor('ten_day', '2026-02-05')).toEqual({ start: '2026-02-01', end: '2026-02-10' });
    expect(periodFor('ten_day', '2026-02-25')).toEqual({ start: '2026-02-21', end: '2026-02-28' });
    expect(periodFor('ten_day', '2026-01-31')).toEqual({ start: '2026-01-21', end: '2026-01-31' });
  });
  it('15-day cycle', () => {
    expect(periodFor('fifteen_day', '2026-04-15')).toEqual({ start: '2026-04-01', end: '2026-04-15' });
    expect(periodFor('fifteen_day', '2026-04-16')).toEqual({ start: '2026-04-16', end: '2026-04-30' });
  });
  it('monthly + daily', () => {
    expect(periodFor('monthly', '2026-02-14')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodFor('daily', '2026-02-14')).toEqual({ start: '2026-02-14', end: '2026-02-14' });
  });
  it('previous period chains without gaps', () => {
    const p = periodFor('ten_day', '2026-03-12');
    expect(previousPeriod('ten_day', p)).toEqual({ start: '2026-03-01', end: '2026-03-10' });
    const m = periodFor('monthly', '2026-03-12');
    expect(previousPeriod('monthly', m)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('totals use exact paise', () => {
    const t = totalsFor([{ litres: 3.3, amount: 0.1 }, { litres: 3.3, amount: 0.2 }], 0.05);
    expect(t.subtotal).toBe(0.3);
    expect(t.total).toBe(0.25);
    expect(t.totalLitres).toBe(6.6);
  });
  it('status & due', () => {
    expect(billStatus(100, 0)).toBe('unpaid');
    expect(billStatus(100, 40)).toBe('part_paid');
    expect(billStatus(100, 100)).toBe('paid');
    expect(billStatus(100, 120)).toBe('paid');
    expect(dueAmount(100, 120)).toBe(0);
    expect(dueAmount(100.5, 40.25)).toBe(60.25);
  });
  it('upi link encodes', () => {
    expect(upiUri('ravi@upi', 'Ravi Kumar', 250, 'Milk bill')).toBe(
      'upi://pay?pa=ravi%40upi&pn=Ravi%20Kumar&cu=INR&am=250.00&tn=Milk%20bill');
  });
  it('bill number', () => { expect(billNumber(7, '2026-03-04')).toBe('NP-202603-0007'); });
});

describe('finance', () => {
  const p = { from: '2026-01-01', to: '2026-01-31' };
  it('summary ignores own-use milk and out-of-range rows', () => {
    const s = summarize(p,
      [{ date: '2026-01-02', amount: 1000, sold: true }, { date: '2026-01-02', amount: 500, sold: false }, { date: '2026-02-01', amount: 999 }],
      [{ date: '2026-01-10', kind: 'subsidy', amount: 200 }],
      [{ date: '2026-01-05', category: 'medical', amount: 300 }, { date: '2026-01-06', category: 'medical', amount: 100 }],
      [{ date: '2026-01-20', amount: 150 }]);
    expect(s.income).toBe(1200);
    expect(s.expense).toBe(400);
    expect(s.net).toBe(800);
    expect(s.savings).toBe(150);
    expect(s.cashAfterSavings).toBe(650);
    expect(s.expenseByCategory.medical).toBe(400);
  });
  it('per-animal P&L allocates shared costs by head count and conserves money', () => {
    const animals = [
      { id: 'a', nickname: 'Lakshmi', head_count: 1 },
      { id: 'b', nickname: 'Gowri', head_count: 1 },
    ];
    const milk = [{ date: '2026-01-02', amount: 900, animal_id: 'a' }, { date: '2026-01-02', amount: 300, animal_id: 'b' }];
    const exp = [
      { date: '2026-01-03', category: 'medical', amount: 100, animal_id: 'a' },
      { date: '2026-01-03', category: 'labor', amount: 200 }, // shared
    ];
    const r = perAnimalPnL(p, animals, milk, [], exp);
    const a = r.find(x => x.animal.id === 'a')!;
    const b = r.find(x => x.animal.id === 'b')!;
    expect(a.net).toBe(700);   // 900 - 100 - 100
    expect(b.net).toBe(200);   // 300 - 0 - 100
    expect(a.net + b.net).toBe(900); // = 1200 income - 300 expense
  });
  it('herd group milk splits by head count', () => {
    const animals = [
      { id: 'a', nickname: 'A', head_count: 1, herd_id: 'h' },
      { id: 'b', nickname: 'B', head_count: 3, herd_id: 'h' },
    ];
    const r = perAnimalPnL(p, animals, [{ date: '2026-01-02', amount: 400, herd_id: 'h' }], [], []);
    expect(r.find(x => x.animal.id === 'a')!.income).toBe(100);
    expect(r.find(x => x.animal.id === 'b')!.income).toBe(300);
  });
  it('sold or dead animals are excluded', () => {
    const r = perAnimalPnL(p, [{ id: 'a', nickname: 'A', status: 'sold' }, { id: 'b', nickname: 'B' }], [], [], []);
    expect(r.length).toBe(1);
  });
});

describe('geo', () => {
  it('Chennai to Bengaluru is ~290 km', () => {
    const d = haversineKm({ lat: 13.0827, lng: 80.2707 }, { lat: 12.9716, lng: 77.5946 });
    expect(d).toBeGreaterThan(280);
    expect(d).toBeLessThan(300);
  });
  it('radius is inclusive and 0 means nobody', () => {
    const a = { lat: 11, lng: 78 };
    expect(isWithinRadius(a, a, 2)).toBe(true);
    expect(isWithinRadius(a, a, 0)).toBe(false);
    const p = { lat: 11 + 0.03, lng: 78 }; // ~3.3 km
    expect(isWithinRadius(a, p, 2)).toBe(false);
    expect(isWithinRadius(a, p, 5)).toBe(true);
  });
  it('orders stops nearest-first and sums distance', () => {
    const farm = { lat: 11, lng: 78 };
    const far = { lat: 11.1, lng: 78, id: 'far' } as any;
    const near = { lat: 11.01, lng: 78, id: 'near' } as any;
    const mid = { lat: 11.05, lng: 78, id: 'mid' } as any;
    const r = orderByNearest(farm, [far, near, mid]);
    expect(r.ordered.map((x: any) => x.id)).toEqual(['near', 'mid', 'far']);
    expect(r.totalKm).toBeCloseTo(11.1, 0);
  });
  it('bounding box contains points inside the radius', () => {
    const c = { lat: 11, lng: 78 };
    const b = boundingBox(c, 5);
    const p = { lat: 11.03, lng: 78.03 };
    expect(haversineKm(c, p)).toBeLessThan(5);
    expect(p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng).toBe(true);
  });
  it('rejects null island and out-of-range', () => {
    expect(validLatLng(0, 0)).toBe(false);
    expect(validLatLng(91, 10)).toBe(false);
    expect(validLatLng(11, 78)).toBe(true);
    expect(validLatLng(null as any, 78)).toBe(false);
  });
});

describe('weather', () => {
  it('THI 35C/60%', () => { expect(thi(35, 60)).toBeCloseTo(86.86, 1); });
  it('levels', () => {
    expect(cattleStress(22, 50).level).toBe('ok');
    expect(cattleStress(35, 60).level).toBe('warning');
    expect(cattleStress(40, 70).level).toBe('danger');
    expect(poultryStress(25, 50)).toBe('ok');
    expect(poultryStress(36, 50)).toBe('danger');
  });
  it('alerts only for species you keep', () => {
    const a = buildAlerts({ tempC: 36, humidity: 60 }, { maxTempC: 37, rainProbPct: 10, rainMm: 0 }, false, true, false);
    expect(a.map(x => x.id)).toEqual(['poultry-heat']);
  });
  it('rain alert', () => {
    const a = buildAlerts({ tempC: 24, humidity: 80 }, { maxTempC: 26, rainProbPct: 80, rainMm: 12 }, true, false, false);
    expect(a.some(x => x.id === 'rain')).toBe(true);
  });
});

describe('schemes', () => {
  const base = { species: ['cow'], herd_size: 3, state: 'Tamil Nadu' as string | null };
  it('woman + landless in TN qualifies for free goat scheme', () => {
    const r = checkEligibility(SCHEMES, { ...base, species: ['goat'], farmer_category: 'landless', is_woman: true });
    expect(r.find(x => x.scheme.id === 'tn-free-goat-sheep')!.status).toBe('eligible');
  });
  it('man is not eligible and gets a reason', () => {
    const r = checkEligibility(SCHEMES, { ...base, farmer_category: 'landless', is_woman: false });
    const x = r.find(y => y.scheme.id === 'tn-free-goat-sheep')!;
    expect(x.status).toBe('not_eligible');
    expect(x.failed.join(' ')).toMatch(/women/);
  });
  it('unknown category gives "maybe", not a false yes', () => {
    const r = checkEligibility(SCHEMES, { ...base, farmer_category: null });
    expect(r.find(y => y.scheme.id === 'nlm-livestock-insurance')!.status).toBe('maybe');
  });
  it('state schemes are hidden for other states', () => {
    const list = relevantSchemes(SCHEMES, 'Kerala');
    expect(list.find(s => s.id === 'tn-free-goat-sheep')).toBeUndefined();
  });
  it('free vaccine needs a covered species', () => {
    const r = checkEligibility(SCHEMES, { species: ['poultry'], herd_size: 50 });
    expect(r.find(y => y.scheme.id === 'nadcp-free-vaccine')!.status).toBe('not_eligible');
  });
});
