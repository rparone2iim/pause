"use client";

import { Compass, LogIn, LogOut, Map, MoonStar, Plus, Sparkles, Sun, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatRadius, RADIUS_OPTIONS } from "@/lib/constants";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useShowChrome } from "./AppShell";
import { Avatar } from "./Avatar";
import { SearchTrigger } from "./SearchDialog";
import { Segmented } from "./Segmented";
import { Logo } from "./Logo";

const NAV = [
  { href: "/", label: "Carte", icon: Map },
  { href: "/spots/new", label: "Ajouter", icon: Plus },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { radius, setRadius, theme, toggleTheme, setAskOpen, user, authStatus, logout } = useStore();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // Login / sign-up pages and logged-out visitors: no header at all.
  if (!useShowChrome()) return null;

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-50 h-16 bg-background/80 backdrop-blur-xl border-b">
        <div className="h-full px-4 md:px-6 grid grid-cols-[1fr_auto] md:grid-cols-[1fr_minmax(0,24rem)_1fr] items-center gap-4">
          {/* Left: brand + radius */}
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <Logo />
              <span className="font-heading text-lg font-bold tracking-tight">Pause</span>
            </Link>
            {user && pathname === "/" && (
              <Segmented
                label="Rayon de recherche"
                value={String(radius)}
                onChange={(v) => setRadius(Number(v))}
                items={RADIUS_OPTIONS.map((r) => ({ value: String(r), label: formatRadius(r) }))}
                // Wide screens only: below, it would slide under the search bar (the list has its own radius button).
                className="hidden 2xl:flex"
              />
            )}
          </div>

          {/* Center: search */}
          <SearchTrigger className="hidden md:flex" />

          {/* Right: actions */}
          <div className="flex items-center justify-end gap-1.5">
            <Button variant="outline" size="sm" className="hidden md:inline-flex rounded-full group" onClick={() => setAskOpen(true)} aria-label="Demander à l'IA">
              <Sparkles className="text-brand transition-transform duration-300 group-hover:rotate-12" aria-hidden />
              <span className="hidden 2xl:inline">Demander à l&apos;IA</span>
              <span className="2xl:hidden">IA</span>
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden rounded-full" onClick={() => setAskOpen(true)} aria-label="Demander à l'IA">
              <Sparkles className="text-brand" />
            </Button>

            <Segmented
              label="Navigation"
              value={NAV.find((n) => isActive(n.href))?.href ?? ""}
              onChange={(href) => router.push(href)}
              items={NAV.map((n) => ({ value: n.href, label: n.label, icon: n.icon }))}
              className="hidden md:flex ml-1"
            />

            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
            >
              {theme === "dark" ? <MoonStar key="m" className="animate-pop" /> : <Sun key="s" className="animate-pop" />}
            </Button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn("rounded-full ring-offset-2 ring-offset-background transition-shadow", pathname === "/profile" && "ring-2 ring-brand")}
                    aria-label="Menu du compte"
                  >
                    <Avatar name={user.displayName} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col">
                    <span>{user.displayName}</span>
                    <span className="text-xs font-normal text-muted-foreground truncate">{user.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => router.push("/profile")}>
                    <User /> Mon profil
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggleTheme}>
                    {theme === "dark" ? <Sun /> : <MoonStar />} {theme === "dark" ? "Mode clair" : "Mode sombre"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      await logout();
                      router.push("/login");
                    }}
                  >
                    <LogOut /> Se déconnecter
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              authStatus !== "checking" && (
                <Button asChild size="sm" className="rounded-full animate-fade-in">
                  <Link href={`/login${pathname !== "/" && !pathname.startsWith("/login") && !pathname.startsWith("/register") ? `?next=${encodeURIComponent(pathname)}` : ""}`}>
                    <LogIn /> <span className="hidden sm:inline">Se connecter</span>
                  </Link>
                </Button>
              )
            )}
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-background/90 backdrop-blur-xl border-t grid grid-cols-3"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {[
          { href: "/", label: "Explorer", icon: Compass },
          { href: "/spots/new", label: "Ajouter", icon: Plus },
          { href: user ? "/profile" : "/login", label: user ? "Profil" : "Connexion", icon: user ? User : LogIn },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors", isActive(item.href) ? "text-foreground" : "text-muted-foreground")}
          >
            <item.icon className={cn("size-5 transition-transform", isActive(item.href) && "scale-110")} />
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
