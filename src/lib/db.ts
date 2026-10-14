import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

// Pilier 8 : Drizzle génère TOUJOURS des requêtes paramétrées ($1, $2…).
// Une valeur envoyée par l'utilisateur n'est jamais concaténée dans le SQL.
// L'app se connecte avec "pause_app" (SELECT/INSERT/UPDATE/DELETE seulement).
// (Le Pool ne se connecte qu'à la première requête, donc pas de souci au build.)
const globalForDb = globalThis as unknown as { pool?: Pool };
const pool = globalForDb.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool; // évite 50 pools en dev (hot reload)

export const db = drizzle({ client: pool, schema });
