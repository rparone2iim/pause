import type { NextConfig } from "next";

/*
 * Pilier 9 — En-têtes de durcissement HTTP.
 * Helmet n'existe que pour Express : avec Next.js on pose exactement les mêmes en-têtes ici
 * (la CSP, elle, est générée dans src/middleware.ts car elle contient un nonce par requête).
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, // HTTPS obligatoire (ignoré en http local)
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" }, // anti-clickjacking
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  output: "standalone", // image Docker minimale
  poweredByHeader: false, // ne pas annoncer "X-Powered-By: Next.js"
  productionBrowserSourceMaps: false, // pas de code source lisible côté navigateur en prod
  serverExternalPackages: ["sharp", "pino", "pg"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
