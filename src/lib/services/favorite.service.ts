import "server-only";
import { favoriteRepository } from "../repositories/favorite.repository";
import { findSpot, getOrCreateSpot } from "../spots";

export const favoriteService = {
  /** Idempotent: adding twice is fine. */
  async add(id: string, userId: string) {
    const spot = await getOrCreateSpot(id, userId);
    await favoriteRepository.add(userId, spot.id);
  },

  async remove(id: string, userId: string) {
    const spot = await findSpot(id, userId);
    if (spot) await favoriteRepository.remove(userId, spot.id);
  },
};
