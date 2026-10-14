"use client";
import dynamic from "next/dynamic";

// Chargement uniquement côté navigateur (Leaflet ne fonctionne pas côté serveur).
const loading = () => <div style={{ height: "100%", background: "var(--line-soft)" }} />;
export const ExploreMap = dynamic(() => import("./maps.impl").then((m) => m.ExploreMap), { ssr: false, loading });
export const MiniMap = dynamic(() => import("./maps.impl").then((m) => m.MiniMap), { ssr: false, loading });
export const PickMap = dynamic(() => import("./maps.impl").then((m) => m.PickMap), { ssr: false, loading });
