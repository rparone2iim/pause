import { Avatar as UiAvatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <UiAvatar className={cn("size-8", className)}>
      <AvatarFallback className="bg-primary text-primary-foreground font-medium">{initials(name) || "?"}</AvatarFallback>
    </UiAvatar>
  );
}
