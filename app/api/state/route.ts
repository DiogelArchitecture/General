import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureTasksForToday } from "@/lib/generation";
import { todayKey } from "@/lib/dates";
import { themeLabel } from "@/lib/themes";

export async function GET(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const today = todayKey(url.searchParams.get("devDate"));

  if (!ctx.coupleId || !ctx.partner) {
    return NextResponse.json({
      paired: false,
      me: ctx.profile,
      date: today,
    });
  }

  // Opening the app on a new day lazily generates today's missions.
  try {
    await ensureTasksForToday(ctx.coupleId, today);
  } catch {
    // Generation failure must not block the page.
  }

  const db = createServiceClient();
  const me = ctx.userId;

  const [loggedRes, missionRes, partnerTaskRes] = await Promise.all([
    db
      .from("entries")
      .select("id")
      .eq("author_id", me)
      .eq("log_date", today)
      .maybeSingle(),
    db
      .from("tasks")
      .select("id, title, instruction, status")
      .eq("couple_id", ctx.coupleId)
      .eq("doer_id", me)
      .eq("task_date", today)
      .maybeSingle(),
    db
      .from("tasks")
      .select("id")
      .eq("couple_id", ctx.coupleId)
      .eq("guesser_id", me)
      .eq("task_date", today)
      .maybeSingle(),
  ]);

  // Recognise the good thing: if my partner already guessed MY mission
  // correctly, it means my gesture was felt — surface that warmly.
  let mission: Record<string, unknown> | null = missionRes.data ?? null;
  if (mission) {
    const noticedRes = await db
      .from("guesses")
      .select("is_correct")
      .eq("task_id", mission.id)
      .eq("guesser_id", ctx.partner.id)
      .maybeSingle();
    mission = {
      ...mission,
      guessed: !!noticedRes.data,
      noticed: !!noticedRes.data?.is_correct,
    };
  }

  let reveal: unknown = null;
  let guessable = false;

  if (partnerTaskRes.data) {
    const taskId = partnerTaskRes.data.id;
    const guessRes = await db
      .from("guesses")
      .select("guessed_theme, guess_text, is_correct")
      .eq("task_id", taskId)
      .eq("guesser_id", me)
      .maybeSingle();

    if (guessRes.data) {
      const internal = await db
        .from("task_internals")
        .select("theme")
        .eq("task_id", taskId)
        .maybeSingle();
      const full = await db
        .from("tasks")
        .select("title, instruction")
        .eq("id", taskId)
        .maybeSingle();
      reveal = {
        title: full.data?.title ?? "",
        instruction: full.data?.instruction ?? "",
        theme: internal.data?.theme ?? null,
        theme_label: internal.data?.theme ? themeLabel(internal.data.theme) : "",
        guessed_theme: guessRes.data.guessed_theme,
        guessed_label: themeLabel(guessRes.data.guessed_theme),
        guess_text: guessRes.data.guess_text,
        is_correct: guessRes.data.is_correct,
      };
    } else {
      guessable = true;
    }
  }

  return NextResponse.json({
    paired: true,
    date: today,
    me: ctx.profile,
    partner: ctx.partner,
    loggedToday: !!loggedRes.data,
    mission,
    guess: { guessable, reveal },
  });
}
