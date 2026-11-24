import { CATEGORIES, CYCLES, HEALTH_KINDS } from './constants';

/**
 * Every status-like word the UI shows, spelled out in English so it can be translated and checked
 * (no string tricks like charAt(0).toUpperCase(), which hide text from the translation check).
 */
export const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled', out: 'Out for delivery', delivered: 'Delivered', missed: 'Missed', cancelled: 'Cancelled',
  active: 'Active', paused: 'Paused', ended: 'Ended', sold: 'Sold', dead: 'Dead', closed: 'Closed',
  requested: 'Requested', confirmed: 'Confirmed', done: 'Done',
  open: 'Open', in_progress: 'In progress', resolved: 'Resolved', rejected: 'Rejected',
  morning: 'Morning', evening: 'Evening',
  subsidy: 'Subsidy', vaccine: 'Vaccine', shed: 'Shed', insurance: 'Insurance', credit: 'Credit',
  distribution: 'Distribution', training: 'Training',
  central: 'Central govt', state: 'State govt',
};

export const statusLabel = (s?: string | null): string => (s && STATUS_LABELS[s]) || s || '';

export const categoryLabel = (species: string, key?: string | null): string => {
  const list = (CATEGORIES as Record<string, { key: string; label: string }[]>)[species] ?? [];
  return list.find(c => c.key === key)?.label ?? key ?? '';
};
export const healthKindLabel = (key: string): string => HEALTH_KINDS.find(h => h.key === key)?.label ?? key;
export const cycleLabel = (key: string): string => CYCLES.find(c => c.key === key)?.label ?? key;
