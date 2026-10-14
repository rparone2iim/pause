import { eq } from "drizzle-orm";
import { route, readJson, ok, HttpError } from "@/lib/http";
import { loginSchema } from "@/lib/validation";
import { verifyPassword, signToken, DUMMY_HASH } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { db } from "@/lib/db";
import { users } from "@/db/schema";

export const POST = route(async (req, _ctx, { ip }) => {
  rateLimit(`login-ip:${ip}`, 10, 15 * 60_000); // anti brute force : 10 essais / 15 min / IP
  const body = await readJson(req, loginSchema);
  rateLimit(`login-email:${body.email}`, 5, 15 * 60_000); // … et 5 essais / 15 min / compte visé

  const [user] = await db.select().from(users).where(eq(users.email, body.email));
  // Toujours un bcrypt.compare, même si l'email n'existe pas (même temps de réponse).
  const valid = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
  // Même message dans les deux cas : on ne dit jamais si c'est l'email ou le mot de passe qui est faux.
  if (!user || !valid) throw new HttpError(401, "BAD_CREDENTIALS", "Email ou mot de passe incorrect");

  return ok({ token: await signToken(user.id), user: { id: user.id, email: user.email, displayName: user.displayName } });
});
