import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/*
 * Unit tests (tests/unit), component tests (tests/components, in a fake browser: jsdom)
 * and integration tests (tests/integration: the real route handlers against a real PostgreSQL,
 * skipped when no DATABASE_URL is set). Run: npm test
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" throws outside a Next.js server build: an empty module stands in for it in tests.
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    // Integration tests share one database: one file at a time.
    fileParallelism: false,
  },
});
