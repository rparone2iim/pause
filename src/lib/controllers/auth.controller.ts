import "server-only";
import { readRefreshCookie, refreshCookie, requireUser } from "../auth";
import { HttpError } from "../errors";
import { json, noContent, readJson, route } from "../http";
import { clientIp } from "../rateLimit";
import { loginBody, registerBody } from "../validation";
import { authService, type IssuedSession } from "../services/auth.service";

const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };

/** The access token goes in the body (kept in memory by the front), the refresh token in an HttpOnly cookie. */
function withSession(body: Record<string, unknown>, session: IssuedSession, init: { status?: number; headers?: Record<string, string> } = {}) {
  const res = json({ ...session.body, ...body }, { status: init.status, headers: { ...noStore, ...init.headers } });
  if (session.refresh) res.headers.append("Set-Cookie", refreshCookie(session.refresh.token, session.refresh.expiresAt));
  return res;
}

/*
 * Authentication modelled as resources (REST: nouns, no verbs in URLs):
 *   POST   /api/v1/users                     create an account (and its first session)
 *   POST   /api/v1/sessions                  log in = open a session
 *   POST   /api/v1/sessions/current/tokens   new access token from the refresh cookie (rotated)
 *   DELETE /api/v1/sessions/current          log out = close this session
 */
export const authController = {
  /** 20 sign-ups per hour per IP. */
  register: route(
    async ({ req, requestId }) => {
      const { user, session } = await authService.register(await readJson(req, registerBody), requestId);
      return withSession({ user }, session, { status: 201, headers: { Location: "/api/v1/me" } });
    },
    { rateLimit: { name: "register", limit: 20, windowMs: 60 * 60_000 } },
  ),

  /** 10 failures / 15 min per IP, 5 per account. */
  login: route(async ({ req, requestId }) => {
    const { user, session } = await authService.login(await readJson(req, loginBody), { ip: clientIp(req), requestId });
    return withSession({ user }, session, { status: 201, headers: { Location: "/api/v1/sessions/current" } });
  }),

  /** No body: the refresh token comes from the cookie (SameSite=Strict + Origin check → no CSRF). */
  refresh: route(
    async ({ req, requestId }) => {
      try {
        return withSession({}, await authService.refresh(readRefreshCookie(req), requestId));
      } catch (e) {
        // Dead refresh token: also remove it from the browser.
        if (e instanceof HttpError) e.options.headers = { ...e.options.headers, "Set-Cookie": refreshCookie(null) };
        throw e;
      }
    },
    { rateLimit: { name: "refresh", limit: 30, windowMs: 60_000 } },
  ),

  /** Only this session ends: the user's other devices stay logged in. */
  logout: route(async ({ req }) => {
    await authService.logout(await requireUser(req));
    return noContent({ ...noStore, "Set-Cookie": refreshCookie(null) });
  }),
};
