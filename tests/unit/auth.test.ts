import { SignJWT, UnsecuredJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isActive = vi.fn();
vi.mock("@/lib/repositories/session.repository", () => ({ sessionRepository: { isActive: (...a: unknown[]) => isActive(...a) } }));

const { hashPassword, hashRefreshToken, newRefreshToken, refreshCookie, requireUser, signAccessToken, verifyPassword } = await import("@/lib/auth");
const { AuthenticationRequiredError, SessionExpiredError } = await import("@/lib/domain-errors");

const bearer = (token: string) => new Request("http://localhost/api/v1/me", { headers: { authorization: `Bearer ${token}` } });

beforeEach(() => isActive.mockReset().mockResolvedValue(true));

describe("passwords (bcrypt)", () => {
  it("hashes with cost 12 and a random salt, and verifies", async () => {
    const [a, b] = await Promise.all([hashPassword("motdepasse42"), hashPassword("motdepasse42")]);
    expect(a).toMatch(/^\$2[aby]\$12\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword("motdepasse42", a)).toBe(true);
    expect(await verifyPassword("mauvais", a)).toBe(false);
  });

  it("an unknown account (no hash) is refused, after the same bcrypt work (no timing leak)", async () => {
    expect(await verifyPassword("motdepasse42", undefined)).toBe(false);
  });
});

describe("refresh tokens", () => {
  it("are random, only their SHA-256 is stored", () => {
    const t = newRefreshToken();
    expect(t).not.toBe(newRefreshToken());
    expect(hashRefreshToken(t)).not.toContain(t);
    expect(hashRefreshToken(t)).toBe(hashRefreshToken(t));
  });

  it("travel in an HttpOnly, SameSite=Strict cookie scoped to the refresh path", () => {
    const c = refreshCookie("abc", new Date(Date.now() + 1000));
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Strict");
    expect(c).toContain("Path=/api/v1/sessions/current");
    expect(refreshCookie(null)).toContain("Max-Age=0");
  });
});

describe("requireUser(): the bouncer of private routes", () => {
  it("accepts a valid access token whose session is still open", async () => {
    const { token } = await signAccessToken("user-1", "session-1");
    expect(await requireUser(bearer(token))).toEqual({ userId: "user-1", sessionId: "session-1" });
    expect(isActive).toHaveBeenCalledWith("session-1", "user-1");
  });

  it("no Authorization header → authentication required", async () => {
    await expect(requireUser(new Request("http://localhost/x"))).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it("a logged-out / revoked session kills its access token at once", async () => {
    isActive.mockResolvedValue(false);
    const { token } = await signAccessToken("user-1", "session-1");
    await expect(requireUser(bearer(token))).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("refuses alg: none, another secret, another audience, an expired token", async () => {
    const claims = { sid: "s" };
    const none = new UnsecuredJWT(claims).setSubject("u").setJti("j").setIssuer("pause-api").setAudience("pause-web").setExpirationTime("1h").encode();
    const sign = (secret: string, aud = "pause-web", exp: string | number = "1h") =>
      new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setSubject("u").setJti("j").setIssuer("pause-api").setAudience(aud).setExpirationTime(exp).sign(new TextEncoder().encode(secret));
    const forged = [none, await sign("another-secret-another-secret-another"), await sign(process.env.JWT_SECRET!, "someone-else"), await sign(process.env.JWT_SECRET!, "pause-web", Math.floor(Date.now() / 1000) - 60)];
    for (const token of forged) await expect(requireUser(bearer(token))).rejects.toBeInstanceOf(SessionExpiredError);
    expect(isActive).not.toHaveBeenCalled();
  });
});
