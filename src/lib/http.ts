import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { z } from "zod";
import { env } from "./env";
import { type FieldErrors, HttpError, PROBLEM_JSON, problem } from "./errors";
import { log } from "./logger";
import { clientIp, rateLimit } from "./rateLimit";
import { spotIdParam } from "./validation";

const MAX_JSON_BYTES = 16 * 1024; // 16 KB: photos go through multipart uploads, never JSON
const GLOBAL_LIMIT = { limit: 120, windowMs: 60_000 }; // per IP, every API route

export interface RouteContext<P> {
  req: Request;
  url: URL;
  params: P;
  requestId: string;
}

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/**
 * W3C trace context: the trace id sent by Cloud Run's load balancer (or the client) is kept, so one request
 * can be followed from the proxy to our logs; otherwise a new one is started. Echoed back in `traceparent`.
 */
function traceContext(req: Request) {
  const m = TRACEPARENT.exec(req.headers.get("traceparent") ?? "");
  const traceId = m && !/^0+$/.test(m[1]) ? m[1] : randomBytes(16).toString("hex");
  return { traceId, traceparent: `00-${traceId}-${randomBytes(8).toString("hex")}-${m?.[3] ?? "01"}` };
}

/** Cloud Logging groups every log line of a request under its trace when this field is present. */
const traceField = (traceId: string) => (env.VERTEX_PROJECT ? { "logging.googleapis.com/trace": `projects/${env.VERTEX_PROJECT}/traces/${traceId}` } : { traceId });

interface RouteOptions {
  /** Extra per-IP limit for this route, e.g. sign-ups. */
  rateLimit?: { name: string; limit: number; windowMs: number };
}

/**
 * The wrapper around every API route:
 * request id → global rate limit (120 req/min/IP) → route limit → handler
 * (requireUser, readJson + Zod, assertOwner, database) → error formatting → security headers → one log line.
 * Unexpected errors are logged in full server-side; the client only gets a generic message.
 */
export function route<P = Record<string, never>>(handler: (ctx: RouteContext<P>) => Promise<Response>, options: RouteOptions = {}) {
  return async (req: Request, context: { params: Promise<unknown> }) => {
    const requestId = randomUUID();
    const started = Date.now();
    const url = new URL(req.url);
    const ip = clientIp(req);
    const trace = traceContext(req);
    let res: Response;
    try {
      for (const [key, { limit, windowMs }] of [
        [`global:${ip}`, GLOBAL_LIMIT],
        ...(options.rateLimit ? ([[`${options.rateLimit.name}:${ip}`, options.rateLimit]] as const) : []),
      ] as const) {
        const r = rateLimit(key, limit, windowMs);
        if (!r.ok) throw new HttpError(429, "Trop de requêtes, réessaie plus tard.", { headers: { "Retry-After": String(r.retryAfter) } });
      }
      res = await handler({ req, url, params: (await context.params) as P, requestId });
    } catch (e) {
      const ctx = { requestId, instance: url.pathname };
      if (e instanceof HttpError) {
        res = json(problem(e.status, e.message, ctx, e.options.fields), { status: e.status, headers: { "Content-Type": PROBLEM_JSON, ...e.options.headers } });
      } else {
        log("error", "unhandled_error", { requestId, ...traceField(trace.traceId), method: req.method, path: url.pathname, error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
        res = json(problem(500, "Une erreur est survenue, réessaie.", ctx), { status: 500, headers: { "Content-Type": PROBLEM_JSON } });
      }
    }
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("traceparent", trace.traceparent);
    res.headers.set("X-Content-Type-Options", "nosniff");
    if (!res.headers.has("Cache-Control")) res.headers.set("Cache-Control", "no-store");
    // Only the path is logged: query strings can carry personal data (coordinates, search terms).
    log(res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info", "http_request", {
      requestId,
      ...traceField(trace.traceId),
      method: req.method,
      path: url.pathname,
      status: res.status,
      durationMs: Date.now() - started,
    });
    return res;
  };
}

export function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...init.headers },
  });
}

/** A collection: items wrapped in `data`, with the page metadata (REST: never a bare, unbounded array). */
export function page<T>(data: T[], limit: number, nextCursor: string | null = null, extra: Record<string, unknown> = {}) {
  return { data, page: { limit, nextCursor }, ...extra };
}

export function noContent(headers: Record<string, string> = {}) {
  return new Response(null, { status: 204, headers });
}

function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const k of issue.keys) out[[...issue.path, k].join(".")] = "Champ non autorisé";
    } else {
      out[issue.path.join(".") || "body"] ??= issue.message;
    }
  }
  return out;
}

/** Content-Type (415), size ≤ 16 KB (413), JSON syntax (400), then exact schema validation (400 + fields). */
export async function readJson<S extends z.ZodType>(req: Request, schema: S, mediaTypes = ["application/json"]): Promise<z.infer<S>> {
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mediaTypes.includes(type)) throw new HttpError(415, `Le corps de la requête doit être en ${mediaTypes.join(" ou ")}.`);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_JSON_BYTES) throw new HttpError(413, "Requête trop volumineuse.");
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_JSON_BYTES) throw new HttpError(413, "Requête trop volumineuse.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "JSON invalide.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "Certains champs ne sont pas valides.", { fields: fieldErrors(parsed.error) });
  return parsed.data;
}

/** Query string validation: a malformed parameter is a 400 with field details. */
export function readQuery<S extends z.ZodType>(url: URL, schema: S): z.infer<S> {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", { fields: fieldErrors(parsed.error) });
  return parsed.data;
}

/** A `{id}` path segment: anything malformed is simply an unknown spot. */
export function readSpotId(raw: string) {
  const r = spotIdParam.safeParse(raw);
  if (!r.success) throw new HttpError(404, "Spot introuvable.");
  return r.data;
}

// --- Idempotency-Key support for duplicate-sensitive POSTs (kept 24h in memory) ---
const g = globalThis as unknown as { idempotent?: Map<string, { at: number; status: number; body: string; headers: [string, string][] }> };
const idempotent = (g.idempotent ??= new Map());

export async function withIdempotency(req: Request, scope: string, run: () => Promise<Response>): Promise<Response> {
  const key = req.headers.get("idempotency-key");
  if (!key) return run();
  if (key.length > 100) throw new HttpError(400, "Idempotency-Key trop long.");
  const id = `${scope}:${key}`;
  const hit = idempotent.get(id);
  if (hit && Date.now() - hit.at < 24 * 3600_000) {
    return new Response(hit.body, { status: hit.status, headers: [...hit.headers, ["Idempotent-Replayed", "true"]] });
  }
  const res = await run();
  if (res.status < 500) {
    idempotent.set(id, { at: Date.now(), status: res.status, body: await res.clone().text(), headers: [...res.headers.entries()] });
  }
  return res;
}
