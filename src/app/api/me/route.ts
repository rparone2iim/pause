import { desc, eq } from "drizzle-orm";
import { route, readJson, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { profileUpdateSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { users, favorites, spots } from "@/db/schema";

async function profile(userId: string) {
  const [me] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName, preferredTypes: users.preferredTypes, radiusM: users.radiusM })
    .from(users).where(eq(users.id, userId));
  const saved = await db
    .select({ id: spots.id, name: spots.name, type: spots.type, tags: spots.tags, lat: spots.lat, lng: spots.lng })
    .from(favorites).innerJoin(spots, eq(favorites.spotId, spots.id))
    .where(eq(favorites.userId, userId)).orderBy(desc(favorites.createdAt));
  return { ...me, favorites: saved };
}

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return ok(await profile(user.id));
});

export const PATCH = route(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, profileUpdateSchema);
  // L'utilisateur ne peut modifier QUE son propre profil (id pris du token, jamais du body).
  await db.update(users).set(body).where(eq(users.id, user.id));
  return ok(await profile(user.id));
});
