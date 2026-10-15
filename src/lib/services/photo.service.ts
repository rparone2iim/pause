import "server-only";
import { ConflictError, ForbiddenError, NotFoundError } from "../domain-errors";
import { log } from "../logger";
import { MAX_PHOTOS_PER_SPOT, photoRepository } from "../repositories/photo.repository";
import { spotRepository } from "../repositories/spot.repository";
import { getOrCreateSpot } from "../spots";
import { cleanPhoto, deleteStoredPhotos, photoUrl, readStoredPhoto, storePhoto } from "../upload";

export const photoService = {
  /** Adds a cleaned-up photo to a spot (6 max). */
  async add(spotId: string, uploaderId: string, raw: Buffer) {
    const spot = await getOrCreateSpot(spotId, uploaderId);
    const webp = await cleanPhoto(raw);
    const filename = await storePhoto(webp);
    const row = await photoRepository.addIfRoom({ filename, spotId: spot.id, uploaderId });
    if (!row) {
      await deleteStoredPhotos([filename]);
      throw new ConflictError(`${MAX_PHOTOS_PER_SPOT} photos maximum par spot.`);
    }
    return { name: filename, url: photoUrl(filename), canDelete: true };
  },

  /** Public on purpose: an <img> tag can't send a token. Names are random UUIDs (impossible to guess) and files were cleaned (no GPS). */
  async read(filename: string) {
    const photo = await photoRepository.findByFilename(filename);
    const file = photo ? await readStoredPhoto(filename) : null;
    if (!file) throw new NotFoundError("Photo introuvable.");
    return file;
  },

  /** The uploader or the spot's author can remove a photo. */
  async remove(filename: string, userId: string, requestId: string) {
    const photo = await photoRepository.findByFilename(filename);
    if (!photo) return; // already gone: DELETE stays idempotent
    const spot = await spotRepository.findById(photo.spotId);
    if (photo.uploaderId !== userId && spot?.authorId !== userId) throw new ForbiddenError("Seul l'auteur de la photo ou du spot peut la supprimer.");
    await photoRepository.delete(filename);
    await deleteStoredPhotos([filename]);
    log("info", "photo_deleted", { requestId, userId });
  },
};
