"use client";

import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthCard, FieldError } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, fieldErrors } from "@/lib/client";
import { safeNext } from "@/lib/auth-redirect";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const RULES = [
  { label: "10 caractères minimum", test: (p: string) => p.length >= 10 },
  { label: "Une lettre", test: (p: string) => /[A-Za-z]/.test(p) },
  { label: "Un chiffre", test: (p: string) => /\d/.test(p) },
];

function RegisterForm() {
  const { register, authStatus, toast } = useStore();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (authStatus === "authenticated") router.replace(next);
  }, [authStatus, next, router]);

  const valid = name.trim().length >= 2 && email.includes("@") && RULES.every((r) => r.test(password));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await register(name.trim(), email.trim(), password);
      toast(`Bienvenue ${name.trim().split(" ")[0]} !`);
      router.replace(next);
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Créer un compte"
      subtitle="Enregistre tes spots et partage-les avec la communauté."
      footer={
        <>
          Déjà un compte ?{" "}
          <Link href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-foreground underline underline-offset-4">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div>
          <Input
            autoComplete="nickname"
            placeholder="Pseudo"
            aria-label="Pseudo"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(fields.displayName)}
            className="h-11 rounded-2xl px-4"
          />
          <FieldError message={fields.displayName} />
        </div>
        <div>
          <Input
            type="email"
            autoComplete="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fields.email)}
            className="h-11 rounded-2xl px-4"
          />
          <FieldError message={fields.email} />
        </div>
        <div>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Mot de passe"
              aria-label="Mot de passe"
              value={password}
              maxLength={128}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fields.password)}
              className="h-11 rounded-2xl px-4 pr-11"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full text-muted-foreground"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {show ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <FieldError message={fields.password} />
          <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
            {RULES.map((r) => {
              const ok = r.test(password);
              return (
                <li key={r.label} className={cn("inline-flex items-center gap-1 text-xs transition-colors", ok ? "text-calm" : "text-muted-foreground")}>
                  <Check className={cn("size-3 transition-opacity", ok ? "opacity-100" : "opacity-30")} />
                  {r.label}
                </li>
              );
            })}
          </ul>
        </div>
        {error && <p className="animate-fade-in rounded-2xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="h-11 rounded-full" disabled={busy || !valid}>
          {busy && <Loader2 className="animate-spin" />}
          Créer mon compte
        </Button>
      </form>
    </AuthCard>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
