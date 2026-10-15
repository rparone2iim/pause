import { readFile } from "node:fs/promises";

/** The API contract, for Swagger UI in development only (404 in production: the contract is not published). */
export async function GET() {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  return new Response(await readFile("openapi.yaml", "utf8"), { headers: { "Content-Type": "application/yaml; charset=utf-8", "Cache-Control": "no-store" } });
}
