import "server-only";
import { and, avg, between, count, eq, inArray, asc } from "drizzle-orm";
import { db } from "./db";
import { spots, reviews, photos, favorites } from "@/db/schema";
import { boundingBox, distanceM, walkMinutes } from "./geo";
import type { SpotType } from "./constants";

/**
 * Spots dans un rayon autour d'un point, du plus proche au plus loin.
 * Utilisé par la carte (GET /api/spots) ET par l'assistant IA.
 */
export async function findNearbySpots(q: { lat: number; lng: number; radius: number; type?: SpotType; userId: string }) {
  // 1) pré-filtre SQL sur un rectangle (utilise l'index lat/lng)
  const box = boundingBox(q.lat, q.lng, q.radius);
  const rows = await db.select().from(spots).where(and(
    between(spots.lat, box.minLat, box.maxLat),
    between(spots.lng, box.minLng, box.maxLng),
    q.type ? eq(spots.type, q.type) : undefined,
  )).limit(500);

  // 2) distance exacte (cercle) + tri
  const nearby = rows
    .map((s) => ({ ...s, distanceM: distanceM(q.lat, q.lng, s.lat, s.lng) }))
    .filter((s) => s.distanceM <= q.radius)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 100);
  const ids = nearby.map((s) => s.id);
  if (ids.length === 0) return [];

  // 3) notes moyennes, 1re photo, favoris — en 3 requêtes groupées (pas de N+1)
  const [stats, pics, favs] = await Promise.all([
    db.select({ spotId: reviews.spotId, rating: avg(reviews.rating), n: count() })
      .from(reviews).where(inArray(reviews.spotId, ids)).groupBy(reviews.spotId),
    db.select({ spotId: photos.spotId, filename: photos.filename })
      .from(photos).where(inArray(photos.spotId, ids)).orderBy(asc(photos.createdAt)),
    db.select({ spotId: favorites.spotId })
      .from(favorites).where(and(eq(favorites.userId, q.userId), inArray(favorites.spotId, ids))),
  ]);
  const statBy = new Map(stats.map((s) => [s.spotId, s]));
  const picBy = new Map<string, string>();
  for (const p of pics) if (!picBy.has(p.spotId)) picBy.set(p.spotId, p.filename);
  const favSet = new Set(favs.map((f) => f.spotId));

  return nearby.map((s) => {
    const st = statBy.get(s.id);
    return {
      id: s.id, name: s.name, description: s.description, accessTip: s.accessTip, type: s.type, tags: s.tags,
      lat: s.lat, lng: s.lng, distanceM: s.distanceM, walkMin: walkMinutes(s.distanceM),
      rating: st?.rating ? Number(Number(st.rating).toFixed(1)) : null,
      reviewCount: st?.n ?? 0,
      cover: picBy.get(s.id) ?? null,
      isFavorite: favSet.has(s.id),
    };
  });
}

export type NearbySpot = Awaited<ReturnType<typeof findNearbySpots>>[number];
