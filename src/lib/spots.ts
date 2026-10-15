import "server-only";
import type { Spot } from "@/db/schema";
import { HttpError } from "./errors";
import { fetchOsmPlace } from "./osm";
import { spotRepository } from "./repositories/spot.repository";
import { OSM_REF } from "./validation";

export const isOsmRef = (id: string) => OSM_REF.test(id);

const notFound = () => new HttpError(404, "Spot introuvable.");

/**
 * The spot row behind an id, or a 404. A private spot of someone else is also a 404
 * (we don't even confirm it exists). For an OpenStreetMap place, null when nobody interacted with it yet.
 */
export async function findSpot(id: string, viewerId: string): Promise<Spot | null> {
  const spot = isOsmRef(id) ? await spotRepository.findByOsmRef(id) : await spotRepository.findById(id);
  if (spot && spot.isPrivate && spot.authorId !== viewerId) throw notFound();
  if (!spot && !isOsmRef(id)) throw notFound();
  return spot;
}

export async function getSpotOr404(id: string, viewerId: string): Promise<Spot> {
  const spot = await findSpot(id, viewerId);
  if (!spot) throw notFound();
  return spot;
}

/**
 * Like getSpotOr404, but an OpenStreetMap place gets its row on first use (review, photo, favorite).
 * Its data comes from OpenStreetMap itself, never from the client.
 */
export async function getOrCreateSpot(id: string, viewerId: string): Promise<Spot> {
  const existing = await findSpot(id, viewerId);
  if (existing) return existing;
  let place;
  try {
    place = await fetchOsmPlace(id, { utcOffsetSeconds: 0 });
  } catch {
    throw new HttpError(503, "OpenStreetMap est momentanément indisponible, réessaie.", { headers: { "Retry-After": "5" } });
  }
  if (!place) throw notFound();
  return spotRepository.upsertFromOsm({
    osmRef: id,
    name: place.name.slice(0, 120),
    type: place.kind,
    lat: place.lat,
    lng: place.lng,
    tags: place.features.slice(0, 20),
    filters: place.filters,
    quiet: place.quiet,
    address: place.address,
    description: place.description?.slice(0, 500),
  });
}

/** Anti-IDOR: being logged in is not enough, you must be the spot's author. Otherwise 403. */
export function assertOwner(spot: Spot, userId: string) {
  if (spot.authorId !== userId) throw new HttpError(403, "Seul l'auteur du spot peut faire ça.");
}
