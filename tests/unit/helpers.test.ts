import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, InvalidInputError, NotFoundError } from "@/lib/domain-errors";
import { proxiedImage, proxiedImageUrl } from "@/lib/image-proxy";
import { cursor, paginate } from "@/lib/pagination";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { assertOwner } from "@/lib/spots";
import type { Spot } from "@/db/schema";

describe("anti-IDOR: assertOwner()", () => {
  it("being logged in is not enough: only the author passes", () => {
    const spot = { authorId: "alice" } as Spot;
    expect(() => assertOwner(spot, "alice")).not.toThrow();
    expect(() => assertOwner(spot, "bob")).toThrow(ForbiddenError);
  });
});

describe("keyset pagination", () => {
  const id = "0b7a6c1e-2f3d-4e5f-8a9b-0c1d2e3f4a5b";

  it("cursor round trip", () => {
    const at = new Date("2026-10-01T10:00:00Z");
    expect(cursor.decode(cursor.encode(at, id))).toEqual({ at, id });
  });

  it("a forged cursor is a clean 400-type error, not a crash or an injection", () => {
    expect(() => cursor.decode(Buffer.from("x' OR 1=1 --|nope").toString("base64url"))).toThrow(InvalidInputError);
  });

  it("asks for limit + 1 rows: a next page exists only if there is one more", () => {
    const rows = [1, 2, 3].map((n) => ({ id, at: new Date(n) }));
    expect(paginate(rows, 2, (r) => r.at, (r) => r.at.getTime()).nextCursor).not.toBeNull();
    expect(paginate(rows, 3, (r) => r.at, (r) => r.at.getTime()).nextCursor).toBeNull();
  });
});

describe("rate limiting", () => {
  it("blocks past the limit and says when to retry", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("without a trusted proxy, a made-up X-Forwarded-For is ignored", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4" } }))).toBe("direct");
  });
});

describe("image proxy: not an open proxy", () => {
  it("only signs Wikimedia URLs over HTTPS", () => {
    expect(proxiedImageUrl("https://upload.wikimedia.org/a.jpg")).toMatch(/^\/api\/v1\/images\?u=.+&s=.+/);
    for (const url of ["http://upload.wikimedia.org/a.jpg", "https://evil.example/a.jpg", "https://user:pw@upload.wikimedia.org/a.jpg", "http://169.254.169.254/"]) {
      expect(proxiedImageUrl(url)).toBeUndefined();
    }
  });

  it("a tampered signature or URL is refused before any request leaves the server (no SSRF)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const signed = new URL(proxiedImageUrl("https://upload.wikimedia.org/a.jpg")!, "http://x");
    const metadata = Buffer.from("http://169.254.169.254/computeMetadata/v1/").toString("base64url");
    await expect(proxiedImage(signed.searchParams.get("u")!, "A".repeat(32))).rejects.toBeInstanceOf(NotFoundError);
    await expect(proxiedImage(metadata, signed.searchParams.get("s")!)).rejects.toBeInstanceOf(NotFoundError);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
