import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center px-4">
      <p className="text-sm font-medium text-brand">404</p>
      <h1 className="text-2xl font-bold">Cette page n&apos;est pas sur la carte</h1>
      <Button asChild className="rounded-full">
        <Link href="/">Retour à la carte</Link>
      </Button>
    </div>
  );
}
