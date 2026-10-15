export { cn } from "cn";

export function timeAgo(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `Il y a ${h} h`;
  const d = Math.round(h / 24);
  return `Il y a ${d} jour${d > 1 ? "s" : ""}`;
}
