"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Pillar 6: generic error page. No technical detail is ever shown to the user (it is in the server logs).
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center px-4">
      <p className="text-sm font-medium text-brand">Oups</p>
      <h1 className="text-2xl font-bold">Quelque chose s&apos;est mal passé</h1>
      <p className="text-sm text-muted-foreground">Réessaie dans un instant.</p>
      <div className="flex gap-2">
        <Button onClick={reset} className="rounded-full">
          <RotateCcw /> Réessayer
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/">Retour à la carte</Link>
        </Button>
      </div>
    </div>
  );
}
