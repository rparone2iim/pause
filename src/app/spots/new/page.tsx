"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/components/AuthProvider";
import { PickMap } from "@/components/maps";
import { FieldError } from "@/components/ui";
import { api, ApiError, DEFAULT_CENTER, locate } from "@/lib/client";
import { MAX_PHOTOS_PER_SPOT, MAX_PHOTO_BYTES, SPOT_TYPES, TAGS, TAG_LABELS, TYPE_LABELS, type SpotType, type Tag } from "@/lib/constants";

const TYPE_HINTS: Record<SpotType, string> = {
  SMOKING: "Cendrier, à l'écart, autorisé",
  CAFE: "Café rapide, à emporter",
  BENCH: "Banc, verdure, calme",
  SHELTER: "À l'abri de la pluie / du vent",
};

export default function NewSpotPage() {
  const { me } = useRequireAuth();
  const router = useRouter();
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [form, setForm] = useState({ name: "", description: "", accessTip: "", type: "" as SpotType | "" });
  const [tags, setTags] = useState<Set<Tag>>(new Set());
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { void locate().then((p) => { setCenter(p); setPos(p); }); }, []);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []).filter((f) => f.size <= MAX_PHOTO_BYTES).slice(0, MAX_PHOTOS_PER_SPOT);
    setFiles(list);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pos) { setErr("Clique sur la carte pour placer le spot"); return; }
    setBusy(true); setErr(null); setFields({});
    try {
      const { id } = await api<{ id: string }>("/api/spots", {
        json: {
          name: form.name, description: form.description, type: form.type || undefined,
          accessTip: form.accessTip || undefined, tags: [...tags], lat: pos.lat, lng: pos.lng,
        },
      });
      for (const f of files) {
        const fd = new FormData();
        fd.append("photo", f);
        await api(`/api/spots/${id}/photos`, { form: fd }).catch(() => {}); // une photo refusée n'annule pas le spot
      }
      router.push(`/spots/${id}`);
    } catch (e) {
      if (e instanceof ApiError) { setErr(e.message); setFields(e.fields); } else setErr("Erreur réseau");
      setBusy(false);
    }
  }

  if (!me) return null;
  const set = (k: "name" | "description" | "accessTip") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <main className="page">
      <form className="stack" style={{ gap: 20, maxWidth: 760, margin: "0 auto" }} onSubmit={submit} noValidate>
        <div className="stack" style={{ gap: 4 }}>
          <h1>Ajouter un spot de pause</h1>
          <p className="muted">Aide les autres à trouver un coin fumeur, un bon café ou un banc tranquille.</p>
        </div>

        <section className="card stack">
          <div className="card-title" style={{ margin: 0 }}>1 · Emplacement</div>
          <p className="muted small">Clique sur la carte pour placer le point exact.</p>
          <div className="pick-map"><PickMap center={center} value={pos} onPick={setPos} /></div>
          <FieldError msg={fields.lat || fields.lng} />
        </section>

        <section className="card stack">
          <div className="card-title" style={{ margin: 0 }}>2 · Type de pause</div>
          <div className="type-grid" role="radiogroup">
            {SPOT_TYPES.map((t) => (
              <button type="button" key={t} role="radio" aria-checked={form.type === t} className="type-option" onClick={() => setForm({ ...form, type: t })}>
                <div style={{ fontSize: 22 }}>{TYPE_LABELS[t].emoji}</div>
                <strong>{TYPE_LABELS[t].label}</strong>
                <div className="muted small">{TYPE_HINTS[t]}</div>
              </button>
            ))}
          </div>
          <FieldError msg={fields.type} />
          <div className="card-title" style={{ margin: "8px 0 0" }}>Équipements</div>
          <div className="row">
            {TAGS.map((t) => (
              <button type="button" key={t} className="chip" aria-pressed={tags.has(t)}
                onClick={() => setTags((p) => { const n = new Set(p); if (n.has(t)) n.delete(t); else n.add(t); return n; })}>
                {TAG_LABELS[t]}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack">
          <div className="card-title" style={{ margin: 0 }}>3 · Description</div>
          <label className="field">Nom du spot
            <input className="input" value={form.name} onChange={set("name")} maxLength={80} placeholder="Ex : Banc sous les platanes, derrière la médiathèque" />
            <FieldError msg={fields.name} />
          </label>
          <label className="field">Pourquoi c&apos;est une bonne pause ?
            <textarea className="input" value={form.description} onChange={set("description")} maxLength={1000} placeholder="Calme, à l'ombre l'après-midi, cendrier propre…" />
            <FieldError msg={fields.description} />
          </label>
          <label className="field">Comment le trouver (optionnel)
            <input className="input" value={form.accessTip} onChange={set("accessTip")} maxLength={300} placeholder="Passe sous l'arche, c'est juste à gauche de l'escalier" />
            <FieldError msg={fields.accessTip} />
          </label>
        </section>

        <section className="card stack">
          <div className="card-title" style={{ margin: 0 }}>4 · Photos (optionnel)</div>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={pickFiles} />
          <p className="muted small">JPEG, PNG ou WebP · 5 Mo max · {MAX_PHOTOS_PER_SPOT} photos max. La position GPS cachée dans tes photos est supprimée automatiquement.</p>
          {previews.length > 0 && <div className="previews">{previews.map((u) => <img key={u} src={u} alt="" />)}</div>}
        </section>

        {err && <div className="alert" role="alert">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? "Publication…" : "Publier le spot"}</button>
      </form>
    </main>
  );
}
