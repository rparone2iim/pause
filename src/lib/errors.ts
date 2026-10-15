import "server-only";
import {
  AuthenticationRequiredError,
  ConflictError,
  DomainError,
  type FieldErrors,
  ForbiddenError,
  InvalidCredentialsError,
  InvalidInputError,
  NotFoundError,
  SessionExpiredError,
  TooManyRequestsError,
  UpstreamUnavailableError,
} from "./domain-errors";

export type { FieldErrors };

/** Stable problem types (RFC 9457): the code never changes, the title is the same for every occurrence. */
const PROBLEMS: Record<number, { code: string; title: string }> = {
  400: { code: "bad-request", title: "Requête invalide" },
  401: { code: "unauthorized", title: "Authentification requise" },
  403: { code: "forbidden", title: "Accès refusé" },
  404: { code: "not-found", title: "Ressource introuvable" },
  405: { code: "method-not-allowed", title: "Méthode non autorisée" },
  409: { code: "conflict", title: "Conflit avec l'état actuel" },
  412: { code: "precondition-failed", title: "Précondition échouée" },
  413: { code: "payload-too-large", title: "Requête trop volumineuse" },
  415: { code: "unsupported-media-type", title: "Type de contenu non supporté" },
  429: { code: "rate-limited", title: "Trop de requêtes" },
  500: { code: "internal-error", title: "Erreur interne" },
  503: { code: "service-unavailable", title: "Service momentanément indisponible" },
};

/**
 * A "clean" HTTP error, safe to show to the client. Thrown only by the HTTP layer (controllers, request
 * parsing); services throw domain errors (src/lib/domain-errors.ts), translated by toHttpError().
 * Anything else that is thrown is logged server-side and answered with a generic 500 (no stack trace, no SQL error).
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public options: { fields?: FieldErrors; headers?: Record<string, string> } = {},
  ) {
    super(message);
  }
}

const BEARER = 'Bearer realm="pause"';

/** The one place where a business error becomes an HTTP status (+ the headers that status requires). */
export function toHttpError(e: DomainError): HttpError {
  const fields = e.fields && { fields: e.fields };
  if (e instanceof NotFoundError) return new HttpError(404, e.message);
  if (e instanceof ForbiddenError) return new HttpError(403, e.message);
  if (e instanceof ConflictError) return new HttpError(409, e.message, { ...fields });
  if (e instanceof InvalidInputError) return new HttpError(400, e.message, { ...fields });
  if (e instanceof AuthenticationRequiredError || e instanceof InvalidCredentialsError) return new HttpError(401, e.message, { headers: { "WWW-Authenticate": BEARER } });
  if (e instanceof SessionExpiredError) return new HttpError(401, e.message, { headers: { "WWW-Authenticate": `${BEARER}, error="invalid_token"` } });
  if (e instanceof TooManyRequestsError) return new HttpError(429, e.message, { headers: { "Retry-After": String(e.retryAfterS) } });
  if (e instanceof UpstreamUnavailableError) return new HttpError(503, e.message, { headers: { "Retry-After": String(e.retryAfterS) } });
  return new HttpError(400, e.message, { ...fields });
}

export const PROBLEM_JSON = "application/problem+json; charset=utf-8";

/**
 * Every API error is a Problem Details document (RFC 9457, `application/problem+json`):
 * `{ type, title, status, detail, instance, code, requestId, fields? }`.
 * `code`, `requestId` and `fields` are documented extensions (see openapi.yaml).
 */
export function problem(status: number, detail: string, ctx: { requestId: string; instance: string }, fields?: FieldErrors) {
  const p = PROBLEMS[status] ?? { code: "error", title: "Erreur" };
  return { type: `/problems/${p.code}`, title: p.title, status, detail, instance: ctx.instance, code: p.code, requestId: ctx.requestId, ...(fields && { fields }) };
}
