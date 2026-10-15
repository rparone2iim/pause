import "server-only";

/*
 * Business errors, thrown by services and domain helpers. They say WHAT went wrong, never which HTTP
 * status to answer: the HTTP layer (src/lib/errors.ts → toHttpError) maps each class to a status
 * and headers in one place. A service can then be reused (job, script, test) without any HTTP in sight.
 */

/** Field name → message shown under that field in the form. */
export type FieldErrors = Record<string, string>;

export abstract class DomainError extends Error {
  constructor(
    message: string,
    public fields?: FieldErrors,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The resource doesn't exist, or the viewer may not even know it exists (someone else's private spot). */
export class NotFoundError extends DomainError {}

/** Logged in, but not allowed to do this (e.g. edit someone else's spot). */
export class ForbiddenError extends DomainError {}

/** Clashes with the current state (email already used, spot already full of photos). */
export class ConflictError extends DomainError {}

/** The data itself is unacceptable (not an image, unreadable cursor…). */
export class InvalidInputError extends DomainError {}

/** No credentials at all. */
export class AuthenticationRequiredError extends DomainError {}

/** Wrong email or password (same error either way: no account enumeration). */
export class InvalidCredentialsError extends DomainError {}

/** The token or session is invalid, expired, revoked or replayed. */
export class SessionExpiredError extends DomainError {}

/** Too many attempts: try again in `retryAfterS` seconds. */
export class TooManyRequestsError extends DomainError {
  constructor(
    message: string,
    public retryAfterS: number,
  ) {
    super(message);
  }
}

/** A service we depend on (OpenStreetMap, Nominatim, Open-Meteo) didn't answer: try again in `retryAfterS` seconds. */
export class UpstreamUnavailableError extends DomainError {
  constructor(
    message: string,
    public retryAfterS: number,
  ) {
    super(message);
  }
}
