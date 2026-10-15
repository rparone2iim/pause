import "server-only";
import { env } from "./env";
import { HttpError } from "./errors";

/**
 * Fixed-window rate limiter kept in memory (one Node process).
 * Good enough for the bootcamp; in production put it in Redis or AWS WAF so all instances share it.
 */
// Kept on globalThis so every route shares the same counters (Next.js dev loads modules once per route).
const g = globalThis as unknown as { rateBuckets?: Map<string, { count: number; resetAt: number }> };
const buckets = (g.rateBuckets ??= new Map());

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  b.count += 1;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), retryAfter: Math.ceil((b.resetAt - now) / 1000) };
}

/** Counts one hit and throws a 429 past the limit. */
export function enforceLimit(key: string, limit: number, windowMs: number, message = "Trop de requêtes, réessaie plus tard.") {
  const r = rateLimit(key, limit, windowMs);
  if (!r.ok) throw new HttpError(429, message, { headers: { "Retry-After": String(r.retryAfter) } });
}

/** Read a counter without incrementing it (e.g. "is this account currently locked?"). */
export function peek(key: string, limit: number) {
  const b = buckets.get(key);
  const now = Date.now();
  if (!b || b.resetAt <= now) return { blocked: false, retryAfter: 0 };
  return { blocked: b.count >= limit, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
}

/**
 * The IP trap: anybody can send a fake `X-Forwarded-For` header and get a fresh rate-limit
 * bucket on every attempt. It is only trusted behind a proxy (TRUST_PROXY=true): Caddy overwrites it,
 * Cloud Run APPENDS the real client IP. Either way the LAST value is the real one; anything before
 * it is client-supplied. Without a proxy every request shares one bucket.
 */
export function clientIp(req: Request) {
  if (!env.TRUST_PROXY) return "direct";
  return req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
}
