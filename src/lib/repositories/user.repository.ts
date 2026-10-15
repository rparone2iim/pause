import "server-only";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { db } from "../db";

const isUniqueViolation = (e: unknown) => (e as { code?: string; cause?: { code?: string } })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505";

export const userRepository = {
  findById: async (id: string) => (await db.select().from(users).where(eq(users.id, id)).limit(1))[0] ?? null,

  findByEmail: async (email: string) => (await db.select().from(users).where(eq(users.email, email)).limit(1))[0] ?? null,

  exists: async (id: string) => (await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)).length > 0,

  /** Null when the email is already registered. */
  async create(data: { displayName: string; email: string; passwordHash: string }) {
    try {
      return (await db.insert(users).values(data).returning())[0];
    } catch (e) {
      if (isUniqueViolation(e)) return null;
      throw e;
    }
  },

  update: async (id: string, data: { displayName?: string; preferredTypes?: string[]; radiusM?: number }) =>
    (await db.update(users).set(data).where(eq(users.id, id)).returning())[0],

  /** Cascades to the user's spots, photos, reviews and favorites. */
  delete: (id: string) => db.delete(users).where(eq(users.id, id)),
};
