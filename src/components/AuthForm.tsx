"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, setToken } from "@/lib/client";
import { useAuth } from "./AuthProvider";
import { FieldError } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [form, setForm] = useState({ email: "", password: "", displayName: "" });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    try {
      const body = isRegister ? form : { email: form.email, password: form.password };
      const res = await api<{ token: string }>(`/api/auth/${mode}`, { json: body });
      setToken(res.token);
      await refresh();
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError) { setError(err.message); setFields(err.fields); } else setError("Erreur réseau");
    } finally { setBusy(false); }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <main className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit} noValidate>
        <h1 style={{ fontSize: 26 }}>{isRegister ? "Créer un compte" : "Connexion"}</h1>
        <p className="muted">{isRegister ? "Trouve les meilleurs spots de pause autour de toi." : "Content de te revoir."}</p>
        {error && <div className="alert" role="alert">{error}</div>}
        {isRegister && (
          <label className="field">Pseudo
            <input className="input" value={form.displayName} onChange={set("displayName")} autoComplete="nickname" required maxLength={40} />
            <FieldError msg={fields.displayName} />
          </label>
        )}
        <label className="field">Email
          <input className="input" type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
          <FieldError msg={fields.email} />
        </label>
        <label className="field">Mot de passe
          <input className="input" type="password" value={form.password} onChange={set("password")} autoComplete={isRegister ? "new-password" : "current-password"} required />
          {isRegister && <span className="muted small">10 caractères minimum, avec au moins une lettre et un chiffre.</span>}
          <FieldError msg={fields.password} />
        </label>
        <button className="btn block" disabled={busy}>{busy ? "…" : isRegister ? "Créer mon compte" : "Se connecter"}</button>
        <p className="muted small" style={{ textAlign: "center" }}>
          {isRegister ? <>Déjà un compte ? <Link href="/login">Connexion</Link></> : <>Pas encore de compte ? <Link href="/register">Inscris-toi</Link></>}
        </p>
      </form>
    </main>
  );
}
