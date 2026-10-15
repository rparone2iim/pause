// Annule les dernières migrations (Drizzle ne sait faire que monter) avec l'utilisateur "migrator".
//   npm run db:rollback            → annule la dernière migration
//   npm run db:rollback -- 2       → annule les 2 dernières
//   npm run db:rollback -- --all   → revient à une base vide (DÉTRUIT TOUTES LES DONNÉES)
// Chaque migration NNNN_nom.sql a son inverse db/migrations/down/NNNN_nom.down.sql (vérifié par les tests).
// Une étape = une transaction : le SQL inverse + l'oubli de la migration dans le journal de Drizzle,
// pour que `npm run db:migrate` la rejoue ensuite.
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) throw new Error("MIGRATE_DATABASE_URL manquant");

const arg = process.argv[2];
const all = arg === "--all";
const steps = all ? Infinity : Number(arg ?? 1);
if (!all && (!Number.isInteger(steps) || steps < 1)) throw new Error("Usage : db:rollback [nombre d'étapes | --all]");

const journal = JSON.parse(readFileSync("./db/migrations/meta/_journal.json", "utf8")) as { entries: { tag: string; when: number }[] };
const tagByWhen = new Map(journal.entries.map((e) => [String(e.when), e.tag]));

const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  const { rows } = await client.query<{ created_at: string }>('SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC');
  const todo = rows.slice(0, steps);
  if (todo.length === 0) console.log("Rien à annuler : aucune migration appliquée.");
  for (const { created_at } of todo) {
    const tag = tagByWhen.get(String(created_at));
    if (!tag) throw new Error(`Migration inconnue dans la base (created_at=${created_at}) : journal et base ne correspondent pas.`);
    const down = readFileSync(`./db/migrations/down/${tag}.down.sql`, "utf8");
    await client.query("BEGIN");
    try {
      await client.query(down);
      await client.query('DELETE FROM "drizzle"."__drizzle_migrations" WHERE created_at = $1', [created_at]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
    console.log(`↩ ${tag} annulée`);
  }
} finally {
  client.release();
  await pool.end();
}
