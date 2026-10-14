// Constantes partagées front + back (aucune dépendance serveur ici).
export const SPOT_TYPES = ["SMOKING", "CAFE", "BENCH", "SHELTER"] as const;
export const TAGS = ["ASHTRAY", "SHELTERED", "SEATING", "SHADE", "SUN", "QUIET", "TAKEAWAY"] as const;
export type SpotType = (typeof SPOT_TYPES)[number];
export type Tag = (typeof TAGS)[number];

export const TYPE_LABELS: Record<SpotType, { label: string; emoji: string; tone: "warm" | "calm" }> = {
  SMOKING: { label: "Coin fumeur", emoji: "🚬", tone: "warm" },
  CAFE: { label: "Café", emoji: "☕", tone: "warm" },
  BENCH: { label: "Banc calme", emoji: "🌿", tone: "calm" },
  SHELTER: { label: "Abri", emoji: "☂️", tone: "calm" },
};

export const TAG_LABELS: Record<Tag, string> = {
  ASHTRAY: "Cendrier",
  SHELTERED: "Abrité de la pluie",
  SEATING: "Places assises",
  SHADE: "Ombre",
  SUN: "Soleil",
  QUIET: "Calme",
  TAKEAWAY: "Café à emporter à côté",
};

export const MAX_PHOTOS_PER_SPOT = 6;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 Mo
