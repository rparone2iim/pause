import type { NextConfig } from "next";

/*
 * Security headers (what Helmet does for Express), applied to every response.
 * The Content-Security-Policy is set per request in src/middleware.ts (it needs a fresh nonce).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HTTPS only (ignored by browsers over plain http, so harmless in dev)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  output: "standalone", // small self-contained server for the Docker image
  poweredByHeader: false, // don't advertise the framework
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: "/health", destination: "/api/v1/health" }];
  },
  async redirects() {
    // Old URLs of the first version.
    return [
      { source: "/signup", destination: "/register", permanent: true },
      { source: "/add-spot", destination: "/spots/new", permanent: true },
    ];
  },
};

export default nextConfig;
