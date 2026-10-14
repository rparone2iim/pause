"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken } from "@/lib/client";
import type { Me } from "@/lib/types";

type Ctx = { me: Me | null; loading: boolean; refresh: () => Promise<void>; logout: () => void };
const AuthCtx = createContext<Ctx>({ me: null, loading: true, refresh: async () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (!getToken()) { setMe(null); setLoading(false); return; }
    try { setMe(await api<Me>("/api/me")); } catch { setMe(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const logout = useCallback(() => { clearToken(); setMe(null); router.push("/login"); }, [router]);

  return <AuthCtx.Provider value={{ me, loading, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

/** À utiliser dans les pages privées : redirige vers /login si pas connecté. */
export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!auth.loading && !auth.me) router.replace("/login");
  }, [auth.loading, auth.me, router]);
  return auth;
}
