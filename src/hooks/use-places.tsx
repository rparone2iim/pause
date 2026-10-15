"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { DEFAULT_ORIGIN, withDistance } from "@/lib/geo";
import type { Origin, Place, SpotFilter, Weather } from "@/lib/types";
import { useAuth } from "./use-auth";
import { useUi } from "./use-ui";

type Status = "idle" | "loading" | "ready" | "error";
type GeoStatus = "idle" | "locating" | "granted" | "denied" | "unavailable";

export interface SpotInput {
  name: string;
  type: Place["kind"];
  lat: number;
  lng: number;
  description?: string;
  accessTip?: string;
  address?: string;
  features: Place["features"];
  filters: SpotFilter[];
  quiet: number;
  isPrivate: boolean;
}

interface PlacesValue {
  origin: Origin;
  setOrigin: (o: Origin) => void;
  locate: () => void;
  geoStatus: GeoStatus;
  radius: number;
  setRadius: (m: number) => void;
  places: Place[];
  weather: Weather | null;
  status: Status;
  /** False when OpenStreetMap didn't answer: only community spots are shown. */
  osmAvailable: boolean;
  refresh: () => void;
  getPlace: (id: string) => Place | undefined;
  addSpot: (spot: SpotInput) => Promise<Place>;
  updateSpot: (id: string, patch: Partial<SpotInput>) => Promise<Place>;
  deleteSpot: (id: string) => Promise<void>;
  uploadPhoto: (spotId: string, file: File) => Promise<void>;
}

const ORIGIN_KEY = "pause-origin-v1";

const PlacesContext = createContext<PlacesValue | null>(null);

/** The map: where we search from (origin + radius), the spots and weather around it, and the spot edits. */
export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useUi();
  const { hydrated, authStatus, user, favorites, mySpots, isFavorite, spotSaved, spotDeleted } = useAuth();
  const [origin, setOriginState] = useState<Origin>(DEFAULT_ORIGIN);
  const [radius, setRadius] = useState(800);
  const [rawPlaces, setRawPlaces] = useState<Place[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [osmAvailable, setOsmAvailable] = useState(true);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [reloadKey, setReloadKey] = useState(0);

  // Last map position of this browser.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORIGIN_KEY);
      if (raw) setOriginState({ ...DEFAULT_ORIGIN, ...JSON.parse(raw) });
    } catch {}
  }, []);

  // The radius saved in the profile (on login, and when it is changed in the profile).
  const profileRadius = user?.radiusM;
  useEffect(() => {
    if (profileRadius) setRadius(profileRadius);
  }, [profileRadius]);

  // Logged out: nothing private stays on screen.
  useEffect(() => {
    if (authStatus === "anonymous") setRawPlaces([]);
  }, [authStatus]);

  const setOrigin = useCallback((o: Origin) => {
    setOriginState(o);
    try {
      localStorage.setItem(ORIGIN_KEY, JSON.stringify(o));
    } catch {}
  }, []);

  // Spots + weather around the origin, in the chosen radius. Logged-in users only.
  const { lat, lng } = origin;
  const loggedIn = authStatus === "authenticated";
  useEffect(() => {
    if (!hydrated || !loggedIn) return;
    const ctrl = new AbortController();
    setStatus("loading");
    api<{ weather: Weather }>(`/weather?lat=${lat}&lng=${lng}`, { signal: ctrl.signal })
      .then((r) => setWeather(r.weather))
      .catch(() => {});
    // The free OpenStreetMap servers are sometimes busy: retry twice before giving up.
    const load = async (attempt: number): Promise<void> => {
      try {
        const res = await api<{ data: Place[]; osmAvailable: boolean }>(`/spots?lat=${lat}&lng=${lng}&radius=${radius}`, { signal: ctrl.signal });
        setRawPlaces(res.data);
        setOsmAvailable(res.osmAvailable);
        setStatus("ready");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (e instanceof ApiError && e.status === 401) return;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500));
          if (!ctrl.signal.aborted) return load(attempt + 1);
          return;
        }
        setStatus("error");
      }
    };
    load(0);
    return () => ctrl.abort();
  }, [lat, lng, radius, hydrated, loggedIn, reloadKey]);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGeoStatus("unavailable");
      toast("La géolocalisation n'est pas disponible sur ce navigateur", "error");
      return;
    }
    setGeoStatus("locating");
    // The position is only used to compute distances: it is never stored on the server.
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeoStatus("granted");
        let label = "Ma position";
        try {
          const r = await api<{ data: { label: string }[] }>(`/addresses?lat=${p.lat}&lng=${p.lng}`);
          if (r.data[0]?.label) label = r.data[0].label;
        } catch {}
        setOrigin({ ...p, label, source: "gps" });
      },
      (err) => {
        setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
        toast(err.code === err.PERMISSION_DENIED ? "Position bloquée — affichage autour de l'IIM (La Défense)" : "Impossible d'obtenir ta position", "info");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [setOrigin, toast]);

  const places = useMemo(() => withDistance(origin, rawPlaces).map((p) => ({ ...p, isFavorite: isFavorite(p.id) })), [rawPlaces, origin, isFavorite]);

  const getPlace = useCallback(
    (id: string) => {
      const p = places.find((x) => x.id === id) ?? mySpots.find((x) => x.id === id) ?? favorites.find((x) => x.id === id);
      return p ? withDistance(origin, [p])[0] : undefined;
    },
    [places, mySpots, favorites, origin],
  );

  const addSpot = useCallback(
    async (spot: SpotInput) => {
      const res = await api<{ spot: Place }>("/spots", { method: "POST", body: spot, idempotencyKey: crypto.randomUUID() });
      spotSaved(res.spot);
      setReloadKey((k) => k + 1);
      return res.spot;
    },
    [spotSaved],
  );

  const updateSpot = useCallback(
    async (id: string, patch: Partial<SpotInput>) => {
      const res = await api<{ spot: Place }>(`/spots/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
      spotSaved(res.spot);
      setReloadKey((k) => k + 1);
      return res.spot;
    },
    [spotSaved],
  );

  const deleteSpot = useCallback(
    async (id: string) => {
      await api(`/spots/${encodeURIComponent(id)}`, { method: "DELETE" });
      spotDeleted(id);
      setRawPlaces((s) => s.filter((x) => x.id !== id));
    },
    [spotDeleted],
  );

  const uploadPhoto = useCallback(async (spotId: string, file: File) => {
    const form = new FormData();
    form.append("photo", file);
    await api(`/spots/${encodeURIComponent(spotId)}/photos`, { method: "POST", body: form });
  }, []);

  const value: PlacesValue = {
    origin,
    setOrigin,
    locate,
    geoStatus,
    radius,
    setRadius,
    places,
    weather,
    status,
    osmAvailable,
    refresh: () => setReloadKey((k) => k + 1),
    getPlace,
    addSpot,
    updateSpot,
    deleteSpot,
    uploadPhoto,
  };
  return <PlacesContext.Provider value={value}>{children}</PlacesContext.Provider>;
}

export function usePlaces() {
  const ctx = useContext(PlacesContext);
  if (!ctx) throw new Error("usePlaces must be used inside <PlacesProvider>");
  return ctx;
}
