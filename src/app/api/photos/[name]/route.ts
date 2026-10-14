import { eq } from "drizzle-orm";
import { route, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { readStoredPhoto, deleteStoredPhoto } from "@/lib/upload";
import { db } from "@/lib/db";
import { photos, spots } from "@/db/schema";

type Ctx = { params: Promise<{ name: string }> };

/**
 * GET /api/photos/<uuid>.webp → sert l'image.
 * Public car une balise <img> ne peut pas envoyer de header Authorization.
 * Le nom est un UUID aléatoire (impossible à deviner) et l'image a été nettoyée (EXIF/GPS supprimés).
 */
export const GET = route<Ctx>(async (_req, { params }) => {
  const buf = await readStoredPhoto((await params).name);
  if (!buf) throw new HttpError(404, "NOT_FOUND", "Photo introuvable");
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400, immutable" },
  });
});

/** DELETE → la personne qui a posté la photo, ou l'auteur du spot. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const name = (await params).name;
  const [p] = await db.select({ id: photos.id, uploaderId: photos.uploaderId, spotAuthor: spots.authorId })
    .from(photos).innerJoin(spots, eq(photos.spotId, spots.id)).where(eq(photos.filename, name));
  if (!p) throw new HttpError(404, "NOT_FOUND", "Photo introuvable");
  if (p.uploaderId !== user.id && p.spotAuthor !== user.id) throw new HttpError(403, "FORBIDDEN", "Ce n'est pas ta photo");
  await db.delete(photos).where(eq(photos.id, p.id));
  await deleteStoredPhoto(name);
  return new Response(null, { status: 204 });
});
