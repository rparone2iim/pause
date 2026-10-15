import "server-only";
import { requireUser } from "../auth";
import { noContent, readSpotId, route } from "../http";
import { favoriteService } from "../services/favorite.service";

type Params = { id: string };

export const favoriteController = {
  /** PUT /api/v1/spots/:id/favorite — add to my favorites (idempotent). */
  add: route<Params>(async ({ req, params }) => {
    const { userId } = await requireUser(req);
    await favoriteService.add(readSpotId(params.id), userId);
    return noContent();
  }),

  /** DELETE /api/v1/spots/:id/favorite — remove from my favorites (idempotent). */
  remove: route<Params>(async ({ req, params }) => {
    const { userId } = await requireUser(req);
    await favoriteService.remove(readSpotId(params.id), userId);
    return noContent();
  }),
};
