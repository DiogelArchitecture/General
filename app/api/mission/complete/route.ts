import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { todayKey } from "@/lib/dates";

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ctx.coupleId) return NextResponse.json({ error: "Not paired" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const today = todayKey(body.devDate);

  const db = createServiceClient();
  const { error } = await db
    .from("tasks")
    .update({ status: "completed" })
    .eq("couple_id", ctx.coupleId)
    .eq("doer_id", ctx.userId)
    .eq("task_date", today);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
