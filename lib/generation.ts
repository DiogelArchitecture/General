// Server-only. Idempotently creates each partner's daily mission.
import { createServiceClient } from "./supabase/service";
import { generateTask } from "./claude";
import { daysBetween } from "./dates";
import { isThemeId, THEME_IDS, type ThemeId } from "./themes";

const HALF_LIFE_DAYS = 7;

interface EntryRow {
  author_id: string;
  subject_id: string;
  log_date: string;
  happy_text: string;
  irritation_theme: string | null;
  happy_theme: string | null;
}

// Recency-weighted: a theme seen today counts ~2x one seen a week ago. Both the
// irritation theme and the happy theme vote on which area matters — only the
// *area* is borrowed from irritations, never their wording.
//
// We then SAMPLE from the top 3 weighted themes proportional to their weight,
// rather than always picking the single strongest. The dominant theme still
// wins most of the time, but #2 and #3 get a real shot — so a couple's logs
// settling into one or two themes don't lock the missions into a rut.
function pickTheme(entries: EntryRow[], today: string): ThemeId | null {
  const weights = new Map<ThemeId, number>();
  let any = false;
  for (const e of entries) {
    const age = Math.max(0, daysBetween(today, e.log_date));
    const w = Math.pow(0.5, age / HALF_LIFE_DAYS);
    for (const raw of [e.irritation_theme, e.happy_theme]) {
      if (raw && isThemeId(raw)) {
        weights.set(raw, (weights.get(raw) ?? 0) + w);
        any = true;
      }
    }
  }
  if (!any) return null;

  const ranked = [...weights.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (ranked.length === 0) return THEME_IDS[0];

  const total = ranked.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [theme, w] of ranked) {
    r -= w;
    if (r <= 0) return theme;
  }
  return ranked[0][0];
}

// The last few gestures this doer has already received, newest first — passed
// to the LLM as a "do not repeat" list to break out of repetitive phrasings
// when the theme keeps coming up. Used by daily generation and by mission swap.
export async function gatherRecentGestures(
  db: ReturnType<typeof createServiceClient>,
  coupleId: string,
  doerId: string,
  today: string,
  limit = 7,
): Promise<{ title: string; instruction: string }[]> {
  const { data } = await db
    .from("tasks")
    .select("title, instruction")
    .eq("couple_id", coupleId)
    .eq("doer_id", doerId)
    .lt("task_date", today)
    .order("task_date", { ascending: false })
    .limit(limit);
  return (data ?? []) as { title: string; instruction: string }[];
}

// The positive memories the guesser logged about the doer within a theme,
// newest first. Shared by daily generation and the mission-swap route so both
// draw on the same inspiration.
export async function gatherMemories(
  db: ReturnType<typeof createServiceClient>,
  coupleId: string,
  guesserId: string,
  doerId: string,
  theme: ThemeId,
  today: string,
): Promise<string[]> {
  const { data: entries } = await db
    .from("entries")
    .select("log_date, happy_text, happy_theme")
    .eq("couple_id", coupleId)
    .eq("author_id", guesserId)
    .eq("subject_id", doerId)
    .lt("log_date", today);

  return (entries ?? [])
    .filter((e: { happy_theme: string | null; happy_text: string }) => e.happy_theme === theme && e.happy_text.trim())
    .sort((a: { log_date: string }, b: { log_date: string }) => (a.log_date < b.log_date ? 1 : -1))
    .map((e: { happy_text: string }) => e.happy_text.trim());
}

async function generateForDoer(
  db: ReturnType<typeof createServiceClient>,
  coupleId: string,
  doerId: string,
  guesserId: string,
  today: string,
): Promise<void> {
  // Already have a mission for today? (unique on couple+doer+date)
  const existing = await db
    .from("tasks")
    .select("id")
    .eq("couple_id", coupleId)
    .eq("doer_id", doerId)
    .eq("task_date", today)
    .maybeSingle();
  if (existing.data) return;

  // What the GUESSER logged ABOUT the doer, strictly before today.
  const { data: entries } = await db
    .from("entries")
    .select("author_id, subject_id, log_date, happy_text, irritation_theme, happy_theme")
    .eq("couple_id", coupleId)
    .eq("author_id", guesserId)
    .eq("subject_id", doerId)
    .lt("log_date", today);

  const rows = (entries ?? []) as EntryRow[];
  const theme = pickTheme(rows, today);
  if (!theme) return; // cold start — nothing logged yet

  const [memories, recentGestures] = await Promise.all([
    gatherMemories(db, coupleId, guesserId, doerId, theme, today),
    gatherRecentGestures(db, coupleId, doerId, today),
  ]);

  const { title, instruction } = await generateTask(theme, memories, recentGestures);

  const inserted = await db
    .from("tasks")
    .insert({
      couple_id: coupleId,
      doer_id: doerId,
      guesser_id: guesserId,
      task_date: today,
      title,
      instruction,
      status: "assigned",
    })
    .select("id")
    .maybeSingle();

  // Lost an insert race against the partner's concurrent open — fine, skip.
  if (!inserted.data) return;

  await db.from("task_internals").insert({
    task_id: inserted.data.id,
    theme,
    rationale: `Theme '${theme}' had the highest recency-weighted salience.`,
    source_summary: memories.slice(0, 4).join(" | "),
  });
}

// Ensure both partners have today's mission. Safe to call on every page load.
export async function ensureTasksForToday(coupleId: string, today: string): Promise<void> {
  const db = createServiceClient();
  const { data: members } = await db
    .from("couple_members")
    .select("user_id")
    .eq("couple_id", coupleId);

  const ids = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (ids.length < 2) return; // need both partners paired

  const [a, b] = ids;
  await Promise.all([
    generateForDoer(db, coupleId, a, b, today),
    generateForDoer(db, coupleId, b, a, today),
  ]);
}
