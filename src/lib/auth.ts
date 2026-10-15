import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { env } from "./env";
import { AuthenticationRequiredError, SessionExpiredError } from "./domain-errors";
import { sessionRepository } from "./repositories/session.repository";

export const JWT_ISSUER = "pause-api";
export const JWT_AUDIENCE = "pause-web";
/** Short-lived access token: if it leaks, it is useless 15 minutes later. */
export const ACCESS_TOKEN_TTL_S = 15 * 60;
/** Refresh token: rotated on every use, the session dies after 7 days without activity or 30 days in total. */
export const REFRESH_IDLE_MS = 7 * 24 * 3600_000;
export const SESSION_MAX_MS = 30 * 24 * 3600_000;
const BCRYPT_COST = 12; // ≈ 250 ms per hash: ruins brute force

const secret = new TextEncoder().encode(env.JWT_SECRET);

// --- Passwords (bcrypt) ---

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_COST);
}

// Compared against when the email is unknown, so response time doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

export async function verifyPassword(password: string, hash: string | undefined) {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return Boolean(hash) && ok;
}

// --- Access tokens (jose, JWT HS256) ---

export async function signAccessToken(userId: string, sessionId: string) {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_S * 1000);
  const token = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
  return { token, expiresAt };
}

// --- Refresh tokens (opaque, only their SHA-256 is stored) ---

export const newRefreshToken = () => randomBytes(32).toString("base64url");
export const hashRefreshToken = (token: string) => createHash("sha256").update(token).digest("base64url");

export const REFRESH_COOKIE = "pause_refresh";
/** Sent back only to the refresh endpoint, never readable by JavaScript, never sent by another site. */
export const REFRESH_COOKIE_PATH = "/api/v1/sessions/current";

export function refreshCookie(token: string | null, expiresAt?: Date) {
  const secure = env.APP_ORIGIN.startsWith("https://") ? "; Secure" : "";
  const base = `${REFRESH_COOKIE}=${token ?? ""}; Path=${REFRESH_COOKIE_PATH}; HttpOnly; SameSite=Strict${secure}`;
  return token && expiresAt ? `${base}; Expires=${expiresAt.toUTCString()}` : `${base}; Max-Age=0`;
}

export function readRefreshCookie(req: Request) {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === REFRESH_COOKIE) return value.join("=") || null;
  }
  return null;
}

export interface AuthUser {
  userId: string;
  sessionId: string;
}

/**
 * The bouncer of private routes. Reads `Authorization: Bearer <jwt>` and checks: signature,
 * algorithm forced to HS256 (a token with `alg: none` is refused), issuer, audience, expiry,
 * and that its session is still active (not logged out, not revoked, account not deleted). Otherwise: 401.
 */
export async function requireUser(req: Request): Promise<AuthUser> {
  const header = req.headers.get("authorization");
  if (!header) throw new AuthenticationRequiredError("Connecte-toi pour continuer.");
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw new SessionExpiredError("Session invalide, reconnecte-toi.");
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    const sid = payload.sid;
    if (!payload.sub || !payload.jti || typeof sid !== "string") throw new Error("incomplete token");
    if (!(await sessionRepository.isActive(sid, payload.sub))) throw new Error("session ended");
    return { userId: payload.sub, sessionId: sid };
  } catch {
    throw new SessionExpiredError("Ta session a expiré, reconnecte-toi.");
  }
}
