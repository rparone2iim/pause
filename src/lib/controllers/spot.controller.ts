import "server-only";
import { createHash } from "node:crypto";
import { requireUser } from "../auth";
import { HttpError } from "../errors";
import { json, noContent, page, readJson, readQuery, readSpotId, route, withIdempotency } from "../http";
import { enforceLimit } from "../rateLimit";
import { NEARBY_LIMIT, spotService } from "../services/spot.service";
import { spotCreateBody, spotPatchBody, spotsQuery } from "../validation";

type Params = { id: string };
const privateCache = { "Cache-Control": "private, no-store" };

/** Version of what this viewer sees (media type included): changes as soon as anything in the spot changes. */
const etagOf = (body: unknown) => `"${createHash("sha256").update(`application/json|${JSON.stringify(body)}`).digest("base64url").slice(0, 27)}"`;
// A compressing proxy (Caddy) appends "-gzip"/"-zstd" to the ETag it forwards: same version, so it still matches.
const normalize = (tag: string) => tag.trim().replace(/^W\//, "").replace(/-(gzip|zstd|br)"$/, '"');
const matches = (header: string | null, etag: string) => !!header && header.split(",").some((t) => t.trim() === "*" || normalize(t) === etag);

/** Optional `If-Match`: the client edits/deletes only the version it has seen, otherwise 412 (no lost update). */
async function checkIfMatch(req: Request, id: string, userId: string) {
  const ifMatch = req.headers.get("if-match");
  if (ifMatch && !matches(ifMatch, etagOf({ spot: await spotService.get(id, userId) }))) {
    throw new HttpError(412, "Ce spot a changé depuis que tu l'as ouvert : recharge la page.");
  }
}

export const spotController = {
  /** GET /api/v1/spots?lat=&lng=&radius=&type= — spots in the radius (300 m – 3 km), nearest first. */
  list: route(async ({ req, url }) => {
    const { userId } = await requireUser(req);
    const q = readQuery(url, spotsQuery);
    const result = await spotService.nearby({ lat: q.lat, lng: q.lng }, q.radius, q.type, userId);
    return json(page(result.spots, NEARBY_LIMIT, null, { osmAvailable: result.osmAvailable }), { headers: { "Cache-Control": result.osmAvailable ? "private, max-age=30" : "no-store" } });
  }),

  /** POST /api/v1/spots — add a spot. 20 per hour per user. Supports Idempotency-Key (no duplicate on double click). */
  create: route(async ({ req }) => {
    const { userId } = await requireUser(req);
    return withIdempotency(req, `spots:${userId}`, async () => {
      enforceLimit(`create-spot:${userId}`, 20, 60 * 60_000, "20 spots maximum par heure.");
      const spot = await spotService.create(userId, await readJson(req, spotCreateBody));
      return json({ spot }, { status: 201, headers: { Location: `/api/v1/spots/${spot.id}` } });
    });
  }),

  /** GET /api/v1/spots/:id — the full spot: photos, averages, reviews. ETag + If-None-Match → 304. */
  get: route<Params>(async ({ req, params }) => {
    const { userId } = await requireUser(req);
    const body = { spot: await spotService.get(readSpotId(params.id), userId) };
    const etag = etagOf(body);
    if (matches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers: { ETag: etag, ...privateCache } });
    return json(body, { headers: { ETag: etag, ...privateCache } });
  }),

  /** PATCH /api/v1/spots/:id — JSON Merge Patch (RFC 7396) of a spot. The author only (otherwise 403). */
  update: route<Params>(async ({ req, params }) => {
    const { userId } = await requireUser(req);
    const id = readSpotId(params.id);
    const patch = await readJson(req, spotPatchBody, ["application/merge-patch+json", "application/json"]);
    await checkIfMatch(req, id, userId);
    const spot = await spotService.update(id, userId, patch);
    return json({ spot }, { headers: { ETag: etagOf({ spot: await spotService.get(id, userId) }), ...privateCache } });
  }),

  /** DELETE /api/v1/spots/:id — delete a spot and its photos. The author only (otherwise 403). */
  remove: route<Params>(async ({ req, params }) => {
    const { userId } = await requireUser(req);
    const id = readSpotId(params.id);
    await checkIfMatch(req, id, userId);
    await spotService.remove(id, userId);
    return noContent();
  }),
};
