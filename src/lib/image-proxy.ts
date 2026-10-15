import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { NotFoundError } from "./domain-errors";
import { log } from "./logger";
import { cleanPhoto, MAX_PHOTO_BYTES } from "./upload";

/*
 * Pictures of OpenStreetMap places (Wikimedia Commons) are re-served by OUR API: the browser never calls
 * another site (only the map tiles). Not an open proxy:
 *  - the server signs every picture URL it hands out (HMAC); an unsigned or tampered URL is refused;
 *  - only Wikimedia hosts are fetched, over HTTPS, redirects included (no request to an internal address);
 *  - the file is checked and re-encoded like an uploaded photo (real image, 5 MB max, WebP, metadata removed).
 */

const ALLOWED_HOSTS = new Set(["commons.wikimedia.org", "upload.wikimedia.org"]);
const USER_AGENT = "Pause/1.0 (student project; image proxy)";
const MAX_REDIRECTS = 3;
const CACHE_SIZE = 100;

const allowed = (raw: string) => {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
};

const signature = (url: string) => createHmac("sha256", env.JWT_SECRET).update(`osm-image:${url}`).digest("base64url").slice(0, 32);

/** Our own URL for an external picture, or undefined if that host is not allowed. */
export function proxiedImageUrl(url: string | undefined) {
  if (!url || !allowed(url)) return undefined;
  return `/api/v1/images?u=${Buffer.from(url).toString("base64url")}&s=${signature(url)}`;
}

const cache = new Map<string, Buffer>();

async function download(url: string): Promise<Buffer> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!allowed(current)) throw new NotFoundError("Image introuvable.");
    const res = await fetch(current, { headers: { "User-Agent": USER_AGENT }, redirect: "manual", signal: AbortSignal.timeout(8_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString(); // each hop is checked again
      continue;
    }
    if (!res.ok || !res.body) throw new NotFoundError("Image introuvable.");
    if (Number(res.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES) throw new NotFoundError("Image introuvable.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > MAX_PHOTO_BYTES) throw new NotFoundError("Image introuvable.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new NotFoundError("Image introuvable.");
}

/** The cleaned WebP behind a signed URL handed out by proxiedImageUrl(). */
export async function proxiedImage(u: string, s: string): Promise<Buffer> {
  let url: string;
  try {
    url = Buffer.from(u, "base64url").toString();
  } catch {
    throw new NotFoundError("Image introuvable.");
  }
  const expected = Buffer.from(signature(url));
  const given = Buffer.from(s);
  if (given.length !== expected.length || !timingSafeEqual(given, expected) || !allowed(url)) throw new NotFoundError("Image introuvable.");

  const hit = cache.get(url);
  if (hit) return hit;
  try {
    const webp = await cleanPhoto(await download(url));
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(url, webp);
    return webp;
  } catch (e) {
    log("warn", "upstream_error", { upstream: "wikimedia", error: e instanceof Error ? e.message : String(e) });
    throw e instanceof NotFoundError ? e : new NotFoundError("Image introuvable.");
  }
}
