import "server-only";
import { requireUser } from "../auth";
import { HttpError } from "../errors";
import { json, noContent, readPhoto, readSpotId, route } from "../http";
import { enforceLimit } from "../rateLimit";
import { photoService } from "../services/photo.service";
import { photoNameParam } from "../validation";

function readName(raw: string) {
  const r = photoNameParam.safeParse(raw);
  if (!r.success) throw new HttpError(404, "Photo introuvable.");
  return r.data;
}

export const photoController = {
  /** POST /api/v1/spots/:id/photos — multipart, field `photo`: JPEG/PNG/WebP, 5 MB, 6 per spot. 30 per hour. */
  upload: route<{ id: string }>(async ({ req, params }) => {
    const { userId } = await requireUser(req);
    const spotId = readSpotId(params.id);
    enforceLimit(`photo:${userId}`, 30, 60 * 60_000, "30 photos maximum par heure.");
    const photo = await photoService.add(spotId, userId, await readPhoto(req));
    return json({ photo }, { status: 201, headers: { Location: photo.url } });
  }),

  /** GET /api/v1/photos/:name — the image itself (public, see photoService.read). */
  serve: route<{ name: string }>(async ({ params }) => {
    const file = await photoService.read(readName(params.name));
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  }),

  /** DELETE /api/v1/photos/:name — the uploader or the spot's author. */
  remove: route<{ name: string }>(async ({ req, params, requestId }) => {
    const { userId } = await requireUser(req);
    await photoService.remove(readName(params.name), userId, requestId);
    return noContent();
  }),
};
