"use client";

import { ArrowLeft, Check, Clock, CloudOff, Footprints, ImagePlus, Loader2, MapPinOff, Navigation, Pencil, Route, Share, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MiniMap } from "@/components/maps";
import { FavoriteButton, formatDistance, KindIcon, OpenBadge } from "@/components/PlaceCard";
import { SpotImage } from "@/components/SpotImage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, api, errorMessage } from "@/lib/client";
import { KIND_META, SCORE_LABELS } from "@/lib/constants";
import { directionsUrl, withDistance } from "@/lib/geo";
import { NamedIcon } from "@/lib/icons";
import { useStore } from "@/lib/store";
import type { Review, SpotDetail } from "@/lib/types";
import { useRequireAuth } from "@/lib/use-require-auth";
import { cn, timeAgo } from "@/lib/utils";

const DAYS: Record<string, string> = { Mo: "lun", Tu: "mar", We: "mer", Th: "jeu", Fr: "ven", Sa: "sam", Su: "dim", PH: "fériés" };
const MAX_PHOTOS = 6;

/** "Mo-Fr 08:00-19:00; Sa off" → "lun–ven 08:00–19:00 · sam fermé" */
function frenchHours(oh: string) {
  return oh
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d])
    .replace(/\boff\b|\bclosed\b/g, "fermé")
    .replace(/24\/7/g, "24 h/24, 7 j/7")
    .replace(/(\d{2}:\d{2})-(\d{2}:\d{2})/g, "$1–$2")
    .replace(/([a-zé]{3})-([a-zé]{3})/g, "$1–$2")
    .replace(/;\s*/g, " · ");
}

const fmt = (n: number | null) => (n == null ? "–" : n.toFixed(1).replace(".", ","));

function Stars({ value, onChange, size = "size-7", label }: { value: number; onChange?: (n: number) => void; size?: string; label: string }) {
  return (
    <div className="flex items-center gap-0.5" role={onChange ? "radiogroup" : "img"} aria-label={onChange ? label : `${label} : ${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} sur 5`}
            onClick={() => onChange(n === value ? 0 : n)}
            className="transition-transform duration-150 hover:scale-110 active:scale-90"
          >
            <Star className={cn(size, n <= value ? "fill-brand text-brand" : "text-muted-foreground/40")} />
          </button>
        ) : (
          <Star key={n} className={cn(size, n <= value ? "fill-brand text-brand" : "text-muted-foreground/30")} />
        ),
      )}
    </div>
  );
}

interface Draft {
  rating: number;
  calm: number;
  clean: number;
  seating: number;
  comment: string;
}

const draftFrom = (r: Review | null): Draft => ({ rating: r?.rating ?? 0, calm: r?.calm ?? 0, clean: r?.clean ?? 0, seating: r?.seating ?? 0, comment: r?.comment ?? "" });

export default function SpotPage() {
  const ready = useRequireAuth();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast, deleteSpot, uploadPhoto, origin, weather, reloadMe } = useStore();
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error" | "notfound">("loading");
  const [draft, setDraft] = useState<Draft>(draftFrom(null));
  const [editing, setEditing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ spot: SpotDetail }>(`/spots/${encodeURIComponent(id)}`);
      setSpot(r.spot);
      setDraft(draftFrom(r.spot.myReview));
      setLoadState("ready");
    } catch (e) {
      setLoadState(e instanceof ApiError && e.status === 404 ? "notfound" : "error");
    }
  }, [id]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready || loadState === "loading") {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-4">
        <Skeleton className="h-72 rounded-3xl" />
        <Skeleton className="h-8 w-2/3 rounded-full" />
        <Skeleton className="h-5 w-1/3 rounded-full" />
      </div>
    );
  }

  if (!spot) {
    return (
      <div className="animate-fade-up flex flex-col items-center justify-center gap-4 py-24 text-center px-4 text-muted-foreground">
        {loadState === "error" ? <CloudOff className="size-10" /> : <MapPinOff className="size-10" />}
        <p>{loadState === "error" ? "Impossible de charger ce spot. Réessaie." : "Ce spot n'existe pas ou plus."}</p>
        <Button asChild className="rounded-full">
          <Link href="/">Retour à la carte</Link>
        </Button>
      </div>
    );
  }

  const place = withDistance(origin, [spot])[0];
  const meta = KIND_META[place.kind];
  const { averages } = spot;

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: place.name, url }).catch(() => {});
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("Lien copié");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Impossible de copier le lien", "error");
    }
  };

  const addPhoto = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      toast("Choisis une photo JPEG, PNG ou WebP de 5 Mo maximum", "error");
      return;
    }
    setUploading(true);
    try {
      await uploadPhoto(spot.id, file);
      toast("Photo ajoutée");
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async (name: string) => {
    try {
      await api(`/photos/${name}`, { method: "DELETE" });
      setSpot((s) => s && { ...s, photos: s.photos.filter((p) => p.name !== name) });
      toast("Photo supprimée", "info");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const postReview = async () => {
    if (!draft.rating) {
      toast("Donne au moins une note globale", "info");
      return;
    }
    setPosting(true);
    try {
      await api(`/spots/${encodeURIComponent(spot.id)}/reviews`, {
        method: "PUT",
        body: {
          rating: draft.rating,
          ...(draft.calm && { calm: draft.calm }),
          ...(draft.clean && { clean: draft.clean }),
          ...(draft.seating && { seating: draft.seating }),
          comment: draft.comment.trim(),
        },
      });
      toast(spot.myReview ? "Avis mis à jour" : "Merci pour ton avis !");
      setEditing(false);
      await load();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setPosting(false);
    }
  };

  const showForm = !spot.myReview || editing;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="self-start rounded-full -ml-2 group" onClick={() => (history.length > 1 ? router.back() : router.push("/"))}>
        <ArrowLeft className="transition-transform group-hover:-translate-x-0.5" />
        Retour
      </Button>

      {/* Gallery */}
      {spot.photos.length > 0 ? (
        <div className="animate-fade-up flex gap-2 overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-4 px-4">
          {spot.photos.map((p, i) => (
            <div key={p.name} className={cn("relative shrink-0 snap-center rounded-3xl overflow-hidden border bg-muted", i === 0 ? "w-full sm:w-[85%] h-72" : "w-56 h-72")}>
              <SpotImage src={p.url} alt={`${place.name}, photo ${i + 1}`} className="w-full h-full" />
              {p.canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button type="button" aria-label="Supprimer cette photo" className="absolute top-2 right-2 size-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
                      <X className="size-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer cette photo ?</AlertDialogTitle>
                      <AlertDialogDescription>Elle sera définitivement retirée du spot.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => removePhoto(p.name)}>
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))}
        </div>
      ) : place.image ? (
        <div className="animate-fade-up relative h-72 rounded-3xl overflow-hidden border bg-muted">
          <SpotImage src={place.image} alt={place.name} className="w-full h-full" />
        </div>
      ) : null}

      <div className="animate-fade-up flex items-start gap-4" style={{ animationDelay: "60ms" }}>
        <KindIcon place={place} className="size-14 rounded-3xl [&_svg]:size-6" />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold leading-tight">{place.name}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-1.5 text-sm text-muted-foreground">
            <span>{meta.label}</span>
            {place.address && <span>· {place.address}</span>}
            <OpenBadge place={place} />
            {averages.rating != null && (
              <Badge variant="secondary" className="gap-1">
                <Star className="fill-brand text-brand" />
                {fmt(averages.rating)} ({averages.count})
              </Badge>
            )}
          </div>
        </div>
        <FavoriteButton place={{ ...place, id: spot.id }} className="size-10 [&_svg]:size-5" />
      </div>

      <div className="animate-fade-up flex flex-wrap gap-2" style={{ animationDelay: "120ms" }}>
        <Badge variant="outline" className="h-8 px-3 gap-1.5 text-sm">
          <Footprints className="size-4! text-brand" />
          {place.walkMin} min à pied · {formatDistance(place.distanceM)}
        </Badge>
        {weather && (
          <Badge variant="outline" className="h-8 px-3 gap-1.5 text-sm">
            <NamedIcon name={weather.icon} className="size-4! text-brand" />
            {weather.temperature}°
          </Badge>
        )}
        {place.features.map((f) => (
          <Badge key={f.label} variant="outline" className="h-8 px-3 gap-1.5 text-sm">
            <NamedIcon name={f.icon} className="size-4! text-calm" />
            {f.label}
          </Badge>
        ))}
      </div>

      {place.description && <p className="text-muted-foreground leading-relaxed">{place.description}</p>}

      {place.accessTip && (
        <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
          <Route className="size-5 text-brand shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Comment y aller</p>
            <p className="text-sm text-muted-foreground mt-0.5">{place.accessTip}</p>
          </div>
        </div>
      )}

      {place.openingHours && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Clock className="size-4 mt-0.5 shrink-0" />
          {frenchHours(place.openingHours)}
        </p>
      )}

      <div className="animate-fade-up flex gap-2" style={{ animationDelay: "180ms" }}>
        <Button asChild size="lg" className="flex-1 h-12 rounded-full text-base">
          <a href={directionsUrl(origin, place)} target="_blank" rel="noopener noreferrer">
            <Navigation /> Itinéraire à pied
          </a>
        </Button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => addPhoto(e.target.files?.[0])} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-lg"
              className="size-12 rounded-full"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || spot.photos.length >= MAX_PHOTOS}
              aria-label="Ajouter une photo"
            >
              {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{spot.photos.length >= MAX_PHOTOS ? "6 photos maximum" : "Ajouter une photo"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon-lg" className="size-12 rounded-full" onClick={share} aria-label="Partager">
              {copied ? <Check key="c" className="animate-pop text-calm" /> : <Share key="s" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Partager</TooltipContent>
        </Tooltip>
        {place.osmUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="outline" size="icon-lg" className="size-12 rounded-full">
                <a href={place.osmUrl} target="_blank" rel="noopener noreferrer" aria-label="Modifier sur OpenStreetMap">
                  <Pencil />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Modifier sur OpenStreetMap</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="relative h-48 rounded-3xl overflow-hidden border">
        <MiniMap spot={place} from={origin} />
      </div>

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-lg font-semibold">Avis</h2>
          {averages.count > 0 && <span className="text-sm text-muted-foreground">{averages.count} avis</span>}
        </div>

        {averages.count > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[]).map((k) => (
              <div key={k} className="rounded-2xl border bg-card p-3">
                <div className="text-xs text-muted-foreground">{SCORE_LABELS[k]}</div>
                <div className="flex items-center gap-1 mt-1 font-heading text-xl font-semibold">
                  <Star className="size-4 fill-brand text-brand" />
                  {fmt(averages[k])}
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm ? (
          <Card className="shadow-none">
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm font-medium">{spot.myReview ? "Modifier mon avis" : "Laisser un avis"}</p>
              <Stars label="Note globale" value={draft.rating} onChange={(rating) => setDraft((d) => ({ ...d, rating }))} />
              <div className="grid sm:grid-cols-3 gap-2">
                {(["calm", "clean", "seating"] as const).map((k) => (
                  <div key={k} className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{SCORE_LABELS[k]} (facultatif)</span>
                    <Stars label={SCORE_LABELS[k]} size="size-5" value={draft[k]} onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} />
                  </div>
                ))}
              </div>
              <Textarea
                value={draft.comment}
                onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value.slice(0, 500) }))}
                rows={2}
                placeholder="C'est comment en ce moment ?"
                className="rounded-2xl resize-none"
              />
              <div className="flex justify-end gap-2">
                {editing && (
                  <Button
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => {
                      setEditing(false);
                      setDraft(draftFrom(spot.myReview));
                    }}
                  >
                    Annuler
                  </Button>
                )}
                <Button onClick={postReview} className="rounded-full" disabled={posting}>
                  {posting && <Loader2 className="animate-spin" />}
                  {spot.myReview ? "Mettre à jour" : "Publier"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {spot.reviews.map((r) => (
          <div key={r.id} className="animate-fade-up flex gap-3">
            <Avatar className="size-9">
              <AvatarFallback>{r.author.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="font-medium">{r.isMine ? "Toi" : r.author.name}</span>
                <Stars label="Note" size="size-3.5" value={r.rating} />
                <span className="text-xs text-muted-foreground">{timeAgo(new Date(r.updatedAt).getTime())}</span>
                {r.isMine && !editing && (
                  <button type="button" onClick={() => setEditing(true)} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                    Modifier
                  </button>
                )}
              </div>
              {(r.calm || r.clean || r.seating) && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(["calm", "clean", "seating"] as const)
                    .filter((k) => r[k])
                    .map((k) => `${SCORE_LABELS[k]} ${r[k]}/5`)
                    .join(" · ")}
                </p>
              )}
              {r.comment && <p className="text-sm mt-0.5">{r.comment}</p>}
            </div>
          </div>
        ))}
      </section>

      {spot.isOwner && (
        <div className="flex justify-end gap-2">
          <Button asChild variant="ghost" size="sm" className="rounded-full text-muted-foreground">
            <Link href={`/spots/${spot.id}/edit`}>
              <Pencil /> Modifier
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-destructive">
                <Trash2 /> Supprimer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer ce spot ?</AlertDialogTitle>
                <AlertDialogDescription>« {place.name} », ses photos et ses avis seront définitivement supprimés.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={async () => {
                    try {
                      await deleteSpot(spot.id);
                      reloadMe().catch(() => {});
                      toast("Spot supprimé", "info");
                      router.push("/");
                    } catch (e) {
                      toast(errorMessage(e), "error");
                    }
                  }}
                >
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
