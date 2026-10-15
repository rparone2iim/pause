"use client";

import { usePathname } from "next/navigation";

export function Footer() {
  // The map page fills the screen: no footer there.
  if (usePathname() === "/") return null;
  return (
    <footer className="w-full px-4 md:px-8 py-6 flex items-center justify-between text-xs text-muted-foreground">
      <span className="font-heading text-sm font-semibold text-foreground">Pause</span>
      <span>Données © Google Maps · OpenStreetMap · Open-Meteo</span>
    </footer>
  );
}
