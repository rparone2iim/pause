"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/components/AuthProvider";
import { ExploreMap } from "@/components/maps";
import { TypeBadge } from "@/components/ui";
import { ChatPanel } from "@/components/ChatPanel";
import { api, DEFAULT_CENTER, locate, photoUrl } from "@/lib/client";
import { SPOT_TYPES, TYPE_LABELS, type SpotType } from "@/lib/constants";
import type { SpotSummary } from "@/lib/types";

const RADII = [300, 500, 800, 1500, 3000];

export default function ExplorePage() {
  const { me } = useRequireAuth();
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [radius, setRadius] = useState(800);
  const [types, setTypes] = useState<Set<SpotType>>(new Set());
  const [spots, setSpots] = useState<SpotSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Préférences du profil = filtres par défaut
  useEffect(() => {
    if (!me) return;
    setRadius(me.radiusM);
    setTypes(new Set(me.preferredTypes));
  }, [me]);

  useEffect(() => { void locate().then((p) => { setCenter(p); setMapCenter(p); }); }, []);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ lat: center.lat.toFixed(6), lng: center.lng.toFixed(6), radius: String(radius) });
      setSpots((await api<{ spots: SpotSummary[] }>(`/api/spots?${q}`)).spots);
    } finally { setLoading(false); }
  }, [me, center, radius]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => (types.size ? spots.filter((s) => types.has(s.type)) : spots), [spots, types]);
  const toggle = (t: SpotType) => setTypes((prev) => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const movedAway = Math.abs(mapCenter.lat - center.lat) > 0.001 || Math.abs(mapCenter.lng - center.lng) > 0.001;

  if (!me) return null;
  return (
    <main className="explore">
      <section className="explore-list" aria-label="Spots à proximité">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Pauses à proximité</h2>
          <select className="input" style={{ width: "auto", minHeight: 32, padding: "4px 8px" }} value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Rayon">
            {RADII.map((r) => <option key={r} value={r}>{r < 1000 ? `${r} m` : `${r / 1000} km`} (~{Math.round(r / 80)} min)</option>)}
          </select>
        </div>
        <div className="row">
          <button className="chip" aria-pressed={types.size === 0} onClick={() => setTypes(new Set())}>Tous ({spots.length})</button>
          {SPOT_TYPES.map((t) => (
            <button key={t} className="chip" aria-pressed={types.has(t)} onClick={() => toggle(t)}>
              {TYPE_LABELS[t].emoji} {TYPE_LABELS[t].label} ({spots.filter((s) => s.type === t).length})
            </button>
          ))}
        </div>
        {loading && <p className="muted">Recherche…</p>}
        {!loading && visible.length === 0 && (
          <div className="empty card">
            <p>Aucun spot dans ce périmètre.</p>
            <p className="small" style={{ margin: "8px 0 12px" }}>Agrandis le rayon, déplace la carte, ou ajoute le premier !</p>
            <Link className="btn small" href="/spots/new">+ Ajouter un spot</Link>
          </div>
        )}
        {visible.map((s) => (
          <article key={s.id} className={`card spot-card ${selected === s.id ? "selected" : ""}`} onClick={() => setSelected(s.id)}>
            <div className="thumb">
              {s.cover ? <img src={photoUrl(s.cover)} alt="" loading="lazy" /> : TYPE_LABELS[s.type].emoji}
            </div>
            <div className="body">
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <h3 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</h3>
                <span className="pill-walk num">{s.walkMin} min</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <TypeBadge type={s.type} />
                <span className="muted small num">{s.distanceM} m · {s.rating ? `★ ${s.rating} (${s.reviewCount})` : "pas encore noté"}{s.isFavorite ? " · ♥" : ""}</span>
              </div>
              <p className="desc">{s.description}</p>
              <Link href={`/spots/${s.id}`} className="small" style={{ fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>Voir la fiche →</Link>
            </div>
          </article>
        ))}
      </section>
      <section className="explore-map" aria-label="Carte">
        <ExploreMap center={center} radius={radius} spots={visible} selectedId={selected} onSelect={setSelected} onMove={setMapCenter} />
        <div className="map-floating">
          {movedAway && <button className="btn small" onClick={() => setCenter(mapCenter)}>Chercher dans cette zone</button>}
          <button className="btn small secondary" onClick={() => void locate().then((p) => { setCenter(p); setMapCenter(p); })}>◎ Ma position</button>
        </div>
        <ChatPanel center={center} radius={radius} onPickSpot={(id) => { setTypes(new Set()); setSelected(id); }} />
      </section>
    </main>
  );
}
