/**
 * Government livestock / poultry schemes (indicative).
 *
 * IMPORTANT: schemes, subsidy % and eligibility change often. This list is a
 * starting catalogue shipped with the app. The `schemes` table in Supabase can
 * override it (see services/schemes sync) so you can correct rules without
 * releasing a new APK. Always confirm at the local Veterinary Dispensary /
 * Animal Husbandry office before applying. `verified` is false until someone
 * on your team checks the current notification.
 */
export type Op = 'eq' | 'in' | 'gte' | 'lte' | 'truthy';

export interface Criterion {
  field: 'state' | 'farmer_category' | 'is_woman' | 'is_sc_st' | 'land_acres' | 'species' | 'herd_size';
  op: Op;
  value?: any;
  /** Shown when this rule fails */
  hint: string;
}

export interface Scheme {
  id: string;
  name: string;
  level: 'central' | 'state';
  state?: string;
  category: 'subsidy' | 'vaccine' | 'shed' | 'insurance' | 'credit' | 'distribution' | 'training';
  benefit: string;
  how: string;
  criteria: Criterion[];
  verified: boolean;
}

export const SCHEMES: Scheme[] = [
  {
    id: 'nadcp-free-vaccine',
    name: 'Free FMD & Brucellosis vaccination (NADCP)',
    level: 'central',
    category: 'vaccine',
    benefit: 'Free foot-and-mouth disease vaccination for cattle, buffalo, sheep, goats and pigs. Free brucellosis vaccination for female calves.',
    how: 'Government vaccination camps. Ask your Veterinary Dispensary for the next round and ear-tag your animals.',
    criteria: [
      { field: 'species', op: 'in', value: ['cow', 'buffalo', 'goat', 'sheep'], hint: 'Applies to cattle, buffalo, goats and sheep' },
    ],
    verified: false,
  },
  {
    id: 'nlm-livestock-insurance',
    name: 'Livestock insurance premium subsidy (NLM)',
    level: 'central',
    category: 'insurance',
    benefit: 'Government pays part of the insurance premium for cattle, buffalo, sheep and goats. Higher support for BPL / small farmers.',
    how: 'Through the Animal Husbandry department and approved insurers. Animals must be ear-tagged and health-certified by a vet.',
    criteria: [
      { field: 'species', op: 'in', value: ['cow', 'buffalo', 'goat', 'sheep'], hint: 'Applies to cattle, buffalo, sheep and goats' },
      { field: 'farmer_category', op: 'in', value: ['landless', 'marginal', 'small', 'bpl'], hint: 'Priority for small, marginal, landless and BPL farmers' },
    ],
    verified: false,
  },
  {
    id: 'nlm-entrepreneurship',
    name: 'Entrepreneurship Development: poultry, sheep & goat, fodder (NLM)',
    level: 'central',
    category: 'subsidy',
    benefit: 'Capital subsidy (up to 50% of project cost, subject to caps) for commercial poultry, sheep/goat units and fodder seed / feed plants.',
    how: 'Apply on the National Livestock Mission portal or via the district Animal Husbandry office with a project report.',
    criteria: [
      { field: 'species', op: 'in', value: ['poultry', 'goat', 'sheep'], hint: 'For poultry, goat or sheep units' },
    ],
    verified: false,
  },
  {
    id: 'rgm-ai-support',
    name: 'Rashtriya Gokul Mission: breeding & artificial insemination support',
    level: 'central',
    category: 'subsidy',
    benefit: 'Support for quality semen, doorstep AI services, and indigenous breed conservation.',
    how: 'Through state livestock development agency and local AI workers / Veterinary Dispensary.',
    criteria: [
      { field: 'species', op: 'in', value: ['cow', 'buffalo'], hint: 'For cattle and buffalo' },
    ],
    verified: false,
  },
  {
    id: 'kcc-ah',
    name: 'Kisan Credit Card for animal husbandry',
    level: 'central',
    category: 'credit',
    benefit: 'Working-capital loan for feed, medicine and running costs at concessional interest (interest subvention for prompt repayment).',
    how: 'Apply at your bank or cooperative bank with Aadhaar, land/lease proof and animal details.',
    criteria: [
      { field: 'herd_size', op: 'gte', value: 1, hint: 'Add at least one animal to your farm' },
    ],
    verified: false,
  },
  {
    id: 'ahidf-infra',
    name: 'Animal Husbandry Infrastructure Development Fund (AHIDF)',
    level: 'central',
    category: 'credit',
    benefit: 'Interest subvention on loans for dairy processing, feed plants and breed-improvement infrastructure.',
    how: 'Apply through the AHIDF portal and a scheduled bank. Meant for larger units / FPOs / MSMEs.',
    criteria: [
      { field: 'herd_size', op: 'gte', value: 10, hint: 'Suited for larger units (about 10+ animals or a group)' },
    ],
    verified: false,
  },
  {
    id: 'tn-free-goat-sheep',
    name: 'Tamil Nadu: free goats / sheep for poor rural women',
    level: 'state',
    state: 'Tamil Nadu',
    category: 'distribution',
    benefit: 'Free goats/sheep (and in some years milch cows) to eligible landless or poor rural women. Check whether the scheme is open this year.',
    how: 'Ask your Panchayat / Block Veterinary Dispensary. Beneficiaries are selected in Gram Sabha.',
    criteria: [
      { field: 'state', op: 'eq', value: 'Tamil Nadu', hint: 'Tamil Nadu residents only' },
      { field: 'is_woman', op: 'truthy', hint: 'For women beneficiaries' },
      { field: 'farmer_category', op: 'in', value: ['landless', 'marginal', 'bpl'], hint: 'For landless / marginal / BPL families' },
    ],
    verified: false,
  },
  {
    id: 'tn-cattle-shed',
    name: 'Cattle shed construction support (MGNREGS convergence)',
    level: 'state',
    category: 'shed',
    benefit: 'Support to build cattle / goat / poultry sheds for job-card holders under MGNREGS convergence, where the state has approved it.',
    how: 'Apply at your Gram Panchayat with MGNREGS job card and ownership details.',
    criteria: [
      { field: 'farmer_category', op: 'in', value: ['landless', 'marginal', 'small', 'bpl'], hint: 'For small, marginal, landless or BPL families' },
      { field: 'herd_size', op: 'gte', value: 1, hint: 'You need at least one animal' },
    ],
    verified: false,
  },
  {
    id: 'scst-subsidy',
    name: 'SC/ST priority support for livestock units',
    level: 'state',
    category: 'subsidy',
    benefit: 'Many state and central schemes give a higher subsidy percentage to SC/ST beneficiaries. Ask for the category-wise rate on each scheme.',
    how: 'Carry your community certificate to the Animal Husbandry / District Industries office.',
    criteria: [
      { field: 'is_sc_st', op: 'truthy', hint: 'For SC/ST farmers' },
    ],
    verified: false,
  },
  {
    id: 'dairy-training',
    name: 'Dairy and poultry farmer training (KVK / Veterinary University)',
    level: 'central',
    category: 'training',
    benefit: 'Free or low-cost short courses on dairy, goat and poultry management at your Krishi Vigyan Kendra (KVK) and Veterinary University.',
    how: 'Contact your district KVK.',
    criteria: [],
    verified: false,
  },
];

export interface FarmFacts {
  state?: string | null;
  farmer_category?: string | null;
  is_woman?: boolean;
  is_sc_st?: boolean;
  land_acres?: number | null;
  species: string[];
  herd_size: number;
}

export interface EligibilityResult {
  scheme: Scheme;
  status: 'eligible' | 'maybe' | 'not_eligible';
  failed: string[];
  passed: number;
}

function getFact(f: FarmFacts, field: Criterion['field']): any {
  switch (field) {
    case 'state': return f.state;
    case 'farmer_category': return f.farmer_category;
    case 'is_woman': return f.is_woman;
    case 'is_sc_st': return f.is_sc_st;
    case 'land_acres': return f.land_acres;
    case 'species': return f.species;
    case 'herd_size': return f.herd_size;
  }
}

function test(c: Criterion, f: FarmFacts): boolean | 'unknown' {
  const v = getFact(f, c.field);
  if (c.field === 'species') {
    // pass if the farm has ANY species in the list
    return (c.value as string[]).some(s => (v as string[]).includes(s));
  }
  if (v === undefined || v === null || v === '') return c.op === 'truthy' ? false : 'unknown';
  switch (c.op) {
    case 'eq': return v === c.value;
    case 'in': return (c.value as any[]).includes(v);
    case 'gte': return Number(v) >= Number(c.value);
    case 'lte': return Number(v) <= Number(c.value);
    case 'truthy': return !!v;
  }
}

export function checkEligibility(schemes: Scheme[], f: FarmFacts): EligibilityResult[] {
  return schemes.map(scheme => {
    const failed: string[] = [];
    let unknown = false;
    let passed = 0;
    for (const c of scheme.criteria) {
      const r = test(c, f);
      if (r === true) passed++;
      else if (r === 'unknown') unknown = true;
      else failed.push(c.hint);
    }
    const status: EligibilityResult['status'] =
      failed.length > 0 ? 'not_eligible' : unknown ? 'maybe' : 'eligible';
    return { scheme, status, failed, passed };
  }).sort((a, b) => {
    const rank = { eligible: 0, maybe: 1, not_eligible: 2 } as const;
    return rank[a.status] - rank[b.status];
  });
}

/** State schemes only apply to their state. */
export function relevantSchemes(all: Scheme[], state?: string | null): Scheme[] {
  return all.filter(s => !s.state || !state || s.state === state);
}
