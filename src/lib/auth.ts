import "server-only";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "./db";
import { users } from "@/db/schema";
import { env } from "./env";
import { HttpError } from "./errors";

/* ───────────── Pilier 3 : mots de passe ───────────── */

const BCRYPT_COST = 12; // 2^12 itérations ≈ 250 ms par hash : lent exprès, ça ruine le brute force

export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_COST);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// Hash "bidon" : quand l'email n'existe pas, on fait quand même un bcrypt.compare
// pour que la réponse prenne le même temps → impossible de deviner quels emails sont inscrits.
export const DUMMY_HASH = bcrypt.hashSync("pas-un-vrai-mot-de-passe", BCRYPT_COST);

/* ───────────── Pilier 1 : JWT ───────────── */

const ISSUER = "pause-api";
const AUDIENCE = "pause-web";
const TOKEN_TTL = "2h"; // durée de vie courte : un token volé ne sert pas longtemps

const key = () => new TextEncoder().encode(env().JWT_SECRET);

export async function signToken(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(key());
}

export type AuthUser = { id: string; email: string; displayName: string };

/**
 * Middleware de protection des routes privées.
 * Lit "Authorization: Bearer <token>", vérifie signature + expiration + émetteur + audience,
 * et FORCE l'algorithme HS256 (un token "alg: none" ou RS256 bricolé est rejeté).
 * Puis vérifie que l'utilisateur existe encore en base (compte supprimé = token inutilisable).
 */
export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw new HttpError(401, "UNAUTHENTICATED", "Connexion requise");

  let sub: string | undefined;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE });
    sub = payload.sub;
  } catch {
    throw new HttpError(401, "UNAUTHENTICATED", "Session invalide ou expirée");
  }
  if (!sub || !/^[0-9a-f-]{36}$/.test(sub)) throw new HttpError(401, "UNAUTHENTICATED", "Session invalide ou expirée");

  const [user] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, sub));
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Session invalide ou expirée");
  return user;
}
