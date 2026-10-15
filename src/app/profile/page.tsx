"use client";

import { Check, Cigarette, Coffee, Heart, Loader2, LogOut, MapPinPlus, Pencil, Plus, Trash2, TreePine, Trees, Umbrella, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FieldError } from "@/components/AuthCard";
import { Avatar } from "@/components/Avatar";
import { PlaceCard } from "@/components/PlaceCard";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { errorMessage, fieldErrors } from "@/lib/client";
import { FILTER_DESCRIPTIONS, FILTER_LABELS, formatRadius, RADIUS_OPTIONS, SPOT_FILTERS } from "@/lib/constants";
import { withDistance } from "@/lib/geo";
import { useStore } from "@/lib/store";
import type { SpotFilter } from "@/lib/types";
import { useRequireAuth } from "@/lib/use-require-auth";

const FILTER_ICONS: Record<SpotFilter, React.ComponentType<{ className?: string }>> = {
  smoke: Cigarette,
  coffee: Coffee,
  quiet: Trees,
  shade: TreePine,
  shelter: Umbrella,
};

const chip =
  "h-10 rounded-full border bg-card px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary transition-all active:scale-95";

function Empty({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
      <Icon className="size-5 shrink-0" />
      {text}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const ready = useRequireAuth();
  const { user, favorites, mySpots, origin, logout, deleteAccount, updateProfile, toast } = useStore();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [saving, setSaving] = useState(false);

  if (!ready || !user) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-4 w-56 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-10 w-2/3 rounded-full" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    );
  }

  const save = async (patch: Parameters<typeof updateProfile>[0], success?: string) => {
    try {
      await updateProfile(patch);
      if (success) toast(success);
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  };

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNameError(undefined);
    try {
      await updateProfile({ displayName: name.trim() });
      setEditingName(false);
      toast("Pseudo mis à jour");
    } catch (err) {
      setNameError(fieldErrors(err).displayName ?? errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const favs = withDistance(origin, favorites);
  const mine = withDistance(origin, mySpots);

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-10">
      <div className="animate-fade-up flex items-center gap-4">
        <Avatar name={user.displayName} className="size-16 text-xl" />
        <div className="min-w-0 flex-1">
          {editingName ? (
            <form onSubmit={saveName} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus aria-label="Pseudo" aria-invalid={Boolean(nameError)} className="h-10 rounded-2xl text-lg font-semibold" />
                <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={saving} aria-label="Enregistrer le pseudo">
                  {saving ? <Loader2 className="animate-spin" /> : <Check />}
                </Button>
                <Button type="button" variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => setEditingName(false)} aria-label="Annuler">
                  <X />
                </Button>
              </div>
              <FieldError message={nameError} />
            </form>
          ) : (
            <h1 className="text-2xl font-bold truncate flex items-center gap-2">
              {user.displayName}
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground"
                onClick={() => {
                  setName(user.displayName);
                  setNameError(undefined);
                  setEditingName(true);
                }}
                aria-label="Modifier mon pseudo"
              >
                <Pencil />
              </Button>
            </h1>
          )}
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full shadow-none"
          onClick={async () => {
            await logout();
            router.push("/login");
          }}
        >
          <LogOut /> <span className="hidden sm:inline">Se déconnecter</span>
        </Button>
      </div>

      <section className="animate-fade-up flex flex-col gap-3" style={{ animationDelay: "60ms" }}>
        <div>
          <h2 className="text-lg font-semibold">Mes types de pause</h2>
          <p className="text-sm text-muted-foreground">Ils servent de filtres par défaut sur la carte.</p>
        </div>
        <ToggleGroup
          type="multiple"
          value={user.preferredTypes}
          onValueChange={(v) => save({ preferredTypes: v as SpotFilter[] })}
          className="flex flex-wrap justify-start gap-2"
          aria-label="Types de pause préférés"
        >
          {SPOT_FILTERS.map((f) => {
            const Icon = FILTER_ICONS[f];
            return (
              <ToggleGroupItem key={f} value={f} title={FILTER_DESCRIPTIONS[f]} className={chip}>
                <Icon className="size-4" />
                {FILTER_LABELS[f]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </section>

      <section className="animate-fade-up flex flex-col gap-3" style={{ animationDelay: "90ms" }}>
        <div>
          <h2 className="text-lg font-semibold">Distance max</h2>
          <p className="text-sm text-muted-foreground">Le rayon affiché par défaut autour de toi.</p>
        </div>
        <ToggleGroup
          type="single"
          value={String(user.radiusM)}
          onValueChange={(v) => v && save({ radiusM: Number(v) }, "Distance mise à jour")}
          className="flex flex-wrap justify-start gap-2"
          aria-label="Distance max"
        >
          {RADIUS_OPTIONS.map((r) => (
            <ToggleGroupItem key={r} value={String(r)} className={chip}>
              {formatRadius(r)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Mes favoris</h2>
        {favs.length === 0 ? (
          <Empty icon={Heart} text="Touche le cœur d'un spot pour le garder ici." />
        ) : (
          favs.map((p, i) => <PlaceCard key={p.id} index={i} place={p} selected={false} onSelect={() => router.push(`/spots/${p.id}`)} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mes spots</h2>
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link href="/spots/new">
              <Plus /> Ajouter
            </Link>
          </Button>
        </div>
        {mine.length === 0 ? (
          <Empty icon={MapPinPlus} text="Les spots que tu ajoutes apparaîtront ici." />
        ) : (
          mine.map((p, i) => <PlaceCard key={p.id} index={i} place={p} selected={false} onSelect={() => router.push(`/spots/${p.id}`)} />)
        )}
      </section>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="self-start rounded-full text-muted-foreground hover:text-destructive">
            <Trash2 /> Supprimer mon compte
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ton compte ?</AlertDialogTitle>
            <AlertDialogDescription>Tes spots, tes photos, tes avis et tes favoris seront définitivement supprimés.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                try {
                  await deleteAccount();
                  toast("Compte supprimé", "info");
                  router.push("/register");
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
  );
}
