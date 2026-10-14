// Applique les migrations SQL de db/migrations avec l'utilisateur "migrator".
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL manquant");

const pool = new Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: "./db/migrations" });
await pool.end();
console.log("✔ Migrations appliquées");
