"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Cover image with a quiet placeholder when the remote file is unavailable. */
export function SpotImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div role="img" aria-label={alt} className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}>
        <ImageOff className="size-8 opacity-50" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setFailed(true)} className={cn("object-cover", className)} />;
}
