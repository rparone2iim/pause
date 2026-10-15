import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import { AskAI } from "@/components/AskAI";
import { AppShell } from "@/components/AppShell";
import { Header } from "@/components/Header";
import { SearchDialog } from "@/components/SearchDialog";
import { ThemeScript } from "@/components/ThemeScript";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "@/components/Providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Pause", template: "%s · Pause" },
  description: "Trouve le spot de pause idéal autour de toi : cafés, coins fumeurs, bancs au calme.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Set by src/middleware.ts: our only inline script must carry it, or the CSP blocks it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" suppressHydrationWarning className={`${inter.variable} ${jakarta.variable}`}>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body>
        <Providers>
          <TooltipProvider delayDuration={300}>
            <Header />
            <AppShell>{children}</AppShell>
            <AskAI />
            <SearchDialog />
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
