export type SpeciesKey = 'cow' | 'buffalo' | 'goat' | 'sheep' | 'poultry' | 'dog' | 'other';

export const SPECIES: { key: SpeciesKey; label: string; icon: string }[] = [
  { key: 'cow', label: 'Cow', icon: 'cow' },
  { key: 'buffalo', label: 'Buffalo', icon: 'cow' },
  { key: 'goat', label: 'Goat', icon: 'sheep' },
  { key: 'sheep', label: 'Sheep', icon: 'sheep' },
  { key: 'poultry', label: 'Poultry', icon: 'bird' },
  { key: 'dog', label: 'Dog', icon: 'dog' },
  { key: 'other', label: 'Other', icon: 'paw' },
];

export const speciesLabel = (k?: string): string => SPECIES.find(s => s.key === k)?.label ?? 'Other';
export const speciesIcon = (k?: string): string => SPECIES.find(s => s.key === k)?.icon ?? 'paw';

export const isCattle = (s?: string) => s === 'cow' || s === 'buffalo';
export const isSmallRuminant = (s?: string) => s === 'goat' || s === 'sheep';

export const CATEGORIES: Record<SpeciesKey, { key: string; label: string }[]> = {
  cow: [
    { key: 'milking', label: 'Milking' }, { key: 'pregnant', label: 'Pregnant' },
    { key: 'dry', label: 'Dry' }, { key: 'heifer', label: 'Heifer' },
    { key: 'calf', label: 'Calf' }, { key: 'bull', label: 'Bull' },
  ],
  buffalo: [
    { key: 'milking', label: 'Milking' }, { key: 'pregnant', label: 'Pregnant' },
    { key: 'dry', label: 'Dry' }, { key: 'heifer', label: 'Heifer' },
    { key: 'calf', label: 'Calf' }, { key: 'bull', label: 'Bull' },
  ],
  goat: [
    { key: 'milking', label: 'Milking' }, { key: 'pregnant', label: 'Pregnant' },
    { key: 'kid', label: 'Kid' }, { key: 'buck', label: 'Buck' }, { key: 'doe', label: 'Doe' },
    { key: 'meat', label: 'Meat / growing' },
  ],
  sheep: [
    { key: 'milking', label: 'Milking' }, { key: 'pregnant', label: 'Pregnant' },
    { key: 'lamb', label: 'Lamb' }, { key: 'ram', label: 'Ram' }, { key: 'ewe', label: 'Ewe' },
  ],
  poultry: [
    { key: 'layer', label: 'Layer' }, { key: 'broiler', label: 'Broiler' },
    { key: 'country', label: 'Country bird' }, { key: 'chick', label: 'Chick' },
    { key: 'breeder', label: 'Breeder' },
  ],
  dog: [{ key: 'pet', label: 'Pet' }, { key: 'puppy', label: 'Puppy' }, { key: 'guard', label: 'Guard dog' }],
  other: [{ key: 'pet', label: 'Pet' }, { key: 'other', label: 'Other' }],
};

export const SIZES = [
  { key: 'small', label: 'Small' }, { key: 'medium', label: 'Medium' }, { key: 'large', label: 'Large' },
];

export const EXPENSE_CATEGORIES = [
  { key: 'fodder_green', label: 'Green fodder (Theevanam)' },
  { key: 'fodder_dry', label: 'Dry fodder' },
  { key: 'vaikkol', label: 'Paddy straw / leaf (Vaikkol)' },
  { key: 'rice_bran', label: 'Rice / bran' },
  { key: 'concentrate', label: 'Maize / concentrate feed' },
  { key: 'medical', label: 'Veterinary / medicine' },
  { key: 'breeding', label: 'Breeding (semen, AI fee)' },
  { key: 'labor', label: 'Labor' },
  { key: 'transport', label: 'Transport' },
  { key: 'other', label: 'Other' },
];

export const INCOME_KINDS = [
  { key: 'animal_sale', label: 'Animal sale' },
  { key: 'product_sale', label: 'Product sale (manure, eggs...)' },
  { key: 'subsidy', label: 'Subsidy / scheme' },
  { key: 'other', label: 'Other income' },
];

export const BUYER_KINDS = [
  { key: 'society', label: 'Govt / Co-op society (Aavin)' },
  { key: 'private_dairy', label: 'Private dairy company' },
  { key: 'agent', label: 'Milk agent / agency' },
  { key: 'vendor', label: 'Milk vendor' },
  { key: 'customer', label: 'Direct customer' },
];

export const PAYMENT_MODES = [
  { key: 'cash', label: 'Cash' },
  { key: 'bank', label: 'Bank transfer' },
  { key: 'upi', label: 'UPI' },
  { key: 'qr', label: 'QR scan' },
];

export const CYCLES = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'ten_day', label: '10-day' },
  { key: 'fifteen_day', label: '15-day' },
  { key: 'monthly', label: 'Monthly' },
];

export const HEALTH_KINDS = [
  { key: 'vaccination', label: 'Vaccination' },
  { key: 'deworming', label: 'Deworming' },
  { key: 'treatment', label: 'Medical treatment' },
  { key: 'checkup', label: 'Checkup' },
  { key: 'mortality', label: 'Mortality (death)' },
];

export const LISTING_CATEGORIES = [
  { key: 'cow', label: 'Cow' }, { key: 'buffalo', label: 'Buffalo' },
  { key: 'goat', label: 'Goat / Sheep' }, { key: 'poultry', label: 'Poultry' },
  { key: 'milk', label: 'Milk' }, { key: 'manure', label: 'Manure' },
  { key: 'farm_product', label: 'Farm products' },
];

export const LISTING_FLOWS = [
  { key: 'farmer_customer', label: 'Farmer → Customer' },
  { key: 'farmer_agent', label: 'Farmer → Agent' },
  { key: 'agent_customer', label: 'Agent → Customer' },
  { key: 'agent_agent', label: 'Agent → Agent' },
];

export const ROLES = [
  { key: 'farmer', label: 'Farmer' },
  { key: 'agent', label: 'Milk agent' },
  { key: 'customer', label: 'Customer' },
  { key: 'delivery_partner', label: 'Delivery partner' },
];

export const INDIAN_STATES = [
  'Tamil Nadu', 'Kerala', 'Karnataka', 'Andhra Pradesh', 'Telangana', 'Puducherry',
  'Maharashtra', 'Gujarat', 'Rajasthan', 'Punjab', 'Haryana', 'Uttar Pradesh', 'Bihar',
  'West Bengal', 'Odisha', 'Madhya Pradesh', 'Other',
];

export const PROVIDER_KINDS = [
  { value: 'vet', label: 'Veterinary doctor' },
  { value: 'ai_worker', label: 'AI worker' },
  { value: 'semen_dealer', label: 'Semen dealer' },
];

/** Which listing flows each role may POST (sell). */
export const sellFlows = (role: string): string[] =>
  role === 'agent' ? ['agent_customer', 'agent_agent'] : role === 'farmer' ? ['farmer_customer', 'farmer_agent'] : [];
/** Which flows are the default BROWSE view for each role (what they would buy). */
export const buyFlows = (role: string): string[] =>
  role === 'agent' ? ['farmer_agent', 'agent_agent'] : ['farmer_customer', 'agent_customer'];
