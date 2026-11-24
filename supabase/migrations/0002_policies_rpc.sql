-- Nammoor Pannai: marketplace, geofenced delivery, delivery partners, OCR limits.
-- Run AFTER 0001_tables.sql.
--
-- SECURITY MODEL
--  * Every synced table is owner-only (see 0001). Other people NEVER read another farmer's rows directly.
--  * Anything shared (nearby farms, partner location) goes through SECURITY DEFINER functions below that
--    check the caller and return only the fields that are safe to share.
--  * The delivery-radius rule is enforced HERE (server). The app also checks it for a nicer UI, but the
--    app can be modified; the database cannot.

-- ---------- helpers ----------
create or replace function public.haversine_km(lat1 double precision, lng1 double precision,
                                               lat2 double precision, lng2 double precision)
returns double precision language sql immutable parallel safe as $$
  select 2 * 6371.0088 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))
$$;

-- ---------- profiles (role) ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'farmer' check (role in ('farmer','agent','customer','delivery_partner')),
  display_name text,
  phone text,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.set_my_profile(p_role text, p_name text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_role not in ('farmer','agent','customer','delivery_partner') then raise exception 'bad role'; end if;
  insert into public.profiles(user_id, role, display_name, phone, updated_at)
  values (auth.uid(), p_role, left(p_name, 80), left(p_phone, 20), now())
  on conflict (user_id) do update
    set role = excluded.role, display_name = excluded.display_name, phone = excluded.phone, updated_at = now();
end $$;

-- ---------- marketplace ----------
-- Any signed-in user can read ACTIVE listings. Writing stays owner-only (0001 policy).
drop policy if exists listings_public_read on public.listings;
create policy listings_public_read on public.listings for select to authenticated
  using (auth.uid() is not null and status = 'active' and deleted_at is null);
create index if not exists listings_market_idx on public.listings (status, flow, category, lat, lng);

insert into storage.buckets (id, name, public) values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;
drop policy if exists listing_photos_insert on storage.objects;
create policy listing_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists listing_photos_delete on storage.objects;
create policy listing_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- farm code (partners join with this) ----------
create unique index if not exists farm_profile_code_uq on public.farm_profile (farm_code) where farm_code is not null;

create or replace function public.ensure_farm_code() returns text
language plpgsql security definer set search_path = public as $$
declare v_code text; v_try int := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select farm_code into v_code from public.farm_profile where owner_id = auth.uid() and deleted_at is null order by created_at limit 1;
  if v_code is not null then return v_code; end if;
  loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.farm_profile where farm_code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'could not allocate code'; end if;
  end loop;
  return v_code;
end $$;

-- ---------- geofenced discovery ----------
-- Customers get farms ONLY if the customer is inside that farm's own delivery radius.
-- Farm coordinates are never returned, only a rounded distance.
create or replace function public.farms_in_range(p_lat double precision, p_lng double precision)
returns table (
  farm_owner uuid, farm_name text, owner_name text, village text, distance_km numeric,
  radius_km double precision, price_per_litre double precision, addons jsonb, phone text
) language plpgsql security definer set search_path = public stable as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'bad location';
  end if;
  return query
  select f.owner_id, f.farm_name, f.owner_name, f.village,
         round(public.haversine_km(p_lat, p_lng, f.lat, f.lng)::numeric, 1),
         f.delivery_radius_km, f.delivery_price, f.addon_catalog, f.phone
  from public.farm_profile f
  where f.deleted_at is null
    and f.delivers_direct = true
    and f.delivery_radius_km > 0
    and f.lat is not null and f.lng is not null
    and public.haversine_km(p_lat, p_lng, f.lat, f.lng) <= f.delivery_radius_km
  order by 5
  limit 50;
end $$;

-- ---------- order / subscription (re-checks the radius) ----------
create or replace function public.place_subscription(
  p_farm_owner uuid, p_lat double precision, p_lng double precision, p_address text,
  p_name text, p_phone text, p_slot text, p_litres double precision, p_addons jsonb, p_start date
) returns uuid language plpgsql security definer set search_path = public as $$
declare f record; v_id uuid := gen_random_uuid(); v_dist double precision; v_n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_slot not in ('morning','evening') then raise exception 'bad slot'; end if;
  if p_litres is null or p_litres <= 0 or p_litres > 25 then raise exception 'litres must be between 0 and 25'; end if;
  if p_lat is null or p_lng is null then raise exception 'delivery location is required'; end if;
  if coalesce(length(trim(p_address)), 0) < 5 then raise exception 'address is required'; end if;
  if p_start < current_date or p_start > current_date + 60 then raise exception 'bad start date'; end if;

  select * into f from public.farm_profile
   where owner_id = p_farm_owner and deleted_at is null and delivers_direct = true limit 1;
  if not found then raise exception 'this farm does not deliver'; end if;
  if f.lat is null or f.lng is null or coalesce(f.delivery_radius_km, 0) <= 0 then raise exception 'this farm does not deliver'; end if;

  v_dist := public.haversine_km(p_lat, p_lng, f.lat, f.lng);
  if v_dist > f.delivery_radius_km then
    raise exception 'outside delivery area (% km away, farm delivers up to % km)', round(v_dist::numeric, 1), f.delivery_radius_km;
  end if;

  select count(*) into v_n from public.delivery_subscriptions
   where customer_user_id = auth.uid() and status = 'active' and deleted_at is null;
  if v_n >= 10 then raise exception 'too many active subscriptions'; end if;

  insert into public.delivery_subscriptions (
    id, owner_id, customer_user_id, customer_name, customer_phone, address, lat, lng, distance_km,
    slot, litres, price_per_litre, addons, start_date, status
  ) values (
    v_id, p_farm_owner, auth.uid(), left(p_name, 80), left(p_phone, 20), left(p_address, 300), p_lat, p_lng,
    round(v_dist::numeric, 2), p_slot, p_litres, f.delivery_price, coalesce(p_addons, '[]'::jsonb), p_start, 'active'
  );
  return v_id;
end $$;

create or replace function public.cancel_my_subscription(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.delivery_subscriptions set status = 'ended', end_date = current_date
   where id = p_id and customer_user_id = auth.uid();
end $$;

-- Customers can READ their own subscriptions and their orders (writes only via the functions).
drop policy if exists subs_customer_read on public.delivery_subscriptions;
create policy subs_customer_read on public.delivery_subscriptions for select to authenticated
  using (customer_user_id = auth.uid() and deleted_at is null);
drop policy if exists orders_customer_read on public.delivery_orders;
create policy orders_customer_read on public.delivery_orders for select to authenticated
  using (exists (select 1 from public.delivery_subscriptions s
                 where s.id = delivery_orders.subscription_id and s.customer_user_id = auth.uid()));

-- ---------- delivery partners ----------
create table if not exists public.farm_partners (
  partner_user uuid not null references auth.users(id) on delete cascade,
  farm_owner uuid not null references auth.users(id) on delete cascade,
  partner_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (partner_user, farm_owner)
);
alter table public.farm_partners enable row level security;
drop policy if exists fp_read on public.farm_partners;
create policy fp_read on public.farm_partners for select to authenticated
  using (partner_user = auth.uid() or farm_owner = auth.uid());
drop policy if exists fp_farm_update on public.farm_partners;
create policy fp_farm_update on public.farm_partners for update to authenticated
  using (farm_owner = auth.uid()) with check (farm_owner = auth.uid());

create or replace function public.join_farm_as_partner(p_code text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_farm text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select owner_id, farm_name into v_owner, v_farm from public.farm_profile
   where farm_code = upper(trim(p_code)) and deleted_at is null limit 1;
  if v_owner is null then raise exception 'farm code not found'; end if;
  if v_owner = auth.uid() then raise exception 'you own this farm'; end if;
  insert into public.farm_partners(partner_user, farm_owner, partner_name) values (auth.uid(), v_owner, left(p_name, 80))
  on conflict (partner_user, farm_owner) do update set active = true, partner_name = excluded.partner_name;
  return v_farm;
end $$;

create or replace function public.partner_orders(p_date date)
returns table (order_id uuid, subscription_id uuid, farm_name text, slot text, status text, items jsonb,
               amount double precision, customer_name text, customer_phone text, address text,
               lat double precision, lng double precision)
language sql security definer set search_path = public stable as $$
  select o.id, o.subscription_id, f.farm_name, o.slot, o.status, o.items, o.amount,
         s.customer_name, s.customer_phone, s.address, s.lat, s.lng
  from public.delivery_orders o
  join public.delivery_subscriptions s on s.id = o.subscription_id
  join public.farm_partners fp on fp.farm_owner = o.owner_id and fp.partner_user = auth.uid() and fp.active
  left join public.farm_profile f on f.owner_id = o.owner_id and f.deleted_at is null
  where o.date = p_date and o.deleted_at is null and s.deleted_at is null
  order by o.slot, o.created_at
$$;

create or replace function public.partner_set_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('out','delivered','missed') then raise exception 'bad status'; end if;
  update public.delivery_orders o
     set status = p_status,
         delivered_at = case when p_status = 'delivered' then now() else o.delivered_at end,
         partner_id = auth.uid(), updated_at = now()
   where o.id = p_order
     and exists (select 1 from public.farm_partners fp
                 where fp.farm_owner = o.owner_id and fp.partner_user = auth.uid() and fp.active);
  if not found then raise exception 'not allowed'; end if;
end $$;

create table if not exists public.partner_locations (
  partner_user uuid primary key references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);
alter table public.partner_locations enable row level security;
-- no direct policies: read/write only through the functions below

create or replace function public.partner_report_location(p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'bad location'; end if;
  if not exists (select 1 from public.farm_partners where partner_user = auth.uid() and active) then
    raise exception 'not a delivery partner';
  end if;
  insert into public.partner_locations(partner_user, lat, lng, updated_at) values (auth.uid(), p_lat, p_lng, now())
  on conflict (partner_user) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();
end $$;

create or replace function public.partner_stop_sharing() returns void
language sql security definer set search_path = public as $$
  delete from public.partner_locations where partner_user = auth.uid();
$$;

-- The customer (or the farm) of an order that is OUT FOR DELIVERY today can see that partner's last position.
create or replace function public.order_partner_location(p_order uuid)
returns table (lat double precision, lng double precision, updated_at timestamptz, partner_name text)
language sql security definer set search_path = public stable as $$
  select pl.lat, pl.lng, pl.updated_at, fp.partner_name
  from public.delivery_orders o
  join public.delivery_subscriptions s on s.id = o.subscription_id
  join public.partner_locations pl on pl.partner_user = o.partner_id
  left join public.farm_partners fp on fp.partner_user = o.partner_id and fp.farm_owner = o.owner_id
  where o.id = p_order and o.status = 'out' and o.date = current_date
    and (s.customer_user_id = auth.uid() or o.owner_id = auth.uid())
    and pl.updated_at > now() - interval '30 minutes'
$$;

-- ---------- AI scan: per-user daily limit ----------
create table if not exists public.ocr_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  n integer not null default 0,
  primary key (user_id, day)
);
alter table public.ocr_usage enable row level security;

create or replace function public.ocr_bump(p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if auth.uid() is null then return false; end if;
  insert into public.ocr_usage(user_id, day, n) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set n = public.ocr_usage.n + 1
  returning n into v_n;
  return v_n <= p_limit;
end $$;

-- ---------- scheme catalogue (editable without a new APK) ----------
create table if not exists public.schemes (
  id text primary key,
  body jsonb not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.schemes enable row level security;
drop policy if exists schemes_read on public.schemes;
create policy schemes_read on public.schemes for select to authenticated using (auth.uid() is not null and active);

-- ---------- lock down function access ----------
revoke all on function public.farms_in_range(double precision, double precision) from public, anon;
revoke all on function public.place_subscription(uuid, double precision, double precision, text, text, text, text, double precision, jsonb, date) from public, anon;
revoke all on function public.cancel_my_subscription(uuid) from public, anon;
revoke all on function public.join_farm_as_partner(text, text) from public, anon;
revoke all on function public.partner_orders(date) from public, anon;
revoke all on function public.partner_set_status(uuid, text) from public, anon;
revoke all on function public.partner_report_location(double precision, double precision) from public, anon;
revoke all on function public.partner_stop_sharing() from public, anon;
revoke all on function public.order_partner_location(uuid) from public, anon;
revoke all on function public.ocr_bump(integer) from public, anon;
revoke all on function public.ensure_farm_code() from public, anon;
revoke all on function public.set_my_profile(text, text, text) from public, anon;
grant execute on function public.farms_in_range(double precision, double precision) to authenticated;
grant execute on function public.place_subscription(uuid, double precision, double precision, text, text, text, text, double precision, jsonb, date) to authenticated;
grant execute on function public.cancel_my_subscription(uuid) to authenticated;
grant execute on function public.join_farm_as_partner(text, text) to authenticated;
grant execute on function public.partner_orders(date) to authenticated;
grant execute on function public.partner_set_status(uuid, text) to authenticated;
grant execute on function public.partner_report_location(double precision, double precision) to authenticated;
grant execute on function public.partner_stop_sharing() to authenticated;
grant execute on function public.order_partner_location(uuid) to authenticated;
grant execute on function public.ocr_bump(integer) to authenticated;
grant execute on function public.ensure_farm_code() to authenticated;
grant execute on function public.set_my_profile(text, text, text) to authenticated;
