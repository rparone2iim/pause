import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * Every migration can be undone: db/migrations/down/<tag>.down.sql exists for each entry of Drizzle's journal.
 * Forget to write the inverse of a new migration and this test fails. Executing them for real
 * (up → all down → up again) is done by the CI on a throw-away PostgreSQL.
 */
const journal = JSON.parse(readFileSync("db/migrations/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };

describe("migrations", () => {
  it.each(journal.entries.map((e) => e.tag))("%s has its rollback script", (tag) => {
    expect(existsSync(`db/migrations/${tag}.sql`)).toBe(true);
    const down = `db/migrations/down/${tag}.down.sql`;
    expect(existsSync(down)).toBe(true);
    expect(readFileSync(down, "utf8").trim()).not.toBe("");
  });
});
