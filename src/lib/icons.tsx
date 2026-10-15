import {
  Accessibility,
  Armchair,
  Bike,
  Check,
  CigaretteOff,
  Cigarette,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Coffee,
  Dot,
  Flower2,
  Grid3x3,
  Info,
  Moon,
  CloudMoon,
  Package,
  Shrub,
  Store,
  Sun,
  Sunset,
  TreePine,
  Trees,
  Umbrella,
  Users,
  VolumeX,
  Wifi,
  Wind,
  Wine,
  Leaf,
  Layers,
  type LucideIcon,
} from "lucide-react";

/**
 * Feature and weather icons arrive from the server as short names
 * (historically Material Symbols ids). Map them to Lucide components.
 */
const ICONS: Record<string, LucideIcon> = {
  smoking_rooms: Cigarette,
  smoke_free: CigaretteOff,
  deck: Sunset,
  local_cafe: Coffee,
  coffee: Coffee,
  wifi: Wifi,
  takeout_dining: Package,
  chair: Armchair,
  local_bar: Wine,
  nature_people: Leaf,
  chair_alt: Armchair,
  umbrella: Umbrella,
  roofing: Umbrella,
  texture: Layers,
  yard: Flower2,
  park: Trees,
  accessible: Accessibility,
  storefront: Store,
  groups: Users,
  air: Wind,
  volume_off: VolumeX,
  wb_sunny: Sun,
  wb_shade: TreePine,
  pedal_bike: Bike,
  grid_view: Grid3x3,
  info: Info,
  check: Check,
  shrub: Shrub,
  // weather (Open-Meteo, see lib/server/osm.ts)
  clear_day: Sun,
  clear_night: Moon,
  partly_cloudy_day: CloudSun,
  partly_cloudy_night: CloudMoon,
  cloud: Cloud,
  foggy: CloudFog,
  rainy: CloudRain,
  drizzle: CloudDrizzle,
  weather_snowy: CloudSnow,
  thunderstorm: CloudLightning,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Dot;
}

export function NamedIcon({ name, className }: { name: string; className?: string }) {
  const Cmp = iconFor(name);
  return <Cmp className={className} aria-hidden />;
}
