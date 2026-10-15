import "server-only";
import { and, avg, count, desc, eq, inArray, sql } from "drizzle-orm";
import { reviews, users } from "@/db/schema";
import { db } from "../db";
import type { PageArgs } from "../pagination";

const withAuthor = {
  id: reviews.id,
  spotId: reviews.spotId,
  authorId: reviews.authorId,
  rating: reviews.rating,
  calm: reviews.calm,
  clean: reviews.clean,
  seating: reviews.seating,
  comment: reviews.comment,
  createdAt: reviews.createdAt,
  updatedAt: reviews.updatedAt,
  authorName: users.displayName,
};

const round1 = (v: string | null) => (v === null ? null : Math.round(Number(v) * 10) / 10);

export const reviewRepository = {
  /** Newest first (keyset pagination on updated_at, id). */
  listBySpot: (spotId: string, { limit, after }: PageArgs) =>
    db
      .select(withAuthor)
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.authorId))
      .where(and(eq(reviews.spotId, spotId), after && sql`(${reviews.updatedAt}, ${reviews.id}) < (${after.at}, ${after.id})`))
      .orderBy(desc(reviews.updatedAt), desc(reviews.id))
      .limit(limit + 1),

  findMine: async (spotId: string, authorId: string) =>
    (
      await db
        .select(withAuthor)
        .from(reviews)
        .innerJoin(users, eq(users.id, reviews.authorId))
        .where(and(eq(reviews.spotId, spotId), eq(reviews.authorId, authorId)))
        .limit(1)
    )[0] ?? null,

  /** Average of each score for one spot. */
  async averages(spotId: string) {
    const [r] = await db
      .select({ rating: avg(reviews.rating), calm: avg(reviews.calm), clean: avg(reviews.clean), seating: avg(reviews.seating), count: count() })
      .from(reviews)
      .where(eq(reviews.spotId, spotId));
    return { rating: round1(r.rating), calm: round1(r.calm), clean: round1(r.clean), seating: round1(r.seating), count: r.count };
  },

  /** Average rating and review count of many spots, in one query. */
  async ratingsBySpots(spotIds: string[]) {
    if (spotIds.length === 0) return new Map<string, { rating: number | null; count: number }>();
    const rows = await db
      .select({ spotId: reviews.spotId, rating: avg(reviews.rating), count: count() })
      .from(reviews)
      .where(inArray(reviews.spotId, spotIds))
      .groupBy(reviews.spotId);
    return new Map(rows.map((r) => [r.spotId, { rating: round1(r.rating), count: r.count }]));
  },

  /** One review per person and per spot: a second one replaces the first. `created` tells which happened. */
  async upsert(data: { spotId: string; authorId: string; rating: number; calm?: number; clean?: number; seating?: number; comment: string }) {
    const values = { calm: null, clean: null, seating: null, ...data };
    const [row] = await db
      .insert(reviews)
      .values(values)
      .onConflictDoUpdate({
        target: [reviews.spotId, reviews.authorId],
        set: { rating: values.rating, calm: values.calm, clean: values.clean, seating: values.seating, comment: values.comment, updatedAt: new Date() },
      })
      .returning({ id: reviews.id, created: sql<boolean>`(xmax = 0)` });
    return row;
  },
};
