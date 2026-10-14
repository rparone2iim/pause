"use client";
import { TYPE_LABELS, TAG_LABELS, type SpotType, type Tag } from "@/lib/constants";

export function TypeBadge({ type }: { type: SpotType }) {
  const t = TYPE_LABELS[type];
  return <span className={`badge ${t.tone}`}>{t.emoji} {t.label}</span>;
}

export function TagList({ tags }: { tags: Tag[] }) {
  return <>{tags.map((t) => <span key={t} className="badge">{TAG_LABELS[t]}</span>)}</>;
}

export function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span>{label}</span>
      <span className="stars" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={n <= value ? "on" : ""} aria-label={`${n} sur 5`} aria-checked={n === value} role="radio" onClick={() => onChange(n)}>★</button>
        ))}
      </span>
    </div>
  );
}

export function ScoreBar({ label, value, tone }: { label: string; value: number | null; tone?: "warm" | "calm" }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span className="num">{value == null ? "—" : `${value} / 5`}</span>
      </div>
      <div className={`bar ${tone ?? ""}`}><span style={{ width: `${((value ?? 0) / 5) * 100}%` }} /></div>
    </div>
  );
}

export function FieldError({ msg }: { msg?: string }) {
  return msg ? <span className="field-error">{msg}</span> : null;
}
