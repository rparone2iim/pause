"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

/*
 * Leaflet needs `window`, which only exists in the browser: the maps are loaded with
 * next/dynamic and `ssr: false`. The real code is in maps.impl.tsx.
 */

function MapLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-map-bg text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}

export const ExploreMap = dynamic(() => import("./maps.impl").then((m) => m.ExploreMap), { ssr: false, loading: MapLoading });
export const MiniMap = dynamic(() => import("./maps.impl").then((m) => m.MiniMap), { ssr: false, loading: MapLoading });
export const PickMap = dynamic(() => import("./maps.impl").then((m) => m.PickMap), { ssr: false, loading: MapLoading });
