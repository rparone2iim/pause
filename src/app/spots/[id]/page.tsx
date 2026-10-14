"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/components/AuthProvider";
import { MiniMap } from "@/components/maps";
import { ScoreBar, StarInput, TagList, TypeBadge, FieldError } from "@/components/ui";
import { api, ApiError, directionsUrl, photoUrl } from "@/lib/client";
import { MAX_PHOTOS_PER_SPOT, TYPE_LABELS } from "@/lib/constants";
import type { SpotDetail } from "@/lib/types";

export default function SpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useRequireAuth();
  const router = useRouter();
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try { setSpot(await api<SpotDetail>(`/api/spots/${encodeURIComponent(id)}`)); }
    catch (e) { if (e instanceof ApiError && e.status === 404) setNotFound(true); }
  }, [id]);
  useEffect(() => { if (me) void load(); }, [me, load]);

  if (!me) return null;
  if (notFound) return <main className="page empty"><h2>Spot introuvable</h2><p style={{ marginTop: 12 }}><Link href="/">← Retour à la carte</Link></p></main>;
  if (!spot) return <main className="page muted">Chargement…</main>;

  const tone = TYPE_LABELS[spot.type].tone;

  async function toggleFav() {
    await api(`/api/spots/${spot!.id}/favorite`, { method: spot!.isFavorite ? "DELETE" : "PUT" });
    await load();
  }
  async function remove() {
    if (!confirm("Supprimer ce spot définitivement ?")) return;
    await api(`/api/spots/${spot!.id}`, { method: "DELETE" });
    router.push("/");
  }
  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("photo", file);
    try { await api(`/api/spots/${spot!.id}/photos`, { form }); setMsg({ ok: true, text: "Photo ajoutée" }); await load(); }
    catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Échec de l'envoi" }); }
  }
  async function deletePhoto(filename: string) {
    await api(`/api/photos/${encodeURIComponent(filename)}`, { method: "DELETE" });
    await load();
  }

  const pics = spot.photos.slice(0, 3);
  return (
    <main className="page stack" style={{ gap: 20 }}>
      <nav className="small"><Link href="/">← Retour à la carte</Link></nav>

      <div className={`gallery ${pics.length <= 1 ? "single" : ""}`}>
        {pics.length === 0 && <div aria-hidden>{TYPE_LABELS[spot.type].emoji}</div>}
        {pics.map((p, i) => (
          <div key={p.filename} style={pics.length === 2 && i === 1 ? { gridRow: "span 2" } : undefined}>
            <img src={photoUrl(p.filename)} alt={`Photo ${i + 1} de ${spot.name}`} />
            {(p.mine || spot.isOwner) && <button className="btn small secondary photo-del" onClick={() => deletePhoto(p.filename)}>Retirer</button>}
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="stack" style={{ gap: 16 }}>
          <section className="card stack">
            <div className="row"><TypeBadge type={spot.type} /><TagList tags={spot.tags} /></div>
            <h1>{spot.name}</h1>
            <p style={{ fontSize: 15, whiteSpace: "pre-line" }}>{spot.description}</p>
            {spot.accessTip && <div className="tip"><strong>Comment y aller : </strong>{spot.accessTip}</div>}
            <p className="muted small">Ajouté par {spot.authorName} · {new Date(spot.createdAt).toLocaleDateString("fr-FR")}</p>
          </section>

          <div className="row">
            <a className="btn" href={directionsUrl(spot.lat, spot.lng)} target="_blank" rel="noopener noreferrer">➤ Y aller à pied</a>
            <button className="btn secondary" onClick={toggleFav}>{spot.isFavorite ? "♥ Dans mes favoris" : "♡ Ajouter aux favoris"}</button>
            {spot.photos.length < MAX_PHOTOS_PER_SPOT && (
              <label className="btn secondary">＋ Photo<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={addPhoto} /></label>
            )}
            {spot.isOwner && <button className="btn danger" onClick={remove}>Supprimer</button>}
          </div>
          {msg && <div className={`alert ${msg.ok ? "ok" : ""}`}>{msg.text}</div>}

          <section className="card stack">
            <div className="card-title">Avis ({spot.averages.count})</div>
            {spot.reviews.length === 0 && <p className="muted">Pas encore d&apos;avis. Sois le premier !</p>}
            {spot.reviews.map((r) => (
              <div key={r.id} className="review stack" style={{ gap: 4 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{r.authorName}{r.mine ? " (toi)" : ""}</strong>
                  <span className="muted small">{new Date(r.updatedAt).toLocaleDateString("fr-FR")}</span>
                </div>
                <span className="small muted num">★ {r.rating} · calme {r.calm} · propreté {r.clean} · assis {r.seating}</span>
                {r.comment && <p>{r.comment}</p>}
              </div>
            ))}
          </section>
        </div>

        <aside className="stack" style={{ gap: 16 }}>
          <section className="card stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="card-title" style={{ margin: 0 }}>Note de la pause</div>
              <strong style={{ color: "var(--warm)", fontSize: 18 }}>{spot.averages.rating ? `★ ${spot.averages.rating}` : "—"}</strong>
            </div>
            <ScoreBar label="Calme" value={spot.averages.calm} tone="calm" />
            <ScoreBar label="Propreté" value={spot.averages.clean} />
            <ScoreBar label="Places assises" value={spot.averages.seating} tone="warm" />
          </section>
          <ReviewForm spot={spot} onDone={load} />
          <section className="card">
            <div className="card-title">Emplacement</div>
            <div className="mini-map"><MiniMap point={spot} tone={tone} /></div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function ReviewForm({ spot, onDone }: { spot: SpotDetail; onDone: () => Promise<void> }) {
  const mine = spot.reviews.find((r) => r.mine);
  const [v, setV] = useState({ rating: mine?.rating ?? 0, calm: mine?.calm ?? 0, clean: mine?.clean ?? 0, seating: mine?.seating ?? 0, comment: mine?.comment ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const complete = v.rating && v.calm && v.clean && v.seating;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setFields({});
    try {
      await api(`/api/spots/${spot.id}/reviews`, { method: "PUT", json: { ...v, comment: v.comment || undefined } });
      await onDone();
    } catch (e) { if (e instanceof ApiError) { setErr(e.message); setFields(e.fields); } }
    finally { setBusy(false); }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="card-title" style={{ margin: 0 }}>{mine ? "Modifier mon avis" : "Laisser un avis"}</div>
      <StarInput label="Note globale" value={v.rating} onChange={(n) => setV({ ...v, rating: n })} />
      <StarInput label="Calme" value={v.calm} onChange={(n) => setV({ ...v, calm: n })} />
      <StarInput label="Propreté" value={v.clean} onChange={(n) => setV({ ...v, clean: n })} />
      <StarInput label="Places assises" value={v.seating} onChange={(n) => setV({ ...v, seating: n })} />
      <textarea className="input" placeholder="Ton expérience : ambiance, cendrier, attente au café…" maxLength={500} value={v.comment} onChange={(e) => setV({ ...v, comment: e.target.value })} />
      <FieldError msg={fields.comment} />
      {err && <div className="alert">{err}</div>}
      <button className="btn" disabled={!complete || busy}>{mine ? "Mettre à jour" : "Publier mon avis"}</button>
    </form>
  );
}
