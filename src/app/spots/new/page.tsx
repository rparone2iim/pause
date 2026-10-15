"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SpotForm } from "@/components/SpotForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, fieldErrors } from "@/lib/client";
import { useStore } from "@/lib/store";
import type { Place } from "@/lib/types";
import { useRequireAuth } from "@/lib/use-require-auth";

export default function NewSpotPage() {
  const ready = useRequireAuth();
  const { addSpot, uploadPhoto, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Place | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (!ready) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
        <Skeleton className="h-9 w-56 rounded-full" />
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-12 rounded-2xl" />
      </div>
    );
  }

  if (created) {
    return (
      <div className="w-full max-w-md mx-auto px-4 py-24 flex flex-col items-center text-center gap-4">
        <div className="animate-pop size-16 rounded-full bg-calm text-white flex items-center justify-center">
          <Check className="size-8" />
        </div>
        <h1 className="animate-fade-up text-2xl font-bold">{created.name}</h1>
        <p className="animate-fade-up text-muted-foreground" style={{ animationDelay: "60ms" }}>
          {created.isPrivate ? "Toi seul peux le voir." : "Il est sur la carte."}
        </p>
        <div className="animate-fade-up flex gap-2" style={{ animationDelay: "120ms" }}>
          <Button asChild className="rounded-full">
            <Link href={`/spots/${created.id}`}>Voir le spot</Link>
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              setCreated(null);
              setFormKey((k) => k + 1);
            }}
          >
            En ajouter un autre
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      <h1 className="animate-fade-up text-3xl font-bold">Ajouter un spot</h1>
      <SpotForm
        key={formKey}
        busy={busy}
        fields={fields}
        onSubmit={async (input, photos) => {
          setBusy(true);
          setFields({});
          try {
            const spot = await addSpot(input);
            let failed = 0;
            for (const file of photos) {
              try {
                await uploadPhoto(spot.id, file);
              } catch (e) {
                failed += 1;
                toast(errorMessage(e), "error");
              }
            }
            toast(failed ? "Spot ajouté (certaines photos n'ont pas été envoyées)" : "Spot ajouté", failed ? "info" : "success");
            setCreated(spot);
          } catch (e) {
            setFields(fieldErrors(e));
            toast(errorMessage(e), "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
