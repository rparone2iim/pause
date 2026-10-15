import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The authentication rules, with the database replaced by in-memory fakes:
 * brute-force lock, no account enumeration, refresh token rotation and stolen-token detection.
 */
const sessions = { create: vi.fn(), purgeOld: vi.fn(), findByRefreshHash: vi.fn(), revoke: vi.fn(), rotate: vi.fn() };
const users = { create: vi.fn(), findByEmail: vi.fn() };
vi.mock("@/lib/repositories/session.repository", () => ({ sessionRepository: sessions }));
vi.mock("@/lib/repositories/user.repository", () => ({ userRepository: users }));

const { authService } = await import("@/lib/services/auth.service");
const { hashPassword, hashRefreshToken } = await import("@/lib/auth");
const { ConflictError, InvalidCredentialsError, SessionExpiredError, TooManyRequestsError } = await import("@/lib/domain-errors");

const passwordHash = await hashPassword("motdepasse42");
const alice = { id: "u1", email: "alice@pause.dev", displayName: "Alice", passwordHash, preferredTypes: [], radiusM: 800, createdAt: new Date(), updatedAt: new Date() };
let ip = 0;
const ctx = () => ({ ip: `10.0.0.${++ip}`, requestId: "r" });

beforeEach(() => {
  for (const f of [...Object.values(sessions), ...Object.values(users)]) f.mockReset();
  sessions.create.mockResolvedValue({ id: "s1" });
  sessions.purgeOld.mockResolvedValue(undefined);
});

describe("register", () => {
  it("never returns the password hash, and opens a first session", async () => {
    users.create.mockResolvedValue(alice);
    const r = await authService.register({ displayName: "Alice", email: alice.email, password: "motdepasse42" }, "r");
    expect(JSON.stringify(r.user)).not.toContain("$2");
    expect(r.session.body.accessToken).toBeTruthy();
    expect(r.session.refresh?.token).toBeTruthy();
    expect(users.create.mock.calls[0][0].passwordHash).not.toBe("motdepasse42");
  });

  it("an email already used → ConflictError on the email field", async () => {
    users.create.mockResolvedValue(null);
    await expect(authService.register({ displayName: "A", email: alice.email, password: "motdepasse42" }, "r")).rejects.toMatchObject({
      constructor: ConflictError,
      fields: { email: expect.any(String) },
    });
  });
});

describe("login", () => {
  it("same error for an unknown email and a wrong password (no account enumeration)", async () => {
    users.findByEmail.mockResolvedValue(null);
    const unknown = await authService.login({ email: "nobody@pause.dev", password: "x" }, ctx()).catch((e) => e);
    users.findByEmail.mockResolvedValue(alice);
    const wrong = await authService.login({ email: alice.email, password: "mauvais" }, ctx()).catch((e) => e);
    expect(unknown).toBeInstanceOf(InvalidCredentialsError);
    expect(wrong).toBeInstanceOf(InvalidCredentialsError);
    expect(unknown.message).toBe(wrong.message);
  });

  it("5 failures on one account lock it, even from 5 different IPs — the right password included", async () => {
    users.findByEmail.mockResolvedValue({ ...alice, email: "target@pause.dev" });
    for (let i = 0; i < 5; i++) await expect(authService.login({ email: "target@pause.dev", password: "mauvais" }, ctx())).rejects.toBeInstanceOf(InvalidCredentialsError);
    const locked = await authService.login({ email: "target@pause.dev", password: "motdepasse42" }, ctx()).catch((e) => e);
    expect(locked).toBeInstanceOf(TooManyRequestsError);
    expect(locked.retryAfterS).toBeGreaterThan(0);
  });
});

describe("refresh token rotation", () => {
  const session = (over: object = {}) => ({ id: "s1", userId: "u1", refreshHash: hashRefreshToken("current"), revokedAt: null, expiresAt: new Date(Date.now() + 3600_000), rotatedAt: new Date(0), createdAt: new Date(), ...over });

  it("a valid token gives a new access token AND a new refresh token (single use)", async () => {
    sessions.findByRefreshHash.mockResolvedValue(session());
    sessions.rotate.mockResolvedValue(true);
    const r = await authService.refresh("current", "r");
    expect(r.refresh?.token).toBeTruthy();
    expect(r.refresh?.token).not.toBe("current");
    expect(sessions.rotate).toHaveBeenCalledWith("s1", hashRefreshToken("current"), hashRefreshToken(r.refresh!.token), expect.any(Date));
  });

  it("an already-rotated token coming back later = stolen → the whole session is revoked", async () => {
    sessions.findByRefreshHash.mockResolvedValue(session({ refreshHash: hashRefreshToken("newer") }));
    await expect(authService.refresh("current", "r")).rejects.toBeInstanceOf(SessionExpiredError);
    expect(sessions.revoke).toHaveBeenCalledWith("s1");
  });

  it("two tabs refreshing at the same moment is not an attack (30 s grace, no revocation)", async () => {
    sessions.findByRefreshHash.mockResolvedValue(session({ refreshHash: hashRefreshToken("newer"), rotatedAt: new Date() }));
    const r = await authService.refresh("current", "r");
    expect(r.body.accessToken).toBeTruthy();
    expect(r.refresh).toBeNull();
    expect(sessions.revoke).not.toHaveBeenCalled();
  });

  it("unknown, revoked or expired → SessionExpiredError", async () => {
    for (const s of [null, session({ revokedAt: new Date() }), session({ expiresAt: new Date(0) })]) {
      sessions.findByRefreshHash.mockResolvedValue(s);
      await expect(authService.refresh("current", "r")).rejects.toBeInstanceOf(SessionExpiredError);
    }
    await expect(authService.refresh(null, "r")).rejects.toBeInstanceOf(SessionExpiredError);
  });
});
