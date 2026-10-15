import { jwtVerify } from "jose/jwt/verify";
import { NextResponse, type NextRequest } from "next/server";
import { allowedMethods } from "@/lib/api-routes";

/*
 * Runs before EVERY request.
 *  - API: a request coming from another site (foreign `Origin`) is refused (403); CORS for our own front only.
 *    Private routes also need a well-formed, validly signed JWT here (defense in depth: routes re-check
 *    that its session is still open with requireUser()).
 *  - Pages: a Content-Security-Policy with a fresh random nonce. The browser only runs scripts carrying
 *    that nonce, so a script injected by an attacker (XSS) is blocked — which protects the access token kept in memory.
 */

const allowedOrigins = (process.env.APP_ORIGIN ?? "http://localhost:3000").split(",").map((o) => o.trim());
const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "");
const isDev = process.env.NODE_ENV !== "production";

/** API routes reachable without a token. */
const PUBLIC_API: { method: string; pattern: RegExp }[] = [
  { method: "POST", pattern: /^\/api\/v1\/(users|sessions)$/ }, // sign up, log in
  { method: "POST", pattern: /^\/api\/v1\/sessions\/current\/tokens$/ }, // refresh: the HttpOnly cookie is the credential
  { method: "GET", pattern: /^\/api\/v1\/photos\/[^/]+$/ },
  { method: "GET", pattern: /^\/api\/v1\/images$/ }, // signed OpenStreetMap pictures, re-served by our API
  { method: "GET", pattern: /^\/api\/v1\/health$/ },
];

/** Same Problem Details document (RFC 9457) as the routes' errors, see src/lib/errors.ts. */
const TITLES = { 401: ["unauthorized", "Authentification requise"], 403: ["forbidden", "Accès refusé"], 405: ["method-not-allowed", "Méthode non autorisée"] } as const;

function apiError(req: NextRequest, status: 401 | 403 | 405, detail: string, headers: Record<string, string> = {}) {
  const [code, title] = TITLES[status];
  const requestId = crypto.randomUUID();
  return new NextResponse(JSON.stringify({ type: `/problems/${code}`, title, status, detail, instance: req.nextUrl.pathname, code, requestId }), {
    status,
    headers: { "Content-Type": "application/problem+json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "X-Request-Id": requestId, ...headers },
  });
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key, If-Match, If-None-Match, traceparent",
    "Access-Control-Expose-Headers": "Location, Retry-After, ETag, X-Request-Id, traceparent",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

async function api(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins.includes(origin)) return apiError(req, 403, "Cette origine n'a pas le droit d'appeler l'API.");
  const cors: Record<string, string> = origin ? corsHeaders(origin) : {};
  if (req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: cors });

  const isPublic = PUBLIC_API.some((r) => r.method === req.method && r.pattern.test(pathname));
  if (!isPublic && /^\/api\/v1\/(sessions|me|spots|photos|addresses|weather|assistant)(\/|$)/.test(pathname)) {
    const [scheme, token] = (req.headers.get("authorization") ?? "").split(" ");
    if (scheme !== "Bearer" || !token) return apiError(req, 401, "Connecte-toi pour continuer.", { "WWW-Authenticate": 'Bearer realm="pause"', ...cors });
    try {
      await jwtVerify(token, secret, { algorithms: ["HS256"], issuer: "pause-api", audience: "pause-web" });
    } catch {
      return apiError(req, 401, "Ta session a expiré, reconnecte-toi.", { "WWW-Authenticate": 'Bearer realm="pause", error="invalid_token"', ...cors });
    }
  }

  // Known path, wrong method: 405 with the list of allowed methods (an unknown path goes on to the JSON 404).
  const allowed = allowedMethods(pathname);
  if (allowed && !allowed.includes(req.method)) {
    return apiError(req, 405, `${req.method} n'est pas possible sur cette ressource.`, { Allow: allowed.join(", "), ...cors });
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

function page(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Leaflet and React position things with inline styles; styles can't run code.
    "style-src 'self' 'unsafe-inline'",
    // Images: our own API only, plus the map tiles. The browser never calls another site's API.
    "img-src 'self' data: blob: https://tiles.openfreemap.org",
    "font-src 'self' data:",
    // The vector map: style, tiles, icons and fonts, all from tiles.openfreemap.org (no key).
    `connect-src 'self' https://tiles.openfreemap.org${isDev ? " ws:" : ""}`,
    // MapLibre draws the map in a Web Worker it creates from a blob.
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  // Next.js reads the nonce from the request's CSP header and adds it to its own scripts.
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export function middleware(req: NextRequest) {
  return req.nextUrl.pathname.startsWith("/api/") ? api(req) : page(req);
}

export const config = {
  matcher: [
    "/api/:path*",
    // Pages only: not static files, images or prefetches.
    { source: "/((?!_next/static|_next/image|favicon.ico|fonts/|maplibre/).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
  ],
};
