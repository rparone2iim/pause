import { afterEach, describe, expect, it, vi } from "vitest";
import type { NearbySpot } from "@/lib/nearby";

// A fake Gemini: the AI Studio client is configured, and fetch() is replaced in each test.
// No quota is used, nothing leaves the machine, and the CI never depends on Google.
process.env.GEMINI_API_KEY = "fake-key-for-tests";
const { aiAnswer, classify, localAnswer } = await import("@/lib/assistant");

const spot = (id: string, over: Partial<NearbySpot> = {}): NearbySpot => ({
  id,
  name: `Spot ${id}`,
  description: null,
  accessTip: null,
  type: "bench",
  tags: [],
  filters: ["quiet"],
  lat: 48.89,
  lng: 2.22,
  distanceM: 200,
  walkMin: 3,
  rating: 4,
  reviewCount: 2,
  cover: null,
  isFavorite: false,
  ...over,
});
const spots = [spot("a"), spot("b", { type: "cafe", rating: 5 }), spot("c", { type: "smoking" })];

/** What Gemini answers: a JSON text in the first candidate, as with responseMimeType: application/json. */
function gemini(answer: unknown, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof answer === "string" ? answer : JSON.stringify(answer) }] } }] }), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("aiAnswer() with a fake Gemini", () => {
  it("asks for structured JSON and keeps only spots that really were in the list", async () => {
    const fetchMock = gemini({ reply: "Va au Spot b, c'est calme.", spots: ["S2", "S9", "S2"] });
    const r = await aiAnswer("un café calme ?", [], spots, "req-1");
    expect(r).toEqual({ reply: "Va au Spot b, c'est calme.", spotIds: ["b"], mode: "ai" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.properties.spots.items.enum).toEqual(["S1", "S2", "S3"]);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("fake-key-for-tests"); // in a header, never in the URL
  });

  it("sends no user position and no personal data to the AI", async () => {
    const fetchMock = gemini({ reply: "ok", spots: [] });
    await aiAnswer("un banc ?", [], spots, "req-2");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("fake-key");
    expect(init.body).not.toMatch(/48\.89|2\.22|@/);
  });

  it.each([
    ["broken JSON", "{reply: oops"],
    ["missing field", { reply: "salut" }],
    ["empty reply", { reply: "", spots: [] }],
    ["invented reference format", { reply: "ok", spots: ["Le Café de Flore"] }],
  ])("an answer outside the schema (%s) → null, the dialog falls back to local mode", async (_, answer) => {
    gemini(answer);
    expect(await aiAnswer("un banc ?", [], spots, "req-3")).toBeNull();
  });

  it("quota exhausted (429) or network error → null, never a crash", async () => {
    gemini({}, 429);
    expect(await aiAnswer("un banc ?", [], spots, "req-4")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await aiAnswer("un banc ?", [], spots, "req-5")).toBeNull();
  });
});

describe("classify(): off-topic questions never reach Gemini", () => {
  it.each([
    ["un café calme près d'ici ?", "on_topic"],
    ["j'ai mal au dos, un étirement ?", "on_topic"],
    ["merci !", "small_talk"],
    ["c'est quoi la capitale du Pérou ?", "off_topic"], // "Pérou" contains "ou", "dossier" contains "dos": words are compared, not substrings
    ["écris-moi un dossier sur Napoléon", "off_topic"],
  ])("%s → %s", (message, topic) => {
    expect(classify(message, false)).toBe(topic);
  });

  it("a short follow-up in a running conversation is allowed", () => {
    expect(classify("et le 2e ?", true)).toBe("on_topic");
  });
});

describe("localAnswer(): the mode without AI", () => {
  it("recommends the best-rated spots of the requested type", () => {
    const r = localAnswer("un coin pour fumer", spots);
    expect(r.spotIds).toEqual(["c"]);
    expect(r.mode).toBe("local");
  });

  it("gives a relaxation tip with the safety note", () => {
    expect(localAnswer("je suis stressé", spots).reply).toContain("pas un avis médical");
  });
});
