import "server-only";
import { z } from "zod";
import { FILTER_KEYS, text } from "./schemas";

/*
 * Every accepted input, described exactly. Body schemas live in ./schemas (shared with the front's forms);
 * query strings and path parameters, which only the server reads, are here.
 * Messages are in French: the front shows them under the matching field.
 */
export * from "./schemas";

const coordLat = z.coerce.number().min(-90).max(90);
const coordLng = z.coerce.number().min(-180).max(180);
export const spotsQuery = z
  .object({
    lat: coordLat,
    lng: coordLng,
    radius: z.coerce.number().int().min(300).max(3000).default(800),
    type: z.enum(FILTER_KEYS).optional(),
  })
  .strict();

export const coordsQuery = z.object({ lat: coordLat, lng: coordLng }).strict();

export const addressesQuery = z
  .object({
    query: text(120, 3).optional(),
    lat: coordLat.optional(),
    lng: coordLng.optional(),
    scope: z.enum(["global", "near"]).optional(),
  })
  .strict()
  .refine((q) => q.query || (q.lat !== undefined && q.lng !== undefined), { message: "query, ou lat et lng", path: ["query"] });

export const pageQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(200).optional(),
  })
  .strict();

/** A spot id: the UUID of a community spot, or the id of an external place (Google Maps or OpenStreetMap). */
export const OSM_REF = /^(osm-(node|way|relation)-\d{1,15}|gplace-[A-Za-z0-9_-]{10,200})$/;
export const spotIdParam = z.union([z.uuid(), z.string().regex(OSM_REF)]);

/** Photos are always stored as "<uuid>.webp": nothing else can be requested (no path traversal). */
export const photoNameParam = z.string().regex(/^[0-9a-f-]{36}\.webp$/);

