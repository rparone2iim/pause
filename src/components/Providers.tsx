"use client";

import { AuthProvider } from "@/hooks/use-auth";
import { PlacesProvider } from "@/hooks/use-places";
import { ThemeProvider } from "@/hooks/use-theme";
import { UiProvider } from "@/hooks/use-ui";

/** The app's shared state, one provider per concern (each one only depends on the ones around it). */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UiProvider>
      <ThemeProvider>
        <AuthProvider>
          <PlacesProvider>{children}</PlacesProvider>
        </AuthProvider>
      </ThemeProvider>
    </UiProvider>
  );
}
