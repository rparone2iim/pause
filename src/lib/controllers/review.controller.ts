import "server-only";
import { requireUser } from "../auth";
import { json, page, readJson, readQuery, readSpotId, route } from "../http";
import { cursor } from "../pagination";
import { enforceLimit } from "../rateLimit";
import { reviewService } from "../services/review.service";
import { pageQuery, reviewBody } from "../validation";

type Params = { id: string };

export const reviewController = {
  /** GET /api/v1/spots/:id/reviews?cursor= — more reviews, newest first. */
  list: route<Params>(async ({ req, url, params }) => {
    const { userId } = await requireUser(req);
    const { limit, cursor: c } = readQuery(url, pageQuery);
    const result = await reviewService.listByPublicId(readSpotId(params.id), { limit, after: cursor.decode(c) }, userId);
    return json(page(result.items, limit, result.nextCursor), { headers: { "Cache-Control": "private, no-store" } });
  }),

  /** PUT /api/v1/spots/:id/reviews — create or update MY review (one per person and per spot). 30 per hour. */
  upsert: route<Params>(async ({ req, params }) => {
    const { userId } = await requireUser(req);
    const id = readSpotId(params.id);
    const body = await readJson(req, reviewBody);
    enforceLimit(`review:${userId}`, 30, 60 * 60_000, "30 avis maximum par heure.");
    const { created, review } = await reviewService.upsert(id, userId, body);
    return json({ review }, { status: created ? 201 : 200 });
  }),
};
