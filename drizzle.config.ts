import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  // Les migrations tournent avec l'utilisateur "migrator" (propriétaire du schéma),
  // l'application, elle, n'a que les droits SELECT/INSERT/UPDATE/DELETE.
  dbCredentials: { url: process.env.MIGRATE_DATABASE_URL ?? "" },
});
