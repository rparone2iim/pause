import "server-only";
import { and, between, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { type NewSpot, spots } from "@/db/schema";
import { db } from "../db";

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export const spotRepository = {
  findById: async (id: string) => (await db.select().from(spots).where(eq(spots.id, id)).limit(1))[0] ?? null,

  findByOsmRef: async (osmRef: string) => (await db.select().from(spots).where(eq(spots.osmRef, osmRef)).limit(1))[0] ?? null,

  /** OpenStreetMap ids → our spot ids, for the OSM places that already have a row. */
  async idsByOsmRefs(refs: string[]) {
    if (refs.length === 0) return new Map<string, string>();
    const rows = await db.select({ id: spots.id, osmRef: spots.osmRef }).from(spots).where(inArray(spots.osmRef, refs));
    return new Map(rows.map((r) => [r.osmRef!, r.id]));
  },

  /** Community spots inside a box (fast thanks to the lat/lng index): public ones, plus the viewer's own private ones. */
  findCommunityInBox: (box: BoundingBox, viewerId: string) =>
    db
      .select()
      .from(spots)
      .where(
        and(
          isNotNull(spots.authorId),
          between(spots.lat, box.minLat, box.maxLat),
          between(spots.lng, box.minLng, box.maxLng),
          or(eq(spots.isPrivate, false), eq(spots.authorId, viewerId)),
        ),
      )
      .limit(300),

  findByAuthor: (authorId: string) => db.select().from(spots).where(eq(spots.authorId, authorId)).orderBy(desc(spots.createdAt)).limit(100),

  create: async (data: NewSpot) => (await db.insert(spots).values(data).returning())[0],

  /** Row mirroring an OpenStreetMap place (no author). Safe when two requests race: the unique osm_ref wins. */
  async upsertFromOsm(data: NewSpot & { osmRef: string }) {
    await db.insert(spots).values(data).onConflictDoNothing({ target: spots.osmRef });
    return (await db.select().from(spots).where(eq(spots.osmRef, data.osmRef)).limit(1))[0];
  },

  update: async (id: string, data: Partial<NewSpot>) => (await db.update(spots).set(data).where(eq(spots.id, id)).returning())[0],

  /** Cascades to the spot's photos, reviews and favorites. */
  delete: (id: string) => db.delete(spots).where(eq(spots.id, id)),
};
