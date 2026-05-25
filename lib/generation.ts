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
  let best: ThemeId = THEME_IDS[0];
  let bestW = -1;
  for (const id of THEME_IDS) {
    const w = weights.get(id) ?? 0;
    if (w > bestW) {
      bestW = w;
      best = id;
    }
  }
  return best;
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

  const memories = rows
    .filter((e) => e.happy_theme === theme && e.happy_text.trim())
    .sort((a, b) => (a.log_date < b.log_date ? 1 : -1))
    .map((e) => e.happy_text.trim());

  const { title, instruction } = await generateTask(theme, memories);

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
