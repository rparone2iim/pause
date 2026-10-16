"use client";

import { Armchair, Check, Cigarette, Coffee, ImagePlus, Loader2, LocateFixed, MapPin, Trees, Umbrella, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FieldError } from "@/components/AuthCard";
import { PickMap } from "@/components/maps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/client";
import { CATEGORY_CONFIG, MAX_PHOTOS_PER_SPOT, categoryOfKind } from "@/lib/constants";
import { NamedIcon } from "@/lib/icons";
import { spotCreateBody, toFieldErrors } from "@/lib/schemas";
import type { SpotInput } from "@/hooks/use-places";
import { usePlaces } from "@/hooks/use-places";
import { useUi } from "@/hooks/use-ui";
import type { Archetype, LatLng, Place, SpotFilter } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<Archetype, React.ComponentType<{ className?: string }>> = {
  smoke: Cigarette,
  coffee: Coffee,
  park: Trees,
  shelter: Umbrella,
  perch: Armchair,
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

interface Draft {
  name: string;
  pos: LatLng | null;
  category: Archetype;
  features: string[];
  description: string;
  accessTip: string;
  isPrivate: boolean;
}

function draftOf(spot?: Place): Draft {
  if (!spot) return { name: "", pos: null, category: "smoke", features: ["Cendrier"], description: "", accessTip: "", isPrivate: false };
  return {
    name: spot.name,
    pos: { lat: spot.lat, lng: spot.lng },
    category: categoryOfKind(spot.kind),
    features: spot.features.map((f) => f.label),
    description: spot.description ?? "",
    accessTip: spot.accessTip ?? "",
    isPrivate: Boolean(spot.isPrivate),
  };
}

function toInput(d: Draft, pos: LatLng, address: string | undefined): SpotInput {
  const cfg = CATEGORY_CONFIG[d.category];
  const has = (t: string) => d.features.includes(t);
  const filters = new Set<SpotFilter>();
  if (d.category === "smoke" || has("Fumeurs en terrasse") || has("Fumeurs OK") || has("Cendrier")) filters.add("smoke");
  if (d.category === "coffee" || has("Bon café")) filters.add("coffee");
  if (d.category === "park" || has("Calme")) filters.add("quiet");
  if (has("Arbres / ombre") || has("À l'ombre")) filters.add("shade");
  if (has("Couvert") || d.category === "coffee" || d.category === "shelter") filters.add("shelter");
  return {
    type: cfg.kind,
    name: d.name.trim(),
    filters: [...filters],
    features: cfg.features.filter((f) => has(f.label)),
    ...(address && { address }),
    quiet: d.category === "park" || has("Calme") ? 4 : 3,
    description: d.description.trim(),
    accessTip: d.accessTip.trim(),
    lat: pos.lat,
    lng: pos.lng,
    isPrivate: d.isPrivate,
  };
}

interface Props {
  /** Edit mode when given. */
  spot?: Place;
  busy: boolean;
  fields: Record<string, string>;
  onSubmit: (input: SpotInput, photos: File[]) => void;
}

/** Click the map to place the point, choose the type, tick the equipment, name, description, access tip, up to 6 photos. */
export function SpotForm({ spot, busy, fields, onSubmit }: Props) {
  const { origin, locate } = usePlaces();
  const { toast } = useUi();
  const [draft, setDraft] = useState<Draft>(() => draftOf(spot));
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [localFields, setLocalFields] = useState<Record<string, string>>({});
  const [address, setAddress] = useState<string | null>(spot?.address ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const cfg = CATEGORY_CONFIG[draft.category];
  const pos = draft.pos ?? origin; // the pin starts on the user's position

  // Street name under the pin (debounced: Nominatim allows ~1 req/s).
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<{ data: { label: string }[] }>(`/addresses?lat=${pos.lat}&lng=${pos.lng}`, { signal: ctrl.signal })
        .then((d) => setAddress(d.data[0]?.label ?? null))
        .catch(() => {});
    }, 800);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [pos.lat, pos.lng]);

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickCategory = (c: Archetype) =>
    setDraft((d) => {
      const labels = CATEGORY_CONFIG[c].features.map((f) => f.label);
      const kept = d.features.filter((f) => labels.includes(f));
      return { ...d, category: c, features: kept.length ? kept : labels.slice(0, 1) };
    });

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next = [...photos];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_PHOTOS_PER_SPOT) {
        toast(`${MAX_PHOTOS_PER_SPOT} photos maximum`, "info");
        break;
      }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > MAX_PHOTO_BYTES) {
        toast(`« ${file.name} » : JPEG, PNG ou WebP de 5 Mo maximum`, "error");
        continue;
      }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setPhotos(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  // Errors found here (shared Zod schema, same rules as the API) win over the server's previous answer.
  const errors = { ...fields, ...localFields };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = toInput(draft, pos, address ?? undefined);
    const parsed = spotCreateBody.safeParse(input);
    if (!parsed.success) {
      const found = toFieldErrors(parsed.error);
      setLocalFields(found);
      if (found.name) document.getElementById("spotName")?.focus();
      return;
    }
    setLocalFields({});
    onSubmit(
      input,
      photos.map((p) => p.file),
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="animate-fade-up flex flex-col gap-2" style={{ animationDelay: "60ms" }}>
        <div className="relative w-full h-64 rounded-3xl overflow-hidden border">
          <PickMap pos={pos} me={origin} onPick={(p) => set("pos", p)} />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => {
              set("pos", null);
              locate();
            }}
            aria-label="Utiliser ma position"
            className="absolute top-3 right-3 z-[1000] rounded-full bg-background shadow-lg text-brand hover:bg-muted"
          >
            <LocateFixed />
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground px-1">
          <MapPin className="size-4 text-brand shrink-0" />
          <span key={address} className="animate-fade-in truncate">
            {address ?? "…"}
          </span>
          <span className="ml-auto shrink-0 text-xs">Clique sur la carte ou glisse le repère</span>
        </p>
        <FieldError message={errors.lat ?? errors.lng} />
      </div>

      <div>
        <Input
          id="spotName"
          value={draft.name}
          maxLength={60}
          onChange={(e) => {
            set("name", e.target.value);
            setLocalFields((f) => {
              const next = { ...f };
              delete next.name;
              return next;
            });
          }}
          aria-invalid={Boolean(errors.name)}
          placeholder="Nom du spot"
          className="animate-fade-up h-12 rounded-2xl px-4 text-base"
          style={{ animationDelay: "120ms" }}
        />
        <FieldError message={errors.name} />
      </div>

      <ToggleGroup
        type="single"
        value={draft.category}
        onValueChange={(v) => v && pickCategory(v as Archetype)}
        className="animate-fade-up grid grid-cols-2 sm:grid-cols-5 gap-2 w-full"
        style={{ animationDelay: "180ms" }}
        aria-label="Type de spot"
      >
        {(Object.keys(CATEGORY_CONFIG) as Archetype[]).map((c) => {
          const Icon = CATEGORY_ICONS[c];
          return (
            <ToggleGroupItem
              key={c}
              value={c}
              className="h-auto flex-col gap-2 py-4 rounded-3xl border bg-card data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary transition-all active:scale-95"
            >
              <Icon className="size-5!" />
              {CATEGORY_CONFIG[c].badge}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      <ToggleGroup key={draft.category} type="multiple" value={draft.features} onValueChange={(v) => set("features", v)} className="flex flex-wrap justify-start gap-2" aria-label="Équipements">
        {cfg.features.map((f, i) => (
          <ToggleGroupItem
            key={f.label}
            value={f.label}
            size="sm"
            style={{ animationDelay: `${i * 30}ms` }}
            className="animate-fade-up rounded-full border bg-card px-3 data-[state=on]:bg-orange-100 data-[state=on]:text-orange-700 data-[state=on]:border-orange-200 dark:data-[state=on]:bg-orange-500/15 dark:data-[state=on]:text-orange-300 dark:data-[state=on]:border-orange-500/30 transition-all active:scale-95"
          >
            {draft.features.includes(f.label) ? <Check /> : <NamedIcon name={f.icon} />}
            {f.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex flex-col gap-3">
        <div>
          <Textarea value={draft.description} maxLength={500} onChange={(e) => set("description", e.target.value)} placeholder="Description (facultatif)" className="min-h-20 rounded-2xl resize-none px-4 py-3" />
          <FieldError message={errors.description} />
        </div>
        <div>
          <Textarea value={draft.accessTip} maxLength={300} onChange={(e) => set("accessTip", e.target.value)} placeholder="Comment y aller ? Ex. : derrière la fontaine, à gauche de l'entrée (facultatif)" className="min-h-20 rounded-2xl resize-none px-4 py-3" />
          <FieldError message={errors.accessTip} />
        </div>
      </div>

      {!spot && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {photos.map((p, i) => (
              <div key={p.url} className="relative size-24 shrink-0 rounded-3xl overflow-hidden border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Photo ${i + 1}`} className="animate-fade-in w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(p.url);
                    setPhotos((list) => list.filter((x) => x !== p));
                  }}
                  aria-label={`Retirer la photo ${i + 1}`}
                  className="absolute top-1.5 right-1.5 size-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS_PER_SPOT && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Ajouter des photos"
                className="size-24 shrink-0 rounded-3xl border border-dashed bg-card hover:bg-muted flex flex-col items-center justify-center gap-1 text-muted-foreground text-xs transition-all active:scale-95"
              >
                <ImagePlus className="size-6" />
                {photos.length}/{MAX_PHOTOS_PER_SPOT}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <label className={cn("inline-flex items-center gap-2.5 text-sm cursor-pointer select-none", draft.isPrivate ? "text-foreground" : "text-muted-foreground")}>
          <Switch checked={draft.isPrivate} onCheckedChange={(v) => set("isPrivate", v)} />
          Garder privé
        </label>
        <Button type="submit" size="lg" className="h-12 px-8 rounded-full text-base" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {spot ? "Enregistrer" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}
