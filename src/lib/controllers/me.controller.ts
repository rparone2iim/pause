import "server-only";
import { requireUser } from "../auth";
import { json, noContent, readJson, route } from "../http";
import { mePatchBody } from "../validation";
import { userService } from "../services/user.service";

const privateCache = { "Cache-Control": "private, no-store" };

export const meController = {
  /** GET /api/v1/me — my profile, my favorites and the spots I added. */
  get: route(async ({ req }) => {
    const { userId } = await requireUser(req);
    return json(await userService.getMe(userId), { headers: privateCache });
  }),

  /** PATCH /api/v1/me — display name, preferred types, radius. Only your own profile: the id comes from the token. */
  update: route(async ({ req }) => {
    const { userId } = await requireUser(req);
    const patch = await readJson(req, mePatchBody, ["application/json", "application/merge-patch+json"]);
    return json({ user: await userService.updateMe(userId, patch) }, { headers: privateCache });
  }),

  /** DELETE /api/v1/me — delete my account and everything attached to it (GDPR). */
  remove: route(async ({ req, requestId }) => {
    const { userId } = await requireUser(req);
    await userService.deleteMe(userId, requestId);
    return noContent();
  }),
};
