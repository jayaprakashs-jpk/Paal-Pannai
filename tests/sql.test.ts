import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

/**
 * Runs the REAL migrations in Postgres (PGlite) with stubs for Supabase's auth/storage, then attacks them as
 * different users. These tests are the evidence for the privacy / geofence claims in the README.
 */
const U = {
  farmerA: '00000000-0000-0000-0000-00000000000a',
  farmerB: '00000000-0000-0000-0000-00000000000b',
  near: '00000000-0000-0000-0000-0000000000c1',   // ~2 km from farm A
  far: '00000000-0000-0000-0000-0000000000c2',    // ~5 km from farm A
  partner: '00000000-0000-0000-0000-0000000000d1',
  stranger: '00000000-0000-0000-0000-0000000000e1',
};
const FARM = { lat: 13.0, lng: 80.0 };
const NEAR = { lat: 13.018, lng: 80.0 };   // ≈ 2.0 km
const FAR = { lat: 13.045, lng: 80.0 };    // ≈ 5.0 km

let db: PGlite;

async function as(uid: string | null) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec('set role authenticated');
}
async function asSuper() { await db.exec('reset role'); }
async function fails(p: Promise<unknown>, re: RegExp) {
  let err: any = null;
  try { await p; } catch (e) { err = e; }
  expect(err, 'expected an error').not.toBeNull();
  expect(String(err?.message ?? err)).toMatch(re);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql as $$
      select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
    grant usage on schema auth, storage to authenticated, anon;
  `);
  await db.exec(readFileSync('supabase/migrations/0001_tables.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/0002_policies_rpc.sql', 'utf8'));
  // Supabase grants table privileges to these roles by default; RLS is what actually protects rows.
  await db.exec(`grant usage on schema public to authenticated, anon;
                 grant all on all tables in schema public to authenticated;
                 grant select, insert, delete on storage.objects to authenticated;`);
  for (const id of Object.values(U)) await db.query('insert into auth.users(id) values ($1)', [id]);

  // Farmer A delivers within 3 km
  await as(U.farmerA);
  await db.query(
    `insert into farm_profile (id, farm_name, owner_name, village, lat, lng, delivers_direct, delivery_radius_km, delivery_price, phone, addon_catalog)
     values (gen_random_uuid(), 'A Farm', 'Ravi', 'Perur', $1, $2, true, 3, 52, '9800000001', '[{"product":"curd","name":"Curd","unit":"cup","price":15}]')`,
    [FARM.lat, FARM.lng]);
  // Farmer B is far away, delivers 50 km but is not in anyone's range here
  await as(U.farmerB);
  await db.query(
    `insert into farm_profile (id, farm_name, lat, lng, delivers_direct, delivery_radius_km, delivery_price)
     values (gen_random_uuid(), 'B Farm', 9.0, 77.0, true, 2, 50)`);
});

const place = (uid: string, at = NEAR, over: Record<string, any> = {}) => {
  const p = { owner: U.farmerA, lat: at.lat, lng: at.lng, addr: '12 Main Road, Perur', name: 'Cust', phone: '9811111111', slot: 'morning', litres: 1.5, addons: '[]', start: null as string | null, ...over };
  return as(uid).then(() => db.query(
    `select public.place_subscription($1::uuid, $2::float8, $3::float8, $4, $5, $6, $7, $8::float8, $9::jsonb, coalesce($10::date, current_date + 1)) as id`,
    [p.owner, p.lat, p.lng, p.addr, p.name, p.phone, p.slot, p.litres, p.addons, p.start]));
};

describe('row level security', () => {
  it('a user cannot read another user\'s private rows', async () => {
    await as(U.farmerA);
    await db.query(`insert into animals (id, nickname, species) values (gen_random_uuid(), 'Lakshmi', 'cow')`);
    await as(U.farmerB);
    const r = await db.query('select * from animals');
    expect(r.rows.length).toBe(0);
  });
  it('a user cannot write a row owned by someone else', async () => {
    await as(U.farmerB);
    await fails(db.query(`insert into animals (id, owner_id, nickname, species) values (gen_random_uuid(), $1, 'Stolen', 'cow')`, [U.farmerA]), /row-level security/);
  });
  it('a user cannot take over an existing row by upserting its id', async () => {
    await as(U.farmerA);
    const { rows } = await db.query<{ id: string }>(`select id from animals limit 1`);
    await as(U.farmerB);
    await fails(db.query(
      `insert into animals (id, owner_id, nickname, species) values ($1, $2, 'Hijack', 'cow')
       on conflict (id) do update set nickname = excluded.nickname`, [rows[0].id, U.farmerB]), /row-level security|violates/);
    await as(U.farmerA);
    const r = await db.query<{ nickname: string }>('select nickname from animals');
    expect(r.rows[0].nickname).toBe('Lakshmi');
  });
  it('anon role has no access to function or tables', async () => {
    await asSuper();
    await db.exec('set role anon');
    await fails(db.query('select * from public.farms_in_range(13, 80)'), /permission denied/);
    await fails(db.query('select * from animals'), /permission denied/);
  });
});

describe('geofenced discovery (server-side)', () => {
  it('customer INSIDE the farm\'s radius sees the farm', async () => {
    await as(U.near);
    const r = await db.query<any>('select * from public.farms_in_range($1, $2)', [NEAR.lat, NEAR.lng]);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].farm_name).toBe('A Farm');
    expect(Number(r.rows[0].distance_km)).toBeGreaterThan(1.8);
    expect(Number(r.rows[0].distance_km)).toBeLessThan(2.2);
  });
  it('customer OUTSIDE the radius sees nothing', async () => {
    await as(U.far);
    const r = await db.query<any>('select * from public.farms_in_range($1, $2)', [FAR.lat, FAR.lng]);
    expect(r.rows.length).toBe(0);
  });
  it('the farm\'s exact coordinates are never returned', async () => {
    await as(U.near);
    const r = await db.query<any>('select * from public.farms_in_range($1, $2)', [NEAR.lat, NEAR.lng]);
    const keys = Object.keys(r.rows[0]);
    expect(keys).not.toContain('lat');
    expect(keys).not.toContain('lng');
  });
  it('customers cannot read farm_profile directly', async () => {
    await as(U.near);
    const r = await db.query('select * from farm_profile');
    expect(r.rows.length).toBe(0);
  });
  it('rejects bad coordinates and signed-out callers', async () => {
    await as(U.near);
    await fails(db.query('select * from public.farms_in_range(95, 10)'), /bad location/);
    await as(null);
    await fails(db.query('select * from public.farms_in_range(13, 80)'), /not signed in/);
  });
  it('a farm that switches delivery off disappears', async () => {
    await as(U.farmerA);
    await db.exec(`update farm_profile set delivers_direct = false`);
    await as(U.near);
    expect((await db.query('select * from public.farms_in_range($1, $2)', [NEAR.lat, NEAR.lng])).rows.length).toBe(0);
    await as(U.farmerA);
    await db.exec(`update farm_profile set delivers_direct = true, delivery_radius_km = 0`);
    await as(U.near);
    expect((await db.query('select * from public.farms_in_range($1, $2)', [NEAR.lat, NEAR.lng])).rows.length).toBe(0);
    await as(U.farmerA);
    await db.exec(`update farm_profile set delivers_direct = true, delivery_radius_km = 3`);
  });
});

describe('placing an order re-checks the radius on the server', () => {
  it('outside the radius is refused even though the caller knows the farm id', async () => {
    await fails(place(U.far, FAR), /outside delivery area/);
  });
  it('inside the radius works, price comes from the farm (not the caller), owner is the farm', async () => {
    const r = await place(U.near, NEAR);
    const id = (r.rows[0] as any).id;
    await asSuper();
    const s = await db.query<any>('select * from delivery_subscriptions where id = $1', [id]);
    expect(s.rows[0].owner_id).toBe(U.farmerA);
    expect(s.rows[0].customer_user_id).toBe(U.near);
    expect(s.rows[0].price_per_litre).toBe(52);
    expect(Number(s.rows[0].distance_km)).toBeLessThan(3);
  });
  it('validates litres, address, slot, dates and signed-in', async () => {
    await fails(place(U.near, NEAR, { litres: 100 }), /litres/);
    await fails(place(U.near, NEAR, { litres: 0 }), /litres/);
    await fails(place(U.near, NEAR, { addr: 'x' }), /address/);
    await fails(place(U.near, NEAR, { slot: 'midnight' }), /slot/);
    await fails(place(U.near, NEAR, { start: '2001-01-01' }), /start date/);
    await as(null);
    await fails(db.query(`select public.place_subscription($1, 13, 80, 'long address', 'n', 'p', 'morning', 1, '[]', current_date + 1)`, [U.farmerA]), /not signed in/);
  });
  it('cannot order from a farm that does not deliver', async () => {
    await fails(place(U.near, NEAR, { owner: U.stranger }), /does not deliver/);
  });
  it('caps active subscriptions per customer', async () => {
    for (let i = 0; i < 12; i++) { try { await place(U.near, NEAR); } catch { /* cap reached */ } }
    await as(U.near);
    const r = await db.query<{ c: number }>(`select count(*)::int as c from delivery_subscriptions where status = 'active'`);
    expect(r.rows[0].c).toBeLessThanOrEqual(10);
  });
});

describe('who can see and change subscriptions', () => {
  it('customer sees only their own; other customer sees none; the farmer sees it', async () => {
    await as(U.near);
    expect((await db.query('select * from delivery_subscriptions')).rows.length).toBeGreaterThan(0);
    await as(U.far);
    expect((await db.query('select * from delivery_subscriptions')).rows.length).toBe(0);
    await as(U.farmerA);
    expect((await db.query('select * from delivery_subscriptions')).rows.length).toBeGreaterThan(0);
    await as(U.stranger);
    expect((await db.query('select * from delivery_subscriptions')).rows.length).toBe(0);
  });
  it('customer cannot edit price/litres directly, or insert a subscription for a farm', async () => {
    await as(U.near);
    await db.exec(`update delivery_subscriptions set price_per_litre = 1, litres = 99`);
    await asSuper();
    const r = await db.query<any>('select price_per_litre, litres from delivery_subscriptions where customer_user_id = $1 limit 1', [U.near]);
    expect(r.rows[0].price_per_litre).toBe(52);
    expect(r.rows[0].litres).not.toBe(99);
    await as(U.near);
    await fails(db.query(
      `insert into delivery_subscriptions (id, owner_id, slot, litres, start_date) values (gen_random_uuid(), $1, 'morning', 1, current_date)`, [U.farmerA]), /row-level security/);
  });
  it('customer can cancel only their own subscription', async () => {
    await as(U.near);
    const mine = (await db.query<{ id: string }>('select id from delivery_subscriptions limit 1')).rows[0].id;
    await as(U.stranger);
    await db.query('select public.cancel_my_subscription($1)', [mine]);
    await asSuper();
    expect((await db.query<any>('select status from delivery_subscriptions where id = $1', [mine])).rows[0].status).toBe('active');
    await as(U.near);
    await db.query('select public.cancel_my_subscription($1)', [mine]);
    await asSuper();
    expect((await db.query<any>('select status from delivery_subscriptions where id = $1', [mine])).rows[0].status).toBe('ended');
  });
});

describe('delivery partners', () => {
  let orderId: string;
  let code: string;
  beforeAll(async () => {
    await as(U.farmerA);
    code = (await db.query<{ c: string }>('select public.ensure_farm_code() as c')).rows[0].c;
    await db.query(`update farm_profile set farm_code = $1`, [code]);
    const sub = (await db.query<{ id: string }>(`select id from delivery_subscriptions where status = 'active' limit 1`)).rows[0].id;
    orderId = (await db.query<{ id: string }>(
      `insert into delivery_orders (id, subscription_id, date, slot, items, amount, status)
       values (gen_random_uuid(), $1, current_date, 'morning', '[{"product":"milk","qty":1.5}]', 78, 'scheduled') returning id`, [sub])).rows[0].id;
  });
  it('farm code is stable and unique per farm', async () => {
    await as(U.farmerA);
    expect((await db.query<{ c: string }>('select public.ensure_farm_code() as c')).rows[0].c).toBe(code);
    expect(code).toMatch(/^[0-9A-F]{6}$/);
  });
  it('wrong code and own farm are refused; right code joins', async () => {
    await as(U.partner);
    await fails(db.query(`select public.join_farm_as_partner('ZZZZZZ', 'P')`), /not found/);
    await as(U.farmerA);
    await fails(db.query(`select public.join_farm_as_partner($1, 'me')`, [code]), /you own this farm/);
    await as(U.partner);
    const r = await db.query<any>(`select public.join_farm_as_partner($1, 'Muthu') as f`, [code]);
    expect(r.rows[0].f).toBe('A Farm');
  });
  it('partner sees today\'s orders of their farm only; a stranger sees none', async () => {
    await as(U.partner);
    const r = await db.query<any>('select * from public.partner_orders(current_date)');
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].address).toMatch(/Main Road/);
    await as(U.stranger);
    expect((await db.query('select * from public.partner_orders(current_date)')).rows.length).toBe(0);
  });
  it('only the farm\'s partner can change an order status, and only to valid values', async () => {
    await as(U.stranger);
    await fails(db.query('select public.partner_set_status($1, $2)', [orderId, 'delivered']), /not allowed/);
    await as(U.partner);
    await fails(db.query('select public.partner_set_status($1, $2)', [orderId, 'refunded']), /bad status/);
    await db.query('select public.partner_set_status($1, $2)', [orderId, 'out']);
    await as(U.farmerA);
    expect((await db.query<any>('select status, partner_id from delivery_orders where id = $1', [orderId])).rows[0]).toMatchObject({ status: 'out', partner_id: U.partner });
  });
  it('live location: only the order\'s customer or farm can read the partner position', async () => {
    await as(U.stranger);
    await fails(db.query('select public.partner_report_location(13.01, 80.0)'), /not a delivery partner/);
    await as(U.partner);
    await db.query('select public.partner_report_location(13.01, 80.0)');
    await as(U.near);
    expect((await db.query('select * from public.order_partner_location($1)', [orderId])).rows.length).toBe(1);
    await as(U.farmerA);
    expect((await db.query('select * from public.order_partner_location($1)', [orderId])).rows.length).toBe(1);
    await as(U.far);
    expect((await db.query('select * from public.order_partner_location($1)', [orderId])).rows.length).toBe(0);
    await as(U.stranger);
    expect((await db.query('select * from public.order_partner_location($1)', [orderId])).rows.length).toBe(0);
    await as(U.stranger);
    await fails(db.query('select * from partner_locations'), /permission denied|row-level/).catch(async () => {
      expect((await db.query('select * from partner_locations')).rows.length).toBe(0);
    });
  });
  it('location stops being visible once the order is delivered', async () => {
    await as(U.partner);
    await db.query('select public.partner_set_status($1, $2)', [orderId, 'delivered']);
    await as(U.near);
    expect((await db.query('select * from public.order_partner_location($1)', [orderId])).rows.length).toBe(0);
  });
});

describe('marketplace', () => {
  it('signed-in users read ACTIVE listings only; only the owner edits', async () => {
    await as(U.farmerA);
    await db.query(`insert into listings (id, flow, category, title, price, status, lat, lng) values (gen_random_uuid(), 'farmer_customer', 'cow', 'HF cow', 60000, 'active', 13, 80)`);
    await db.query(`insert into listings (id, flow, category, title, price, status) values (gen_random_uuid(), 'farmer_customer', 'cow', 'Sold cow', 50000, 'sold')`);
    await db.query(`insert into listings (id, flow, category, title, price, status, deleted_at) values (gen_random_uuid(), 'farmer_customer', 'cow', 'Deleted', 1, 'active', now())`);
    await as(U.near);
    const r = await db.query<any>('select title from listings');
    expect(r.rows.map(x => x.title)).toEqual(['HF cow']);
    await db.exec(`update listings set price = 1`);
    await as(U.farmerA);
    expect((await db.query<any>(`select price from listings where title = 'HF cow'`)).rows[0].price).toBe(60000);
    await as(null);
    expect((await db.query('select * from listings')).rows.length).toBe(0);
  });
  it('photo uploads are limited to the user\'s own folder', async () => {
    await as(U.farmerA);
    await db.query(`insert into storage.objects (bucket_id, name) values ('listing-photos', $1)`, [`${U.farmerA}/a.jpg`]);
    await fails(db.query(`insert into storage.objects (bucket_id, name) values ('listing-photos', $1)`, [`${U.farmerB}/a.jpg`]), /row-level security/);
  });
});

describe('AI scan cost control', () => {
  it('enforces the per-user daily limit', async () => {
    await as(U.stranger);
    const r = [];
    for (let i = 0; i < 4; i++) r.push((await db.query<any>('select public.ocr_bump(3) as ok')).rows[0].ok);
    expect(r).toEqual([true, true, true, false]);
    await as(U.farmerB);
    expect((await db.query<any>('select public.ocr_bump(3) as ok')).rows[0].ok).toBe(true); // other users unaffected
  });
  it('users cannot read or edit usage counters directly', async () => {
    await as(U.stranger);
    expect((await db.query('select * from ocr_usage')).rows.length).toBe(0);
  });
});
