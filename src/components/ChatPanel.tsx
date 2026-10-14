"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError, photoUrl } from "@/lib/client";
import { TYPE_LABELS, type SpotType } from "@/lib/constants";

type ChatSpot = { id: string; name: string; type: SpotType; walkMin: number; distanceM: number; rating: number | null; cover: string | null };
type Msg = { role: "user" | "assistant"; content: string; spots?: ChatSpot[]; mode?: "ai" | "local"; notice?: string; error?: boolean };

const SUGGESTIONS = [
  "Où fumer à l'abri ?",
  "Un café rapide près d'ici",
  "Un coin calme pour souffler",
  "Je suis stressé, un conseil ?",
  "Un étirement de yoga au bureau",
];

const WELCOME: Msg = {
  role: "assistant",
  content: "Salut ! Dis-moi ce dont tu as besoin : un coin fumeur, un café, un banc au calme… ou un petit conseil pour te détendre.",
};

export function ChatPanel(props: { center: { lat: number; lng: number }; radius: number; onPickSpot: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy, open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = msgs.filter((m) => !m.error).slice(-10).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setInput("");
    setBusy(true);
    try {
      const res = await api<{ reply: string; spots: ChatSpot[]; mode: "ai" | "local"; notice?: string }>("/api/assistant", {
        json: { message, history, lat: props.center.lat, lng: props.center.lng, radius: Math.max(props.radius, 800) },
      });
      setMsgs((m) => [...m, { role: "assistant", content: res.reply, spots: res.spots, mode: res.mode, notice: res.notice }]);
    } catch (err) {
      const text = err instanceof ApiError ? err.message : "Je n'arrive pas à répondre pour l'instant.";
      setMsgs((m) => [...m, { role: "assistant", content: text, error: true }]);
    } finally { setBusy(false); }
  }

  if (!open) {
    return <button className="btn chat-fab" onClick={() => setOpen(true)} aria-label="Ouvrir l'assistant">✦ Demander à Pause</button>;
  }

  return (
    <section className="chat-panel card" aria-label="Assistant Pause">
      <header className="chat-head">
        <div>
          <strong>✦ Demander à Pause</strong>
          <div className="muted small">Spots autour de toi et conseils détente</div>
        </div>
        <button className="btn small secondary" onClick={() => setOpen(false)} aria-label="Fermer">✕</button>
      </header>

      <div className="chat-body" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role} ${m.error ? "error" : ""}`}>
            {/* Texte brut : React échappe tout, même si l'IA renvoyait du HTML (anti-XSS) */}
            <p>{m.content}</p>
            {m.spots && m.spots.length > 0 && (
              <div className="chat-spots">
                {m.spots.map((s) => (
                  <div key={s.id} className="chat-spot">
                    <button className="chat-spot-main" onClick={() => props.onPickSpot(s.id)} title="Voir sur la carte">
                      <span className="thumb small-thumb">{s.cover ? <img src={photoUrl(s.cover)} alt="" /> : TYPE_LABELS[s.type].emoji}</span>
                      <span className="chat-spot-text">
                        <strong>{s.name}</strong>
                        <span className="muted small">{s.walkMin} min · {s.distanceM} m{s.rating ? ` · ★ ${s.rating}` : ""}</span>
                      </span>
                    </button>
                    <Link className="small" href={`/spots/${s.id}`}>Fiche →</Link>
                  </div>
                ))}
              </div>
            )}
            {m.notice && <span className="mode-tag">{m.notice}</span>}
            {m.mode === "ai" && <span className="mode-tag">✦ Gemini</span>}
            {m.mode === "local" && !m.notice && <span className="mode-tag">réponse automatique (sans IA)</span>}
          </div>
        ))}
        {busy && <div className="bubble assistant"><p className="muted">…</p></div>}
        <div ref={endRef} />
      </div>

      {msgs.length <= 1 && (
        <div className="chat-suggest">
          {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Ex : un banc à l'ombre pas loin" aria-label="Ton message" />
        <button className="btn" disabled={busy || !input.trim()}>Envoyer</button>
      </form>
      <p className="muted small chat-foot">L&apos;assistant ne connaît pas ta position exacte, seulement les spots proches.</p>
    </section>
  );
}
