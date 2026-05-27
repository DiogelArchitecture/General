// Server-only. Two gentle, non-punitive numbers for the daily hub:
//   * reflectionStreak — consecutive days I've logged an evening reflection,
//     counting back from today. An un-done *today* never breaks it (we start
//     from yesterday if today isn't logged yet).
//   * noticedCount — how many gestures have been noticed between the two of us.
import { createServiceClient } from "./supabase/service";
import { previousKey } from "./dates";

export interface Stats {
  reflectionStreak: number;
  noticedCount: number;
}

export async function getStats(
  coupleId: string,
  userId: string,
  today: string,
): Promise<Stats> {
  const db = createServiceClient();

  const [entriesRes, noticedRes] = await Promise.all([
    db
      .from("entries")
      .select("log_date")
      .eq("couple_id", coupleId)
      .eq("author_id", userId),
    db
      .from("guesses")
      .select("tasks!inner(couple_id)", { count: "exact", head: true })
      .eq("is_correct", true)
      .eq("tasks.couple_id", coupleId),
  ]);

  const logged = new Set((entriesRes.data ?? []).map((e: { log_date: string }) => e.log_date));

  // Start at today if logged, else yesterday, then walk back while unbroken.
  let cursor = logged.has(today) ? today : previousKey(today);
  let streak = 0;
  while (logged.has(cursor)) {
    streak++;
    cursor = previousKey(cursor);
  }

  return { reflectionStreak: streak, noticedCount: noticedRes.count ?? 0 };
}
