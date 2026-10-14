import { route, readJson, ok, HttpError } from "@/lib/http";
import { registerSchema } from "@/lib/validation";
import { hashPassword, signToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { db } from "@/lib/db";
import { users } from "@/db/schema";

export const POST = route(async (req, _ctx, { ip }) => {
  rateLimit(`register:${ip}`, 20, 60 * 60_000); // 20 comptes / heure / IP
  const body = await readJson(req, registerSchema);

  const [user] = await db
    .insert(users)
    .values({ email: body.email, displayName: body.displayName, passwordHash: await hashPassword(body.password) })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id, email: users.email, displayName: users.displayName });
  if (!user) throw new HttpError(409, "EMAIL_TAKEN", "Cet email est déjà utilisé");

  return ok({ token: await signToken(user.id), user }, 201);
});
