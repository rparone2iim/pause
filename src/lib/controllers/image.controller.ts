import "server-only";
import { route } from "../http";
import { proxiedImage } from "../image-proxy";

export const imageController = {
  /**
   * GET /api/v1/images?u=&s= — picture of an OpenStreetMap place, re-served by our API (public, like photos:
   * an <img> can't send a token). Only URLs signed by our server are accepted: see image-proxy.ts.
   */
  serve: route(
    async ({ url }) => {
      const webp = await proxiedImage(url.searchParams.get("u") ?? "", url.searchParams.get("s") ?? "");
      return new Response(new Uint8Array(webp), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=86400",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      });
    },
    { rateLimit: { name: "images", limit: 120, windowMs: 60_000 } },
  ),
};
