import { z } from "zod";

/*
 * The body schemas of the API, shared by the server (src/lib/validation.ts → readJson) and the forms
 * of the front: the browser checks exactly the same rules before sending, the server checks them again
 * (it never trusts the client). Body schemas are `.strict()`: an unknown field (e.g. "role": "admin")
 * is rejected, and every value has a type, a length and a format.
 * No server-only import here: this file is bundled for the browser.
 */
z.config(z.locales.fr());

export const SPOT_TYPES = ["cafe", "bar", "terrace", "park", "bench", "smoking", "shelter"] as const;
export const FILTER_KEYS = ["smoke", "coffee", "quiet", "shade", "shelter"] as const;

/** Field name → message shown under that field in the form. */
export type FieldErrors = Record<string, string>;

/** Zod issues → one message per field, as the API returns them in Problem Details `fields`. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const k of issue.keys) out[[...issue.path, k].join(".")] = "Champ non autorisé";
    } else {
      out[issue.path.join(".") || "body"] ??= issue.message;
    }
  }
  return out;
}

/** Free text: invisible control characters (\u0000, escape codes…) are stripped, then trimmed, before the length checks. */
export const text = (max: number, min = 0, minMessage = `${min} caractères minimum`) =>
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
  .refine((p) => new TextEncoder().encode(p).length <= 72, "72 octets maximum")
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
