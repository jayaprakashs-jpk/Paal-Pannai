/**
 * Single source of truth for every table.
 * - SQLite DDL (src/db/schema.ts) is generated from this.
 * - Supabase SQL (supabase/migrations/0001_tables.sql) is generated from this
 *   by `npm run gen:sql`, so local and cloud schemas can never drift.
 *
 * Column spec: "<type>[!][=<default>]"
 *   types: text | int | real | bool | json | date | ts | ref (id of another row)
 *   "!"  = NOT NULL
 */
export type ColType = 'text' | 'int' | 'real' | 'bool' | 'json' | 'date' | 'ts' | 'ref';

export interface ColDef {
  name: string;
  type: ColType;
  notNull: boolean;
  def?: string;
}

export interface TableDef {
  name: string;
  cols: ColDef[];
  /** true = never synced to the cloud (device-only data) */
  localOnly?: boolean;
}

function parse(spec: string): Omit<ColDef, 'name'> {
  const m = /^(text|int|real|bool|json|date|ts|ref)(!)?(?:=(.*))?$/.exec(spec);
  if (!m) throw new Error(`Bad column spec: ${spec}`);
  return { type: m[1] as ColType, notNull: !!m[2], def: m[3] };
}

function table(name: string, cols: Record<string, string>, opts: { localOnly?: boolean } = {}): TableDef {
  return {
    name,
    localOnly: opts.localOnly,
    cols: Object.entries(cols).map(([n, s]) => ({ name: n, ...parse(s) })),
  };
}

export const TABLE_LIST: TableDef[] = [
  table('farm_profile', {
    farm_name: 'text', owner_name: 'text', phone: 'text',
    state: 'text', district: 'text', village: 'text',
    lat: 'real', lng: 'real',
    farmer_category: 'text', is_woman: 'bool=0', is_sc_st: 'bool=0', land_acres: 'real',
    delivers_direct: 'bool=0', delivery_radius_km: 'real=0', farm_code: 'text',
    delivery_price: 'real', addon_catalog: 'json',
    upi_id: 'text', bank_holder: 'text', bank_account_no: 'text', bank_ifsc: 'text',
  }),
  table('herds', {
    name: 'text!', species: 'text!', location_name: 'text', lat: 'real', lng: 'real', notes: 'text',
  }),
  table('animals', {
    nickname: 'text!', tag_id: 'text', species: 'text!', breed: 'text', category: 'text',
    sex: 'text', size: 'text', dob: 'date', head_count: 'int=1', herd_id: 'ref',
    girth_cm: 'real', height_cm: 'real', body_length_cm: 'real',
    weight_kg: 'real', weight_source: 'text', status: 'text=active',
    photo_uri: 'text', purchase_price: 'real', notes: 'text',
  }),
  table('health_records', {
    animal_id: 'ref!', kind: 'text!', title: 'text!', date: 'date!', next_due_date: 'date',
    cost: 'real=0', vet_name: 'text', count: 'int=1', cause: 'text', notes: 'text',
  }),
  table('weight_logs', { animal_id: 'ref!', date: 'date!', weight_kg: 'real!' }),
  table('egg_logs', { animal_id: 'ref!', date: 'date!', eggs: 'int!', birds: 'int!', broken: 'int=0' }),
  table('hatch_batches', {
    animal_id: 'ref!', set_date: 'date!', eggs_set: 'int!', incubation_days: 'int=21',
    hatched_count: 'int', notes: 'text',
  }),
  table('reminders', {
    animal_id: 'ref', kind: 'text!', title: 'text!', time_hhmm: 'text!',
    days: 'text=1,2,3,4,5,6,7', enabled: 'bool=1',
  }),
  table('location_logs', {
    animal_id: 'ref', herd_id: 'ref', place_name: 'text', lat: 'real!', lng: 'real!',
    accuracy: 'real', moved_at: 'ts!', distance_m: 'real', area_changed: 'bool=0', notes: 'text',
  }),
  table('heat_records', { animal_id: 'ref!', heat_at: 'ts!', intensity: 'text', notes: 'text' }),
  table('breeding_events', {
    animal_id: 'ref!', heat_id: 'ref', method: 'text!', done_at: 'ts!',
    semen_breed: 'text', bull_name: 'text',
    semen_cost: 'real=0', service_charge: 'real=0', vet_fee: 'real=0',
    provider_id: 'ref', status: 'text=pending', checked_on: 'date',
    expected_heat_date: 'date', expected_delivery_date: 'date', notes: 'text',
  }),
  table('providers', {
    kind: 'text!', name: 'text!', phone: 'text', address: 'text', village: 'text',
    lat: 'real', lng: 'real', fee: 'real', notes: 'text', is_favorite: 'bool=0',
  }),
  table('bookings', {
    provider_id: 'ref!', animal_id: 'ref', service: 'text!', scheduled_at: 'ts!',
    status: 'text=requested', fee: 'real', notes: 'text',
  }),
  table('buyers', {
    name: 'text!', kind: 'text!', org: 'text', address: 'text', phone: 'text',
    lat: 'real', lng: 'real', upi_id: 'text', bank_account_no: 'text', bank_ifsc: 'text',
    notes: 'text', is_active: 'bool=1',
  }),
  table('buyer_rates', {
    buyer_id: 'ref!', effective_date: 'date!', milk_type: 'text=any', rate_type: 'text=flat',
    base_rate: 'real!', std_fat: 'real=3.5', std_snf: 'real=8.5',
    fat_rate: 'real=0', snf_rate: 'real=0', min_rate: 'real=0', bonus_per_litre: 'real=0',
    notes: 'text',
  }),
  table('milk_entries', {
    date: 'date!', session: 'text!', animal_id: 'ref', herd_id: 'ref',
    litres: 'real!', fat: 'real', snf: 'real', buyer_id: 'ref',
    rate_per_litre: 'real', amount: 'real', sold: 'bool=1', source: 'text=manual',
    milk_type: 'text', notes: 'text',
  }),
  table('bills', {
    bill_no: 'text!', party_id: 'ref!', cycle: 'text!', period_start: 'date!', period_end: 'date!',
    items: 'json', total_litres: 'real=0', subtotal: 'real=0', deductions: 'real=0',
    total: 'real=0', paid_amount: 'real=0', status: 'text=unpaid', notes: 'text',
  }),
  table('payments', {
    bill_id: 'ref', party_id: 'ref!', amount: 'real!', mode: 'text!', reference: 'text',
    paid_at: 'ts!', notes: 'text',
  }),
  table('payment_queries', {
    party_id: 'ref!', bill_id: 'ref', title: 'text!', expected_amount: 'real',
    received_amount: 'real', missing_amount: 'real', status: 'text=open',
    raised_on: 'date!', resolved_on: 'date', resolution_note: 'text',
  }),
  table('query_updates', { query_id: 'ref!', note: 'text!', at: 'ts!' }),
  table('listings', {
    flow: 'text!', category: 'text!', title: 'text!', description: 'text',
    price: 'real!', price_unit: 'text=each', quantity: 'real=1', animal_id: 'ref',
    photos: 'json', details: 'json', lat: 'real', lng: 'real', village: 'text',
    contact_phone: 'text', status: 'text=active',
  }),
  table('expenses', {
    date: 'date!', category: 'text!', amount: 'real!', qty: 'real', unit: 'text',
    animal_id: 'ref', herd_id: 'ref', vendor: 'text', notes: 'text',
  }),
  table('incomes', {
    date: 'date!', kind: 'text!', amount: 'real!', animal_id: 'ref', notes: 'text',
  }),
  table('savings_log', { date: 'date!', amount: 'real!', notes: 'text' }),
  table('delivery_subscriptions', {
    customer_id: 'ref', customer_user_id: 'ref', customer_name: 'text', customer_phone: 'text',
    address: 'text', lat: 'real', lng: 'real', distance_km: 'real',
    slot: 'text!', litres: 'real!', price_per_litre: 'real', addons: 'json',
    start_date: 'date!', end_date: 'date', status: 'text=active',
  }),
  table('delivery_orders', {
    subscription_id: 'ref!', date: 'date!', slot: 'text!', items: 'json', amount: 'real',
    status: 'text=scheduled', partner_id: 'ref', delivered_at: 'ts',
  }),
  // Device-only: photographed pages waiting for AI extraction (images live on this phone).
  table('scan_queue', {
    image_uri: 'text!', kind: 'text=milk_notebook', status: 'text=pending',
    result: 'json', error: 'text',
  }, { localOnly: true }),
];

export const TABLES: Record<string, TableDef> = Object.fromEntries(TABLE_LIST.map(t => [t.name, t]));
export const SYNCED_TABLES = TABLE_LIST.filter(t => !t.localOnly).map(t => t.name);

/** Columns every table has (added automatically). */
export const BASE_COLS = ['id', 'owner_id', 'created_at', 'updated_at', 'deleted_at'] as const;

export function colType(table: string, col: string): ColType | undefined {
  return TABLES[table]?.cols.find(c => c.name === col)?.type;
}
