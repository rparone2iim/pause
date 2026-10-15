import "server-only";
import { aiAnswer, classify, localAnswer, OFF_TOPIC_REPLY, SMALL_TALK_REPLY, type AssistantResult, type ChatTurn } from "../assistant";
import { requireUser } from "../auth";
import { env } from "../env";
import { json, readJson, route } from "../http";
import { findNearbySpots } from "../nearby";
import { enforceLimit, rateLimit } from "../rateLimit";
import { photoUrl } from "../upload";
import { assistantMessageBody } from "../validation";

const DAY = 24 * 60 * 60_000;

export const assistantController = {
  /**
   * POST /api/v1/assistant/messages → { message, history, lat, lng } → { reply, spots, mode, notice? }
   * The position is only used to find the spots around, then forgotten (never stored, never sent to the AI).
   */
  reply: route(async ({ req, requestId }) => {
    const { userId } = await requireUser(req);
    enforceLimit(`assistant:${userId}`, 20, 10 * 60_000, "20 messages maximum toutes les 10 minutes."); // whatever happens
    const body = await readJson(req, assistantMessageBody);

    // 1) Guard: off topic or "thanks" → instant answer, NO call to Gemini.
    const topic = classify(body.message, body.history.length > 0);
    if (topic === "small_talk") return json({ ...SMALL_TALK_REPLY, spots: [] });
    if (topic === "off_topic") {
      // Insisting with off-topic questions gets you blocked for 10 min at the 6th one.
      enforceLimit(`assistant-offtopic:${userId}`, 5, 10 * 60_000, "Trop de questions hors sujet, réessaie dans quelques minutes.");
      return json({ ...OFF_TOPIC_REPLY, spots: [] });
    }

    const spots = await findNearbySpots({ lat: body.lat, lng: body.lng, radius: body.radius, userId });

    // The history comes from the browser: put it back in shape (user/assistant alternating, starting with user).
    const history: ChatTurn[] = [];
    for (const turn of body.history) {
      if (history.length === 0 && turn.role !== "user") continue;
      const last = history.at(-1);
      if (last && last.role === turn.role) last.content += `\n${turn.content}`;
      else history.push({ ...turn });
    }
    if (history.at(-1)?.role === "user") history.pop();

    // 2) Gemini quotas: per user AND for the whole app (protects the Google quota).
    let result: AssistantResult | null = null;
    let notice: string | undefined;
    if (rateLimit(`gemini-user:${userId}`, env.AI_DAILY_LIMIT_PER_USER, DAY).ok && rateLimit("gemini-global", env.AI_DAILY_LIMIT_GLOBAL, DAY).ok) {
      result = await aiAnswer(body.message, history, spots, requestId);
    } else {
      notice = "Quota IA du jour atteint : réponses automatiques jusqu'à demain.";
    }
    result ??= localAnswer(body.message, spots);

    const byId = new Map(spots.map((s) => [s.id, s]));
    return json({
      reply: result.reply,
      mode: result.mode,
      notice,
      spots: result.spotIds
        .map((id) => byId.get(id))
        .filter((s) => s !== undefined)
        .map((s) => ({ id: s.id, name: s.name, type: s.type, walkMin: s.walkMin, distanceM: s.distanceM, rating: s.rating, image: s.cover ? photoUrl(s.cover) : null })),
    });
  }),
};
