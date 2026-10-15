"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast as sonner } from "sonner";

type ToastKind = "success" | "error" | "info";

interface UiValue {
  toast: (message: string, kind?: ToastKind) => void;
  /** The "Ask AI" dialog. */
  askOpen: boolean;
  setAskOpen: (open: boolean) => void;
  /** The address search dialog. */
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

const UiContext = createContext<UiValue | null>(null);

/** Interface-only state: notifications and the two global dialogs. */
export function UiProvider({ children }: { children: React.ReactNode }) {
  const [askOpen, setAskOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    sonner[kind](message);
  }, []);
  const value = useMemo(() => ({ toast, askOpen, setAskOpen, searchOpen, setSearchOpen }), [toast, askOpen, searchOpen]);
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used inside <UiProvider>");
  return ctx;
}
