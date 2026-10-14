import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { logger } from "./logger";
import { env } from "./env";
import { clientIp, rateLimit } from "./rateLimit";
import { HttpError } from "./errors";

export { HttpError };

export type Meta = { requestId: string; ip: string };

/**
 * Enveloppe TOUTES les routes de l'API.
 *  - Pilier 2 : rate limit global (120 req/min/IP)
 *  - Pilier 6 : log structuré de chaque requête + requestId
 *  - Pilier 6 : AUCUNE erreur technique (stack trace, SQL…) ne part au client
 */
export function route<C>(handler: (req: NextRequest, ctx: C, meta: Meta) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    const requestId = randomUUID();
    const ip = clientIp(req);
    const start = Date.now();
    let res: Response;
    try {
      env(); // vérifie la config (crash clair si une variable manque)
      rateLimit(`global:${ip}`, 120, 60_000);
      res = await handler(req, ctx, { requestId, ip });
    } catch (err) {
      res = toErrorResponse(err, requestId, req);
    }
    res.headers.set("X-Request-Id", requestId);
    if (!res.headers.has("Cache-Control")) res.headers.set("Cache-Control", "no-store"); // pas de cache des réponses API
    logger.info({ requestId, ip, method: req.method, path: req.nextUrl.pathname, status: res.status, ms: Date.now() - start });
    return res;
  };
}

function toErrorResponse(err: unknown, requestId: string, req: NextRequest): Response {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: { code: err.code, message: err.message }, requestId }, { status: err.status, headers: err.headers });
  }
  if (err instanceof ZodError) {
    // On renvoie QUEL champ est invalide (utile au front), jamais la valeur reçue ni de détail interne.
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    return NextResponse.json({ error: { code: "VALIDATION", message: "Données invalides", fields }, requestId }, { status: 400 });
  }
  // Erreur inattendue : détail complet dans les logs serveur, message générique au client.
  logger.error({ requestId, method: req.method, path: req.nextUrl.pathname, err }, "Erreur non gérée");
  return NextResponse.json({ error: { code: "INTERNAL", message: "Une erreur interne est survenue" }, requestId }, { status: 500 });
}

const MAX_JSON_BYTES = 16 * 1024; // 16 Ko : largement assez pour un spot ou un avis

/**
 * Pilier 4 : lit et valide un body JSON.
 *  - refuse si ce n'est pas du JSON (415) ou si c'est trop gros (413)
 *  - valide avec un schéma Zod .strict() → tout champ inconnu = rejet
 */
export async function readJson<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Le corps doit être en JSON");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Requête trop volumineuse");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(400, "BAD_JSON", "JSON mal formé");
  }
  return schema.parse(data);
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
