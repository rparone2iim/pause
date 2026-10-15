import "server-only";
import { type PageArgs, paginate } from "../pagination";
import { reviewRepository } from "../repositories/review.repository";
import { findSpot, getOrCreateSpot } from "../spots";
import type { Review } from "../types";

type Row = NonNullable<Awaited<ReturnType<typeof reviewRepository.findMine>>>;

const toReview = (viewerId: string) => (r: Row): Review => ({
  id: r.id,
  rating: r.rating,
  calm: r.calm,
  clean: r.clean,
  seating: r.seating,
  comment: r.comment,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  author: { name: r.authorName },
  isMine: r.authorId === viewerId,
});

export const reviewService = {
  /** Reviews of a spot (by database id), newest first. */
  list: async (spotId: string, page: PageArgs, viewerId: string) =>
    paginate(await reviewRepository.listBySpot(spotId, page), page.limit, (r) => r.updatedAt, toReview(viewerId)),

  mine: async (spotId: string, viewerId: string) => {
    const row = await reviewRepository.findMine(spotId, viewerId);
    return row ? toReview(viewerId)(row) : null;
  },

  /** Reviews of a spot by its public id (empty for an OpenStreetMap place nobody reviewed yet). */
  async listByPublicId(id: string, page: PageArgs, viewerId: string) {
    const spot = await findSpot(id, viewerId);
    return spot ? this.list(spot.id, page, viewerId) : { items: [], nextCursor: null };
  },

  /** Creates my review, or updates it if I already reviewed this spot. */
  async upsert(id: string, authorId: string, input: { rating: number; calm?: number; clean?: number; seating?: number; comment: string }) {
    const spot = await getOrCreateSpot(id, authorId);
    const { created } = await reviewRepository.upsert({ spotId: spot.id, authorId, ...input });
    return { created, review: (await this.mine(spot.id, authorId))! };
  },
};
