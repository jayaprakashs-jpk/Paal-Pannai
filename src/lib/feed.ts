/**
 * Daily ration calculator. Rule-of-thumb guidance in the style of Indian
 * extension recommendations (ICAR / state AH dept). It is a STARTING POINT,
 * not a veterinary prescription: animals differ, check body condition and
 * talk to your vet / feed company chart.
 */
import { isCattle, isSmallRuminant } from './constants';

export type PregnancyStage = 'none' | 'early' | 'late';
export type GreenAvailability = 'plenty' | 'normal' | 'limited' | 'none';

export interface FeedInput {
  species: string;
  category?: string | null;
  weightKg: number;
  milkLitresPerDay?: number;
  pregnancy?: PregnancyStage;
  greenAvailability?: GreenAvailability;
  headCount?: number;       // flocks
  ageWeeks?: number;        // broilers / chicks
  maizeShare?: number;      // share of concentrate that is maize flour (0..1)
}

export interface FeedNote { text: string; vars?: Record<string, string | number> }

export interface FeedResult {
  perAnimal: boolean;
  dryMatterKg: number;
  greenKg: number;          // fresh green fodder (Theevanam)
  dryKg: number;            // dry fodder (straw / hay)
  concentrateKg: number;    // total concentrate mix
  maizeKg: number;          // maize flour (Makkachola Maavu)
  brankg: number;           // rice / wheat bran
  oilcakeKg: number;        // groundnut / cotton / coconut cake
  mineralKg: number;
  saltKg: number;
  waterL: number;
  /** English message + placeholders; translate with t(text, vars) in the UI */
  notes: FeedNote[];
}

const GREEN_SHARE: Record<GreenAvailability, number> = { plenty: 0.65, normal: 0.5, limited: 0.25, none: 0 };
const GREEN_DM = 0.2;  // fresh green fodder ~20% dry matter
const DRY_DM = 0.9;    // straw / hay ~90% dry matter
const CONC_DM = 0.9;

const r1 = (n: number) => Math.round(n * 100) / 100;

/** Broiler feed grams/bird/day by week of age (approximate, follow your feed company chart). */
const BROILER_G = [25, 60, 95, 130, 160, 180, 190, 195];

function empty(): FeedResult {
  return {
    perAnimal: true, dryMatterKg: 0, greenKg: 0, dryKg: 0, concentrateKg: 0, maizeKg: 0,
    brankg: 0, oilcakeKg: 0, mineralKg: 0, saltKg: 0, waterL: 0, notes: [],
  };
}

function splitConcentrate(r: FeedResult, conc: number, maizeShare: number) {
  const maize = Math.min(Math.max(maizeShare, 0), 1);
  const rest = 1 - maize;
  // remaining split: bran 25 : oilcake 30 : mineral 4 : salt 1  (of a 60 non-maize base)
  r.concentrateKg = r1(conc);
  r.maizeKg = r1(conc * maize);
  r.brankg = r1(conc * rest * (25 / 60));
  r.oilcakeKg = r1(conc * rest * (30 / 60));
  r.mineralKg = r1(conc * rest * (4 / 60));
  r.saltKg = r1(conc * rest * (1 / 60));
}

export function calcFeed(i: FeedInput): FeedResult {
  const r = empty();
  const w = Number(i.weightKg) || 0;
  const milk = Math.max(0, Number(i.milkLitresPerDay) || 0);
  const preg = i.pregnancy || 'none';
  const green = GREEN_SHARE[i.greenAvailability || 'normal'];
  const maizeShare = i.maizeShare ?? 0.4;
  const cat = i.category || '';

  // ---------- Poultry ----------
  if (i.species === 'poultry') {
    const n = Math.max(1, Math.floor(i.headCount || 1));
    let g = 110;
    if (cat === 'broiler') {
      const wk = Math.min(Math.max(Math.floor(i.ageWeeks ?? 4), 0), BROILER_G.length - 1);
      g = BROILER_G[wk];
    } else if (cat === 'country') g = 75;
    else if (cat === 'chick') g = i.ageWeeks && i.ageWeeks > 4 ? 60 : 30;
    else if (cat === 'breeder') g = 130;
    // layer default 110 g
    const kg = (g * n) / 1000;
    r.perAnimal = false;
    r.dryMatterKg = r1(kg * 0.9);
    r.concentrateKg = r1(kg);
    r.maizeKg = r1(kg * 0.55);
    r.oilcakeKg = r1(kg * 0.25);
    r.waterL = r1(kg * 2);
    r.notes.push({ text: 'Feed per bird: {g} g/day', vars: { g } });
    r.notes.push({ text: 'Water is about 2x the feed weight, more in hot weather' });
    if (cat === 'layer') r.notes.push({ text: 'Add calcium (shell grit) for layers' });
    return r;
  }

  // ---------- Dogs / other pets ----------
  if (i.species === 'dog' || i.species === 'other') {
    const pct = cat === 'puppy' ? 0.05 : 0.025;
    r.concentrateKg = r1(w * pct);
    r.dryMatterKg = r1(w * pct * 0.9);
    r.waterL = r1(Math.max(0.5, w * 0.06));
    r.notes.push({ text: 'Pet food estimate: 2.5% of body weight (5% for puppies)' });
    return r;
  }

  if (!(w > 0)) {
    r.notes.push({ text: 'Enter the animal weight first' });
    return r;
  }

  // ---------- Cattle / buffalo ----------
  if (isCattle(i.species)) {
    const buffalo = i.species === 'buffalo';
    const lactating = milk > 0;
    let dmi: number;
    let conc: number;
    const isCalf = cat === 'calf';
    if (isCalf) {
      dmi = w * 0.025;
      conc = Math.min(Math.max(w * 0.01, 0.3), 2);
      r.notes.push({ text: 'Calf: feed colostrum/milk as per vet plus starter feed' });
    } else {
      const base = buffalo ? 0.026 : 0.025;
      dmi = lactating ? w * base + 0.1 * milk : w * 0.022;
      const maintenance = Math.min(Math.max((w / 350) * 1.0, 0.5), 2);
      const perLitre = buffalo ? 1 / 2 : 1 / 2.5; // 1 kg concentrate per 2 L (buffalo) / 2.5 L (cow)
      conc = maintenance + (lactating ? milk * perLitre : 0);
      if (preg === 'late') {
        conc += 1.25;
        r.notes.push({ text: 'Late pregnancy: +1.25 kg concentrate added (last 2 months)' });
      }
    }
    // Keep at least 50% of dry matter from roughage (rumen health).
    const maxConcDM = dmi * 0.5;
    if (conc * CONC_DM > maxConcDM) {
      conc = maxConcDM / CONC_DM;
      r.notes.push({ text: 'Concentrate capped at 50% of dry matter. Feed more green fodder for high yielders' });
    }
    const roughDM = Math.max(dmi - conc * CONC_DM, 0);
    const greenDM = roughDM * green;
    const dryDM = roughDM - greenDM;
    r.dryMatterKg = r1(dmi);
    r.greenKg = r1(greenDM / GREEN_DM);
    r.dryKg = r1(dryDM / DRY_DM);
    splitConcentrate(r, conc, maizeShare);
    r.waterL = r1(dmi * 4 + milk * 1.2);
    if (green === 0) r.notes.push({ text: 'No green fodder: give extra mineral mixture and vitamin A as per vet' });
    if (lactating && milk > 12) r.notes.push({ text: 'High yield: split concentrate into 2-3 feeds per day' });
    if (buffalo) r.notes.push({ text: 'Buffalo: also give 50-60 g mineral mixture daily' });
    else r.notes.push({ text: 'Give 50 g mineral mixture and salt daily' });
    return r;
  }

  // ---------- Goat / sheep ----------
  if (isSmallRuminant(i.species)) {
    const lactating = milk > 0;
    const isYoung = cat === 'kid' || cat === 'lamb';
    const dmi = w * (isYoung ? 0.04 : 0.035) + (lactating ? 0.1 * milk : 0);
    let conc = w * (isYoung ? 0.012 : 0.005) + (lactating ? milk * 0.4 : 0);
    if (preg === 'late') {
      conc += 0.25;
      r.notes.push({ text: 'Late pregnancy: +250 g concentrate added (last 6 weeks)' });
    }
    const maxConcDM = dmi * 0.5;
    if (conc * CONC_DM > maxConcDM) conc = maxConcDM / CONC_DM;
    const roughDM = Math.max(dmi - conc * CONC_DM, 0);
    const greenDM = roughDM * Math.max(green, i.greenAvailability ? green : 0.6);
    const dryDM = roughDM - greenDM;
    r.dryMatterKg = r1(dmi);
    r.greenKg = r1(greenDM / GREEN_DM);
    r.dryKg = r1(dryDM / DRY_DM);
    splitConcentrate(r, conc, maizeShare);
    r.waterL = r1(dmi * 3.5 + milk);
    r.notes.push({ text: 'Goats do best with tree leaves/browse. Offer salt lick' });
    return r;
  }

  r.notes.push({ text: 'No feed rule for this species' });
  return r;
}

/** Recent average milk (L/day) for feed calc from entries. */
export function avgDailyMilk(entries: { date: string; litres: number }[], days = 7): number {
  if (!entries.length) return 0;
  const byDay = new Map<string, number>();
  for (const e of entries) byDay.set(e.date, (byDay.get(e.date) || 0) + (e.litres || 0));
  const recent = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, days);
  if (!recent.length) return 0;
  return r1(recent.reduce((s, [, v]) => s + v, 0) / recent.length);
}
