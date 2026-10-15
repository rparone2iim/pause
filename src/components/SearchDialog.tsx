"use client";

import { Globe, Loader2, LocateFixed, MapPin, Navigation, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDistance } from "@/components/PlaceCard";
import { Segmented } from "@/components/Segmented";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { usePlaces } from "@/hooks/use-places";
import { useUi } from "@/hooks/use-ui";
import { cn } from "@/lib/utils";

interface Result {
  label: string;
  full: string;
  lat: number;
  lng: number;
  /** Distance from the break origin, in meters. */
  distanceM?: number;
}

type Scope = "global" | "near";
const SCOPES: { value: Scope; label: string; icon: typeof Globe }[] = [
  { value: "global", label: "Partout", icon: Globe },
  { value: "near", label: "Près de moi", icon: Navigation },
];

/** Looks like a search field; opens the search dialog (also ⌘K / Ctrl+K). */
export function SearchTrigger({ className }: { className?: string }) {
  const { setSearchOpen } = useUi();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  return (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      className={cn(
        "flex items-center gap-2 h-10 w-full rounded-full border bg-muted/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-muted",
        className,
      )}
    >
      <Search className="size-4 shrink-0" />
      <span className="flex-1 text-left truncate">Rechercher un lieu</span>
      <kbd className="hidden lg:inline-flex h-5 items-center rounded-md border bg-background px-1.5 font-sans text-[10px] font-medium">⌘K</kbd>
    </button>
  );
}

/** Address / place search (OpenStreetMap Nominatim) that moves the break origin. */
export function SearchDialog() {
  const { origin, setOrigin, locate } = usePlaces();
  const { searchOpen, setSearchOpen } = useUi();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  /** The search ("scope:term") the current results answer: until it matches what's typed, we're still searching. */
  const [answered, setAnswered] = useState("");
  const [active, setActive] = useState(0);
  const [scope, setScope] = useState<Scope>("global");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) {
      setResults([]);
      return;
    }
    const key = `${scope}:${term}`;
    const ctrl = new AbortController();
    // Nominatim asks for ≤ 1 request/second: debounce typing.
    const t = setTimeout(() => {
      api<{ data: Result[] }>(`/addresses?query=${encodeURIComponent(term)}&lat=${origin.lat}&lng=${origin.lng}&scope=${scope}`, { signal: ctrl.signal })
        .then((d) => {
          setResults(d.data);
          setActive(0);
          setAnswered(key);
        })
        .catch(() => {
          // Aborted: a newer search is already on its way. Failed: stop the spinner.
          if (!ctrl.signal.aborted) {
            setResults([]);
            setAnswered(key);
          }
        });
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, origin.lat, origin.lng, scope]);

  const close = () => {
    setSearchOpen(false);
    setQ("");
    setResults([]);
  };

  const choose = (r: Result) => {
    setOrigin({ lat: r.lat, lng: r.lng, label: r.label, source: "search" });
    close();
    if (pathname !== "/") router.push("/");
  };

  const useMyPosition = () => {
    locate();
    close();
    if (pathname !== "/") router.push("/");
  };

  const showResults = q.trim().length >= 3;
  const loading = showResults && answered !== `${scope}:${q.trim()}`;

  return (
    <Dialog open={searchOpen} onOpenChange={(o) => (o ? setSearchOpen(true) : close())}>
      <DialogContent className="sm:max-w-lg rounded-3xl gap-4 [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="size-5 text-brand" />
            Rechercher un lieu
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                choose(results[active]);
              }
            }}
            placeholder="Une adresse, une rue, un lieu…"
            className="h-12 rounded-full pl-4 pr-12"
          />
          {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <Segmented value={scope} onChange={setScope} items={SCOPES} label="Où chercher" className="shrink-0" />
          {scope === "near" && <span className="text-xs text-muted-foreground truncate">Autour de {origin.label}</span>}
        </div>

        <div className="flex flex-col gap-2">
          {!showResults && (
            <button
              type="button"
              onClick={useMyPosition}
              className="flex items-center gap-3 rounded-2xl border p-2.5 text-left transition-all hover:bg-muted hover:-translate-y-0.5"
            >
              <div className="size-10 rounded-xl flex items-center justify-center shrink-0 bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                <LocateFixed className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">Utiliser ma position</p>
                <p className="text-xs text-muted-foreground truncate">Actuellement : {origin.label}</p>
              </div>
            </button>
          )}
          {showResults && !loading && results.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">{scope === "near" ? "Aucun lieu trouvé à moins de 3 km. Essaie « Partout »." : "Aucun lieu trouvé."}</p>
          )}
          {showResults &&
            results.map((r, i) => (
              <button
                key={`${r.lat},${r.lng},${i}`}
                type="button"
                onClick={() => choose(r)}
                onMouseEnter={() => setActive(i)}
                style={{ animationDelay: `${i * 40}ms` }}
                className={cn(
                  "animate-fade-up flex items-center gap-3 rounded-2xl border p-2.5 text-left transition-all hover:-translate-y-0.5",
                  i === active && "bg-muted",
                )}
              >
                <div className="size-10 rounded-xl flex items-center justify-center shrink-0 bg-muted text-brand">
                  <MapPin className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{r.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.full}</p>
                </div>
                {scope === "near" && r.distanceM !== undefined && <span className="text-xs font-medium text-muted-foreground shrink-0">{formatDistance(r.distanceM)}</span>}
              </button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
