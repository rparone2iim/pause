import { route, readJson, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { reviewSchema } from "@/lib/validation";
import { getSpotOr404 } from "@/lib/spots";
import { rateLimit } from "@/lib/rateLimit";
import { db } from "@/lib/db";
import { reviews } from "@/db/schema";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/spots/:id/reviews → crée OU met à jour MON avis (1 avis par personne et par spot). */
export const PUT = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  rateLimit(`review:${user.id}`, 30, 60 * 60_000);
  const spot = await getSpotOr404((await params).id);
  const body = await readJson(req, reviewSchema);
  const values = { ...body, comment: body.comment || null };
  await db.insert(reviews)
    .values({ ...values, spotId: spot.id, authorId: user.id })
    .onConflictDoUpdate({ target: [reviews.spotId, reviews.authorId], set: { ...values, updatedAt: new Date() } });
  return ok({ ok: true });
});
