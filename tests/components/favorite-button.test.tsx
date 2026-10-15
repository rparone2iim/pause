// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/lib/types";

const favorites = new Set<string>();
const toggleFavorite = vi.fn((p: Place) => (favorites.has(p.id) ? favorites.delete(p.id) : favorites.add(p.id)));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ isFavorite: (id: string) => favorites.has(id), toggleFavorite }) }));

const { FavoriteButton } = await import("@/components/PlaceCard");

const place: Place = { id: "spot-1", source: "community", kind: "bench", name: "Banc du parc", lat: 48.89, lng: 2.22, filters: [], features: [], quiet: 4 };

afterEach(cleanup);

describe("FavoriteButton", () => {
  it("is announced to screen readers with its state, and toggles the favorite", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<FavoriteButton place={place} />);
    const button = screen.getByRole("button", { name: "Ajouter Banc du parc aux favoris" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    expect(toggleFavorite).toHaveBeenCalledWith(place);
    rerender(<FavoriteButton place={place} />);
    expect(screen.getByRole("button", { name: "Retirer Banc du parc des favoris" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not open the card underneath when clicked", async () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <FavoriteButton place={{ ...place, id: "spot-2" }} />
      </div>,
    );
    await userEvent.setup().click(screen.getByRole("button"));
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
