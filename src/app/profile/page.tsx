"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/components/AuthProvider";
import { FieldError, TagList, TypeBadge } from "@/components/ui";
import { api, ApiError, directionsUrl } from "@/lib/client";
import { SPOT_TYPES, TYPE_LABELS, type SpotType } from "@/lib/constants";

export default function ProfilePage() {
  const { me, refresh, logout } = useRequireAuth();
  const [name, setName] = useState("");
  const [types, setTypes] = useState<Set<SpotType>>(new Set());
  const [radius, setRadius] = useState(800);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!me) return;
    setName(me.displayName); setTypes(new Set(me.preferredTypes)); setRadius(me.radiusM);
  }, [me]);

  if (!me) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null); setFields({});
    try {
      await api("/api/me", { method: "PATCH", json: { displayName: name, preferredTypes: [...types], radiusM: radius } });
      await refresh();
      setMsg({ ok: true, text: "Préférences enregistrées" });
    } catch (err) { if (err instanceof ApiError) { setMsg({ ok: false, text: err.message }); setFields(err.fields); } }
  }
  async function unfav(id: string) {
    await api(`/api/spots/${id}/favorite`, { method: "DELETE" });
    await refresh();
  }

  return (
    <main className="page stack" style={{ gap: 24 }}>
      <section className="card row" style={{ gap: 16 }}>
        <div className="logo-mark" style={{ width: 56, height: 56, fontSize: 22, borderRadius: 12 }}>{me.displayName.slice(0, 1).toUpperCase()}</div>
        <div className="stack" style={{ gap: 2 }}>
          <h1 style={{ fontSize: 24 }}>{me.displayName}</h1>
          <span className="muted">{me.email} · rayon {me.radiusM} m (~{Math.round(me.radiusM / 80)} min à pied)</span>
        </div>
        <button className="btn secondary small" style={{ marginLeft: "auto" }} onClick={logout}>Déconnexion</button>
      </section>

      <div className="grid-2" style={{ gridTemplateColumns: "360px minmax(0,1fr)" }}>
        <form className="card stack" onSubmit={save}>
          <h2>Mes préférences de pause</h2>
          <p className="muted small">Servent de filtres par défaut sur la carte.</p>
          <label className="field">Pseudo
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            <FieldError msg={fields.displayName} />
          </label>
          <div className="stack" style={{ gap: 6 }}>
            <span style={{ fontWeight: 500 }}>Types préférés</span>
            <div className="row">
              {SPOT_TYPES.map((t) => (
                <button type="button" key={t} className="chip" aria-pressed={types.has(t)}
                  onClick={() => setTypes((p) => { const n = new Set(p); if (n.has(t)) n.delete(t); else n.add(t); return n; })}>
                  {TYPE_LABELS[t].emoji} {TYPE_LABELS[t].label}
                </button>
              ))}
            </div>
          </div>
          <label className="field">Distance max à pied
            <select className="input" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
              {[300, 500, 800, 1500, 3000].map((r) => <option key={r} value={r}>{r} m (~{Math.round(r / 80)} min)</option>)}
            </select>
          </label>
          {msg && <div className={`alert ${msg.ok ? "ok" : ""}`}>{msg.text}</div>}
          <button className="btn">Enregistrer</button>
        </form>

        <section className="stack">
          <h2>Mes spots favoris ({me.favorites.length})</h2>
          {me.favorites.length === 0 && <div className="card empty">Aucun favori pour l&apos;instant. Ajoute-en depuis une fiche spot.</div>}
          <div className="stack">
            {me.favorites.map((s) => (
              <article key={s.id} className="card stack" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h3><Link href={`/spots/${s.id}`}>{s.name}</Link></h3>
                  <TypeBadge type={s.type} />
                </div>
                <div className="row"><TagList tags={s.tags} /></div>
                <div className="row">
                  <a className="btn small" href={directionsUrl(s.lat, s.lng)} target="_blank" rel="noopener noreferrer">➤ Itinéraire</a>
                  <button className="btn small secondary" onClick={() => unfav(s.id)}>Retirer</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
