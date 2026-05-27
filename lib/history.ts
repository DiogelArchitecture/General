// Server-only. Gathers a couple's gentle "memory lane" — built entirely from
// data we already store, and only the parts that are safe to resurface:
//   * the good things I logged about my partner (mine to read),
//   * gestures of mine my partner noticed, and gestures of theirs I noticed
//     (both already revealed, so the titles are no longer secret).
// Raw irritations are never read here.
import { createServiceClient } from "./supabase/service";

export interface Kindness {
  date: string;
  text: string;
}
export interface Landed {
  date: string;
  title: string;
}

export interface MemoryLane {
  kindnesses: Kindness[];
  landed: Landed[]; // my gestures my partner noticed
  noticed: Landed[]; // my partner's gestures I noticed
}

export async function getMemoryLane(
  coupleId: string,
  userId: string,
  partnerId: string,
): Promise<MemoryLane> {
  const db = createServiceClient();

  const [kindRes, mineRes, theirsRes] = await Promise.all([
    // Good things I wrote about my partner.
    db
      .from("entries")
      .select("log_date, happy_text")
      .eq("couple_id", coupleId)
      .eq("author_id", userId)
      .order("log_date", { ascending: false }),
    // My missions + whether my partner guessed them correctly.
    db
      .from("tasks")
      .select("id, task_date, title, guesses(is_correct, guesser_id)")
      .eq("couple_id", coupleId)
      .eq("doer_id", userId)
      .order("task_date", { ascending: false }),
    // My partner's missions + whether I guessed them correctly.
    db
      .from("tasks")
      .select("id, task_date, title, guesses(is_correct, guesser_id)")
      .eq("couple_id", coupleId)
      .eq("doer_id", partnerId)
      .order("task_date", { ascending: false }),
  ]);

  const kindnesses: Kindness[] = (kindRes.data ?? [])
    .filter((e: { happy_text: string }) => e.happy_text?.trim())
    .map((e: { log_date: string; happy_text: string }) => ({
      date: e.log_date,
      text: e.happy_text.trim(),
    }));

  type TaskWithGuesses = {
    task_date: string;
    title: string;
    guesses: { is_correct: boolean; guesser_id: string }[] | null;
  };

  const correctlyGuessedBy = (t: TaskWithGuesses, guesserId: string) =>
    (t.guesses ?? []).some((g) => g.guesser_id === guesserId && g.is_correct);

  const landed: Landed[] = ((mineRes.data ?? []) as TaskWithGuesses[])
    .filter((t) => correctlyGuessedBy(t, partnerId))
    .map((t) => ({ date: t.task_date, title: t.title }));

  const noticed: Landed[] = ((theirsRes.data ?? []) as TaskWithGuesses[])
    .filter((t) => correctlyGuessedBy(t, userId))
    .map((t) => ({ date: t.task_date, title: t.title }));

  return { kindnesses, landed, noticed };
}
