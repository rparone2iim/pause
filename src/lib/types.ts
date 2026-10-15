export type FilterKey = "all" | "smoke" | "coffee" | "quiet" | "shade" | "shelter";

/** A filter that can be stored on a spot or in the user's preferences ("all" is UI-only). */
export type SpotFilter = Exclude<FilterKey, "all">;

export type Archetype = "smoke" | "coffee" | "park" | "shelter" | "perch";

export type PlaceKind = "cafe" | "bar" | "terrace" | "park" | "bench" | "smoking" | "shelter";

export type Tone = "orange" | "orange-soft" | "green" | "dark" | "neutral";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Origin extends LatLng {
  label: string;
  source: "gps" | "default" | "search";
}


/** A real break spot, normalised from OpenStreetMap or added by the community. */
export interface Place extends LatLng {
  /** Community spot: its UUID. Google Maps place: "gplace-…". OpenStreetMap place: "osm-node-123", "osm-way-456"… */
  id: string;
  source: "osm" | "community";
  kind: PlaceKind;
  name: string;
  filters: FilterKey[];
  /** Human-readable attributes derived from tags ("Terrasse", "Fumeurs en terrasse", "Dossier"…). */
  features: { icon: string; label: string }[];
  address?: string;
  openingHours?: string;
  openNow?: boolean | null;
  website?: string;
  phone?: string;
  /** First photo: a community photo (/api/v1/photos/…) or the OpenStreetMap / Wikimedia picture. */
  image?: string;
  /** 1–5 estimate from the place type (parks are calm, bars are not). */
  quiet: number;
  count?: number; // grouped benches
  osmUrl?: string;
  description?: string;
  /** "Comment y aller" — how to find the spot. */
  accessTip?: string;
  /** Average rating (1–5) and number of reviews. */
  rating?: number | null;
  ratingCount?: number;
  isFavorite?: boolean;
  // computed relative to the current origin
  distanceM?: number;
  walkMin?: number;
  // community-only
  isPrivate?: boolean;
  createdAt?: number;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  preferredTypes: SpotFilter[];
  radiusM: number;
  createdAt: string;
}

/** POST /users or /sessions: the access token (kept in memory) + the user. The refresh token is an HttpOnly cookie. */
export interface Session {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  expiresAt: string;
  user: User;
}

export interface Photo {
  name: string;
  url: string;
  /** Uploader or spot author. */
  canDelete: boolean;
}

export interface Review {
  id: string;
  rating: number;
  calm: number | null;
  clean: number | null;
  seating: number | null;
  comment: string;
  createdAt: string;
  updatedAt: string;
  author: { name: string };
  isMine: boolean;
}

export interface Averages {
  rating: number | null;
  calm: number | null;
  clean: number | null;
  seating: number | null;
  count: number;
}

/** Everything the spot page shows. */
export interface SpotDetail extends Place {
  photos: Photo[];
  averages: Averages;
  reviews: Review[];
  myReview: Review | null;
  isOwner: boolean;
}

export interface Weather {
  temperature: number;
  precipitation: number;
  code: number;
  cloudCover: number;
  windKmh: number;
  uvIndex: number;
  isDay: boolean;
  label: string;
  icon: string;
  utcOffsetSeconds: number;
}

