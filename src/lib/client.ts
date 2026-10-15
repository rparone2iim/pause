"use client";

/**
 * Browser side: `api()` calls the server and adds `Authorization: Bearer <access token>`.
 * - The access token (15 min) lives only in memory: not in localStorage, not in a cookie, so an injected
 *   script can't pick it up from storage and another site can't make the browser send it (no CSRF).
 * - The refresh token is an HttpOnly cookie that JavaScript can't read at all; it is only sent to
 *   /api/v1/sessions/current/tokens, and never by another site (SameSite=Strict).
 * When the access token is missing or expired, api() gets a new one once, then retries the request.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Field name → message to show under that field. */
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

// --- Access token, in memory only ---

let access: { token: string; expiresAt: number } | null = null;

export interface SessionTokens {
  accessToken: string;
  expiresAt: string;
}

export function setSession(s: SessionTokens | null) {
  access = s ? { token: s.accessToken, expiresAt: new Date(s.expiresAt).getTime() } : null;
}

const validToken = () => (access && access.expiresAt > Date.now() + 15_000 ? access.token : null);

/** Called when the session can't be renewed any more (logged out elsewhere, expired, revoked). */
let onUnauthorized: () => void = () => {};
export function onSessionExpired(fn: () => void) {
  onUnauthorized = fn;
}

let refreshing: Promise<boolean> | null = null;

/**
 * New access token from the refresh cookie. One request at a time: parallel calls share it.
 * Returns false when there is no valid session (never logged in, logged out, expired).
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch("/api/v1/sessions/current/tokens", { method: "POST", headers: { Accept: "application/json" }, credentials: "same-origin" });
      if (!res.ok) {
        access = null;
        return false;
      }
      setSession((await res.json()) as SessionTokens);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

// --- api() ---

interface Options {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON body, or FormData for photo uploads. */
  body?: unknown;
  signal?: AbortSignal;
  idempotencyKey?: string;
  /** Sent as Content-Type for a JSON body (e.g. application/merge-patch+json for a PATCH). */
  contentType?: string;
}

const PUBLIC = /^\/(users|sessions)$/;

async function send(path: string, { method = "GET", body, signal, idempotencyKey, contentType }: Options, token: string | null) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = contentType ?? (method === "PATCH" ? "application/merge-patch+json" : "application/json");
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  try {
    return await fetch(`/api/v1${path}`, { method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body), signal, credentials: "same-origin" });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network-error", "Connexion impossible. Vérifie ta connexion internet.");
  }
}

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const isPublic = PUBLIC.test(path);
  let token = isPublic ? null : validToken();
  if (!isPublic && !token && (await refreshSession())) token = validToken();

  let res = await send(path, options, token);
  // Access token refused (expired between two checks, or revoked): one refresh, one retry.
  if (res.status === 401 && !isPublic && (await refreshSession())) res = await send(path, options, validToken());

  if (res.status === 204 || res.status === 304) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Errors are Problem Details (RFC 9457): { type, title, status, detail, code, fields? }.
    if (res.status === 401 && !isPublic) {
      access = null;
      onUnauthorized();
      const here = window.location.pathname;
      if (!here.startsWith("/login") && !here.startsWith("/register")) window.location.assign(`/login?next=${encodeURIComponent(here)}`);
    }
    throw new ApiError(res.status, data?.code ?? "error", data?.detail ?? "Une erreur est survenue, réessaie.", data?.fields ?? {});
  }
  return data as T;
}

/** Logs out on the server (this device only) and forgets the access token. */
export async function endSession() {
  try {
    if (validToken() || (await refreshSession())) await send("/sessions/current", { method: "DELETE" }, validToken());
  } finally {
    access = null;
  }
}

/** The message to show for any error thrown by api(). */
export function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : "Une erreur est survenue, réessaie.";
}

/** Field errors of a 400, to show under each field. */
export function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError ? e.fields : {};
}
