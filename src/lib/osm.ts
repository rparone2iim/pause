import "server-only";
import { proxiedImageUrl } from "./image-proxy";
import OpeningHours from "opening_hours";
import { distanceM } from "./geo";
import { log } from "./logger";
import { googleNearby, googlePlace, googlePlacesEnabled, isGooglePlaceId } from "./google-places";
import type { FilterKey, LatLng, Place, PlaceKind, Weather } from "./types";

/**
 * Free, key-less data sources:
 *  - OpenStreetMap via the Overpass API (cafés, bars, terraces, benches, parks, smoking spots)
 *  - Nominatim (OSM geocoding)
 *  - Open-Meteo (weather)
 * Every call is cached in memory so the public instances are not hammered.
 */

const USER_AGENT = "PauseIA-bootcamp/0.1 (student project; Next.js)";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter", // second try after a short pause (rate limit slots free up fast)
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const CACHE_TTL_MS = 10 * 60_000;

// Kept on globalThis so every route shares them (Next.js dev loads modules once per route).
const g = globalThis as unknown as { osmCache?: Map<string, { at: number; value: unknown }>; osmSeen?: Map<string, { at: number; place: Place }> };
const cache = (g.osmCache ??= new Map());

/** Places seen in area searches, by id: opening a place (or reviewing it) right after the list needs no new Overpass call. */
const seen = (g.osmSeen ??= new Map());

function remember(places: Place[]) {
  const at = Date.now();
  for (const p of places) seen.set(p.id, { at, place: p });
  if (seen.size > 5000) {
    for (const [k, v] of seen) if (at - v.at > 60 * 60_000) seen.delete(k);
  }
}

/** Fresh for `ttl`; after that, refetched — and if the upstream fails, the stale value is served instead of an error. */
async function cached<T>(key: string, fn: () => Promise<T>, ttl = CACHE_TTL_MS): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  try {
    const value = await fn();
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return value;
  } catch (e) {
    if (hit) return hit.value as T;
    throw e;
  }
}

/** Round coordinates so nearby requests (≈ 100 m, GPS jitter included) share a cache entry. */
const cell = (p: LatLng) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

// ---------------------------------------------------------------------------
// Overpass

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * `timeoutMs`: a 3 km search in a dense city takes ~15 s on the public servers.
 * Alongside Google Places, OpenStreetMap only adds benches & co: one quick try is enough.
 */
async function overpass(query: string, timeoutMs = 12_000): Promise<OsmElement[]> {
  let lastError: unknown;
  const endpoints = googlePlacesEnabled() ? OVERPASS_ENDPOINTS.slice(0, 1) : OVERPASS_ENDPOINTS;
  if (googlePlacesEnabled()) timeoutMs = Math.min(timeoutMs, 6_000);
  for (const [i, url] of endpoints.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements: OsmElement[] };
      return json.elements ?? [];
    } catch (e) {
      lastError = e;
      log("warn", "upstream_error", { upstream: new URL(url).host, attempt: i + 1, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass unavailable");
}

const SMOKING_OK = /^(outside|yes|designated|separated|isolated|dedicated)$/;

function spotsQuery({ lat, lng }: LatLng, r: number) {
  const a = `(around:${r},${lat},${lng})`;
  return `[out:json][timeout:${r > 1500 ? 30 : 15}];
(
  nwr${a}[amenity=cafe];
  nwr${a}[amenity~"^(bar|pub|biergarten)$"];
  nwr${a}[amenity~"^(restaurant|fast_food|ice_cream)$"][smoking~"^(outside|yes|designated|separated|isolated)$"];
  node${a}[amenity=bench];
  nwr${a}[leisure~"^(park|garden)$"];
  nwr${a}[amenity=shelter];
  nwr${a}[amenity=smoking_area];
  node${a}[amenity=ashtray];
  node${a}[amenity=waste_basket][waste~"cigarettes"];
);
out center tags;`;
}

function osmId(el: OsmElement) {
  return `osm-${el.type}-${el.id}`;
}

function position(el: OsmElement): LatLng | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

function kindOf(t: Record<string, string>): PlaceKind | null {
  if (t.amenity === "cafe") return "cafe";
  if (/^(bar|pub|biergarten)$/.test(t.amenity ?? "")) return "bar";
  if (/^(restaurant|fast_food|ice_cream)$/.test(t.amenity ?? "")) return "terrace";
  if (t.amenity === "bench") return "bench";
  if (t.leisure === "park" || t.leisure === "garden") return "park";
  if (t.amenity === "shelter") return "shelter";
  if (t.amenity === "smoking_area" || t.amenity === "ashtray" || t.amenity === "waste_basket") return "smoking";
  return null;
}

const DEFAULT_NAME: Record<PlaceKind, string> = {
  cafe: "Café",
  bar: "Bar",
  terrace: "Terrasse",
  park: "Petit parc",
  bench: "Banc",
  smoking: "Cendrier",
  shelter: "Abri",
};

const MATERIALS: Record<string, string> = {
  wood: "Bois",
  metal: "Métal",
  stone: "Pierre",
  concrete: "Béton",
  plastic: "Plastique",
  granite: "Granit",
  steel: "Acier",
};

const KIND_CAP: Record<PlaceKind, number> = { cafe: 45, bar: 25, terrace: 30, smoking: 20, bench: 25, park: 20, shelter: 10 };

const QUIET: Record<PlaceKind, number> = { park: 5, bench: 3, shelter: 3, cafe: 3, bar: 2, terrace: 2, smoking: 2 };

function features(kind: PlaceKind, t: Record<string, string>) {
  const f: { icon: string; label: string }[] = [];
  const smoking = t.smoking ?? "";
  if (smoking === "outside") f.push({ icon: "smoking_rooms", label: "Fumeurs en terrasse" });
  else if (smoking === "yes") f.push({ icon: "smoking_rooms", label: "Fumeurs acceptés" });
  else if (/^(designated|separated|isolated|dedicated)$/.test(smoking)) f.push({ icon: "smoking_rooms", label: "Espace fumeurs" });
  else if (smoking === "no") f.push({ icon: "smoke_free", label: "Non-fumeur" });
  if (kind === "smoking") f.push({ icon: "smoking_rooms", label: t.amenity === "smoking_area" ? "Zone fumeurs" : "Cendrier" });
  if (t.outdoor_seating === "yes") f.push({ icon: "deck", label: "Terrasse" });
  if (/coffee_shop/.test(t.cuisine ?? "")) f.push({ icon: "local_cafe", label: "Coffee shop" });
  if (t.internet_access === "wlan" || t.internet_access === "yes") f.push({ icon: "wifi", label: "Wi-Fi" });
  if (t.takeaway === "yes" || t.takeaway === "only") f.push({ icon: "takeout_dining", label: "À emporter" });
  if (t.backrest === "yes") f.push({ icon: "chair", label: "Dossier" });
  if (t.covered === "yes" || kind === "shelter") f.push({ icon: "umbrella", label: "Couvert" });
  if (t.material) f.push({ icon: "texture", label: MATERIALS[t.material] ?? t.material });
  if (t.leisure === "garden") f.push({ icon: "yard", label: "Jardin" });
  if (t.leisure === "park") f.push({ icon: "park", label: "Parc" });
  if (t.wheelchair === "yes") f.push({ icon: "accessible", label: "Accessible PMR" });
  if (t.brand) f.push({ icon: "storefront", label: `Chaîne · ${t.brand}` });
  return f;
}

function filtersOf(kind: PlaceKind, t: Record<string, string>): FilterKey[] {
  const out = new Set<FilterKey>();
  if (SMOKING_OK.test(t.smoking ?? "") || kind === "smoking") out.add("smoke");
  if (kind === "cafe" || /coffee_shop/.test(t.cuisine ?? "")) out.add("coffee");
  if (kind === "park" || kind === "bench") out.add("quiet");
  if (kind === "park" || t.covered === "yes" || kind === "shelter") out.add("shade");
  if (kind === "cafe" || kind === "bar" || kind === "shelter" || t.covered === "yes") out.add("shelter");
  return [...out];
}

/** The place's picture, re-served by our own API (the browser never calls Wikimedia directly). */
function imageOf(t: Record<string, string>) {
  if (t.image && /^https:\/\//.test(t.image) && /\.(jpe?g|png|webp)(\?|$)/i.test(t.image)) {
    const own = proxiedImageUrl(t.image); // other hosts than Wikimedia are dropped
    if (own) return own;
  }
  const commons = t.wikimedia_commons;
  if (commons && /^File:/i.test(commons)) {
    return proxiedImageUrl(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(commons.slice(5))}?width=900`);
  }
  return undefined;
}

function toPlace(el: OsmElement): Place | null {
  const t = el.tags ?? {};
  const pos = position(el);
  const kind = kindOf(t);
  if (!pos || !kind) return null;
  if (t.access === "private" || t.access === "no") return null;
  // Unnamed "gardens" are mostly decorative planting strips (La Défense is full of them), not break spots.
  if (t.leisure === "garden" && !t.name) return null;
  const address = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || undefined;
  return {
    id: osmId(el),
    source: "osm",
    kind,
    name: t.name ?? DEFAULT_NAME[kind],
    filters: filtersOf(kind, t),
    features: features(kind, t),
    address,
    openingHours: t.opening_hours,
    website: t.website ?? t["contact:website"],
    phone: t.phone ?? t["contact:phone"],
    image: imageOf(t),
    quiet: QUIET[kind],
    description: t.description,
    osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    lat: pos.lat,
    lng: pos.lng,
  };
}

/** Merge points of the same kind closer than `meters` (benches along a square, ashtrays at a door). */
function cluster(places: Place[], meters: number, label: (n: number) => string): Place[] {
  const groups: Place[][] = [];
  for (const p of places) {
    const g = groups.find((grp) => distanceM(grp[0], p) < meters);
    if (g) g.push(p);
    else groups.push([p]);
  }
  return groups.map((g) => {
    if (g.length === 1) return g[0];
    const feats = new Map<string, { icon: string; label: string }>();
    g.forEach((p) => p.features.forEach((f) => feats.set(f.label, f)));
    return {
      ...g[0],
      name: label(g.length),
      count: g.length,
      lat: g.reduce((s, p) => s + p.lat, 0) / g.length,
      lng: g.reduce((s, p) => s + p.lng, 0) / g.length,
      features: [...feats.values()],
    };
  });
}

/** Local wall-clock time at the place, expressed as a Date whose *local* getters read that time. */
function localDate(utcOffsetSeconds: number) {
  const now = new Date();
  return new Date(now.getTime() + utcOffsetSeconds * 1000 + now.getTimezoneOffset() * 60_000);
}

function openNow(place: Place, countryCode: string | undefined, utcOffsetSeconds: number): boolean | null {
  if (!place.openingHours) return null;
  try {
    const oh = new OpeningHours(
      place.openingHours,
      { lat: place.lat, lon: place.lng, address: { country_code: countryCode ?? "fr", state: "" } },
      { mode: 0, tag_key: "opening_hours" } as never,
    );
    return oh.getState(localDate(utcOffsetSeconds));
  } catch {
    return null;
  }
}

/** Kinds Google Maps doesn't know: only OpenStreetMap has benches, ashtrays and shelters. */
const OSM_ONLY: PlaceKind[] = ["bench", "smoking", "shelter"];

/**
 * The places around a point. On Google Cloud: cafés, bars and parks come from Google Places (reliable, current
 * opening hours), and OpenStreetMap only adds what Google doesn't have (benches, ashtrays, shelters) when it answers.
 * If Google fails, everything comes from OpenStreetMap; if both fail, the caller shows community spots only.
 */
export async function fetchOsmPlaces(center: LatLng, radius: number, ctx: { countryCode?: string; utcOffsetSeconds: number }) {
  const fromOsm = () => cached(`osm:${cell(center)}:${radius}`, () => overpass(spotsQuery(center, radius), radius > 1500 ? 30_000 : 12_000));
  if (!googlePlacesEnabled()) return osmPlaces(await fromOsm(), center, radius, ctx);

  const [google, osm] = await Promise.all([
    cached(`gplaces:${cell(center)}:${radius}`, () => googleNearby(center, radius)).catch(() => null),
    fromOsm().catch(() => null),
  ]);
  if (!google) {
    if (!osm) throw new Error("No place provider answered");
    return osmPlaces(osm, center, radius, ctx);
  }
  remember(google);
  const extras = osm ? osmPlaces(osm, center, radius, ctx).filter((p) => OSM_ONLY.includes(p.kind)) : [];
  return [...google.filter((p) => distanceM(center, p) <= radius), ...extras];
}

function osmPlaces(elements: OsmElement[], center: LatLng, radius: number, ctx: { countryCode?: string; utcOffsetSeconds: number }) {
  const all = elements.map(toPlace).filter((p): p is Place => !!p);
  remember(all);

  // Big parks reached through their boundary can have a far-away centre: keep sensible ones only.
  const near = all.filter((p) => distanceM(center, p) <= radius * 1.6);

  const benches = near.filter((p) => p.kind === "bench" && p.name === "Banc");
  const namedBenches = near.filter((p) => p.kind === "bench" && p.name !== "Banc");
  const ashtrays = near.filter((p) => p.kind === "smoking" && p.name === "Cendrier");
  const others = near.filter((p) => !(p.kind === "bench") && !(p.kind === "smoking" && p.name === "Cendrier"));

  const grouped = [
    ...others,
    ...namedBenches,
    ...cluster(benches, 35, (n) => `${n} bancs`),
    ...cluster(ashtrays, 25, (n) => `${n} cendriers`),
  ];

  // Unnamed benches are plentiful: keep the closest clusters so the map stays readable.
  const benchClusters = grouped
    .filter((p) => p.kind === "bench")
    .sort((a, b) => distanceM(center, a) - distanceM(center, b))
    .slice(0, 25);
  const result = [...grouped.filter((p) => p.kind !== "bench"), ...benchClusters];

  // Dense cities return hundreds of bars: keep the nearest of each kind so the list stays useful.
  const used: Partial<Record<PlaceKind, number>> = {};
  const capped = result
    .sort((a, b) => distanceM(center, a) - distanceM(center, b))
    .filter((p) => (used[p.kind] = (used[p.kind] ?? 0) + 1) <= KIND_CAP[p.kind]);

  return capped.map((p) => ({ ...p, openNow: openNow(p, ctx.countryCode, ctx.utcOffsetSeconds) }));
}

export async function fetchOsmPlace(id: string, ctx: { countryCode?: string; utcOffsetSeconds: number }): Promise<Place | null> {
  if (isGooglePlaceId(id)) {
    const known = seen.get(id);
    if (known && Date.now() - known.at < 60 * 60_000) return known.place;
    return googlePlacesEnabled() ? cached(`gplace-id:${id}`, () => googlePlace(id), 60 * 60_000) : null;
  }
  const m = id.match(/^osm-(node|way|relation)-(\d+)$/);
  if (!m) return null;
  const hit = seen.get(id);
  if (hit && Date.now() - hit.at < 60 * 60_000) return { ...hit.place, openNow: openNow(hit.place, ctx.countryCode, ctx.utcOffsetSeconds) };
  const elements = await cached(`osm-id:${id}`, () => overpass(`[out:json][timeout:20];${m[1]}(${m[2]});out center tags;`), 60 * 60_000);
  const place = elements[0] ? toPlace(elements[0]) : null;
  return place ? { ...place, openNow: openNow(place, ctx.countryCode, ctx.utcOffsetSeconds) } : null;
}

// ---------------------------------------------------------------------------
// Weather (Open-Meteo)

const WMO: [number[], string, string][] = [
  [[0], "Ciel dégagé", "clear_day"],
  [[1, 2], "Éclaircies", "partly_cloudy_day"],
  [[3], "Couvert", "cloud"],
  [[45, 48], "Brouillard", "foggy"],
  [[51, 53, 55, 56, 57], "Bruine", "rainy"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "Pluie", "rainy"],
  [[71, 73, 75, 77, 85, 86], "Neige", "weather_snowy"],
  [[95, 96, 99], "Orage", "thunderstorm"],
];

export async function fetchWeather(center: LatLng): Promise<Weather> {
  return cached(
    `wx:${center.lat.toFixed(2)},${center.lng.toFixed(2)}`,
    async () => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${center.lat}&longitude=${center.lng}&current=temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day,uv_index&timezone=auto`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const j = await res.json();
      const c = j.current;
      const match = WMO.find(([codes]) => codes.includes(c.weather_code));
      const isDay = c.is_day === 1;
      let icon = match?.[2] ?? "cloud";
      if (!isDay && icon === "clear_day") icon = "clear_night";
      if (!isDay && icon === "partly_cloudy_day") icon = "partly_cloudy_night";
      return {
        temperature: Math.round(c.temperature_2m),
        precipitation: c.precipitation,
        code: c.weather_code,
        cloudCover: c.cloud_cover,
        windKmh: Math.round(c.wind_speed_10m),
        uvIndex: Math.round((c.uv_index ?? 0) * 10) / 10,
        isDay,
        label: match?.[1] ?? "Inconnu",
        icon,
        utcOffsetSeconds: j.utc_offset_seconds ?? 0,
      };
    },
    15 * 60_000,
  );
}

// ---------------------------------------------------------------------------
// Geocoding (Nominatim)

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: Record<string, string>;
}

function shortLabel(r: NominatimResult) {
  const a = r.address ?? {};
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.square].filter(Boolean).join(" ");
  const area = a.suburb ?? a.city_district ?? a.neighbourhood ?? a.quarter;
  const city = a.city ?? a.town ?? a.village ?? a.municipality;
  const head = r.name && r.name !== street ? r.name : street;
  return [head, area, city].filter(Boolean).slice(0, 3).join(" · ") || r.display_name.split(",").slice(0, 2).join(",");
}

async function nominatim(path: string) {
  const res = await fetch(`https://nominatim.openstreetmap.org/${path}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr,en" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

/**
 * `scope: "global"`: anywhere, only biased around `near`.
 * `scope: "near"`: only within ~3 km of `near`, closest first.
 */
export async function geocode(q: string, near?: LatLng, scope: "global" | "near" = "global") {
  const nearby = scope === "near" && near;
  const [dLng, dLat] = nearby ? [0.045, 0.03] : [0.3, 0.2];
  const bias = near ? `&viewbox=${near.lng - dLng},${near.lat + dLat},${near.lng + dLng},${near.lat - dLat}${nearby ? "&bounded=1" : ""}` : "";
  const results = await cached(`geo:${nearby ? "near" : "global"}:${q.toLowerCase()}:${near ? cell(near) : ""}`, () =>
    nominatim(`search?format=jsonv2&addressdetails=1&limit=${nearby ? 15 : 5}&q=${encodeURIComponent(q)}${bias}`),
  ) as NominatimResult[];
  const mapped = results.map((r) => {
    const p = { lat: Number(r.lat), lng: Number(r.lon) };
    return { label: shortLabel(r), ...p, full: r.display_name, distanceM: near ? Math.round(distanceM(near, p)) : undefined };
  });
  return nearby ? mapped.sort((a, b) => a.distanceM! - b.distanceM!).slice(0, 8) : mapped;
}

export async function reverseGeocode(p: LatLng) {
  const r = (await cached(
    `rev:${p.lat.toFixed(3)},${p.lng.toFixed(3)}`,
    () => nominatim(`reverse?format=jsonv2&addressdetails=1&zoom=17&lat=${p.lat}&lon=${p.lng}`),
    24 * 60 * 60_000,
  )) as NominatimResult & { error?: string };
  if (r.error) return { label: "Zone inconnue", countryCode: undefined };
  const a = r.address ?? {};
  const road = a.road && !/^(piste|voie) cyclable/i.test(a.road) ? a.road : undefined;
  const street = road ?? a.pedestrian ?? a.square ?? a.footway;
  const area = a.suburb ?? a.city_district ?? a.neighbourhood ?? a.city ?? a.town ?? a.village;
  return { label: [street, area].filter(Boolean).join(" · ") || shortLabel(r), countryCode: a.country_code };
}
