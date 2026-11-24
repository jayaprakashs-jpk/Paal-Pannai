import { fromPaise, toPaise } from './money';

export interface ExpenseLite { date: string; category: string; amount: number; animal_id?: string | null; herd_id?: string | null }
export interface IncomeLite { date: string; kind: string; amount: number; animal_id?: string | null }
export interface MilkLite { date: string; amount?: number | null; sold?: boolean | null; animal_id?: string | null; herd_id?: string | null }
export interface AnimalLite { id: string; nickname: string; head_count?: number | null; herd_id?: string | null; status?: string | null }

export interface FarmSummary {
  milkIncome: number;
  otherIncome: number;
  income: number;
  expense: number;
  net: number;
  savings: number;
  cashAfterSavings: number;
  expenseByCategory: Record<string, number>;
}

const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

export function summarize(
  p: { from: string; to: string },
  milk: MilkLite[], incomes: IncomeLite[], expenses: ExpenseLite[], savings: { date: string; amount: number }[],
): FarmSummary {
  let milkP = 0, otherP = 0, expP = 0, savP = 0;
  const byCat: Record<string, number> = {};
  for (const m of milk) {
    if (m.sold === false) continue; // own use / calf share is not income
    if (inRange(m.date, p.from, p.to)) milkP += toPaise(m.amount || 0);
  }
  for (const i of incomes) if (inRange(i.date, p.from, p.to)) otherP += toPaise(i.amount);
  for (const e of expenses) {
    if (!inRange(e.date, p.from, p.to)) continue;
    expP += toPaise(e.amount);
    byCat[e.category] = (byCat[e.category] || 0) + toPaise(e.amount);
  }
  for (const s of savings) if (inRange(s.date, p.from, p.to)) savP += toPaise(s.amount);
  const net = milkP + otherP - expP;
  return {
    milkIncome: fromPaise(milkP),
    otherIncome: fromPaise(otherP),
    income: fromPaise(milkP + otherP),
    expense: fromPaise(expP),
    net: fromPaise(net),
    savings: fromPaise(savP),
    cashAfterSavings: fromPaise(net - savP),
    expenseByCategory: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, fromPaise(v)])),
  };
}

export interface AnimalPnL {
  animal: AnimalLite;
  income: number;
  directExpense: number;
  sharedExpense: number;
  net: number;
}

/**
 * Per-animal profit/loss.
 *  - Income: that animal's own milk + its own incomes + an equal share of its herd's group milk.
 *  - Expense: its own expenses + an equal share of its herd's expenses
 *             + an equal share (by head count) of farm-wide shared expenses (no animal/herd tagged).
 * Shared costs are an allocation, not a measurement. The UI says so.
 */
export function perAnimalPnL(
  p: { from: string; to: string }, animals: AnimalLite[],
  milk: MilkLite[], incomes: IncomeLite[], expenses: ExpenseLite[],
): AnimalPnL[] {
  const active = animals.filter(a => a.status !== 'sold' && a.status !== 'dead');
  const heads = (a: AnimalLite) => Math.max(1, a.head_count || 1);
  const totalHeads = active.reduce((s, a) => s + heads(a), 0) || 1;
  const herdHeads = new Map<string, number>();
  for (const a of active) if (a.herd_id) herdHeads.set(a.herd_id, (herdHeads.get(a.herd_id) || 0) + heads(a));

  const incomeP = new Map<string, number>();
  const directP = new Map<string, number>();
  const sharedP = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);

  for (const m of milk) {
    if (m.sold === false || !inRange(m.date, p.from, p.to)) continue;
    const amt = toPaise(m.amount || 0);
    if (m.animal_id) add(incomeP, m.animal_id, amt);
    else if (m.herd_id && herdHeads.get(m.herd_id)) {
      const members = active.filter(a => a.herd_id === m.herd_id);
      const hh = herdHeads.get(m.herd_id)!;
      for (const a of members) add(incomeP, a.id, Math.round((amt * heads(a)) / hh));
    }
  }
  for (const i of incomes) {
    if (i.animal_id && inRange(i.date, p.from, p.to)) add(incomeP, i.animal_id, toPaise(i.amount));
  }
  for (const e of expenses) {
    if (!inRange(e.date, p.from, p.to)) continue;
    const amt = toPaise(e.amount);
    if (e.animal_id) add(directP, e.animal_id, amt);
    else if (e.herd_id && herdHeads.get(e.herd_id)) {
      const hh = herdHeads.get(e.herd_id)!;
      for (const a of active.filter(x => x.herd_id === e.herd_id)) add(directP, a.id, Math.round((amt * heads(a)) / hh));
    } else {
      for (const a of active) add(sharedP, a.id, Math.round((amt * heads(a)) / totalHeads));
    }
  }
  return active.map(a => {
    const inc = incomeP.get(a.id) || 0;
    const dir = directP.get(a.id) || 0;
    const sh = sharedP.get(a.id) || 0;
    return {
      animal: a,
      income: fromPaise(inc),
      directExpense: fromPaise(dir),
      sharedExpense: fromPaise(sh),
      net: fromPaise(inc - dir - sh),
    };
  });
}
