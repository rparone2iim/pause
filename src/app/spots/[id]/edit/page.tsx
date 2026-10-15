"use client";

import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SpotForm } from "@/components/SpotForm";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage, fieldErrors } from "@/lib/client";
import { usePlaces } from "@/hooks/use-places";
import { useUi } from "@/hooks/use-ui";
import type { SpotDetail } from "@/lib/types";
import { useRequireAuth } from "@/hooks/use-require-auth";

/** Edit a spot — its author only (the API answers 403 to anyone else). */
export default function EditSpotPage() {
  const ready = useRequireAuth();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { updateSpot } = usePlaces();
  const { toast } = useUi();
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ready) return;
    api<{ spot: SpotDetail }>(`/spots/${encodeURIComponent(id)}`)
      .then((r) => setSpot(r.spot))
      .catch(() => setFailed(true));
  }, [ready, id]);

  if (failed || (spot && !spot.isOwner)) {
    return (
      <div className="animate-fade-up flex flex-col items-center justify-center gap-4 py-24 text-center px-4 text-muted-foreground">
        <Lock className="size-10" />
        <p>Seul l&apos;auteur du spot peut le modifier.</p>
        <Button asChild className="rounded-full">
          <Link href={`/spots/${id}`}>Retour au spot</Link>
        </Button>
      </div>
    );
  }

  if (!ready || !spot) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
        <Skeleton className="h-9 w-56 rounded-full" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start rounded-full -ml-2">
        <Link href={`/spots/${id}`}>
          <ArrowLeft /> Retour
        </Link>
      </Button>
      <h1 className="animate-fade-up text-3xl font-bold">Modifier le spot</h1>
      <SpotForm
        spot={spot}
        busy={busy}
        fields={fields}
        onSubmit={async (input) => {
          setBusy(true);
          setFields({});
          try {
            await updateSpot(spot.id, input);
            toast("Spot mis à jour");
            router.push(`/spots/${spot.id}`);
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
