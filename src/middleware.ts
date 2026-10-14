import { NextResponse, type NextRequest } from "next/server";

/*
 * Middleware exécuté AVANT chaque requête.
 *
 * Pilier 2 — CORS strict : le front et l'API sont sur la MÊME origine (Next.js).
 *   → on n'envoie jamais de header Access-Control-Allow-Origin, donc le navigateur
 *     bloque toute lecture de l'API depuis un autre site.
 *   → en plus, toute requête API qui arrive avec un Origin étranger est refusée (403).
 *
 * Pilier 9 / anti-XSS — Content-Security-Policy avec "nonce" :
 *   seuls les scripts portant le nonce aléatoire de CETTE réponse peuvent s'exécuter.
 *   Un <script> injecté par un attaquant n'a pas le nonce → bloqué par le navigateur.
 */
export function middleware(req: NextRequest) {
  const appOrigin = process.env.APP_ORIGIN;

  if (req.nextUrl.pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");
    if (origin && origin !== appOrigin) {
      return NextResponse.json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origine non autorisée" } }, { status: 403 });
    }
    return NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // Leaflet positionne les tuiles en style inline
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp); // Next lit le nonce ici et l'ajoute à ses propres scripts
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)" }],
};
