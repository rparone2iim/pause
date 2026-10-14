import { z } from "zod";
import { SPOT_TYPES, TAGS } from "./constants";

/*
 * Pilier 4 : validation par schéma "allowlist".
 * Chaque schéma est .strict() → un champ inconnu (ex: "role": "admin") = requête rejetée.
 * Chaque champ a un type, une longueur min/max, des bornes. Tout le reste est refusé.
 */

// Retire les caractères de contrôle invisibles (\u0000, etc.) et les espaces en trop.
const cleanText = (min: number, max: number) =>
  z.string().transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min, `Au moins ${min} caractères`).max(max, `Maximum ${max} caractères`));

const email = z.string().trim().toLowerCase().email("Email invalide").max(254);

// bcrypt ne prend en compte que les 72 premiers OCTETS : au-delà on refuse plutôt que tronquer en silence.
const password = z.string()
  .min(10, "Au moins 10 caractères")
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, "72 octets maximum")
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), "Doit contenir au moins une lettre et un chiffre");

const displayName = cleanText(2, 40).pipe(z.string().regex(/^[\p{L}\p{N} '\-_.]+$/u, "Caractères non autorisés"));

export const spotTypeSchema = z.enum(SPOT_TYPES);
export const tagSchema = z.enum(TAGS);
const note = z.number().int().min(1).max(5);

export const registerSchema = z.object({ email, password, displayName }).strict();
export const loginSchema = z.object({ email, password: z.string().min(1).max(200) }).strict();

export const spotCreateSchema = z.object({
  name: cleanText(3, 80),
  description: cleanText(10, 1000),
  accessTip: cleanText(0, 300).optional(),
  type: spotTypeSchema,
  tags: z.array(tagSchema).max(TAGS.length).refine((t) => new Set(t).size === t.length, "Tags en double").default([]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
}).strict();

export const spotUpdateSchema = spotCreateSchema.partial().strict()
  .refine((o) => Object.keys(o).length > 0, "Rien à modifier");

export const spotsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(100).max(5000).default(800),
  type: spotTypeSchema.optional(),
}).strict();

export const reviewSchema = z.object({
  rating: note, calm: note, clean: note, seating: note,
  comment: cleanText(0, 500).optional(),
}).strict();

export const profileUpdateSchema = z.object({
  displayName: displayName.optional(),
  preferredTypes: z.array(spotTypeSchema).max(SPOT_TYPES.length).optional(),
  radiusM: z.number().int().min(100).max(5000).optional(),
}).strict();

export const uuidSchema = z.string().uuid("Identifiant invalide");

/* Assistant IA : on borne TOUT (taille du message, de l'historique) → coût et surface d'attaque maîtrisés. */
export const assistantSchema = z.object({
  message: cleanText(1, 500),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(2000),
  }).strict()).max(10).default([]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().int().min(100).max(5000).default(1500),
}).strict();
