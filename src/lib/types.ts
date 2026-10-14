import type { SpotType, Tag } from "./constants";

export type Me = { id: string; email: string; displayName: string; preferredTypes: SpotType[]; radiusM: number; favorites: FavSpot[] };
export type FavSpot = { id: string; name: string; type: SpotType; tags: Tag[]; lat: number; lng: number };
export type SpotSummary = {
  id: string; name: string; description: string; type: SpotType; tags: Tag[]; lat: number; lng: number;
  distanceM: number; walkMin: number; rating: number | null; reviewCount: number; cover: string | null; isFavorite: boolean;
};
export type Review = { id: string; rating: number; calm: number; clean: number; seating: number; comment: string | null; updatedAt: string; authorName: string; mine: boolean };
export type SpotDetail = {
  id: string; name: string; description: string; accessTip: string | null; type: SpotType; tags: Tag[];
  lat: number; lng: number; createdAt: string; authorName: string; isOwner: boolean; isFavorite: boolean;
  photos: { filename: string; mine: boolean }[];
  averages: { rating: number | null; calm: number | null; clean: number | null; seating: number | null; count: number };
  reviews: Review[];
};
