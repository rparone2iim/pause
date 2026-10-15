import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "./env";
import { InvalidInputError } from "./domain-errors";
import { log } from "./logger";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_PIXELS = 40_000_000; // refuses "decompression bombs" (tiny file, gigantic image)
const ACCEPTED = new Set(["jpeg", "png", "webp"]);

const uploadDir = path.resolve(env.UPLOAD_DIR);

/**
 * Checks the real content (not the file name or the announced type), then re-encodes:
 * auto-rotation, max 1600 px, WebP. Re-encoding drops every metadata (EXIF, GPS position…)
 * and anything hidden in the original file.
 */
export async function cleanPhoto(input: Buffer): Promise<Buffer> {
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !ACCEPTED.has(format)) {
    throw new InvalidInputError("Ce fichier n'est pas une image JPEG, PNG ou WebP.", { photo: "Format non accepté" });
  }
  try {
    return await sharp(input, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new InvalidInputError("Image illisible ou trop grande.", { photo: "Image invalide" });
  }
}

/** Saves under a random name chosen by the server: "<uuid>.webp". */
export async function storePhoto(webp: Buffer) {
  await mkdir(uploadDir, { recursive: true });
  const filename = `${randomUUID()}.webp`;
  await writeFile(path.join(uploadDir, filename), webp, { mode: 0o640 });
  return filename;
}

/** `filename` is always validated as "<uuid>.webp" before reaching here. */
export async function readStoredPhoto(filename: string) {
  try {
    return await readFile(path.join(uploadDir, filename));
  } catch {
    return null;
  }
}

export async function deleteStoredPhotos(filenames: string[]) {
  await Promise.all(
    filenames.map((f) =>
      unlink(path.join(uploadDir, f)).catch((e) => {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") log("warn", "photo_delete_failed", { filename: f });
      }),
    ),
  );
}

export const photoUrl = (filename: string) => `/api/v1/photos/${filename}`;
