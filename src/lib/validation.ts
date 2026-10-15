import "server-only";
import { z } from "zod";
import { FILTER_KEYS, SPOT_TYPES } from "@/db/schema";

/*
 * Every accepted input, described exactly. Body schemas are `.strict()`: an unknown field
 * (e.g. "role": "admin") is rejected with a 400, and every value has a type, a length and a format.
 * Messages are in French: the front shows them under the matching field.
 */
z.config(z.locales.fr());

const coordLat = z.coerce.number().min(-90).max(90);
const coordLng = z.coerce.number().min(-180).max(180);
// Invisible control characters (\u0000, escape codes…) are stripped before the length checks.
const text = (max: number, min = 0, minMessage = `${min} caractères minimum`) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min, minMessage).max(max, `${max} caractères maximum`));
const email = z
  .email("Adresse email invalide")
  .max(254)
  .transform((e) => e.toLowerCase());
const score = z.number().int().min(1, "Note de 1 à 5").max(5, "Note de 1 à 5");

export const password = z
  .string()
  .min(10, "10 caractères minimum")
  // bcrypt only reads the first 72 BYTES: longer is refused rather than silently truncated.
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, "72 octets maximum")
  .regex(/[A-Za-z]/, "Doit contenir au moins une lettre")
  .regex(/\d/, "Doit contenir au moins un chiffre");

export const registerBody = z
  .object({
    displayName: text(40, 2),
    email,
    password,
  })
  .strict();

export const loginBody = z
  .object({
    email,
    password: z.string().min(1, "Champ obligatoire").max(128),
  })
  .strict();

export const mePatchBody = z
  .object({
    displayName: text(40, 2).optional(),
    preferredTypes: z.array(z.enum(FILTER_KEYS)).max(FILTER_KEYS.length).optional(),
    radiusM: z.number().int().min(300, "300 m minimum").max(3000, "3 km maximum").optional(),
  })
  .strict();

const tag = z
  .object({
    icon: z.string().regex(/^[a-z_]{1,40}$/, "Icône inconnue"),
    label: text(60, 1),
  })
  .strict();

const spotFields = {
  name: text(60, 3),
  type: z.enum(SPOT_TYPES),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  description: text(500).optional(),
  accessTip: text(300).optional(),
  address: text(200).optional(),
  features: z.array(tag).max(10).default([]),
  filters: z.array(z.enum(FILTER_KEYS)).max(FILTER_KEYS.length).default([]),
  quiet: z.number().int().min(1).max(5).default(3),
  isPrivate: z.boolean().default(false),
};

export const spotCreateBody = z.object(spotFields).strict();

export const spotPatchBody = z
  .object({
    name: spotFields.name.optional(),
    type: spotFields.type.optional(),
    lat: spotFields.lat.optional(),
    lng: spotFields.lng.optional(),
    description: text(500).nullable().optional(),
    accessTip: text(300).nullable().optional(),
    address: text(200).nullable().optional(),
    features: z.array(tag).max(10).optional(),
    filters: z.array(z.enum(FILTER_KEYS)).max(FILTER_KEYS.length).optional(),
    quiet: z.number().int().min(1).max(5).optional(),
    isPrivate: z.boolean().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Rien à modifier", path: ["name"] })
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), { message: "lat et lng vont ensemble", path: ["lat"] });

export const reviewBody = z
  .object({
    rating: score,
    calm: score.optional(),
    clean: score.optional(),
    seating: score.optional(),
    comment: text(500).default(""),
  })
  .strict();

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

/* Assistant: everything is bounded (message, history) → cost and attack surface under control. */
export const assistantMessageBody = z
  .object({
    message: text(500, 1, "Message vide"),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }).strict())
      .max(10)
      .default([]),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radius: z.number().int().min(100).max(5000).default(1500),
  })
  .strict();
