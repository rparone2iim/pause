import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { spots } from "@/db/schema";
import { HttpError } from "./errors";
import { uuidSchema } from "./validation";
import type { AuthUser } from "./auth";

/** Récupère un spot ou renvoie 404. L'id est validé (UUID) AVANT d'aller en base. */
export async function getSpotOr404(rawId: string) {
  const id = uuidSchema.safeParse(rawId);
  if (!id.success) throw new HttpError(404, "NOT_FOUND", "Spot introuvable");
  const [spot] = await db.select().from(spots).where(eq(spots.id, id.data));
  if (!spot) throw new HttpError(404, "NOT_FOUND", "Spot introuvable");
  return spot;
}

/**
 * Pilier 1 (autorisation) — protection IDOR :
 * être connecté ne suffit pas, il faut être l'AUTEUR du spot pour le modifier/supprimer.
 * Sans ce check, n'importe qui pourrait supprimer le spot d'un autre en changeant l'id dans l'URL.
 */
export function assertOwner(spot: { authorId: string }, user: AuthUser) {
  if (spot.authorId !== user.id) throw new HttpError(403, "FORBIDDEN", "Tu ne peux modifier que tes propres spots");
}
