import "server-only";
import pino from "pino";

// Les erreurs SQL de Drizzle recopient les VALEURS de la requête (« params: … ») dans leur message.
// Une erreur pendant l'inscription mettrait donc un email ou un hash de mot de passe dans les logs :
// on masque ces valeurs avant d'écrire.
const scrub = (s?: string) => s?.replace(/\nparams: [\s\S]*?(?=\n {4}at |\ncaused by|$)/g, "\nparams: [MASQUÉ]");

function errSerializer(e: unknown) {
  const out = pino.stdSerializers.err(e as Error) as unknown as Record<string, unknown>;
  out.message = scrub(out.message as string);
  out.stack = scrub(out.stack as string);
  delete out.params;
  return out;
}

// Pilier 6 : logs structurés (JSON) côté serveur uniquement.
// Les champs sensibles sont masqués automatiquement s'ils se retrouvent dans un log.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "pause" },
  serializers: { err: errSerializer },
  redact: {
    paths: ["password", "*.password", "passwordHash", "*.passwordHash", "token", "*.token", "headers.authorization"],
    censor: "[MASQUÉ]",
  },
});
