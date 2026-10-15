import "server-only";
import { env } from "./env";

/*
 * Google APIs without any key (Vertex AI for Gemini, Places for cafés and parks).
 * On Cloud Run, the metadata server (internal address 169.254.169.254, unreachable from the Internet)
 * hands out a 1-hour OAuth token for the service's own account (pause-app). Shared by every Google call.
 * In dev, a token can be given by hand: VERTEX_ACCESS_TOKEN=$(gcloud auth print-access-token)
 */
let cached: { value: string; expiresAt: number } | null = null;

export async function googleAccessToken(): Promise<string> {
  if (env.VERTEX_ACCESS_TOKEN) return env.VERTEX_ACCESS_TOKEN;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  // The metadata server only speaks HTTP, on a link-local address unreachable from outside the machine.
  // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
  const res = await fetch("http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(3_000),
  });
  if (!res.ok) throw new Error(`metadata ${res.status}`);
  const t = (await res.json()) as { access_token: string; expires_in: number };
  cached = { value: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}
