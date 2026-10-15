"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthCard, FieldError } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, fieldErrors } from "@/lib/client";
import { safeNext } from "@/lib/auth-redirect";
import { useStore } from "@/lib/store";

function LoginForm() {
  const { login, authStatus, toast } = useStore();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (authStatus === "authenticated") router.replace(next);
  }, [authStatus, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await login(email.trim(), password);
      toast("Content de te revoir !");
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
      title="Connexion"
      subtitle="Retrouve tes spots et tes pauses préférées."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href={`/register${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-foreground underline underline-offset-4">
            Créer un compte
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div>
          <Input
            type="email"
            autoComplete="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fields.email)}
            className="h-11 rounded-2xl px-4"
            required
          />
          <FieldError message={fields.email} />
        </div>
        <div>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Mot de passe"
              aria-label="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fields.password)}
              className="h-11 rounded-2xl px-4 pr-11"
              required
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
        </div>
        {error && <p className="animate-fade-in rounded-2xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="h-11 rounded-full" disabled={busy || !email || !password}>
          {busy && <Loader2 className="animate-spin" />}
          Se connecter
        </Button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
