// Weekly digest — Sunday-evening recap of the small noticings between a
// couple. Pure server, service-role. Numbers and the top theme are computed
// directly from the existing tables; nothing new is stored.
import { createServiceClient } from "./supabase/service";
import { previousKey } from "./dates";
import { themeLabel } from "./themes";

export interface WeeklyDigest {
  partnerName: string;
  gesturesYouNoticed: number;
  gesturesPartnerNoticed: number;
  missionsYouDid: number;
  missionsPartnerDid: number;
  topThemeLabel: string | null;
}

export async function buildWeeklyDigest(
  coupleId: string,
  userId: string,
  partnerId: string,
  partnerName: string,
  today: string,
): Promise<WeeklyDigest> {
  const db = createServiceClient();

  // 7-day window ending today (inclusive). Cheap and good enough — we don't
  // need calendar-week alignment for the warmth this is going for.
  let cursor = today;
  for (let i = 0; i < 6; i++) cursor = previousKey(cursor);
  const earliest = cursor;

  type TaskRef = { task_date: string; couple_id: string };
  type GuessRow = { task_id: string; is_correct: boolean; tasks: TaskRef | TaskRef[] | null };
  type ThemeRow = { theme: string; tasks: TaskRef | TaskRef[] | null };

  const [completedMine, completedTheirs, myCorrect, partnerCorrect, weekThemes] = await Promise.all([
    db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("couple_id", coupleId)
      .eq("doer_id", userId)
      .eq("status", "completed")
      .gte("task_date", earliest)
      .lte("task_date", today),
    db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("couple_id", coupleId)
      .eq("doer_id", partnerId)
      .eq("status", "completed")
      .gte("task_date", earliest)
      .lte("task_date", today),
    db
      .from("guesses")
      .select("task_id, is_correct, tasks!inner(task_date, couple_id)", { count: "exact", head: true })
      .eq("guesser_id", userId)
      .eq("is_correct", true)
      .eq("tasks.couple_id", coupleId)
      .gte("tasks.task_date", earliest)
      .lte("tasks.task_date", today),
    db
      .from("guesses")
      .select("task_id, is_correct, tasks!inner(task_date, couple_id)", { count: "exact", head: true })
      .eq("guesser_id", partnerId)
      .eq("is_correct", true)
      .eq("tasks.couple_id", coupleId)
      .gte("tasks.task_date", earliest)
      .lte("tasks.task_date", today),
    db
      .from("task_internals")
      .select("theme, tasks!inner(task_date, couple_id)")
      .eq("tasks.couple_id", coupleId)
      .gte("tasks.task_date", earliest)
      .lte("tasks.task_date", today),
  ]);

  // Top theme this week (combined across both partners).
  const themeCounts = new Map<string, number>();
  for (const row of (weekThemes.data ?? []) as ThemeRow[]) {
    if (!row.theme) continue;
    themeCounts.set(row.theme, (themeCounts.get(row.theme) ?? 0) + 1);
  }
  let topThemeId: string | null = null;
  let topCount = 0;
  for (const [t, c] of themeCounts) {
    if (c > topCount) {
      topCount = c;
      topThemeId = t;
    }
  }

  return {
    partnerName,
    gesturesYouNoticed: myCorrect.count ?? 0,
    gesturesPartnerNoticed: partnerCorrect.count ?? 0,
    missionsYouDid: completedMine.count ?? 0,
    missionsPartnerDid: completedTheirs.count ?? 0,
    topThemeLabel: topThemeId ? themeLabel(topThemeId) : null,
  };
}
