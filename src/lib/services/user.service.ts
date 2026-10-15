import "server-only";
import type { User } from "@/db/schema";
import { HttpError } from "../errors";
import { log } from "../logger";
import { favoriteRepository } from "../repositories/favorite.repository";
import { photoRepository } from "../repositories/photo.repository";
import { spotRepository } from "../repositories/spot.repository";
import { userRepository } from "../repositories/user.repository";
import type { SpotFilter } from "../types";
import { deleteStoredPhotos } from "../upload";
import { spotService } from "./spot.service";

/** The account as exposed by the API (never the password hash). */
export function toPublicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    preferredTypes: u.preferredTypes as SpotFilter[],
    radiusM: u.radiusM,
    createdAt: u.createdAt.toISOString(),
  };
}

async function getUser(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) throw new HttpError(404, "Compte introuvable.");
  return user;
}

export const userService = {
  /** Profile + favorites + the spots the user added. */
  async getMe(userId: string) {
    const [user, favoriteSpots, ownSpots] = await Promise.all([getUser(userId), favoriteRepository.listSpots(userId), spotRepository.findByAuthor(userId)]);
    const [favorites, spots] = await Promise.all([spotService.decorate(favoriteSpots.map(spotService.toPlace), userId), spotService.decorate(ownSpots.map(spotService.toPlace), userId)]);
    return { user: toPublicUser(user), favorites, spots };
  },

  async updateMe(userId: string, patch: { displayName?: string; preferredTypes?: SpotFilter[]; radiusM?: number }) {
    await getUser(userId);
    const updated = await userRepository.update(userId, {
      ...(patch.displayName !== undefined && { displayName: patch.displayName }),
      ...(patch.preferredTypes !== undefined && { preferredTypes: [...new Set(patch.preferredTypes)] }),
      ...(patch.radiusM !== undefined && { radiusM: patch.radiusM }),
    });
    return toPublicUser(updated);
  },

  /** Deletes the account and everything attached to it (GDPR), photo files included. */
  async deleteMe(userId: string, requestId: string) {
    await getUser(userId);
    const files = await photoRepository.filenamesOfUser(userId);
    await userRepository.delete(userId);
    await deleteStoredPhotos(files);
    log("info", "user_deleted", { requestId, userId });
  },
};
