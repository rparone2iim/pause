import "server-only";
import { requireUser } from "../auth";
import { json, page, readQuery, route } from "../http";
import { locationService } from "../services/location.service";
import { addressesQuery, coordsQuery } from "../validation";

const longCache = { "Cache-Control": "private, max-age=3600" };
const ADDRESSES_LIMIT = 8;

export const locationController = {
  /**
   * GET /api/v1/addresses?query=…[&lat=&lng=][&scope=near] — search addresses/places (biased around lat/lng, or only near it).
   * GET /api/v1/addresses?lat=&lng=          — the address at a point (reverse geocoding).
   */
  addresses: route(
    async ({ req, url }) => {
      await requireUser(req);
      const q = readQuery(url, addressesQuery);
      if (q.query) {
        const near = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
        return json(page(await locationService.search(q.query, near, q.scope), ADDRESSES_LIMIT), { headers: longCache });
      }
      return json(page([await locationService.addressAt({ lat: q.lat!, lng: q.lng! })], ADDRESSES_LIMIT), { headers: longCache });
    },
    { rateLimit: { name: "addresses", limit: 60, windowMs: 60_000 } },
  ),

  /** GET /api/v1/weather?lat=&lng= — current weather at a point. */
  weather: route(async ({ req, url }) => {
    await requireUser(req);
    const weather = await locationService.weather(readQuery(url, coordsQuery));
    return json({ weather }, { headers: { "Cache-Control": "private, max-age=600" } });
  }),
};
