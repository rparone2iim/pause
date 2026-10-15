"use client";

import { ArrowUp, Footprints, Loader2, RotateCcw, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client";
import { KIND_META } from "@/lib/constants";
import { NamedIcon } from "@/lib/icons";
import { useStore } from "@/lib/store";
import type { PlaceKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toneClass } from "./PlaceCard";

/** A spot recommended by the assistant (always one of OUR spots around, checked by the server). */
interface ChatSpot {
  id: string;
  name: string;
  type: PlaceKind;
  walkMin: number;
  distanceM: number;
  rating: number | null;
  image: string | null;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  spots?: ChatSpot[];
  mode?: "ai" | "local";
  notice?: string;
  error?: boolean;
}

const SUGGESTIONS = ["Où fumer à l'abri ?", "Un café rapide près d'ici", "Un coin calme pour souffler", "Je suis stressé, un conseil ?", "Un étirement de yoga au bureau"];

const WELCOME: Msg = {
  role: "assistant",
  content: "Salut ! Dis-moi ce dont tu as besoin : un coin fumeur, un café, un banc au calme… ou un petit conseil pour te détendre.",
};

function SpotLink({ spot, index, onOpen }: { spot: ChatSpot; index: number; onOpen: () => void }) {
  const meta = KIND_META[spot.type];
  return (
    <Link
      href={`/spots/${encodeURIComponent(spot.id)}`}
      onClick={onOpen}
      style={{ animationDelay: `${index * 60}ms` }}
      className="animate-fade-up flex items-center gap-3 rounded-2xl border bg-background p-2.5 transition-all hover:bg-muted hover:-translate-y-0.5"
    >
      {spot.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={spot.image} alt="" className="size-10 rounded-xl object-cover shrink-0" />
      ) : (
        <div className={cn("size-10 rounded-xl flex items-center justify-center shrink-0", toneClass[meta.tone])}>
          <NamedIcon name={meta.icon} className="size-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{spot.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {meta.label} · {spot.distanceM} m
          {spot.rating != null && (
            <>
              {" · "}
              <Star className="inline size-3 -mt-0.5 fill-current" aria-hidden /> <span className="sr-only">Note </span>
              {spot.rating}
            </>
          )}
        </p>
      </div>
      <span className="flex items-center gap-1 text-xs font-medium shrink-0">
        <Footprints className="size-3.5 text-brand" aria-hidden />
        {spot.walkMin} min
      </span>
    </Link>
  );
}

/** "Demander à l'IA": Pause's assistant (Gemini via Vertex AI, with a local fallback), in a dialog. */
export function AskAI() {
  const { askOpen, setAskOpen, origin, radius } = useStore();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME]);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs, busy]);

  const reset = () => {
    setMsgs([WELCOME]);
    setInput("");
  };

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = msgs.filter((m) => !m.error).slice(-10).map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setInput("");
    setBusy(true);
    try {
      const res = await api<{ reply: string; spots: ChatSpot[]; mode: "ai" | "local"; notice?: string }>("/assistant/messages", {
        method: "POST",
        // The position only serves to find the spots around: the server never stores it nor gives it to the AI.
        body: { message, history, lat: origin.lat, lng: origin.lng, radius: Math.max(radius, 800) },
      });
      setMsgs((m) => [...m, { role: "assistant", content: res.reply, spots: res.spots, mode: res.mode, notice: res.notice }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: errorMessage(e), error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={askOpen} onOpenChange={setAskOpen}>
      <DialogContent className="sm:max-w-lg rounded-3xl gap-4 [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-brand" aria-hidden />
            Demander à l&apos;IA
            {msgs.length > 1 && (
              <Button variant="ghost" size="sm" className="ml-auto mr-6 h-7 rounded-full px-2.5 text-xs font-normal text-muted-foreground" onClick={reset}>
                <RotateCcw className="size-3.5" aria-hidden /> Nouvelle conversation
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>Spots autour de toi et conseils détente. L&apos;assistant ne connaît pas ta position exacte, seulement les spots proches.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto -mx-1 px-1" aria-live="polite">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <p key={i} className="animate-fade-in self-end max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-3.5 py-2 text-sm">
                {m.content}
              </p>
            ) : (
              <div key={i} className="animate-fade-in flex flex-col gap-2">
                {/* Plain text: React escapes everything, even if the AI sent back HTML (anti-XSS). */}
                <p className={cn("self-start max-w-[90%] rounded-2xl rounded-bl-md px-3.5 py-2 text-sm whitespace-pre-line", m.error ? "bg-destructive/10 text-destructive" : "bg-muted")}>
                  {m.content}
                </p>
                {m.spots?.map((s, j) => <SpotLink key={s.id} spot={s} index={j} onOpen={() => setAskOpen(false)} />)}
                {(m.notice || m.mode) && (
                  <span className="self-start text-[11px] text-muted-foreground">
                    {m.notice ?? (m.mode === "ai" ? "✦ Gemini" : "Réponse automatique (sans IA)")}
                  </span>
                )}
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Je regarde autour de toi…
            </div>
          )}
          <div ref={bottom} />
        </div>

        {msgs.length <= 1 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button key={s} variant="outline" size="sm" className="rounded-full font-normal" disabled={busy} onClick={() => send(s)}>
                {s}
              </Button>
            ))}
          </div>
        )}

        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <Input
            autoFocus
            value={input}
            maxLength={500}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ex : un banc à l'ombre pas loin"
            aria-label="Ton message"
            className="h-12 rounded-full pl-4 pr-12"
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full" aria-label="Envoyer">
            <ArrowUp aria-hidden />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
