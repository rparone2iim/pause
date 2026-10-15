import "server-only";
import { and, asc, avg, between, count, eq, inArray, or } from "drizzle-orm";
import { favorites, photos, reviews, spots } from "@/db/schema";
import { db } from "./db";
import { WALK_M_PER_MIN, distanceM } from "./geo";

/** Rectangle around a point: a fast SQL pre-filter on the lat/lng index before the exact circle. */
function boundingBox(lat: number, lng: number, radiusM: number) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/**
 * The spots of our database around a point, nearest first — what the assistant may recommend.
 * Read on the server (never sent by the browser), so nobody can slip a made-up place into the AI's list.
 * Private spots are only included for their author.
 */
export async function findNearbySpots(q: { lat: number; lng: number; radius: number; userId: string }) {
  // 1) SQL pre-filter on a rectangle (uses the lat/lng index)
  const box = boundingBox(q.lat, q.lng, q.radius);
  const rows = await db
    .select()
    .from(spots)
    .where(
      and(
        between(spots.lat, box.minLat, box.maxLat),
        between(spots.lng, box.minLng, box.maxLng),
        or(eq(spots.isPrivate, false), eq(spots.authorId, q.userId)),
      ),
    )
    .limit(500);

  // 2) exact distance (circle) + sort
  const nearby = rows
    .map((s) => ({ ...s, distanceM: Math.round(distanceM({ lat: q.lat, lng: q.lng }, s)) }))
    .filter((s) => s.distanceM <= q.radius)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 100);
  const ids = nearby.map((s) => s.id);
  if (ids.length === 0) return [];

  // 3) average ratings, first photo, favorites — 3 grouped queries (no N+1)
  const [stats, pics, favs] = await Promise.all([
    db.select({ spotId: reviews.spotId, rating: avg(reviews.rating), n: count() }).from(reviews).where(inArray(reviews.spotId, ids)).groupBy(reviews.spotId),
    db.select({ spotId: photos.spotId, filename: photos.filename }).from(photos).where(inArray(photos.spotId, ids)).orderBy(asc(photos.createdAt)),
    db.select({ spotId: favorites.spotId }).from(favorites).where(and(eq(favorites.userId, q.userId), inArray(favorites.spotId, ids))),
  ]);
  const statBy = new Map(stats.map((s) => [s.spotId, s]));
  const picBy = new Map<string, string>();
  for (const p of pics) if (!picBy.has(p.spotId)) picBy.set(p.spotId, p.filename);
  const favSet = new Set(favs.map((f) => f.spotId));

  return nearby.map((s) => {
    const st = statBy.get(s.id);
    return {
      id: s.osmRef ?? s.id, // the id the front uses for this place (OpenStreetMap places keep their OSM id)
      name: s.name,
      description: s.description,
      accessTip: s.accessTip,
      type: s.type,
      tags: s.tags,
      filters: s.filters,
      lat: s.lat,
      lng: s.lng,
      distanceM: s.distanceM,
      walkMin: Math.max(1, Math.round(s.distanceM / WALK_M_PER_MIN)),
      rating: st?.rating ? Number(Number(st.rating).toFixed(1)) : null,
      reviewCount: st?.n ?? 0,
      cover: picBy.get(s.id) ?? null,
      isFavorite: favSet.has(s.id),
    };
  });
}

export type NearbySpot = Awaited<ReturnType<typeof findNearbySpots>>[number];
