import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKey } from "@/lib/dates";

// Mark today's mission as 'skipped' — for off-days when the gesture doesn't
// fit (away, ill, just not feeling it). This is distinct from completion:
//   - the partner doesn't sit waiting for a guess on something that never
//     happened (state surfaces `partnerSkipped`, the guess step is bypassed),
//   - the doer can't be guessed against (no reveal, no scoring effect).
// Blocked once already completed or guessed against, so a swap-after-guess
// loophole can't accidentally turn into a skip-after-guess one either.
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
    .select("id, status")
    .eq("couple_id", ctx.coupleId)
    .eq("doer_id", ctx.userId)
    .eq("task_date", today)
    .maybeSingle();

  if (!task) {
    return NextResponse.json({ error: "No mission to skip today" }, { status: 400 });
  }
  if (task.status === "completed") {
    return NextResponse.json({ error: "You've already done this one" }, { status: 400 });
  }
  if (task.status === "skipped") {
    return NextResponse.json({ ok: true });
  }

  // If the partner already guessed (unlikely since we now gate on completion,
  // but defensive), don't let the doer rewrite history.
  const { data: partnerGuess } = await db
    .from("guesses")
    .select("task_id")
    .eq("task_id", task.id)
    .eq("guesser_id", ctx.partner.id)
    .maybeSingle();
  if (partnerGuess) {
    return NextResponse.json(
      { error: `${ctx.partner.display_name || "Your partner"} has already guessed — can't sit this one out now` },
      { status: 400 },
    );
  }

  const { error } = await db
    .from("tasks")
    .update({ status: "skipped" })
    .eq("id", task.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
