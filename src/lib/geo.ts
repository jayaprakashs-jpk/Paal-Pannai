export interface LatLng { lat: number; lng: number }

const R = 6371.0088; // km, mean earth radius
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const haversineM = (a: LatLng, b: LatLng): number => haversineKm(a, b) * 1000;

/** Inclusive. radiusKm <= 0 means "no delivery" so nobody is inside. */
export function isWithinRadius(center: LatLng, point: LatLng, radiusKm: number): boolean {
  if (!(radiusKm > 0)) return false;
  return haversineKm(center, point) <= radiusKm;
}

export function validLatLng(lat: any, lng: any): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export function fmtKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** Minimum move (metres) before we call it a new grazing area / shed. GPS jitter is 5-30 m. */
export const AREA_CHANGE_THRESHOLD_M = 150;

/** Greedy nearest-stop-first route from `start`. Good enough for <30 doorstep deliveries. */
export function orderByNearest<T extends LatLng>(start: LatLng, stops: T[]): { ordered: T[]; totalKm: number } {
  const left = [...stops];
  const ordered: T[] = [];
  let cur = start;
  let total = 0;
  while (left.length) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = haversineKm(cur, left[i]);
      if (d < bd) { bd = d; bi = i; }
    }
    const next = left.splice(bi, 1)[0];
    ordered.push(next);
    total += bd;
    cur = next;
  }
  return { ordered, totalKm: Math.round(total * 10) / 10 };
}

/** Rough bounding box so the cloud query can filter before we compute exact distance. */
export function boundingBox(c: LatLng, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos(rad(c.lat))));
  return { minLat: c.lat - dLat, maxLat: c.lat + dLat, minLng: c.lng - dLng, maxLng: c.lng + dLng };
}
