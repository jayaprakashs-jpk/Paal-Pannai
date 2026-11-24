import NetInfo from '@react-native-community/netinfo';
import { kvGet, kvSet } from '../db/client';
import { haversineKm, boundingBox, LatLng } from '../lib/geo';
import { supabase } from './supabase';

export interface MarketListing {
  id: string; owner_id: string; flow: string; category: string; title: string; description: string | null;
  price: number; price_unit: string; quantity: number; photos: string[] | null; details: any; lat: number | null; lng: number | null;
  village: string | null; contact_phone: string | null; created_at: string; distanceKm?: number;
  status?: string; animal_id?: string | null;
}

const CACHE = 'market.cache';

export async function fetchMarket(opts: {
  origin: LatLng | null; radiusKm: number | null; flows: string[] | null; category: string | null; limit?: number;
}): Promise<{ rows: MarketListing[]; fromCache: boolean; error?: string }> {
  const cached = async (error?: string) => {
    const raw = await kvGet(CACHE);
    return { rows: raw ? (JSON.parse(raw) as MarketListing[]) : [], fromCache: true, error };
  };
  if (!supabase) return cached('Cloud is not set up');
  const net = await NetInfo.fetch();
  if (!net.isConnected) return cached('Offline');
  let q = supabase.from('listings').select('*').eq('status', 'active').is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(opts.limit ?? 100);
  if (opts.flows?.length) q = q.in('flow', opts.flows);
  if (opts.category) q = q.eq('category', opts.category);
  if (opts.origin && opts.radiusKm) {
    const b = boundingBox(opts.origin, opts.radiusKm);
    q = q.gte('lat', b.minLat).lte('lat', b.maxLat).gte('lng', b.minLng).lte('lng', b.maxLng);
  }
  const { data, error } = await q;
  if (error) return cached(error.message);
  let rows = (data ?? []) as MarketListing[];
  if (opts.origin) {
    rows = rows.map(r => ({ ...r, distanceKm: r.lat != null && r.lng != null ? haversineKm(opts.origin!, { lat: r.lat, lng: r.lng }) : undefined }));
    if (opts.radiusKm) rows = rows.filter(r => r.distanceKm === undefined || r.distanceKm <= opts.radiusKm!);
    rows.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  }
  await kvSet(CACHE, JSON.stringify(rows.slice(0, 60)));
  return { rows, fromCache: false };
}

export async function fetchListing(id: string): Promise<MarketListing | null> {
  if (supabase) {
    const { data } = await supabase.from('listings').select('*').eq('id', id).maybeSingle();
    if (data) return data as MarketListing;
  }
  const raw = await kvGet(CACHE);
  return raw ? (JSON.parse(raw) as MarketListing[]).find(x => x.id === id) ?? null : null;
}
