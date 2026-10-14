import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { env } from "./env";
import { HttpError } from "./errors";
import { MAX_PHOTO_BYTES } from "./constants";

/*
 * Upload de photos = la plus grosse surface d'attaque de l'app. On se protège ainsi :
 *  1. Taille limitée AVANT de lire le fichier (Content-Length) puis APRÈS (taille réelle).
 *  2. Type vérifié sur le CONTENU (sharp lit les octets), pas sur l'extension ni le Content-Type
 *     envoyé par le client (tous les deux falsifiables).
 *  3. Image RÉ-ENCODÉE en WebP : un fichier piégé (script caché dans l'image, polyglotte…)
 *     ne survit pas au ré-encodage.
 *  4. Métadonnées EXIF supprimées → la position GPS du téléphone n'est jamais publiée (RGPD).
 *  5. Nom de fichier = UUID aléatoire : impossible de faire du path traversal (../../etc/passwd)
 *     ou d'écraser un fichier existant.
 */

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const FILENAME_RE = /^[0-9a-f-]{36}\.webp$/;

const uploadDir = () => path.resolve(env().UPLOAD_DIR);

export async function readPhotoFromRequest(req: NextRequest): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_PHOTO_BYTES + 64 * 1024) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Photo trop lourde (5 Mo max)");
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Envoie la photo en multipart/form-data");
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("photo");
  } catch {
    throw new HttpError(400, "BAD_UPLOAD", "Envoi invalide");
  }
  if (!(file instanceof File)) throw new HttpError(400, "BAD_UPLOAD", "Champ « photo » manquant");
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Photo trop lourde (5 Mo max)");
  return Buffer.from(await file.arrayBuffer());
}

export async function processAndStorePhoto(input: Buffer): Promise<string> {
  let output: Buffer;
  try {
    // limitInputPixels : protège contre les "bombes de décompression" (image minuscule en octets, géante en pixels)
    const img = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
    const meta = await img.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new Error("format refusé");
    output = await img
      .rotate() // applique l'orientation EXIF avant de la supprimer
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 }) // sharp ne recopie AUCUNE métadonnée par défaut (EXIF/GPS supprimés)
      .toBuffer();
  } catch {
    throw new HttpError(400, "BAD_IMAGE", "Fichier non reconnu : JPEG, PNG ou WebP uniquement");
  }
  const filename = `${randomUUID()}.webp`;
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(uploadDir(), filename), output, { flag: "wx" }); // wx : n'écrase jamais
  return filename;
}

export async function readStoredPhoto(filename: string): Promise<Buffer | null> {
  if (!FILENAME_RE.test(filename)) return null; // bloque ../, /, %2e%2e, etc.
  try {
    return await readFile(path.join(uploadDir(), filename));
  } catch {
    return null;
  }
}

export async function deleteStoredPhoto(filename: string) {
  if (!FILENAME_RE.test(filename)) return;
  await unlink(path.join(uploadDir(), filename)).catch(() => {});
}
