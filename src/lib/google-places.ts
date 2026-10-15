import "server-only";
import { env } from "./env";
import { log } from "./logger";
import type { FilterKey, LatLng, Place, PlaceKind } from "./types";

/*
 * Google Places (the places behind Google Maps): the main source of cafés, bars and parks on Google Cloud.
 * Reliable from Cloud Run, unlike OpenStreetMap's public Overpass servers (they refuse most cloud requests).
 * No API key: on Cloud Run the service account gets a 1-hour token from the metadata server, exactly like Gemini.
 * Google only knows shops and parks: benches, ashtrays and shelters stay OpenStreetMap-only.
 * Called by the server only: the browser never talks to Google.
 */

const BASE = "https://places.googleapis.com/v1";
const FIELDS = [
  "id",
  "displayName",
  "location",
  "types",
  "currentOpeningHours.openNow",
  "shortFormattedAddress",
  "outdoorSeating",
  "takeout",
  "websiteUri",
  "nationalPhoneNumber",
];

/** On Google Cloud (VERTEX_PROJECT set): enabled. Elsewhere, only with a manual token (dev). */
export const googlePlacesEnabled = () => Boolean(env.VERTEX_PROJECT);

let cachedToken: { value: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  if (env.VERTEX_ACCESS_TOKEN) return env.VERTEX_ACCESS_TOKEN;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  // The metadata server only speaks HTTP, on a link-local address unreachable from outside the machine.
  // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
  const res = await fetch("http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(3_000),
  });
  if (!res.ok) throw new Error(`metadata ${res.status}`);
  const t = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}

async function call<T>(path: string, init: { method: "GET" | "POST"; fieldMask: string; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await token()}`,
    "X-Goog-FieldMask": init.fieldMask,
    "Content-Type": "application/json",
  };
  // A personal token (dev) must say which project pays; the service account's project is implicit.
  if (env.VERTEX_ACCESS_TOKEN && env.VERTEX_PROJECT) headers["X-Goog-User-Project"] = env.VERTEX_PROJECT;
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) {
    log("warn", "upstream_error", { upstream: "places.googleapis.com", status: res.status });
    throw new Error(`Google Places ${res.status}`);
  }
  return (await res.json()) as T;
}

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  types?: string[];
  currentOpeningHours?: { openNow?: boolean };
  shortFormattedAddress?: string;
  outdoorSeating?: boolean;
  takeout?: boolean;
  websiteUri?: string;
  nationalPhoneNumber?: string;
}

function kindOf(types: string[]): PlaceKind | null {
  const has = (...t: string[]) => t.some((x) => types.includes(x));
  if (has("cafe", "coffee_shop", "tea_house", "cafeteria")) return "cafe";
  if (has("bar", "pub", "irish_pub", "wine_bar", "cocktail_bar", "sports_bar", "beer_garden")) return "bar";
  if (has("park", "garden", "city_park", "botanical_garden")) return "park";
  return null;
}

const QUIET: Partial<Record<PlaceKind, number>> = { park: 5, cafe: 3, bar: 2 };
const FILTERS: Partial<Record<PlaceKind, FilterKey[]>> = { cafe: ["coffee", "shelter"], bar: ["shelter"], park: ["quiet", "shade"] };

/** Our ids for Google places: "gplace-<Google id>" (Google ids are URL-safe). */
export const isGooglePlaceId = (id: string) => id.startsWith("gplace-");

function toPlace(p: GooglePlace): Place | null {
  const kind = kindOf(p.types ?? []);
  if (!kind || !p.location || !p.displayName?.text) return null;
  const features: Place["features"] = [];
  if (p.outdoorSeating) features.push({ icon: "deck", label: "Terrasse" });
  if (p.takeout) features.push({ icon: "takeout_dining", label: "À emporter" });
  if (kind === "park") features.push({ icon: "park", label: "Parc" });
  features.push({ icon: "info", label: "Données Google Maps" }); // attribution required by Google
  return {
    id: `gplace-${p.id}`,
    source: "osm", // "external place" for the rest of the app: same handling as OpenStreetMap places
    kind,
    name: p.displayName.text,
    filters: FILTERS[kind] ?? [],
    features,
    address: p.shortFormattedAddress,
    openNow: p.currentOpeningHours?.openNow ?? null,
    website: p.websiteUri,
    phone: p.nationalPhoneNumber,
    quiet: QUIET[kind] ?? 3,
    lat: p.location.latitude,
    lng: p.location.longitude,
  };
}

/** Cafés, bars and parks around a point, nearest first (2 requests: 20 shops + 10 parks at most). */
export async function googleNearby(center: LatLng, radius: number): Promise<Place[]> {
  const search = (includedTypes: string[], maxResultCount: number) =>
    call<{ places?: GooglePlace[] }>("/places:searchNearby", {
      method: "POST",
      fieldMask: FIELDS.map((f) => `places.${f}`).join(","),
      body: {
        includedTypes,
        maxResultCount,
        rankPreference: "DISTANCE",
        languageCode: "fr",
        locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius } },
      },
    });
  const [shops, parks] = await Promise.all([search(["cafe", "coffee_shop", "bar", "pub", "wine_bar"], 20), search(["park"], 10)]);
  const seen = new Set<string>();
  return [...(shops.places ?? []), ...(parks.places ?? [])]
    .map(toPlace)
    .filter((p): p is Place => !!p && !seen.has(p.id) && Boolean(seen.add(p.id)));
}

/** One place by our id ("gplace-…"), e.g. when someone opens, reviews or bookmarks it. */
export async function googlePlace(id: string): Promise<Place | null> {
  const googleId = id.slice("gplace-".length);
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(googleId)) return null;
  return toPlace(await call<GooglePlace>(`/places/${googleId}`, { method: "GET", fieldMask: FIELDS.join(",") }));
}
