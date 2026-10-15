import "server-only";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { sessions } from "@/db/schema";
import { db } from "../db";

export const sessionRepository = {
  create: async (data: { userId: string; refreshHash: string; expiresAt: Date }) => (await db.insert(sessions).values(data).returning())[0],

  /** One indexed lookup per private request: the session exists, belongs to this user, and is neither revoked nor expired. */
  isActive: async (id: string, userId: string) =>
    (
      await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
        .limit(1)
    ).length > 0,

  /** The session holding this refresh token, as the current one or as the one it just replaced. */
  findByRefreshHash: async (hash: string) =>
    (await db.select().from(sessions).where(or(eq(sessions.refreshHash, hash), eq(sessions.previousHash, hash))).limit(1))[0] ?? null,

  /** Rotation: the new hash becomes current, the old one is kept only to detect a replay. */
  rotate: async (id: string, currentHash: string, nextHash: string, expiresAt: Date) =>
    (
      await db
        .update(sessions)
        .set({ refreshHash: nextHash, previousHash: currentHash, rotatedAt: new Date(), expiresAt })
        // Only if nobody rotated it in the meantime (two requests racing with the same token).
        .where(and(eq(sessions.id, id), eq(sessions.refreshHash, currentHash)))
        .returning({ id: sessions.id })
    ).length > 0,

  revoke: (id: string) => db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, id), isNull(sessions.revokedAt))),

  /** Expired or revoked sessions are useless after a while: the table doesn't grow forever. */
  purgeOld: () => db.delete(sessions).where(or(lt(sessions.expiresAt, new Date()), lt(sessions.revokedAt, new Date(Date.now() - 24 * 3600_000)))),
};
