import type { LatLng, Origin, Place } from "./types";

/** Walking pace used for every "x min walk" estimate (≈ 4.8 km/h). */
export const WALK_M_PER_MIN = 80;

export const DEFAULT_ORIGIN: Origin = {
  lat: Number(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? 48.8932),
  lng: Number(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? 2.2269),
  label: process.env.NEXT_PUBLIC_DEFAULT_LABEL ?? "IIM Digital School · Nanterre",
  source: "default",
};

export function distanceM(a: LatLng, b: LatLng) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Straight-line distance × 1.25 to approximate the street network. */
export function walkFrom(origin: LatLng, p: LatLng) {
  const m = Math.round((distanceM(origin, p) * 1.25) / 10) * 10;
  return { distanceM: Math.max(10, m), walkMin: Math.max(1, Math.round(m / WALK_M_PER_MIN)) };
}

export function withDistance<T extends Place>(origin: LatLng, places: T[]): T[] {
  return places.map((p) => ({ ...p, ...walkFrom(origin, p) }));
}

export function directionsUrl(from: LatLng, to: LatLng) {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat.toFixed(6)},${from.lng.toFixed(6)}&destination=${to.lat.toFixed(6)},${to.lng.toFixed(6)}&travelmode=walking`;
}
