"use client";

import { Footprints, Heart, Lock, Star, Users } from "lucide-react";
import { forwardRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KIND_META } from "@/lib/constants";
import { NamedIcon } from "@/lib/icons";
import { useAuth } from "@/hooks/use-auth";
import type { Place, Tone } from "@/lib/types";
import { cn } from "@/lib/utils";

export const toneClass: Record<Tone, string> = {
  orange: "bg-brand text-brand-foreground",
  "orange-soft": "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  dark: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
  neutral: "bg-muted text-foreground",
};

/** Only shown when we actually know: open / closed. */
export function OpenBadge({ place }: { place: Place }) {
  if (place.openNow == null) return null;
  return (
    <Badge variant="secondary" className={cn("gap-1.5", place.openNow ? "text-calm" : "text-destructive")}>
      <span className={cn("size-1.5 rounded-full", place.openNow ? "bg-calm" : "bg-destructive")} />
      {place.openNow ? "Ouvert" : "Fermé"}
    </Badge>
  );
}

export function KindIcon({ place, className }: { place: Place; className?: string }) {
  const meta = KIND_META[place.kind];
  return (
    <div className={cn("size-11 rounded-2xl flex items-center justify-center shrink-0", toneClass[meta.tone], className)}>
      <NamedIcon name={meta.icon} className="size-5" />
    </div>
  );
}

/** Distance in m / km, as shown on the cards. */
export const formatDistance = (m?: number) => (m === undefined ? "" : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);

export function FavoriteButton({ place, className }: { place: Place; className?: string }) {
  const { isFavorite, toggleFavorite } = useAuth();
  const saved = isFavorite(place.id);
  const [bump, setBump] = useState(0);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={saved ? `Retirer ${place.name} des favoris` : `Ajouter ${place.name} aux favoris`}
      aria-pressed={saved}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(place);
        setBump((b) => b + 1);
      }}
      className={cn("rounded-full", saved ? "text-brand hover:text-brand" : "text-muted-foreground", className)}
    >
      <Heart key={bump} className={cn(saved && "fill-current", bump > 0 && "animate-bump")} />
    </Button>
  );
}

interface Props {
  place: Place;
  selected: boolean;
  onSelect: () => void;
  index?: number;
}

/** The spot's photo when there is one (falls back to the type icon if it fails to load). */
function Thumb({ place }: { place: Place }) {
  const [failed, setFailed] = useState(false);
  if (!place.image || failed) return <KindIcon place={place} className="transition-transform duration-200 group-hover:scale-105" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={place.image}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-11 rounded-2xl object-cover shrink-0 transition-transform duration-200 group-hover:scale-105"
    />
  );
}

export const PlaceCard = forwardRef<HTMLDivElement, Props>(function PlaceCard({ place, selected, onSelect, index = 0 }, ref) {
  const feature = place.features[0];
  return (
    <Card
      ref={ref}
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
      className={cn(
        "animate-fade-up group relative shrink-0 flex-row items-center gap-3 p-3 cursor-pointer shadow-none",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 has-[button[data-card-action]:focus-visible]:ring-2 has-[button[data-card-action]:focus-visible]:ring-brand",
        selected && "ring-2 ring-primary shadow-lg shadow-black/5",
      )}
    >
      {/* The whole card is one real button (keyboard + screen readers), laid over the content;
          the favorite button sits above it, so no control is nested inside another. */}
      <button
        type="button"
        data-card-action
        onClick={onSelect}
        aria-current={selected || undefined}
        aria-label={`${place.name}, ${KIND_META[place.kind].label}, ${place.walkMin} min à pied`}
        className="absolute inset-0 z-[1] rounded-[inherit] outline-none"
      />
      <Thumb place={place} />
      <div className="min-w-0 flex-1">
        <h3 className="font-heading font-semibold text-[15px] leading-tight truncate">{place.name}</h3>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground shrink-0">
            <Footprints className="size-3.5" />
            {place.walkMin} min · {formatDistance(place.distanceM)}
          </span>
          {place.rating != null && (
            <span className="inline-flex items-center gap-0.5 font-medium text-foreground shrink-0">
              <Star className="size-3.5 fill-brand text-brand" />
              {place.rating.toFixed(1).replace(".", ",")}
            </span>
          )}
          {place.openNow != null && (
            <span className={cn("inline-flex items-center gap-1", place.openNow ? "text-calm" : "text-destructive")}>
              <span className={cn("size-1.5 rounded-full", place.openNow ? "bg-calm" : "bg-destructive")} />
              {place.openNow ? "Ouvert" : "Fermé"}
            </span>
          )}
          {feature && place.rating == null && (
            <span className="inline-flex items-center gap-1 truncate">
              <NamedIcon name={feature.icon} className="size-3.5 shrink-0" />
              <span className="truncate">{feature.label}</span>
            </span>
          )}
          {place.source === "community" && (
            <span className="inline-flex items-center gap-1 text-calm">
              {place.isPrivate ? <Lock className="size-3.5" /> : <Users className="size-3.5" />}
              {place.isPrivate ? "Privé" : "Communauté"}
            </span>
          )}
        </div>
        {place.description && <p className="mt-1 text-xs text-muted-foreground leading-snug line-clamp-2">{place.description}</p>}
      </div>
      <FavoriteButton place={place} className="relative z-10" />
    </Card>
  );
});
