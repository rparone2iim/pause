import "server-only";
import { HttpError } from "../errors";
import { json, route } from "../http";
import { healthService } from "../services/health.service";

export const healthController = {
  /** GET /api/v1/health — liveness + database check. Uncached, exposes no internals. */
  check: route(async () => {
    const health = await healthService.check();
    return json(health, { status: health.status === "healthy" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  }),

  /** Any unknown /api route answers a JSON 404 instead of an HTML page. */
  notFound: route(async () => {
    throw new HttpError(404, "Cette route n'existe pas.");
  }),
};
