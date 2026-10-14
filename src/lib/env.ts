import "server-only";
import { z } from "zod";

// Les variables d'environnement sont validées au démarrage :
// si le secret JWT est trop court ou absent, l'app refuse de démarrer.
const schema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET doit faire au moins 32 caractères"),
  APP_ORIGIN: z.string().url(),
  UPLOAD_DIR: z.string().default("./uploads"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  GEMINI_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(20).optional()), // facultatif : sans clé, l'assistant passe en mode local
  AI_MODEL: z.string().regex(/^[a-z0-9.\-]+$/).default("gemini-3.5-flash-lite"),
  AI_DAILY_LIMIT_PER_USER: z.coerce.number().int().min(0).default(30),
  AI_DAILY_LIMIT_GLOBAL: z.coerce.number().int().min(0).default(500),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
