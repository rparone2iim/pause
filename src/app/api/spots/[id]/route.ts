import { and, avg, count, desc, eq, asc } from "drizzle-orm";
import { route, readJson, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { spotUpdateSchema } from "@/lib/validation";
import { getSpotOr404, assertOwner } from "@/lib/spots";
import { deleteStoredPhoto } from "@/lib/upload";
import { db } from "@/lib/db";
import { spots, reviews, photos, favorites, users } from "@/db/schema";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/spots/:id → fiche complète */
export const GET = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const spot = await getSpotOr404((await params).id);

  const [author, pics, revs, [avgs], [fav]] = await Promise.all([
    db.select({ displayName: users.displayName }).from(users).where(eq(users.id, spot.authorId)),
    db.select({ filename: photos.filename, uploaderId: photos.uploaderId }).from(photos)
      .where(eq(photos.spotId, spot.id)).orderBy(asc(photos.createdAt)),
    db.select({
      id: reviews.id, rating: reviews.rating, calm: reviews.calm, clean: reviews.clean, seating: reviews.seating,
      comment: reviews.comment, updatedAt: reviews.updatedAt, authorId: reviews.authorId,
      authorName: users.displayName, // on expose le pseudo, JAMAIS l'email des autres
    }).from(reviews).innerJoin(users, eq(reviews.authorId, users.id))
      .where(eq(reviews.spotId, spot.id)).orderBy(desc(reviews.updatedAt)).limit(50),
    db.select({ rating: avg(reviews.rating), calm: avg(reviews.calm), clean: avg(reviews.clean), seating: avg(reviews.seating), n: count() })
      .from(reviews).where(eq(reviews.spotId, spot.id)),
    db.select({ spotId: favorites.spotId }).from(favorites)
      .where(and(eq(favorites.userId, user.id), eq(favorites.spotId, spot.id))),
  ]);

  const r = (v: string | null) => (v == null ? null : Number(Number(v).toFixed(1)));
  return ok({
    id: spot.id, name: spot.name, description: spot.description, accessTip: spot.accessTip,
    type: spot.type, tags: spot.tags, lat: spot.lat, lng: spot.lng, createdAt: spot.createdAt,
    authorName: author[0]?.displayName ?? "?",
    isOwner: spot.authorId === user.id,
    isFavorite: Boolean(fav),
    photos: pics.map((p) => ({ filename: p.filename, mine: p.uploaderId === user.id })),
    averages: { rating: r(avgs.rating), calm: r(avgs.calm), clean: r(avgs.clean), seating: r(avgs.seating), count: avgs.n },
    reviews: revs.map(({ authorId, ...rv }) => ({ ...rv, mine: authorId === user.id })),
  });
});

/** PATCH /api/spots/:id → modifier (auteur uniquement) */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const spot = await getSpotOr404((await params).id);
  assertOwner(spot, user);
  const body = await readJson(req, spotUpdateSchema);
  await db.update(spots).set({ ...body, updatedAt: new Date() }).where(eq(spots.id, spot.id));
  return ok({ id: spot.id });
});

/** DELETE /api/spots/:id → supprimer (auteur uniquement) */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const spot = await getSpotOr404((await params).id);
  assertOwner(spot, user);
  const files = await db.select({ filename: photos.filename }).from(photos).where(eq(photos.spotId, spot.id));
  await db.delete(spots).where(eq(spots.id, spot.id)); // cascade : photos, avis, favoris
  await Promise.all(files.map((f) => deleteStoredPhoto(f.filename)));
  return new Response(null, { status: 204 });
});
