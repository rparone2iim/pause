"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast as sonner } from "sonner";
import { api, ApiError, endSession, errorMessage, onSessionExpired, refreshSession, setSession } from "./client";
import { DEFAULT_ORIGIN, withDistance } from "./geo";
import type { Origin, Place, Session, SpotFilter, User, Weather } from "./types";

type Theme = "light" | "dark";
type Status = "idle" | "loading" | "ready" | "error";
type GeoStatus = "idle" | "locating" | "granted" | "denied" | "unavailable";
type AuthStatus = "checking" | "anonymous" | "authenticated";
type ToastKind = "success" | "error" | "info";

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

interface StoreValue {
  hydrated: boolean;
  // auth (the AuthProvider part: profile loaded at start-up, shared with every page)
  user: User | null;
  authStatus: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, "displayName" | "preferredTypes" | "radiusM">>) => Promise<void>;
  // map
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
  // account data
  favorites: Place[];
  mySpots: Place[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (place: Place) => void;
  addSpot: (spot: SpotInput) => Promise<Place>;
  updateSpot: (id: string, patch: Partial<SpotInput>) => Promise<Place>;
  deleteSpot: (id: string) => Promise<void>;
  uploadPhoto: (spotId: string, file: File) => Promise<void>;
  reloadMe: () => Promise<void>;
  // ui
  theme: Theme;
  toggleTheme: () => void;
  toast: (message: string, kind?: ToastKind) => void;
  askOpen: boolean;
  setAskOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

const ORIGIN_KEY = "pause-origin-v1";

const StoreContext = createContext<StoreValue | null>(null);

/**
 * Set while the user logs out / deletes the account on purpose, so private-page guards
 * don't bounce them to the login page with a "come back to" link while the app navigates.
 */
export const intentionalSignOut = { active: false };

function markSignOut() {
  intentionalSignOut.active = true;
  setTimeout(() => (intentionalSignOut.active = false), 1500);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [askOpen, setAskOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [favorites, setFavorites] = useState<Place[]>([]);
  const [mySpots, setMySpots] = useState<Place[]>([]);

  const [origin, setOriginState] = useState<Origin>(DEFAULT_ORIGIN);
  const [radius, setRadius] = useState(800);
  const radiusFromProfile = useRef(false);
  const [rawPlaces, setRawPlaces] = useState<Place[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [osmAvailable, setOsmAvailable] = useState(true);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [reloadKey, setReloadKey] = useState(0);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    sonner[kind](message);
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    setUser(null);
    setFavorites([]);
    setMySpots([]);
    setRawPlaces([]);
    radiusFromProfile.current = false;
    setAuthStatus("anonymous");
  }, []);

  // A session that can no longer be renewed (logged out elsewhere, expired, revoked) ends here; client.ts sends the user to /login.
  useEffect(() => onSessionExpired(clearSession), [clearSession]);

  const reloadMe = useCallback(async () => {
    const me = await api<{ user: User; favorites: Place[]; spots: Place[] }>("/me");
    setUser(me.user);
    setFavorites(me.favorites);
    setMySpots(me.spots);
    if (!radiusFromProfile.current) {
      radiusFromProfile.current = true;
      setRadius(me.user.radiusM);
    }
    setAuthStatus("authenticated");
  }, []);

  // Start-up: theme, last map position, and the stored session (profile loaded once, shared by all pages).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORIGIN_KEY);
      if (raw) setOriginState({ ...DEFAULT_ORIGIN, ...JSON.parse(raw) });
    } catch {}
    let storedTheme: string | null = null;
    try {
      storedTheme = localStorage.getItem("pause-theme");
    } catch {}
    const dark = storedTheme ? storedTheme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
    setTheme(dark ? "dark" : "light");

    // The access token lives in memory only: on each visit, the HttpOnly refresh cookie gives a new one (or not).
    refreshSession().then((loggedIn) => {
      if (!loggedIn) return clearSession();
      reloadMe().catch((e) => {
        if (e instanceof ApiError && e.status === 401) clearSession();
        else setAuthStatus("authenticated"); // keep the session on transient errors
      });
    });
    setHydrated(true);
  }, [clearSession, reloadMe]);

  const startSession = useCallback(
    async (s: Session) => {
      setSession(s);
      setUser(s.user);
      await reloadMe().catch(() => setAuthStatus("authenticated"));
    },
    [reloadMe],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      startSession(await api<Session>("/sessions", { method: "POST", body: { email, password } }));
    },
    [startSession],
  );

  const register = useCallback(
    async (displayName: string, email: string, password: string) => {
      startSession(await api<Session>("/users", { method: "POST", body: { displayName, email, password } }));
    },
    [startSession],
  );

  const logout = useCallback(async () => {
    try {
      await endSession();
    } catch {}
    markSignOut();
    clearSession();
    sonner.info("Tu es déconnecté.");
  }, [clearSession]);

  const deleteAccount = useCallback(async () => {
    await api("/me", { method: "DELETE" });
    markSignOut();
    clearSession();
  }, [clearSession]);

  const updateProfile = useCallback(
    async (patch: Partial<Pick<User, "displayName" | "preferredTypes" | "radiusM">>) => {
      if (!user) return;
      const previous = user;
      setUser({ ...user, ...patch }); // optimistic, rolled back if the API refuses
      if (patch.radiusM) setRadius(patch.radiusM);
      try {
        const res = await api<{ user: User }>("/me", { method: "PATCH", body: patch });
        setUser(res.user);
      } catch (e) {
        setUser(previous);
        throw e;
      }
    },
    [user],
  );

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

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);
  const places = useMemo(
    () => withDistance(origin, rawPlaces).map((p) => ({ ...p, isFavorite: favoriteIds.has(p.id) })),
    [rawPlaces, origin, favoriteIds],
  );

  const getPlace = useCallback(
    (id: string) => {
      const p = places.find((x) => x.id === id) ?? mySpots.find((x) => x.id === id) ?? favorites.find((x) => x.id === id);
      return p ? withDistance(origin, [p])[0] : undefined;
    },
    [places, mySpots, favorites, origin],
  );

  const isFavorite = useCallback((id: string) => favoriteIds.has(id), [favoriteIds]);

  const toggleFavorite = useCallback(
    (place: Place) => {
      const was = favoriteIds.has(place.id);
      const previous = favorites;
      setFavorites(was ? favorites.filter((f) => f.id !== place.id) : [{ ...place, isFavorite: true }, ...favorites]);
      api(`/spots/${encodeURIComponent(place.id)}/favorite`, { method: was ? "DELETE" : "PUT" })
        .then(() => toast(was ? "Retiré des favoris" : "Ajouté aux favoris", was ? "info" : "success"))
        .catch((e) => {
          setFavorites(previous);
          toast(errorMessage(e), "error");
        });
    },
    [favoriteIds, favorites, toast],
  );

  const addSpot = useCallback(async (spot: SpotInput) => {
    const res = await api<{ spot: Place }>("/spots", { method: "POST", body: spot, idempotencyKey: crypto.randomUUID() });
    setMySpots((s) => [res.spot, ...s]);
    setReloadKey((k) => k + 1);
    return res.spot;
  }, []);

  const updateSpot = useCallback(async (id: string, patch: Partial<SpotInput>) => {
    const res = await api<{ spot: Place }>(`/spots/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
    setMySpots((s) => s.map((x) => (x.id === id ? { ...x, ...res.spot } : x)));
    setReloadKey((k) => k + 1);
    return res.spot;
  }, []);

  const deleteSpot = useCallback(async (id: string) => {
    await api(`/spots/${encodeURIComponent(id)}`, { method: "DELETE" });
    setMySpots((s) => s.filter((x) => x.id !== id));
    setFavorites((s) => s.filter((x) => x.id !== id));
    setRawPlaces((s) => s.filter((x) => x.id !== id));
  }, []);

  const uploadPhoto = useCallback(async (spotId: string, file: File) => {
    const form = new FormData();
    form.append("photo", file);
    await api(`/spots/${encodeURIComponent(spotId)}/photos`, { method: "POST", body: form });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem("pause-theme", next);
      } catch {}
      return next;
    });
  }, []);

  const value: StoreValue = {
    hydrated,
    user,
    authStatus,
    login,
    register,
    logout,
    deleteAccount,
    updateProfile,
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
    favorites,
    mySpots,
    isFavorite,
    toggleFavorite,
    addSpot,
    updateSpot,
    deleteSpot,
    uploadPhoto,
    reloadMe,
    theme,
    toggleTheme,
    toast,
    askOpen,
    setAskOpen,
    searchOpen,
    setSearchOpen,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
