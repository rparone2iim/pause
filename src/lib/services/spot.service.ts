import "server-only";
import type { NewSpot, Spot } from "@/db/schema";
import { distanceM, withDistance } from "../geo";
import { NotFoundError, UpstreamUnavailableError } from "../domain-errors";
import { fetchOsmPlace, fetchOsmPlaces, fetchWeather, reverseGeocode } from "../osm";
import { favoriteRepository } from "../repositories/favorite.repository";
import { photoRepository } from "../repositories/photo.repository";
import { reviewRepository } from "../repositories/review.repository";
import { spotRepository } from "../repositories/spot.repository";
import { assertOwner, findSpot, getSpotOr404, isOsmRef } from "../spots";
import type { LatLng, Place, SpotDetail, SpotFilter } from "../types";
import { deleteStoredPhotos, photoUrl } from "../upload";
import { reviewService } from "./review.service";

const osmUnavailable = () => new UpstreamUnavailableError("OpenStreetMap est momentanément indisponible, réessaie.", 5);

/** Database row → the Place shape shared with the front. */
function toPlace(s: Spot): Place {
  return {
    id: s.osmRef ?? s.id,
    source: s.osmRef ? "osm" : "community",
    kind: s.type,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    address: s.address ?? undefined,
    description: s.description ?? undefined,
    accessTip: s.accessTip ?? undefined,
    features: s.tags,
    filters: s.filters as SpotFilter[],
    quiet: s.quiet,
    ...(s.authorId && { isPrivate: s.isPrivate, createdAt: s.createdAt.getTime() }),
  };
}

/** Write fields of the API → columns. */
function toColumns(input: { features?: NewSpot["tags"]; [k: string]: unknown }) {
  const { features, ...rest } = input;
  return { ...rest, ...(features !== undefined && { tags: features }) } as Partial<NewSpot>;
}

/** Community spots around a point: bounding box in SQL (indexed), then the exact distance. */
async function communityNear(center: LatLng, radius: number, viewerId: string) {
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((center.lat * Math.PI) / 180));
  const rows = await spotRepository.findCommunityInBox(
    { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng },
    viewerId,
  );
  return rows.map(toPlace).filter((p) => distanceM(center, p) <= radius);
}

/** A radius search never returns more than this (REST: no unbounded collection). */
export const NEARBY_LIMIT = 300;

export const spotService = {
  toPlace,

  /**
   * Adds the community data to places (OpenStreetMap or not): average rating, first photo, favorite.
   * 1 query to find which OSM places have a row, then 3 grouped queries — never one query per spot.
   */
  async decorate(places: Place[], viewerId: string): Promise<Place[]> {
    const refs = await spotRepository.idsByOsmRefs(places.filter((p) => p.source === "osm").map((p) => p.id));
    const dbId = (p: Place) => (p.source === "osm" ? refs.get(p.id) : p.id);
    const ids = places.map(dbId).filter((id): id is string => Boolean(id));
    const [ratings, firstPhotos, favorites] = await Promise.all([
      reviewRepository.ratingsBySpots(ids),
      photoRepository.firstBySpots(ids),
      favoriteRepository.idsAmong(viewerId, ids),
    ]);
    return places.map((p) => {
      const id = dbId(p);
      const r = id ? ratings.get(id) : undefined;
      const photo = id ? firstPhotos.get(id) : undefined;
      return { ...p, rating: r?.rating ?? null, ratingCount: r?.count ?? 0, isFavorite: id ? favorites.has(id) : false, ...(photo && { image: photoUrl(photo) }) };
    });
  },

  /**
   * OpenStreetMap places + community spots in the radius, nearest first.
   * If OpenStreetMap is down, community spots are still returned (`osmAvailable: false`).
   */
  async nearby(center: LatLng, radius: number, type: SpotFilter | undefined, viewerId: string) {
    const [weather, area] = await Promise.all([fetchWeather(center).catch(() => null), reverseGeocode(center).catch(() => null)]);
    const [osm, community] = await Promise.all([
      fetchOsmPlaces(center, radius, { countryCode: area?.countryCode, utcOffsetSeconds: weather?.utcOffsetSeconds ?? 0 }).catch(() => null),
      communityNear(center, radius, viewerId),
    ]);
    const all = withDistance(center, [...community, ...(osm ?? []).filter((p) => distanceM(center, p) <= radius)])
      .filter((p) => !type || p.filters.includes(type))
      .sort((a, b) => a.distanceM! - b.distanceM!)
      .slice(0, NEARBY_LIMIT);
    return { spots: await this.decorate(all, viewerId), osmAvailable: osm !== null };
  },

  /** The full spot page: photos, averages, reviews, my review. */
  async get(id: string, viewerId: string): Promise<SpotDetail> {
    const row = await findSpot(id, viewerId);
    let place: Place;
    if (isOsmRef(id)) {
      const live = await fetchOsmPlace(id, { utcOffsetSeconds: 0 }).catch(() => undefined);
      if (live === undefined && !row) throw osmUnavailable();
      if (!live && !row) throw new NotFoundError("Spot introuvable.");
      place = live ?? toPlace(row!);
      if (live) {
        const weather = await fetchWeather(live).catch(() => null);
        if (weather) place = (await fetchOsmPlace(id, { utcOffsetSeconds: weather.utcOffsetSeconds }).catch(() => null)) ?? live;
      }
    } else {
      place = toPlace(row!);
    }
    const [decorated] = await this.decorate([place], viewerId);
    if (!row) {
      return { ...decorated, photos: [], averages: { rating: null, calm: null, clean: null, seating: null, count: 0 }, reviews: [], myReview: null, isOwner: false };
    }
    const [photos, averages, reviews, myReview] = await Promise.all([
      photoRepository.listBySpot(row.id),
      reviewRepository.averages(row.id),
      reviewService.list(row.id, { limit: 20 }, viewerId),
      reviewService.mine(row.id, viewerId),
    ]);
    return {
      ...decorated,
      ...(photos[0] && { image: photoUrl(photos[0].filename) }),
      photos: photos.map((p) => ({ name: p.filename, url: photoUrl(p.filename), canDelete: p.uploaderId === viewerId || row.authorId === viewerId })),
      averages,
      reviews: reviews.items,
      myReview,
      isOwner: row.authorId === viewerId,
    };
  },

  async create(authorId: string, input: Omit<NewSpot, "authorId" | "tags"> & { features: NewSpot["tags"] }) {
    const spot = await spotRepository.create({ ...toColumns(input), authorId } as NewSpot);
    return toPlace(spot);
  },

  /** Only the author can edit (anti-IDOR). */
  async update(id: string, userId: string, patch: Record<string, unknown>) {
    const spot = await getSpotOr404(id, userId);
    assertOwner(spot, userId);
    return toPlace(await spotRepository.update(spot.id, toColumns(patch)));
  },

  /** Only the author can delete; photos, reviews and favorites go with it (cascade), photo files too. */
  async remove(id: string, userId: string) {
    const spot = await getSpotOr404(id, userId);
    assertOwner(spot, userId);
    const files = await photoRepository.filenamesOfSpot(spot.id);
    await spotRepository.delete(spot.id);
    await deleteStoredPhotos(files);
  },
};
