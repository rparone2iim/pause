export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="10" className="fill-primary" />
      <rect x="9.5" y="9" width="4.5" height="14" rx="2.25" className="fill-primary-foreground" />
      <rect x="18" y="9" width="4.5" height="14" rx="2.25" className="fill-brand" />
    </svg>
  );
}
