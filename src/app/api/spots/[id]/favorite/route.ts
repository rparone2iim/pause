import { and, eq } from "drizzle-orm";
import { route, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getSpotOr404 } from "@/lib/spots";
import { db } from "@/lib/db";
import { favorites } from "@/db/schema";

type Ctx = { params: Promise<{ id: string }> };

/** PUT → ajoute aux favoris, DELETE → retire. Toujours pour l'utilisateur du token. */
export const PUT = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const spot = await getSpotOr404((await params).id);
  await db.insert(favorites).values({ userId: user.id, spotId: spot.id }).onConflictDoNothing();
  return ok({ isFavorite: true });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const spot = await getSpotOr404((await params).id);
  await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.spotId, spot.id)));
  return ok({ isFavorite: false });
});
