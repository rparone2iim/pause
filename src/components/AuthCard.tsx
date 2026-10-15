import Link from "next/link";
import { Logo } from "./Logo";

/** Centered card used by the login and signup pages. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="min-h-svh flex items-center justify-center px-4 py-10">
      <div className="animate-fade-up w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Link href="/" aria-label="Accueil">
            <Logo className="size-12" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </div>
        <div className="rounded-3xl border bg-card p-6 shadow-sm">{children}</div>
        <p className="text-center text-sm text-muted-foreground">{footer}</p>
      </div>
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="animate-fade-in text-xs text-destructive mt-1.5 px-1">{message}</p>;
}
