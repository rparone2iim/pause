import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db";

export const healthRepository = {
  ping: () => db.execute(sql`SELECT 1`),
};
