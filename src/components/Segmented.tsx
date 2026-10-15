"use client";

import type { LucideIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

interface Item<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/** Pill-shaped segmented control (walk time, main navigation…). */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
  className,
}: {
  value: T | "";
  onChange: (v: T) => void;
  items: Item<T>[];
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={cn("bg-muted rounded-full p-0.5 gap-0", className)}
    >
      {items.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          className="h-8 rounded-full px-3.5 text-xs gap-1.5 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm transition-all"
        >
          {item.icon && <item.icon className="size-3.5" />}
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
