import * as Location from 'expo-location';
import { LatLng } from '../lib/geo';

export interface Fix extends LatLng { accuracy: number | null }

export async function ensureLocationPermission(): Promise<boolean> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

/** Current GPS fix, or the last known one if GPS is slow (rural coverage). Null if unavailable. */
export async function getPosition(timeoutMs = 15000): Promise<Fix | null> {
  if (!(await ensureLocationPermission())) return null;
  try {
    const p = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>(res => setTimeout(() => res(null), timeoutMs)),
    ]);
    if (p) return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null };
  } catch { /* fall through */ }
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude, accuracy: last.coords.accuracy ?? null };
  } catch { /* none */ }
  return null;
}

export async function placeName(p: LatLng): Promise<string | null> {
  try {
    const r = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
    const a = r[0];
    if (!a) return null;
    return [a.name, a.street, a.district, a.city].filter(Boolean).slice(0, 3).join(', ') || null;
  } catch { return null; }
}

export async function watchPosition(onFix: (f: Fix) => void, intervalMs = 15000): Promise<{ remove: () => void } | null> {
  if (!(await ensureLocationPermission())) return null;
  return Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: intervalMs, distanceInterval: 20 },
    p => onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null }),
  );
}
