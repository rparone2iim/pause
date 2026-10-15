import "server-only";
import { z } from "zod";

/** Server configuration, validated once at startup: a missing or weak secret fails fast. */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  APP_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  /** Only "true" behind a proxy that sets the real client IP last in X-Forwarded-For (Caddy, Cloud Run). */
  TRUST_PROXY: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  UPLOAD_DIR: z.string().min(1).default("./uploads"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /**
   * "Ask AI" (Gemini). On Google Cloud: VERTEX_PROJECT → Vertex AI with NO key (the Cloud Run service's own identity).
   * Elsewhere: GEMINI_API_KEY (AI Studio). Neither → the dialog uses its local keyword matcher.
   */
  VERTEX_PROJECT: z.string().optional().transform((v) => v || undefined),
  VERTEX_LOCATION: z.string().regex(/^[a-z0-9-]+$/).default("global"),
  /** Dev only: a short-lived token, e.g. VERTEX_ACCESS_TOKEN=$(gcloud auth print-access-token). */
  VERTEX_ACCESS_TOKEN: z.string().optional().transform((v) => v || undefined),
  GEMINI_API_KEY: z.string().optional().transform((v) => v || undefined),
  /** Only to point the AI Studio client somewhere else (a local fake Gemini in tests). */
  GEMINI_BASE_URL: z.url().default("https://generativelanguage.googleapis.com"),
  GEMINI_MODEL: z.string().regex(/^[a-z0-9.-]+$/).default("gemini-3.5-flash-lite"),
  /** Daily Gemini budget: per user and for the whole app. Past it, the dialog answers locally. */
  AI_DAILY_LIMIT_PER_USER: z.coerce.number().int().min(0).default(30),
  AI_DAILY_LIMIT_GLOBAL: z.coerce.number().int().min(0).default(500),
});

// `next build` loads the routes without any secret (they must never be baked into the Docker image):
// placeholders during the build only. At run time, a missing or weak secret still stops the server.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

export const env = schema.parse(isBuild ? { DATABASE_URL: "postgresql://build", JWT_SECRET: "build-time-placeholder-not-a-secret!", ...process.env } : process.env);

export const allowedOrigins = env.APP_ORIGIN.split(",").map((o) => o.trim());
