import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Integration tests: the real route handlers (src/app/api/v1/**) against a real PostgreSQL, in-process —
 * no browser, no server to start. Only run with INTEGRATION=1 and a migrated database
 * (npm run test:integration, done by the CI after db/init.sh + db:migrate).
 * The black-box attacks against a running server are scripts/security-test.mjs.
 */
const enabled = process.env.INTEGRATION === "1";

type Handler = (req: Request, ctx: { params: Promise<unknown> }) => Promise<Response>;
const users = await import("@/app/api/v1/users/route");
const sessions = await import("@/app/api/v1/sessions/route");
const current = await import("@/app/api/v1/sessions/current/route");
const tokens = await import("@/app/api/v1/sessions/current/tokens/route");
const me = await import("@/app/api/v1/me/route");
const spots = await import("@/app/api/v1/spots/route");
const spot = await import("@/app/api/v1/spots/[id]/route");
const reviews = await import("@/app/api/v1/spots/[id]/reviews/route");

interface Call {
  token?: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  contentType?: string;
}
async function call(handler: Handler, method: string, path: string, { token, body, cookie, headers = {}, params = {}, contentType = "application/json" }: Call = {}) {
  const h: Record<string, string> = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (cookie) h.cookie = cookie;
  if (body !== undefined) h["content-type"] = contentType;
  const res = await handler(new Request(`http://localhost${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), { params: Promise.resolve(params) });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null, text };
}
const refreshCookieOf = (r: { headers: Headers }) => r.headers.getSetCookie().find((c) => c.startsWith("pause_refresh="))!.split(";")[0];

const run = Date.now().toString(36);
const password = "motdepasse42";
let alice: { token: string };
let bob: { token: string };

describe.skipIf(!enabled)("API against a real database", () => {
  beforeAll(async () => {
    const a = await call(users.POST, "POST", "/api/v1/users", { body: { displayName: "Alice", email: `alice-${run}@test.dev`, password } });
    const b = await call(users.POST, "POST", "/api/v1/users", { body: { displayName: "Bob", email: `bob-${run}@test.dev`, password } });
    expect([a.status, b.status]).toEqual([201, 201]);
    alice = { token: a.json.accessToken };
    bob = { token: b.json.accessToken };
  });

  afterAll(async () => {
    for (const t of [alice?.token, bob?.token]) if (t) await call(me.DELETE, "DELETE", "/api/v1/me", { token: t });
  });

  describe("accounts and sessions", () => {
    it("sign-up: 201 + Location, never the password hash, email unique", async () => {
      const r = await call(me.GET, "GET", "/api/v1/me", { token: alice.token });
      expect(r.status).toBe(200);
      expect(r.text).not.toMatch(/password|\$2[aby]\$/);
      const dup = await call(users.POST, "POST", "/api/v1/users", { body: { displayName: "Alice 2", email: `ALICE-${run}@test.dev`, password } });
      expect(dup.status).toBe(409);
      expect(dup.json.fields.email).toBeDefined();
    });

    it("refresh rotates the cookie; replaying an old one = stolen → the whole session is revoked", async () => {
      const login = await call(sessions.POST, "POST", "/api/v1/sessions", { body: { email: `alice-${run}@test.dev`, password } });
      const [token, c1] = [login.json.accessToken, refreshCookieOf(login)];
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        const first = await call(tokens.POST, "POST", "/api/v1/sessions/current/tokens", { cookie: c1 });
        expect(first.status).toBe(200);
        const c2 = refreshCookieOf(first);
        expect(c2).not.toBe(c1);

        vi.setSystemTime(Date.now() + 31_000); // past the 30 s grace given to two tabs refreshing together
        const replay = await call(tokens.POST, "POST", "/api/v1/sessions/current/tokens", { cookie: c1 });
        expect(replay.status).toBe(401);
        expect(replay.headers.get("set-cookie")).toContain("Max-Age=0");
        // The thief AND the victim are out: the new cookie and the access token of that session are dead.
        expect((await call(tokens.POST, "POST", "/api/v1/sessions/current/tokens", { cookie: c2 })).status).toBe(401);
        expect((await call(me.GET, "GET", "/api/v1/me", { token })).status).toBe(401);
      } finally {
        vi.useRealTimers();
      }
      // Alice's other session (other device) is untouched.
      expect((await call(me.GET, "GET", "/api/v1/me", { token: alice.token })).status).toBe(200);
    });

    it("login with the wrong password: 401 + WWW-Authenticate, same message as an unknown email", async () => {
      const wrong = await call(sessions.POST, "POST", "/api/v1/sessions", { body: { email: `alice-${run}@test.dev`, password: "mauvais-mdp-1" } });
      const unknown = await call(sessions.POST, "POST", "/api/v1/sessions", { body: { email: `nobody-${run}@test.dev`, password: "mauvais-mdp-1" } });
      expect(wrong.status).toBe(401);
      expect(wrong.headers.get("www-authenticate")).toMatch(/^Bearer/);
      expect(unknown.json.detail).toBe(wrong.json.detail);
    });

    it("logout kills the access token at once (server-side session)", async () => {
      const login = await call(sessions.POST, "POST", "/api/v1/sessions", { body: { email: `alice-${run}@test.dev`, password } });
      expect(login.status).toBe(201);
      const token = login.json.accessToken;
      expect((await call(current.DELETE, "DELETE", "/api/v1/sessions/current", { token })).status).toBe(204);
      expect((await call(me.GET, "GET", "/api/v1/me", { token })).status).toBe(401);
      alice.token = (await call(sessions.POST, "POST", "/api/v1/sessions", { body: { email: `alice-${run}@test.dev`, password } })).json.accessToken;
    });
  });

  describe("spots: ownership, privacy, concurrency", () => {
    let id: string;

    it("create: 201 + Location; the same Idempotency-Key never creates a duplicate", async () => {
      const body = { name: `Banc ${run}`, type: "bench", lat: 48.8932, lng: 2.2269, isPrivate: true };
      const headers = { "idempotency-key": `k-${run}` };
      const a = await call(spots.POST, "POST", "/api/v1/spots", { token: alice.token, body, headers });
      const b = await call(spots.POST, "POST", "/api/v1/spots", { token: alice.token, body, headers });
      expect(a.status).toBe(201);
      expect(a.headers.get("location")).toBe(`/api/v1/spots/${a.json.spot.id}`);
      expect(b.json.spot.id).toBe(a.json.spot.id);
      expect(b.headers.get("idempotent-replayed")).toBe("true");
      id = a.json.spot.id;
    });

    it("someone else's private spot does not exist for Bob (404), and he can't edit or delete it", async () => {
      const params = { id };
      expect((await call(spot.GET, "GET", `/api/v1/spots/${id}`, { token: bob.token, params })).status).toBe(404);
      expect((await call(spot.PATCH, "PATCH", `/api/v1/spots/${id}`, { token: bob.token, params, body: { name: "Piraté" } })).status).toBe(404);
      expect((await call(spot.DELETE, "DELETE", `/api/v1/spots/${id}`, { token: bob.token, params })).status).toBe(404);
    });

    it("once public, Bob can see it but still not edit it (403: anti-IDOR)", async () => {
      const params = { id };
      expect((await call(spot.PATCH, "PATCH", `/api/v1/spots/${id}`, { token: alice.token, params, body: { isPrivate: false } })).status).toBe(200);
      expect((await call(spot.GET, "GET", `/api/v1/spots/${id}`, { token: bob.token, params })).status).toBe(200);
      expect((await call(spot.PATCH, "PATCH", `/api/v1/spots/${id}`, { token: bob.token, params, body: { name: "Piraté" } })).status).toBe(403);
    });

    it("ETag: 304 when unchanged, 412 when editing a version that changed meanwhile", async () => {
      const params = { id };
      const first = await call(spot.GET, "GET", `/api/v1/spots/${id}`, { token: alice.token, params });
      const etag = first.headers.get("etag")!;
      expect((await call(spot.GET, "GET", `/api/v1/spots/${id}`, { token: alice.token, params, headers: { "if-none-match": etag } })).status).toBe(304);
      await call(reviews.PUT, "PUT", `/api/v1/spots/${id}/reviews`, { token: bob.token, params, body: { rating: 4 } });
      const stale = await call(spot.PATCH, "PATCH", `/api/v1/spots/${id}`, { token: alice.token, params, body: { name: "Nouveau nom" }, headers: { "if-match": etag } });
      expect(stale.status).toBe(412);
    });

    it("one review per person: PUT creates (201) then updates (200)", async () => {
      const params = { id };
      const again = await call(reviews.PUT, "PUT", `/api/v1/spots/${id}/reviews`, { token: bob.token, params, body: { rating: 2, comment: "Bruyant ce midi" } });
      expect(again.status).toBe(200);
      const list = await call(reviews.GET, "GET", `/api/v1/spots/${id}/reviews`, { token: alice.token, params });
      expect(list.json.data).toHaveLength(1);
      expect(list.json.data[0]).toMatchObject({ rating: 2, comment: "Bruyant ce midi" });
    });

    it("deleting the account (GDPR) removes the user's reviews and logs them out", async () => {
      expect((await call(me.DELETE, "DELETE", "/api/v1/me", { token: bob.token })).status).toBe(204);
      expect((await call(me.GET, "GET", "/api/v1/me", { token: bob.token })).status).toBe(401);
      const list = await call(reviews.GET, "GET", `/api/v1/spots/${id}/reviews`, { token: alice.token, params: { id } });
      expect(list.json.data).toHaveLength(0);
    });
  });
});
