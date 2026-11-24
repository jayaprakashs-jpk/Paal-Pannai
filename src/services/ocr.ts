import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { persistImage } from './images';
import { requireSupabase } from './supabase';
import { today } from '../lib/dates';

/**
 * AI notebook / bill scanner.
 * The phone only photographs, compresses and uploads the page to YOUR Supabase Edge Function
 * (supabase/functions/ocr-extract). The function holds the AI key and checks the user's login
 * and daily limit. NEVER put an AI key inside the APK: anyone can unzip an APK.
 */
export interface ScanRow {
  date: string | null;          // YYYY-MM-DD
  session: 'morning' | 'evening' | null;
  animal_tag: string | null;
  litres: number | null;
  fat: number | null;
  snf: number | null;
  amount: number | null;
  confidence: number;           // 0..1
}

export type ScanKind = 'milk_notebook' | 'society_slip' | 'receipt';

const MAX_WIDTH = 1600;

/** Takes a photo (or picks one), shrinks it, and keeps a permanent copy so offline scans survive. */
export async function captureImage(source: 'camera' | 'library'): Promise<string | null> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  return persistImage(res.assets[0].uri, 'scans', MAX_WIDTH);
}

export async function extractRows(
  imageUri: string, kind: ScanKind, knownTags: string[],
): Promise<ScanRow[]> {
  const sb = requireSupabase();
  const b64 = await new File(imageUri).base64();
  if (b64.length > 6_000_000) throw new Error('Image is too large. Take a closer, clearer photo.');
  const { data, error } = await sb.functions.invoke('ocr-extract', {
    body: { image_base64: b64, media_type: 'image/jpeg', kind, today: today(), known_tags: knownTags.slice(0, 80) },
  });
  if (error) {
    // supabase-js hides the body of non-2xx responses; try to surface our function's message
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* keep default */ }
    throw new Error(msg);
  }
  const rows = (data?.rows ?? []) as ScanRow[];
  return rows.map(normalizeRow);
}

function num(v: any): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function normalizeRow(r: any): ScanRow {
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
  const session = r.session === 'morning' || r.session === 'evening' ? r.session : null;
  let fat = num(r.fat);
  let snf = num(r.snf);
  // reject physically impossible values instead of saving a misread digit
  if (fat !== null && (fat < 0.5 || fat > 15)) fat = null;
  if (snf !== null && (snf < 5 || snf > 12)) snf = null;
  const litres = num(r.litres);
  return {
    date, session,
    animal_tag: r.animal_tag ? String(r.animal_tag).trim() : null,
    litres: litres !== null && litres > 0 && litres < 200 ? litres : null,
    fat, snf, amount: num(r.amount),
    confidence: Math.min(1, Math.max(0, num(r.confidence) ?? 0.5)),
  };
}
