"use client";
/*
 * Client HTTP du front.
 * Pilier 7 : le JWT est envoyé dans le header "Authorization: Bearer …" (jamais dans un cookie).
 * Le navigateur ne l'ajoute donc JAMAIS tout seul → une attaque CSRF (un site tiers qui déclenche
 * une requête vers notre API) arrive sans token et est rejetée en 401.
 */
const KEY = "pause_token";

export function getToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setToken(t: string) {
  try { localStorage.setItem(KEY, t); } catch { /* navigation privée */ }
}
export function clearToken() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}) {
    super(message);
  }
}

type Opts = { method?: string; json?: unknown; form?: FormData };

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.json); }
  if (opts.form) body = opts.form;

  const res = await fetch(path, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });

  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    clearToken();
    window.location.href = "/login";
    throw new ApiError(401, "Session expirée");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? "Erreur", data?.error?.fields ?? {});
  return data as T;
}

export const photoUrl = (filename: string) => `/api/photos/${encodeURIComponent(filename)}`;
export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;

/** Position par défaut si le navigateur refuse la géoloc : Paris La Défense (Grande Arche). */
export const DEFAULT_CENTER = { lat: 48.8925, lng: 2.2361 };

export function locate(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(DEFAULT_CENTER);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(DEFAULT_CENTER),
      { enableHighAccuracy: true, timeout: 6000 },
    );
  });
}
