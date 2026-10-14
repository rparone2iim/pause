import { count, eq } from "drizzle-orm";
import { route, ok, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getSpotOr404 } from "@/lib/spots";
import { rateLimit } from "@/lib/rateLimit";
import { readPhotoFromRequest, processAndStorePhoto } from "@/lib/upload";
import { MAX_PHOTOS_PER_SPOT } from "@/lib/constants";
import { db } from "@/lib/db";
import { photos } from "@/db/schema";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/spots/:id/photos (multipart, champ "photo") → ajoute une photo au spot. */
export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  rateLimit(`upload:${user.id}`, 30, 60 * 60_000);
  const spot = await getSpotOr404((await params).id);

  const [{ n }] = await db.select({ n: count() }).from(photos).where(eq(photos.spotId, spot.id));
  if (n >= MAX_PHOTOS_PER_SPOT) throw new HttpError(409, "TOO_MANY_PHOTOS", `${MAX_PHOTOS_PER_SPOT} photos maximum par spot`);

  const filename = await processAndStorePhoto(await readPhotoFromRequest(req));
  await db.insert(photos).values({ filename, spotId: spot.id, uploaderId: user.id });
  return ok({ filename }, 201);
});
