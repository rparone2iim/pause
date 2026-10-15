import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { env } from "./env";

/*
 * PostgreSQL connection, as the restricted `pause_app` role (rows only, no DDL).
 * Drizzle always sends parameterized queries: values never end up inside the SQL text.
 * One pool per process (Next.js dev hot-reload would otherwise open new connections).
 */
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool = globalForDb.pgPool ?? new Pool({ connectionString: env.DATABASE_URL, max: 10 });
if (env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
