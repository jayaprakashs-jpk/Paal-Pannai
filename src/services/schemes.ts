import { kvGet, kvSet } from '../db/client';
import { SCHEMES, Scheme } from '../data/schemes';
import { supabase } from './supabase';

/**
 * Schemes ship inside the app, but the list can be corrected from the cloud
 * (table `schemes`, one row per scheme with the same JSON as src/data/schemes.ts),
 * so a wrong rule is fixed for everyone without a new APK.
 */
export async function loadSchemes(refresh = true): Promise<Scheme[]> {
  if (supabase && refresh) {
    try {
      const { data, error } = await supabase.from('schemes').select('id, body').eq('active', true);
      if (!error && data && data.length) {
        const list = data.map(r => ({ ...(r.body as Scheme), id: r.id })) as Scheme[];
        await kvSet('schemes.cache', JSON.stringify(list));
        return list;
      }
    } catch { /* offline: fall through to cache */ }
  }
  const cached = await kvGet('schemes.cache');
  if (cached) { try { return JSON.parse(cached) as Scheme[]; } catch { /* ignore */ } }
  return SCHEMES;
}
