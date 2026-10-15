import type { Archetype, PlaceKind, SpotFilter, Tone } from "./types";

/** Display metadata per place kind: badge, icon and map pin colour. */
export const KIND_META: Record<PlaceKind, { label: string; icon: string; tone: Tone; color: string }> = {
  cafe: { label: "Café", icon: "local_cafe", tone: "orange-soft", color: "#fd651e" },
  bar: { label: "Bar", icon: "local_bar", tone: "neutral", color: "#a73a00" },
  terrace: { label: "Terrasse", icon: "deck", tone: "orange-soft", color: "#e8590c" },
  park: { label: "Espace vert", icon: "park", tone: "green", color: "#069669" },
  bench: { label: "Banc", icon: "chair", tone: "neutral", color: "#71717a" },
  smoking: { label: "Coin fumeur", icon: "smoking_rooms", tone: "orange", color: "#a73a00" },
  shelter: { label: "Abri", icon: "roofing", tone: "dark", color: "#3f3f46" },
};

/** Break types: map filters and the user's preferred types. */
export const FILTER_LABELS: Record<SpotFilter, string> = {
  smoke: "Fumeurs",
  coffee: "Café",
  quiet: "Calme",
  shade: "Verdure",
  shelter: "À l'abri",
};

export const FILTER_DESCRIPTIONS: Record<SpotFilter, string> = {
  smoke: "Coin fumeur, cendrier, terrasse fumeurs.",
  coffee: "Café ou coffee shop, à emporter bienvenu.",
  quiet: "Espace vert ou banc à l'écart, loin du bruit.",
  shade: "Arbres, parcs et coins d'ombre.",
  shelter: "Couvert : on y est à l'abri de la pluie.",
};

export const SPOT_FILTERS = Object.keys(FILTER_LABELS) as SpotFilter[];

/** Search radius choices (300 m – 3 km). */
export const RADIUS_OPTIONS = [300, 500, 800, 1000, 2000, 3000] as const;

export const formatRadius = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

/** Labels of the detailed scores of a review. */
export const SCORE_LABELS = { rating: "Note globale", calm: "Calme", clean: "Propreté", seating: "Places assises" } as const;

/** Categories offered when pinning a community spot. */
export const CATEGORY_CONFIG: Record<
  Archetype,
  { emoji: string; title: string; subtitle: string; badge: string; kind: PlaceKind; features: { icon: string; label: string }[] }
> = {
  smoke: {
    emoji: "🚬",
    title: "Zone fumeurs",
    subtitle: "Cendrier, abrité",
    badge: "Coin fumeur",
    kind: "smoking",
    features: [
      { icon: "smoking_rooms", label: "Cendrier" },
      { icon: "air", label: "À l'abri du vent" },
      { icon: "umbrella", label: "Couvert" },
      { icon: "chair", label: "Places assises" },
    ],
  },
  coffee: {
    emoji: "☕",
    title: "Café",
    subtitle: "Espresso, à emporter",
    badge: "Café",
    kind: "cafe",
    features: [
      { icon: "local_cafe", label: "Bon café" },
      { icon: "takeout_dining", label: "À emporter" },
      { icon: "deck", label: "Terrasse" },
      { icon: "smoking_rooms", label: "Fumeurs en terrasse" },
      { icon: "wifi", label: "Wi-Fi" },
    ],
  },
  park: {
    emoji: "🌿",
    title: "Coin de verdure",
    subtitle: "Calme, vert, assis",
    badge: "Coin vert",
    kind: "park",
    features: [
      { icon: "park", label: "Arbres / ombre" },
      { icon: "chair", label: "Banc" },
      { icon: "volume_off", label: "Calme" },
      { icon: "umbrella", label: "Couvert" },
    ],
  },
  shelter: {
    emoji: "☂️",
    title: "Abri",
    subtitle: "Couvert, à l'abri de la pluie",
    badge: "Abri",
    kind: "shelter",
    features: [
      { icon: "umbrella", label: "Couvert" },
      { icon: "air", label: "À l'abri du vent" },
      { icon: "chair", label: "Places assises" },
      { icon: "smoking_rooms", label: "Cendrier" },
    ],
  },
  perch: {
    emoji: "🪑",
    title: "Petit coin",
    subtitle: "Muret, marches, pause debout",
    badge: "Petit coin",
    kind: "bench",
    features: [
      { icon: "texture", label: "Muret en pierre" },
      { icon: "wb_sunny", label: "Au soleil" },
      { icon: "wb_shade", label: "À l'ombre" },
      { icon: "smoking_rooms", label: "Fumeurs OK" },
    ],
  },
};

/** The add-spot category matching a spot type (to edit an existing spot). */
export function categoryOfKind(kind: PlaceKind): Archetype {
  const found = (Object.keys(CATEGORY_CONFIG) as Archetype[]).find((c) => CATEGORY_CONFIG[c].kind === kind);
  return found ?? (kind === "cafe" || kind === "bar" || kind === "terrace" ? "coffee" : "perch");
}
