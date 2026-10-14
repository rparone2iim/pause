/** Distance en mètres entre deux points GPS (formule de Haversine). */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Rectangle (lat/lng min/max) qui contient le cercle de rayon `radiusM` : sert de pré-filtre SQL indexé. */
export function boundingBox(lat: number, lng: number, radiusM: number) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** ~80 m par minute à pied. */
export const walkMinutes = (m: number) => Math.max(1, Math.round(m / 80));
