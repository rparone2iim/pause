import "server-only";
import {
  ACCESS_TOKEN_TTL_S,
  type AuthUser,
  REFRESH_IDLE_MS,
  SESSION_MAX_MS,
  hashPassword,
  hashRefreshToken,
  newRefreshToken,
  signAccessToken,
  verifyPassword,
} from "../auth";
import { ConflictError, InvalidCredentialsError, SessionExpiredError, TooManyRequestsError } from "../domain-errors";
import { log } from "../logger";
import { peek, rateLimit } from "../rateLimit";
import { sessionRepository } from "../repositories/session.repository";
import { userRepository } from "../repositories/user.repository";
import { toPublicUser } from "./user.service";

// Anti brute force: failed logins are counted per IP and per account; a successful login doesn't count.
const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES_PER_IP = 10;
const MAX_FAILURES_PER_ACCOUNT = 5;
/** Two tabs refreshing at the same moment both send the token that was just rotated: not an attack. */
const ROTATION_GRACE_MS = 30_000;

/** What the client gets: an access token in the body, the refresh token for the HttpOnly cookie. */
export interface IssuedSession {
  body: { accessToken: string; tokenType: "Bearer"; expiresIn: number; expiresAt: string };
  refresh: { token: string; expiresAt: Date } | null;
}

async function accessFor(userId: string, sessionId: string): Promise<IssuedSession["body"]> {
  const { token, expiresAt } = await signAccessToken(userId, sessionId);
  return { accessToken: token, tokenType: "Bearer", expiresIn: ACCESS_TOKEN_TTL_S, expiresAt: expiresAt.toISOString() };
}

async function openSession(userId: string): Promise<IssuedSession> {
  const token = newRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_IDLE_MS);
  const session = await sessionRepository.create({ userId, refreshHash: hashRefreshToken(token), expiresAt });
  void sessionRepository.purgeOld().catch(() => {});
  return { body: await accessFor(userId, session.id), refresh: { token, expiresAt } };
}

const invalidRefresh = () => new SessionExpiredError("Ta session a expiré, reconnecte-toi.");

export const authService = {
  /** Creates the account and logs it in right away. */
  async register(input: { displayName: string; email: string; password: string }, requestId: string) {
    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.create({ displayName: input.displayName, email: input.email, passwordHash });
    if (!user) throw new ConflictError("Un compte existe déjà avec cet email.", { email: "Cet email est déjà utilisé" });
    log("info", "user_created", { requestId, userId: user.id });
    return { user: toPublicUser(user), session: await openSession(user.id) };
  },

  async login(input: { email: string; password: string }, ctx: { ip: string; requestId: string }) {
    const ipKey = `login-fail-ip:${ctx.ip}`;
    const accountKey = `login-fail-account:${input.email}`;
    for (const [key, max] of [
      [ipKey, MAX_FAILURES_PER_IP],
      [accountKey, MAX_FAILURES_PER_ACCOUNT],
    ] as const) {
      const state = peek(key, max);
      if (state.blocked) throw new TooManyRequestsError("Trop de tentatives, réessaie dans quelques minutes.", state.retryAfter);
    }

    const user = await userRepository.findByEmail(input.email);
    const ok = await verifyPassword(input.password, user?.passwordHash);
    if (!user || !ok) {
      rateLimit(ipKey, MAX_FAILURES_PER_IP, LOGIN_WINDOW_MS);
      rateLimit(accountKey, MAX_FAILURES_PER_ACCOUNT, LOGIN_WINDOW_MS);
      log("warn", "login_failed", { requestId: ctx.requestId, ip: ctx.ip });
      // Same message whether the email exists or not (no account enumeration).
      throw new InvalidCredentialsError("Email ou mot de passe incorrect.");
    }
    log("info", "login_succeeded", { requestId: ctx.requestId, userId: user.id });
    return { user: toPublicUser(user), session: await openSession(user.id) };
  },

  /**
   * A new access token for the refresh token of the cookie, which is rotated (single use).
   * A token that was already rotated and comes back later means it was stolen: the whole session is revoked,
   * so neither the thief nor the victim can go on with it (the victim simply logs in again).
   */
  async refresh(rawToken: string | null, requestId: string): Promise<IssuedSession> {
    if (!rawToken || rawToken.length > 100) throw invalidRefresh();
    const hash = hashRefreshToken(rawToken);
    const session = await sessionRepository.findByRefreshHash(hash);
    if (!session || session.revokedAt || session.expiresAt <= new Date()) throw invalidRefresh();

    if (session.refreshHash !== hash) {
      if (Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS) {
        // Race between two tabs: the browser already holds the new cookie, only the access token is needed.
        return { body: await accessFor(session.userId, session.id), refresh: null };
      }
      await sessionRepository.revoke(session.id);
      log("warn", "refresh_token_reused", { requestId, userId: session.userId, sessionId: session.id });
      throw invalidRefresh();
    }

    const next = newRefreshToken();
    const expiresAt = new Date(Math.min(Date.now() + REFRESH_IDLE_MS, session.createdAt.getTime() + SESSION_MAX_MS));
    if (!(await sessionRepository.rotate(session.id, hash, hashRefreshToken(next), expiresAt))) {
      // Rotated by a concurrent request a few milliseconds ago: same as the grace case above.
      return { body: await accessFor(session.userId, session.id), refresh: null };
    }
    return { body: await accessFor(session.userId, session.id), refresh: { token: next, expiresAt } };
  },

  /** Ends THIS session only (this device): its access and refresh tokens stop working at once. */
  async logout(auth: AuthUser) {
    await sessionRepository.revoke(auth.sessionId);
  },
};
