import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { gatherMemories, gatherRecentGestures } from "@/lib/generation";
import { generateTask } from "@/lib/claude";
import { todayKey } from "@/lib/dates";
import { isThemeId } from "@/lib/themes";

const MAX_SWAPS = 1;

// Regenerate today's gesture for the doer. The theme is kept fixed — only the
// surface action changes — so the guesser's challenge (which area?) is fair
// and unchanged. Blocked once completed, once the cap is hit, or once the
// partner has already guessed (we don't move the target after they've played).
export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ctx.coupleId || !ctx.partner) {
    return NextResponse.json({ error: "Not paired" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const today = todayKey(body.devDate);
  const db = createServiceClient();

  const { data: task } = await db
    .from("tasks")
    .select("id, status, swap_count, title, instruction")
    .eq("couple_id", ctx.coupleId)
    .eq("doer_id", ctx.userId)
    .eq("task_date", today)
    .maybeSingle();

  if (!task) {
    return NextResponse.json({ error: "No mission to swap yet today" }, { status: 400 });
  }
  if (task.status === "completed") {
    return NextResponse.json({ error: "You've already done this one" }, { status: 400 });
  }
  if ((task.swap_count ?? 0) >= MAX_SWAPS) {
    return NextResponse.json({ error: "You've already swapped today's mission" }, { status: 400 });
  }

  const { data: partnerGuess } = await db
    .from("guesses")
    .select("task_id")
    .eq("task_id", task.id)
    .eq("guesser_id", ctx.partner.id)
    .maybeSingle();
  if (partnerGuess) {
    return NextResponse.json(
      { error: `${ctx.partner.display_name || "Your partner"} has already guessed — too late to swap` },
      { status: 400 },
    );
  }

  const { data: internal } = await db
    .from("task_internals")
    .select("theme")
    .eq("task_id", task.id)
    .maybeSingle();
  const theme = internal?.theme ?? "";
  if (!isThemeId(theme)) {
    return NextResponse.json({ error: "Can't swap this mission" }, { status: 400 });
  }

  const [memories, recentGestures] = await Promise.all([
    gatherMemories(db, ctx.coupleId, ctx.partner.id, ctx.userId, theme, today),
    gatherRecentGestures(db, ctx.coupleId, ctx.userId, today),
  ]);
  // Include the gesture being swapped out, so the regenerated one is forced to
  // differ from it as well as from the past week.
  const avoid = [
    { title: task.title, instruction: task.instruction },
    ...recentGestures,
  ];
  const { title, instruction } = await generateTask(theme, memories, avoid);

  const { error } = await db
    .from("tasks")
    .update({ title, instruction, swap_count: (task.swap_count ?? 0) + 1 })
    .eq("id", task.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db
    .from("task_internals")
    .update({ source_summary: memories.slice(0, 4).join(" | ") })
    .eq("task_id", task.id);

  return NextResponse.json({ ok: true, title, instruction });
}
