import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Pause — les meilleurs spots de pause autour de toi",
  description: "Trouve un coin fumeur, un café ou un banc calme à quelques minutes à pied.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lire les headers rend la page dynamique : indispensable pour que Next applique
  // le nonce CSP (généré à chaque requête dans middleware.ts) à ses propres scripts.
  await headers();
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <Header />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
