/**
 * Every API route and its methods, in one place (mirrors src/app/api/v1 and openapi.yaml).
 * The middleware uses it to answer 405 + `Allow` for a known path called with the wrong method.
 */
const SEG = "[^/]+";

export const API_ROUTES: { pattern: RegExp; methods: string[] }[] = [
  { pattern: /^\/api\/v1\/users$/, methods: ["POST"] },
  { pattern: /^\/api\/v1\/sessions$/, methods: ["POST"] },
  { pattern: /^\/api\/v1\/sessions\/current$/, methods: ["DELETE"] },
  { pattern: /^\/api\/v1\/sessions\/current\/tokens$/, methods: ["POST"] },
  { pattern: /^\/api\/v1\/me$/, methods: ["GET", "PATCH", "DELETE"] },
  { pattern: /^\/api\/v1\/spots$/, methods: ["GET", "POST"] },
  { pattern: new RegExp(`^/api/v1/spots/${SEG}$`), methods: ["GET", "PATCH", "DELETE"] },
  { pattern: new RegExp(`^/api/v1/spots/${SEG}/reviews$`), methods: ["GET", "PUT"] },
  { pattern: new RegExp(`^/api/v1/spots/${SEG}/photos$`), methods: ["POST"] },
  { pattern: new RegExp(`^/api/v1/spots/${SEG}/favorite$`), methods: ["PUT", "DELETE"] },
  { pattern: new RegExp(`^/api/v1/photos/${SEG}$`), methods: ["GET", "DELETE"] },
  { pattern: /^\/api\/v1\/addresses$/, methods: ["GET"] },
  { pattern: /^\/api\/v1\/weather$/, methods: ["GET"] },
  { pattern: /^\/api\/v1\/images$/, methods: ["GET"] },
  { pattern: /^\/api\/v1\/health$/, methods: ["GET"] },
  { pattern: /^\/api\/v1\/assistant\/messages$/, methods: ["POST"] },
];

/** The methods allowed on this path (HEAD comes with GET), or null for an unknown path. */
export function allowedMethods(pathname: string): string[] | null {
  const route = API_ROUTES.find((r) => r.pattern.test(pathname));
  if (!route) return null;
  return [...route.methods, ...(route.methods.includes("GET") ? ["HEAD"] : []), "OPTIONS"];
}
