import "server-only";
import type { LatLng } from "../types";
import { fetchWeather, geocode, reverseGeocode } from "../osm";
import { UpstreamUnavailableError } from "../domain-errors";

const unavailable = (what: string, retryAfterS: number) => new UpstreamUnavailableError(`${what} momentanément indisponible, réessaie.`, retryAfterS);

export const locationService = {
  /** Addresses/places matching a search: anywhere (biased around `near`), or only close to `near`. */
  async search(query: string, near?: LatLng, scope?: "global" | "near") {
    try {
      return await geocode(query, near, scope);
    } catch {
      throw unavailable("Recherche d'adresse", 5);
    }
  },

  /** The address at a point (reverse geocoding). */
  async addressAt(point: LatLng) {
    try {
      const { label } = await reverseGeocode(point);
      return { label, lat: point.lat, lng: point.lng };
    } catch {
      throw unavailable("Recherche d'adresse", 5);
    }
  },

  async weather(point: LatLng) {
    try {
      return await fetchWeather(point);
    } catch {
      throw unavailable("Météo", 30);
    }
  },
};
