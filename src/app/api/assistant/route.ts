import { route, readJson, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { assistantSchema } from "@/lib/validation";
import { rateLimit, tryConsume } from "@/lib/rateLimit";
import { findNearbySpots } from "@/lib/nearby";
import { aiAnswer, classify, localAnswer, OFF_TOPIC_REPLY, SMALL_TALK_REPLY, type AssistantResult, type ChatTurn } from "@/lib/assistant";

const DAY = 24 * 60 * 60_000;
const PER_USER_PER_DAY = Number(process.env.AI_DAILY_LIMIT_PER_USER ?? 30);
const GLOBAL_PER_DAY = Number(process.env.AI_DAILY_LIMIT_GLOBAL ?? 500);

/**
 * POST /api/assistant → { message, history, lat, lng } → { reply, spots, mode, notice? }
 * La position sert à chercher les spots proches puis est oubliée (jamais stockée, jamais envoyée à l'IA).
 */
export const POST = route(async (req, _ctx, { requestId }) => {
  const user = await requireUser(req);
  rateLimit(`assistant:${user.id}`, 20, 10 * 60_000); // 20 messages / 10 min, quoi qu'il arrive
  const body = await readJson(req, assistantSchema);

  // 1) Garde-fou : hors sujet ou « merci » → réponse immédiate, AUCUN appel à Gemini.
  const topic = classify(body.message, body.history.length > 0);
  if (topic === "small_talk") return ok({ ...SMALL_TALK_REPLY, spots: [] });
  if (topic === "off_topic") {
    // Celui qui insiste avec du hors sujet est bloqué 10 min au 6e essai.
    rateLimit(`assistant-offtopic:${user.id}`, 5, 10 * 60_000);
    return ok({ ...OFF_TOPIC_REPLY, spots: [] });
  }

  const spots = await findNearbySpots({ lat: body.lat, lng: body.lng, radius: body.radius, userId: user.id });

  // L'historique vient du navigateur : on le remet en forme (alternance user/assistant, commence par user).
  const history: ChatTurn[] = [];
  for (const turn of body.history) {
    if (history.length === 0 && turn.role !== "user") continue;
    const last = history.at(-1);
    if (last && last.role === turn.role) last.content += `\n${turn.content}`;
    else history.push({ ...turn });
  }
  if (history.at(-1)?.role === "user") history.pop();

  // 2) Quotas Gemini : par utilisateur ET pour toute l'app (protège le quota gratuit de Google).
  let result: AssistantResult | null = null;
  let notice: string | undefined;
  if (tryConsume(`gemini-user:${user.id}`, PER_USER_PER_DAY, DAY) && tryConsume("gemini-global", GLOBAL_PER_DAY, DAY)) {
    result = await aiAnswer(body.message, history, spots, requestId);
  } else {
    notice = "Quota IA du jour atteint : réponses automatiques jusqu'à demain.";
  }
  result ??= localAnswer(body.message, spots);

  const byId = new Map(spots.map((s) => [s.id, s]));
  return ok({
    reply: result.reply,
    mode: result.mode,
    notice,
    spots: result.spotIds.map((id) => byId.get(id)!).filter(Boolean).map((s) => ({
      id: s.id, name: s.name, type: s.type, walkMin: s.walkMin, distanceM: s.distanceM, rating: s.rating, cover: s.cover,
    })),
  });
});
