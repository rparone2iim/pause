"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";

export function Header() {
  const { me, logout } = useAuth();
  const path = usePathname();
  const cls = (href: string) => (path === href ? "active" : undefined);
  return (
    <header className="topbar">
      <Link href="/" className="logo"><span className="logo-mark">P</span>Pause</Link>
      <nav className="nav">
        {me ? (
          <>
            <Link href="/" className={cls("/")}>Explorer</Link>
            <Link href="/spots/new" className={cls("/spots/new")}>+ Ajouter</Link>
            <Link href="/profile" className={cls("/profile")}>Profil</Link>
            <button onClick={logout} className="hide-mobile">Déconnexion</button>
          </>
        ) : (
          <>
            <Link href="/login" className={cls("/login")}>Connexion</Link>
            <Link href="/register" className={cls("/register")}>Créer un compte</Link>
          </>
        )}
      </nav>
    </header>
  );
}
