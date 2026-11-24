import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { uuid } from '../db/repo';

const BUCKET = 'listing-photos';
const isLocal = (u: string) => u.startsWith('file:') || u.startsWith('content:');

/** Uploads local photo files of a listing row to Supabase Storage and swaps the URIs for public URLs. */
export async function uploadListingPhotos(row: Record<string, any>, uid: string): Promise<Record<string, any>> {
  if (!supabase || !row.photos) return row;
  let photos: string[];
  try { photos = typeof row.photos === 'string' ? JSON.parse(row.photos) : row.photos; } catch { return row; }
  if (!Array.isArray(photos) || !photos.some(isLocal)) return row;

  const out: string[] = [];
  for (const p of photos) {
    if (!isLocal(p)) { out.push(p); continue; }
    try {
      const bytes = await new File(p).bytes();
      const path = `${uid}/${uuid()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (error) { out.push(p); continue; } // keep local, retry next sync
      out.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    } catch { out.push(p); }
  }
  return { ...row, photos: JSON.stringify(out) };
}
