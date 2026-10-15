/** Only allow redirects to our own pages after login (prevents open redirects like ?next=https://evil.com). */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
