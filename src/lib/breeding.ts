import { addDays, daysBetween, isoToLocalDate } from './dates';

export interface BreedingProfile {
  cycleDays: number;      // typical gap between heats
  cycleMin: number;
  cycleMax: number;
  gestationDays: number;
  firstCheckDays: number; // return-to-heat watch window ends / first pregnancy check
  confirmDays: number;    // vet pregnancy confirmation
  lateStageDays: number;  // days before delivery that count as "late pregnancy"
}

export const BREEDING: Record<string, BreedingProfile> = {
  cow: { cycleDays: 21, cycleMin: 18, cycleMax: 24, gestationDays: 283, firstCheckDays: 24, confirmDays: 60, lateStageDays: 60 },
  buffalo: { cycleDays: 21, cycleMin: 18, cycleMax: 24, gestationDays: 310, firstCheckDays: 24, confirmDays: 60, lateStageDays: 60 },
  goat: { cycleDays: 21, cycleMin: 18, cycleMax: 24, gestationDays: 150, firstCheckDays: 24, confirmDays: 45, lateStageDays: 42 },
  sheep: { cycleDays: 17, cycleMin: 14, cycleMax: 19, gestationDays: 147, firstCheckDays: 20, confirmDays: 45, lateStageDays: 42 },
  dog: { cycleDays: 180, cycleMin: 150, cycleMax: 210, gestationDays: 63, firstCheckDays: 28, confirmDays: 28, lateStageDays: 21 },
};

export const POULTRY_INCUBATION: Record<string, number> = { chicken: 21, duck: 28, quail: 17, turkey: 28 };

export function profileFor(species: string): BreedingProfile | null {
  return BREEDING[species] ?? null;
}

export interface HeatWindow { start: string; expected: string; end: string }

/** Next expected heat after a heat/insemination date. */
export function nextHeatWindow(species: string, fromDate: string): HeatWindow | null {
  const p = profileFor(species);
  if (!p) return null;
  return {
    start: addDays(fromDate, p.cycleMin),
    expected: addDays(fromDate, p.cycleDays),
    end: addDays(fromDate, p.cycleMax),
  };
}

/**
 * After a FAILED conception, the animal keeps cycling. Starting from the heat/service
 * date, step forward one cycle at a time until the window ends on/after today.
 * (If the failure is only found at the 60-day scan, the animal has already cycled
 * 2-3 times in silence, so we project to the next one that is still ahead.)
 */
export function nextHeatAfterFailure(species: string, lastHeatOrServiceDate: string, todayISO: string): HeatWindow | null {
  const p = profileFor(species);
  if (!p) return null;
  let base = lastHeatOrServiceDate;
  let guard = 0;
  while (addDays(base, p.cycleMax) < todayISO && guard < 60) {
    base = addDays(base, p.cycleDays);
    guard++;
  }
  return nextHeatWindow(species, base);
}

export function expectedDelivery(species: string, serviceDate: string): string | null {
  const p = profileFor(species);
  return p ? addDays(serviceDate, p.gestationDays) : null;
}

export function dryOffDate(species: string, deliveryDate: string): string | null {
  if (species !== 'cow' && species !== 'buffalo') return null;
  return addDays(deliveryDate, -60);
}

export interface PregnancyInfo {
  daysPregnant: number;
  daysToDelivery: number;
  stage: 'early' | 'late';
  overdue: boolean;
}

export function pregnancyInfo(species: string, serviceDate: string, todayISO: string): PregnancyInfo | null {
  const p = profileFor(species);
  if (!p) return null;
  const daysPregnant = daysBetween(serviceDate, todayISO);
  const daysToDelivery = p.gestationDays - daysPregnant;
  return {
    daysPregnant,
    daysToDelivery,
    stage: daysToDelivery <= p.lateStageDays ? 'late' : 'early',
    overdue: daysToDelivery < 0,
  };
}

export interface BreedingEventLite {
  id?: string;
  animal_id: string;
  done_at: string;
  status: string; // pending | confirmed | failed | delivered
}

/** Is this animal currently confirmed/probably pregnant? Uses the latest non-failed event. */
export function currentPregnancy(
  species: string, events: BreedingEventLite[], todayISO: string,
): { event: BreedingEventLite; info: PregnancyInfo; confirmed: boolean } | null {
  const p = profileFor(species);
  if (!p) return null;
  const live = events
    .filter(e => e.status === 'confirmed' || e.status === 'pending')
    .sort((a, b) => b.done_at.localeCompare(a.done_at))[0];
  if (!live) return null;
  const info = pregnancyInfo(species, isoToLocalDate(live.done_at), todayISO);
  if (!info || info.overdue && info.daysToDelivery < -30) return null; // stale record
  // A pending event older than the confirmation window is unresolved, not pregnant
  if (live.status === 'pending' && info.daysPregnant > p.confirmDays + 30) return null;
  return { event: live, info, confirmed: live.status === 'confirmed' };
}

// ---------- Poultry ----------
export const layingRatePct = (eggs: number, birds: number): number =>
  birds > 0 ? Math.round((eggs / birds) * 1000) / 10 : 0;

export const hatchDue = (setDate: string, incubationDays = 21): string => addDays(setDate, incubationDays);

export const hatchRatePct = (hatched: number, eggsSet: number): number =>
  eggsSet > 0 ? Math.round((hatched / eggsSet) * 1000) / 10 : 0;

/** Brooder temperature guide (°C) by week of chick age. */
export function brooderTempC(ageDays: number): number | null {
  const wk = Math.floor(ageDays / 7);
  const t = [35, 32, 29, 26, 23][wk];
  return t ?? null;
}

/**
 * AM/PM rule for artificial insemination: heat first seen in the morning -> inseminate that evening;
 * seen in the afternoon/evening -> inseminate next morning. Returns a local Date.
 */
export function bestInseminationTime(heatSeenAt: Date): Date {
  const d = new Date(heatSeenAt);
  if (d.getHours() < 12) { d.setHours(17, 0, 0, 0); return d; }
  d.setDate(d.getDate() + 1);
  d.setHours(7, 0, 0, 0);
  return d;
}
