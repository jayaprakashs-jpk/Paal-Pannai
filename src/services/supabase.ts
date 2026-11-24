import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** false => the app runs fully offline-only (no login, no sync, no marketplace). */
export const isCloudConfigured = Boolean(url && anon);

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(url, anon, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Cloud is not set up. Add the Supabase URL and key, then rebuild.');
  return supabase;
}
