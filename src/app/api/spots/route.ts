import { route, readJson, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { spotCreateSchema, spotsQuerySchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";
import { findNearbySpots } from "@/lib/nearby";
import { db } from "@/lib/db";
import { spots } from "@/db/schema";

/** GET /api/spots?lat=..&lng=..&radius=800&type=CAFE → spots dans le périmètre, du plus proche au plus loin. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const q = spotsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const list = await findNearbySpots({ ...q, userId: user.id });
  // accessTip n'est pas utile dans la liste : on ne renvoie que ce que l'écran affiche
  return ok({ spots: list.map(({ accessTip: _tip, ...s }) => s) });
});

/** POST /api/spots → créer un spot (connecté). */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  rateLimit(`create-spot:${user.id}`, 20, 60 * 60_000); // anti-spam : 20 spots / heure
  const body = await readJson(req, spotCreateSchema);
  // authorId vient du TOKEN, jamais du body (sinon on pourrait créer un spot "au nom" d'un autre)
  const [spot] = await db.insert(spots).values({ ...body, authorId: user.id }).returning({ id: spots.id });
  return ok(spot, 201);
});
