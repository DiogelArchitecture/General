import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKey } from "@/lib/dates";
import { isThemeId, themeLabel } from "@/lib/themes";

// Submitting a guess is the only way the guesser learns the partner's mission.
// We verify a guess, record it, then reveal — the task row itself is never
// readable by the guesser (RLS is doer-only), so there's no way to peek early.
export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ctx.coupleId) return NextResponse.json({ error: "Not paired" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const guessedTheme = String(body.guessed_theme ?? "");
  const guessText = String(body.guess_text ?? "").slice(0, 500);
  if (!isThemeId(guessedTheme)) {
    return NextResponse.json({ error: "Pick a category" }, { status: 400 });
  }

  const today = todayKey(body.devDate);
  const db = createServiceClient();

  // The partner's mission for today (the one this user is meant to notice).
  const { data: task } = await db
    .from("tasks")
    .select("id, title, instruction, completed_at")
    .eq("couple_id", ctx.coupleId)
    .eq("guesser_id", ctx.userId)
    .eq("task_date", today)
    .maybeSingle();

  if (!task) {
    return NextResponse.json({ error: "Nothing to guess yet today" }, { status: 400 });
  }

  const { data: internal } = await db
    .from("task_internals")
    .select("theme")
    .eq("task_id", task.id)
    .maybeSingle();

  const actualTheme = internal?.theme ?? "";
  const isCorrect = isThemeId(actualTheme) && actualTheme === guessedTheme;

  // Idempotent: a second submit returns the existing reveal unchanged.
  await db.from("guesses").upsert(
    {
      task_id: task.id,
      guesser_id: ctx.userId,
      guessed_theme: guessedTheme,
      guess_text: guessText,
      is_correct: isCorrect,
    },
    { onConflict: "task_id,guesser_id", ignoreDuplicates: true },
  );

  const { data: saved } = await db
    .from("guesses")
    .select("guessed_theme, guess_text, is_correct")
    .eq("task_id", task.id)
    .eq("guesser_id", ctx.userId)
    .maybeSingle();

  return NextResponse.json({
    reveal: {
      title: task.title,
      instruction: task.instruction,
      theme: actualTheme,
      theme_label: actualTheme ? themeLabel(actualTheme) : "",
      guessed_theme: saved?.guessed_theme ?? guessedTheme,
      guessed_label: themeLabel(saved?.guessed_theme ?? guessedTheme),
      guess_text: saved?.guess_text ?? guessText,
      is_correct: saved?.is_correct ?? isCorrect,
      completed_at: task.completed_at ?? null,
    },
  });
}
