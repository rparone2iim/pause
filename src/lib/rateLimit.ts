import "server-only";
import type { NextRequest } from "next/server";
import { HttpError } from "./errors";

/**
 * Pilier 2 : rate limiting "fenêtre fixe", en mémoire.
 * Suffisant pour UNE instance (la démo). En production avec plusieurs instances,
 * on le déplace dans Redis ou dans l'API Gateway / le WAF AWS (cf. SECURITY.md).
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > max) {
    const retry = Math.ceil((b.resetAt - now) / 1000);
    throw new HttpError(429, "TOO_MANY_REQUESTS", "Trop de tentatives, réessaie plus tard", { "Retry-After": String(retry) });
  }
}

/** Comme rateLimit, mais sans erreur : renvoie false si la limite est atteinte (sert aux quotas IA). */
export function tryConsume(key: string, max: number, windowMs: number): boolean {
  try { rateLimit(key, max, windowMs); return true; } catch { return false; }
}

// Ménage toutes les minutes pour que la Map ne grossisse pas à l'infini.
const g = globalThis as unknown as { rlCleaner?: NodeJS.Timeout };
g.rlCleaner ??= setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 60_000).unref();

/**
 * IP du client — piège classique : le header X-Forwarded-For peut être INVENTÉ par le client.
 *  - TRUST_PROXY=true (Docker avec Caddy, ou load balancer AWS en prod) : le proxy de confiance
 *    écrase ce header avec la vraie IP → on prend la dernière valeur, celle écrite par le proxy.
 *  - Sinon (npm run dev / npm start en direct) : on IGNORE le header, sinon un attaquant
 *    changerait d'IP à chaque requête pour contourner le rate limit. Tout le monde partage
 *    alors le même compteur global (OK en local), et les limites par compte restent actives.
 */
export function clientIp(req: NextRequest): string {
  if (process.env.TRUST_PROXY !== "true") return "direct";
  const xff = req.headers.get("x-forwarded-for");
  return xff ? xff.split(",").at(-1)!.trim() : "unknown";
}
