// Server-only. Imported solely by /api route handlers — never by client code.
import Anthropic from "@anthropic-ai/sdk";
import { THEMES, THEME_IDS, isThemeId, themeLabel, type ThemeId } from "./themes";
import { fallbackTask } from "./fallbackTasks";

const GEN_MODEL = "claude-sonnet-4-6";
const CLASSIFY_MODEL = "claude-haiku-4-5";

let cached: Anthropic | null = null;
function client(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cached) cached = new Anthropic();
  return cached;
}

const TAXONOMY = THEMES.map((t) => `- ${t.id}: ${t.label} — ${t.blurb}`).join("\n");

function firstJson(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Classification — sort each log into one shared theme.
// ---------------------------------------------------------------------------

const KEYWORDS: Record<ThemeId, string[]> = {
  affection: ["hug", "kiss", "cuddle", "touch", "hold", "close", "intimate", "love"],
  appreciation: ["thank", "appreciat", "notice", "credit", "acknowledg", "praise", "grateful"],
  quality_time: ["time", "together", "phone", "present", "distract", "date", "attention to me"],
  home_tidiness: ["tidy", "mess", "clean", "dishes", "laundry", "clutter", "kitchen", "room"],
  help_chores: ["chore", "help", "task", "cook", "shop", "bins", "errand", "load", "do it"],
  listening: ["listen", "hear", "heard", "interrupt", "ignore", "talk over", "understand"],
  thoughtfulness: ["thoughtful", "surprise", "remember", "gift", "considerate", "gesture", "little thing"],
  space: ["space", "alone", "myself", "independ", "freedom", "smother", "breathing"],
  communication: ["communicat", "tell", "talk", "honest", "open", "express", "shut down", "silent"],
  fun: ["fun", "laugh", "play", "joke", "boring", "lighten", "spontaneous", "adventure"],
};

function keywordTheme(text: string): ThemeId {
  const t = text.toLowerCase();
  let best: ThemeId = "appreciation";
  let bestScore = 0;
  for (const id of THEME_IDS) {
    let score = 0;
    for (const kw of KEYWORDS[id]) if (t.includes(kw)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

export async function classifyEntry(
  irritation: string,
  happy: string,
): Promise<{ irritation_theme: ThemeId; happy_theme: ThemeId }> {
  const fallback = {
    irritation_theme: keywordTheme(irritation),
    happy_theme: keywordTheme(happy),
  };

  const c = client();
  if (!c) return fallback;

  try {
    const res = await c.messages.create({
      model: CLASSIFY_MODEL,
      max_tokens: 100,
      system: [
        {
          type: "text",
          text:
            "You sort short notes one partner wrote about the other into relationship themes. " +
            "Reply ONLY with JSON: {\"irritation_theme\":\"<id>\",\"happy_theme\":\"<id>\"} " +
            "using exactly one theme id per field from this list:\n" +
            TAXONOMY,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `IRRITATION: ${irritation || "(none)"}\nHAPPY: ${happy || "(none)"}`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    const parsed = text && text.type === "text" ? firstJson(text.text) : null;
    return {
      irritation_theme: parsed && isThemeId(parsed.irritation_theme) ? parsed.irritation_theme : fallback.irritation_theme,
      happy_theme: parsed && isThemeId(parsed.happy_theme) ? parsed.happy_theme : fallback.happy_theme,
    };
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Task generation — turn a theme + positive memories into one subtle gesture.
// The model never sees irritations: those only steer which theme is chosen.
// ---------------------------------------------------------------------------

const GEN_SYSTEM =
  "You design a single small daily 'mission' for one partner in a couple. " +
  "The mission is a kind, specific, concrete action they can do today as a quiet gesture of love.\n\n" +
  "HARD RULES — the experience depends on these:\n" +
  "1. Frame it ONLY as a positive gesture. NEVER reference, imply, or hint at any complaint, problem, or that the partner did anything wrong.\n" +
  "2. Keep it subtle and doable in a normal day — something the other person might happily NOTICE, not a grand romantic spectacle.\n" +
  "3. Be specific and warm, not generic. Draw inspiration from the positive memories provided.\n" +
  "4. Never mention the theme name, this app, points, or that it is a task/assignment.\n" +
  "5. Output ONLY JSON: {\"title\":\"<3-5 word name>\",\"instruction\":\"<one warm sentence telling them what to do today>\"}";

export async function generateTask(
  theme: ThemeId,
  positiveMemories: string[],
): Promise<{ title: string; instruction: string; usedFallback: boolean }> {
  const c = client();
  if (!c) {
    return { ...fallbackTask(theme, Date.now()), usedFallback: true };
  }

  const memo =
    positiveMemories.length > 0
      ? positiveMemories.slice(0, 4).map((m) => `- ${m}`).join("\n")
      : "(no specific memories yet — keep it simple and warm)";

  try {
    const res = await c.messages.create({
      model: GEN_MODEL,
      max_tokens: 300,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: GEN_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content:
            `Focus area: ${themeLabel(theme)}.\n` +
            `Positive things the partner has appreciated before (inspiration, paraphrase — do not copy):\n${memo}\n\n` +
            `Write today's mission.`,
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    const parsed = text && text.type === "text" ? firstJson(text.text) : null;
    if (parsed && typeof parsed.title === "string" && typeof parsed.instruction === "string") {
      return { title: parsed.title.trim(), instruction: parsed.instruction.trim(), usedFallback: false };
    }
  } catch {
    // fall through to fallback
  }

  return { ...fallbackTask(theme, Date.now()), usedFallback: true };
}
