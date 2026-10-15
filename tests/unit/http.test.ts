import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ConflictError,
  ForbiddenError,
  InvalidCredentialsError,
  NotFoundError,
  SessionExpiredError,
  TooManyRequestsError,
  UpstreamUnavailableError,
} from "@/lib/domain-errors";
import { HttpError, toHttpError } from "@/lib/errors";
import { readJson, route } from "@/lib/http";
import { logger } from "@/lib/logger";

const call = (handler: () => Promise<Response>) => route(handler)(new Request("http://localhost/api/v1/test"), { params: Promise.resolve({}) });

describe("toHttpError: the one place where a business error becomes an HTTP status", () => {
  it.each([
    [new NotFoundError("x"), 404],
    [new ForbiddenError("x"), 403],
    [new ConflictError("x"), 409],
    [new InvalidCredentialsError("x"), 401],
    [new SessionExpiredError("x"), 401],
    [new TooManyRequestsError("x", 12), 429],
    [new UpstreamUnavailableError("x", 5), 503],
  ])("%s → %i", (error, status) => {
    expect(toHttpError(error).status).toBe(status);
  });

  it("adds the headers each status requires", () => {
    expect(toHttpError(new InvalidCredentialsError("x")).options.headers).toEqual({ "WWW-Authenticate": 'Bearer realm="pause"' });
    expect(toHttpError(new SessionExpiredError("x")).options.headers?.["WWW-Authenticate"]).toContain('error="invalid_token"');
    expect(toHttpError(new TooManyRequestsError("x", 12)).options.headers).toEqual({ "Retry-After": "12" });
  });

  it("keeps the field errors for the form", () => {
    expect(toHttpError(new ConflictError("déjà pris", { email: "Cet email est déjà utilisé" })).options.fields).toEqual({ email: "Cet email est déjà utilisé" });
  });
});

describe("route(): every API error is a Problem Details document", () => {
  it("a service's business error → its status, application/problem+json, a requestId", async () => {
    const res = await call(async () => {
      throw new NotFoundError("Spot introuvable.");
    });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    const body = await res.json();
    expect(body).toMatchObject({ type: "/problems/not-found", status: 404, detail: "Spot introuvable.", instance: "/api/v1/test" });
    expect(body.requestId).toBe(res.headers.get("x-request-id"));
  });

  it("a controller's HTTP error keeps its status and headers", async () => {
    const res = await call(async () => {
      throw new HttpError(412, "Version périmée.");
    });
    expect(res.status).toBe(412);
  });

  it("an unexpected error → generic 500: no stack trace, no SQL, nothing internal leaks", async () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const res = await call(async () => {
      throw new Error('relation "users" does not exist at /app/src/lib/db.ts:12');
    });
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toMatch(/relation|users|db\.ts|at \//);
    // …but everything is in the server logs
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ event: "unhandled_error", error: expect.stringContaining("relation") }));
  });

  it("adds nosniff, no-store and a W3C traceparent to every answer", async () => {
    const res = await call(async () => new Response("{}"));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("traceparent")).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
  });
});

describe("readJson()", () => {
  const schema = z.object({ name: z.string() }).strict();
  const req = (body: string, type = "application/json") => new Request("http://localhost/x", { method: "POST", body, headers: { "content-type": type } });
  const status = (p: Promise<unknown>) => p.then(() => 200, (e: HttpError) => e.status);

  it("415 on a wrong Content-Type, 413 over 16 KB, 400 on broken JSON or a field too many", async () => {
    expect(await status(readJson(req('{"name":"a"}', "text/plain"), schema))).toBe(415);
    expect(await status(readJson(req(JSON.stringify({ name: "a".repeat(17_000) })), schema))).toBe(413);
    expect(await status(readJson(req("{name:"), schema))).toBe(400);
    expect(await status(readJson(req('{"name":"a","role":"admin"}'), schema))).toBe(400);
  });

  it("returns the validated data", async () => {
    expect(await readJson(req('{"name":"a"}'), schema)).toEqual({ name: "a" });
  });
});
