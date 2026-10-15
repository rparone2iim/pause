"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Footer } from "./Footer";

/** Pages where nobody is logged in yet: no header, no bottom nav, no footer. */
const AUTH_ROUTES = ["/login", "/register"];

/** The header (and mobile nav) only exist for a logged-in user. */
export function useShowChrome() {
  const pathname = usePathname();
  const { authStatus } = useAuth();
  return !AUTH_ROUTES.includes(pathname) && authStatus !== "anonymous";
}

/** Page frame: leaves room for the fixed header / mobile nav only when they are shown. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const chrome = useShowChrome();
  return (
    <div className={cn(chrome && "pb-16 md:pb-0")}>
      <main className={cn("w-full", chrome && "pt-16 min-h-[calc(100vh-4rem)]")}>{children}</main>
      {chrome && <Footer />}
    </div>
  );
}
