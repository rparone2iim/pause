"use client";

import { ArrowDownUp, ArrowRight, Cigarette, CloudOff, Coffee, Footprints, Loader2, MapPin, Navigation, Plus, Radius, SearchX, Star, TreePine, Trees, Umbrella } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchTrigger } from "@/components/SearchDialog";
import { ExploreMap } from "@/components/maps";
import { formatDistance, PlaceCard } from "@/components/PlaceCard";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FILTER_LABELS, formatRadius, KIND_META, RADIUS_OPTIONS, SPOT_FILTERS } from "@/lib/constants";
import { NamedIcon } from "@/lib/icons";
import { useAuth } from "@/hooks/use-auth";
import { usePlaces } from "@/hooks/use-places";
import type { Place, SpotFilter } from "@/lib/types";
import { useRequireAuth } from "@/hooks/use-require-auth";

const FILTER_ICONS: Record<SpotFilter, React.ComponentType<{ className?: string }>> = {
  smoke: Cigarette,
  coffee: Coffee,
  quiet: Trees,
  shade: TreePine,
  shelter: Umbrella,
};

type SortKey = "nearest" | "rating" | "open" | "quietness";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "nearest", label: "Les plus proches" },
  { key: "rating", label: "Les mieux notés" },
  { key: "open", label: "Ouverts maintenant" },
  { key: "quietness", label: "Les plus calmes" },
];

export default function ExplorePage() {
  const ready = useRequireAuth();
  const { user } = useAuth();
  const { places, status, osmAvailable, refresh, weather, radius, setRadius, origin, setOrigin, locate } = usePlaces();
  const [filters, setFilters] = useState<SpotFilter[]>([]);
  const [sort, setSort] = useState<SortKey>("nearest");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const askedGps = useRef(false);
  const filtersFromProfile = useRef(false);

  // The preferred break types of the profile are the default filters.
  useEffect(() => {
    if (!user || filtersFromProfile.current) return;
    filtersFromProfile.current = true;
    setFilters(user.preferredTypes);
  }, [user]);

  // First visit: ask for the real position (falls back to the school if refused).
  useEffect(() => {
    if (!ready || askedGps.current || origin.source !== "default") return;
    askedGps.current = true;
    locate();
  }, [ready, origin.source, locate]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(SPOT_FILTERS.map((f) => [f, 0])) as Record<SpotFilter, number>;
    places.forEach((p) => p.filters.forEach((f) => f !== "all" && (c[f] += 1)));
    return c;
  }, [places]);

  const visible = useMemo(() => {
    const dist = (a: Place, b: Place) => (a.distanceM ?? 0) - (b.distanceM ?? 0);
    const sorters: Record<SortKey, (a: Place, b: Place) => number> = {
      nearest: dist,
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0) || dist(a, b),
      open: (a, b) => Number(b.openNow === true) - Number(a.openNow === true) || dist(a, b),
      quietness: (a, b) => b.quiet - a.quiet || dist(a, b),
    };
    return places.filter((p) => filters.length === 0 || filters.some((f) => p.filters.includes(f))).sort(sorters[sort]);
  }, [places, filters, sort]);

  useEffect(() => {
    if (visible.length === 0) setSelectedId(null);
    else if (!visible.some((p) => p.id === selectedId)) setSelectedId(visible[0].id);
  }, [visible, selectedId]);

  const select = (id: string, scroll = false) => {
    setSelectedId(id);
    if (scroll) cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  if (!ready) {
    return (
      <div className="flex flex-col lg:flex-row w-full lg:h-[calc(100vh-4rem)]">
        <div className="w-full lg:w-[400px] p-4 flex flex-col gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[70px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="flex-1 h-[45vh] lg:h-full rounded-none" />
      </div>
    );
  }

  const selected = visible.find((p) => p.id === selectedId);
  const selectedCard = selected && (
    <div key={selected.id} className="animate-pop flex items-center gap-3 w-72 rounded-3xl bg-primary text-primary-foreground p-2 shadow-2xl">
      <span className="size-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
        <NamedIcon name={KIND_META[selected.kind].icon} className="size-5 text-brand" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-heading font-semibold leading-snug truncate">{selected.name}</div>
        <div className="flex items-center gap-1.5 text-xs opacity-70">
          <Footprints className="size-3.5" />
          {selected.walkMin} min · {formatDistance(selected.distanceM)}
          {selected.rating != null && (
            <>
              <Star className="size-3.5 fill-brand text-brand ml-1" />
              {selected.rating.toFixed(1).replace(".", ",")}
            </>
          )}
        </div>
      </div>
      <Button asChild size="icon-lg" className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90 shrink-0 transition-transform hover:scale-105">
        <Link href={`/spots/${selected.id}`} aria-label={`Ouvrir ${selected.name}`}>
          <ArrowRight />
        </Link>
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row w-full lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
      <h1 className="sr-only">Spots de pause autour de toi</h1>
      <aside className="order-2 lg:order-1 w-full lg:w-[400px] shrink-0 flex flex-col lg:h-full lg:border-r bg-background">
        <div className="p-4 pb-3 flex flex-col gap-3">
          <SearchTrigger className="md:hidden" />
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="multiple"
              value={filters}
              onValueChange={(v) => setFilters(v as SpotFilter[])}
              className="flex-1 justify-start gap-1.5 overflow-x-auto no-scrollbar [mask-image:linear-gradient(to_right,black_85%,transparent)]"
              aria-label="Filtrer par type"
            >
              {SPOT_FILTERS.filter((f) => counts[f] > 0 || filters.includes(f)).map((f) => {
                const Icon = FILTER_ICONS[f];
                return (
                  <ToggleGroupItem
                    key={f}
                    value={f}
                    size="sm"
                    className="shrink-0 rounded-full border bg-card px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary transition-all active:scale-95"
                  >
                    <Icon className="size-3.5" />
                    {FILTER_LABELS[f]}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full shrink-0 shadow-none bg-card hover:bg-muted gap-1 px-2.5" aria-label="Rayon">
                  <Radius /> {formatRadius(radius)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Rayon</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
                  {RADIUS_OPTIONS.map((r) => (
                    <DropdownMenuRadioItem key={r} value={String(r)}>
                      {formatRadius(r)} · {Math.round(r / 80)} min
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" className="rounded-full shrink-0 shadow-none bg-card hover:bg-muted" aria-label="Trier">
                  <ArrowDownUp />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Trier par</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  {SORTS.map((s) => (
                    <DropdownMenuRadioItem key={s.key} value={s.key}>
                      {s.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {status === "ready" && !osmAvailable && (
            <div className="animate-fade-in flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
              <CloudOff className="size-4 shrink-0" />
              <span className="flex-1">OpenStreetMap ne répond pas : seuls les spots de la communauté sont affichés.</span>
              <button type="button" onClick={refresh} className="font-medium text-foreground underline underline-offset-4">
                Réessayer
              </button>
            </div>
          )}
          {filters.length > 0 && (
            <button type="button" onClick={() => setFilters([])} className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Tout afficher
            </button>
          )}
        </div>

        <div className="flex-1 lg:overflow-y-auto px-4 pt-1 pb-4 flex flex-col gap-2.5" aria-busy={status === "loading"}>
          <h2 className="sr-only">Liste des spots, du plus proche au plus loin</h2>
          {status === "loading" && places.length === 0 && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[70px] shrink-0 rounded-2xl" />)}

          {status === "error" && places.length === 0 && (
            <div className="animate-fade-up flex flex-col items-center text-center gap-3 py-12 text-muted-foreground">
              <CloudOff className="size-8" />
              <p className="text-sm">Impossible de charger les spots.</p>
              <Button onClick={refresh} className="rounded-full">
                Réessayer
              </Button>
            </div>
          )}

          {visible.map((p, i) => (
            <PlaceCard
              key={p.id}
              index={i}
              ref={(el) => {
                cardRefs.current[p.id] = el;
              }}
              place={p}
              selected={p.id === selectedId}
              onSelect={() => select(p.id)}
            />
          ))}

          {status === "ready" && visible.length === 0 && (
            <div className="animate-fade-up flex flex-col items-center text-center gap-3 py-12 text-muted-foreground">
              <SearchX className="size-8" />
              <p className="text-sm">Rien par ici pour l&apos;instant.</p>
              <Button asChild className="rounded-full">
                <Link href="/spots/new">
                  <Plus /> Ajouter un spot
                </Link>
              </Button>
            </div>
          )}
        </div>
      </aside>

      <section className="order-1 lg:order-2 flex-none lg:flex-1 relative h-[45vh] min-h-[320px] lg:h-full overflow-hidden">
        <ExploreMap
          center={origin}
          radiusM={radius}
          places={visible}
          selectedId={selectedId}
          onSelect={(id) => select(id, true)}
          onLocate={locate}
          onSearchArea={(c) => setOrigin({ ...c, label: "Zone de la carte", source: "search" })}
          selectedCard={selectedCard}
        >
          <div className="absolute top-3 left-3 right-3 flex pointer-events-none z-[1000]">
            <div className="animate-fade-in pointer-events-auto flex items-center gap-2 rounded-full bg-background/90 backdrop-blur-md border px-3.5 py-2 shadow-lg min-w-0 text-sm">
              {origin.source === "gps" ? <Navigation className="size-3.5 text-brand fill-brand shrink-0" /> : <MapPin className="size-3.5 text-brand shrink-0" />}
              <span className="font-medium truncate">{origin.label}</span>
              {weather && (
                <span className="flex items-center gap-1 pl-2 border-l text-muted-foreground shrink-0">
                  <NamedIcon name={weather.icon} className="size-4" />
                  {weather.temperature}°
                </span>
              )}
              {status === "loading" && <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />}
            </div>
          </div>

        </ExploreMap>
      </section>
    </div>
  );
}
