import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { favorites, spots } from "@/db/schema";
import { db } from "../db";

export const favoriteRepository = {
  add: (userId: string, spotId: string) => db.insert(favorites).values({ userId, spotId }).onConflictDoNothing(),

  remove: (userId: string, spotId: string) => db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.spotId, spotId))),

  /** The user's favorite spots, most recent first. */
  listSpots: async (userId: string) =>
    (
      await db
        .select({ spot: spots })
        .from(favorites)
        .innerJoin(spots, eq(spots.id, favorites.spotId))
        .where(eq(favorites.userId, userId))
        .orderBy(desc(favorites.createdAt))
        .limit(200)
    ).map((r) => r.spot),

  /** Which of these spots the user has bookmarked, in one query. */
  async idsAmong(userId: string, spotIds: string[]) {
    if (spotIds.length === 0) return new Set<string>();
    const rows = await db
      .select({ spotId: favorites.spotId })
      .from(favorites)
      .where(and(eq(favorites.userId, userId), inArray(favorites.spotId, spotIds)));
    return new Set(rows.map((r) => r.spotId));
  },
};
