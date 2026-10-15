"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { intentionalSignOut, useStore } from "./store";

/** Client-side guard for private pages: sends anonymous visitors to the login page and back afterwards. */
export function useRequireAuth() {
  const { authStatus, hydrated } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (hydrated && authStatus === "anonymous" && !intentionalSignOut.active) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, authStatus, pathname, router]);
  return authStatus === "authenticated";
}
