import "server-only";
import pino from "pino";
import { env } from "./env";

/**
 * JSON logs (one line per event), read by Google Cloud Logging on Cloud Run.
 * Passwords, hashes and tokens are masked automatically, wherever they appear.
 */
// One logger per process (Next.js dev hot-reload would otherwise stack pino instances and their exit hooks).
const globalForLogger = globalThis as unknown as { pinoLogger?: pino.Logger };

export const logger: pino.Logger =
  globalForLogger.pinoLogger ??
  pino({
    level: env.LOG_LEVEL,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    // Cloud Logging reads the level from "severity" (INFO, WARNING, ERROR…).
    formatters: { level: (label) => ({ severity: label === "warn" ? "WARNING" : label.toUpperCase() }) },
    redact: {
      paths: [
        "password",
        "passwordHash",
        "token",
        "accessToken",
        "refreshToken",
        "authorization",
        "cookie",
        "*.password",
        "*.passwordHash",
        "*.token",
        "*.accessToken",
        "*.refreshToken",
        "*.authorization",
        "*.cookie",
        "headers.cookie",
      ],
      censor: "[masqué]",
    },
  });
globalForLogger.pinoLogger = logger;

// Database errors copy the query VALUES into their message ("params: …"): an email or a hash
// would end up in the logs. They are masked before anything is written.
const scrub = (s: string) => s.replace(/params: [\s\S]*?(?=\n {4}at |\ncaused by|$)/g, "params: [masqué]");

export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const safe = typeof fields.error === "string" ? { ...fields, error: scrub(fields.error) } : fields;
  logger[level]({ event, ...safe });
}
