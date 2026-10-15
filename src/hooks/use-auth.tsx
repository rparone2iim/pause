"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError, endSession, errorMessage, onSessionExpired, refreshSession, setSession } from "@/lib/client";
import type { Place, Session, User } from "@/lib/types";
import { useUi } from "./use-ui";

type AuthStatus = "checking" | "anonymous" | "authenticated";
export type ProfilePatch = Partial<Pick<User, "displayName" | "preferredTypes" | "radiusM">>;

interface AuthValue {
  /** True once the app runs in the browser (before that, nothing is known about the session). */
  hydrated: boolean;
  user: User | null;
  authStatus: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
  /** Reloads the profile, favorites and own spots (GET /me). */
  reloadMe: () => Promise<void>;
  // The account's data, loaded with the profile
  favorites: Place[];
  mySpots: Place[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (place: Place) => void;
  /** Called by usePlaces after a spot is created, edited or deleted, so the profile lists stay right. */
  spotSaved: (spot: Place) => void;
  spotDeleted: (id: string) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Set while the user logs out / deletes the account on purpose, so private-page guards
 * don't bounce them to the login page with a "come back to" link while the app navigates.
 */
export const intentionalSignOut = { active: false };

function markSignOut() {
  intentionalSignOut.active = true;
  setTimeout(() => (intentionalSignOut.active = false), 1500);
}

/**
 * The session and the account: who is logged in, their profile, favorites and spots.
 * The access token itself is not here: it stays inside src/lib/client.ts, in memory only.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useUi();
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [favorites, setFavorites] = useState<Place[]>([]);
  const [mySpots, setMySpots] = useState<Place[]>([]);

  const clearSession = useCallback(() => {
    setSession(null);
    setUser(null);
    setFavorites([]);
    setMySpots([]);
    setAuthStatus("anonymous");
  }, []);

  // A session that can no longer be renewed (logged out elsewhere, expired, revoked) ends here; client.ts sends the user to /login.
  useEffect(() => onSessionExpired(clearSession), [clearSession]);

  const reloadMe = useCallback(async () => {
    const me = await api<{ user: User; favorites: Place[]; spots: Place[] }>("/me");
    setUser(me.user);
    setFavorites(me.favorites);
    setMySpots(me.spots);
    setAuthStatus("authenticated");
  }, []);

  // Start-up: the access token lives in memory only, so on each visit the HttpOnly refresh cookie gives a new one (or not).
  useEffect(() => {
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
    toast("Tu es déconnecté.", "info");
  }, [clearSession, toast]);

  const deleteAccount = useCallback(async () => {
    await api("/me", { method: "DELETE" });
    markSignOut();
    clearSession();
  }, [clearSession]);

  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      if (!user) return;
      const previous = user;
      setUser({ ...user, ...patch }); // optimistic, rolled back if the API refuses
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

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);
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

  const spotSaved = useCallback((spot: Place) => {
    setMySpots((list) => (list.some((x) => x.id === spot.id) ? list.map((x) => (x.id === spot.id ? { ...x, ...spot } : x)) : [spot, ...list]));
  }, []);

  const spotDeleted = useCallback((id: string) => {
    setMySpots((list) => list.filter((x) => x.id !== id));
    setFavorites((list) => list.filter((x) => x.id !== id));
  }, []);

  const value: AuthValue = {
    hydrated,
    user,
    authStatus,
    login,
    register,
    logout,
    deleteAccount,
    updateProfile,
    reloadMe,
    favorites,
    mySpots,
    isFavorite,
    toggleFavorite,
    spotSaved,
    spotDeleted,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
