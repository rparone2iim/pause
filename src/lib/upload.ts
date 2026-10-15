import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "./env";
import { HttpError } from "./errors";
import { log } from "./logger";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
const MULTIPART_OVERHEAD = 64 * 1024;
const MAX_PIXELS = 40_000_000; // refuses "decompression bombs" (tiny file, gigantic image)
const ACCEPTED = new Set(["jpeg", "png", "webp"]);

const uploadDir = path.resolve(env.UPLOAD_DIR);

/** Reads the request body, stopping as soon as it exceeds `max` bytes (a missing or lying Content-Length changes nothing). */
async function readLimited(req: Request, max: number) {
  if (Number(req.headers.get("content-length") ?? 0) > max) throw new HttpError(413, "Photo trop lourde (5 Mo maximum).");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Aucune photo reçue.", { fields: { photo: "Champ obligatoire" } });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, "Photo trop lourde (5 Mo maximum).");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** `multipart/form-data` with one file in the field `photo`. */
export async function readPhoto(req: Request): Promise<Buffer> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new HttpError(415, "Envoie la photo en multipart/form-data (champ « photo »).");
  const raw = await readLimited(req, MAX_PHOTO_BYTES + MULTIPART_OVERHEAD);
  let form: FormData;
  try {
    form = await new Response(raw, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new HttpError(400, "Formulaire illisible.");
  }
  const file = form.get("photo");
  if (!(file instanceof File)) throw new HttpError(400, "Aucune photo reçue.", { fields: { photo: "Champ obligatoire" } });
  if (file.size > MAX_PHOTO_BYTES) throw new HttpError(413, "Photo trop lourde (5 Mo maximum).");
  return Buffer.from(await file.arrayBuffer());
}

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
    throw new HttpError(400, "Ce fichier n'est pas une image JPEG, PNG ou WebP.", { fields: { photo: "Format non accepté" } });
  }
  try {
    return await sharp(input, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new HttpError(400, "Image illisible ou trop grande.", { fields: { photo: "Image invalide" } });
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
