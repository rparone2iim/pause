import "server-only";
import { asc, eq, inArray, or, sql } from "drizzle-orm";
import { photos, spots } from "@/db/schema";
import { db } from "../db";

export const MAX_PHOTOS_PER_SPOT = 6;

export const photoRepository = {
  findByFilename: async (filename: string) => (await db.select().from(photos).where(eq(photos.filename, filename)).limit(1))[0] ?? null,

  listBySpot: (spotId: string) => db.select().from(photos).where(eq(photos.spotId, spotId)).orderBy(asc(photos.createdAt)),

  /** First photo of each spot, in one query. */
  async firstBySpots(spotIds: string[]) {
    if (spotIds.length === 0) return new Map<string, string>();
    const rows = await db
      .selectDistinctOn([photos.spotId], { spotId: photos.spotId, filename: photos.filename })
      .from(photos)
      .where(inArray(photos.spotId, spotIds))
      .orderBy(photos.spotId, asc(photos.createdAt));
    return new Map(rows.map((r) => [r.spotId, r.filename]));
  },

  /**
   * Inserts a photo unless the spot already has 6. The spot row is locked during the check,
   * so two simultaneous uploads can't both pass it. Returns null when the spot is full.
   */
  addIfRoom: (data: { filename: string; spotId: string; uploaderId: string }) =>
    db.transaction(async (tx) => {
      await tx.select({ id: spots.id }).from(spots).where(eq(spots.id, data.spotId)).for("update");
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(photos).where(eq(photos.spotId, data.spotId));
      if (count >= MAX_PHOTOS_PER_SPOT) return null;
      return (await tx.insert(photos).values(data).returning())[0];
    }),

  delete: (filename: string) => db.delete(photos).where(eq(photos.filename, filename)),

  filenamesOfSpot: async (spotId: string) => (await db.select({ f: photos.filename }).from(photos).where(eq(photos.spotId, spotId))).map((r) => r.f),

  /** Files that disappear with an account: photos it uploaded, and every photo of the spots it authored. */
  filenamesOfUser: async (userId: string) =>
    (
      await db
        .select({ f: photos.filename })
        .from(photos)
        .leftJoin(spots, eq(spots.id, photos.spotId))
        .where(or(eq(photos.uploaderId, userId), eq(spots.authorId, userId)))
    ).map((r) => r.f),
};
