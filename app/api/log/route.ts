import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth";
import { classifyEntry } from "@/lib/claude";
import { todayKey } from "@/lib/dates";

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ctx.coupleId || !ctx.partner) {
    return NextResponse.json({ error: "Pair with your partner first" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const irritation = String(body.irritation_text ?? "").slice(0, 1000);
  const happy = String(body.happy_text ?? "").slice(0, 1000);
  if (!irritation.trim() && !happy.trim()) {
    return NextResponse.json({ error: "Write at least one note" }, { status: 400 });
  }

  const today = todayKey(body.devDate);
  const themes = await classifyEntry(irritation, happy);

  const supabase = await createClient();
  const { error } = await supabase.from("entries").upsert(
    {
      couple_id: ctx.coupleId,
      author_id: ctx.userId,
      subject_id: ctx.partner.id,
      log_date: today,
      irritation_text: irritation,
      happy_text: happy,
      irritation_theme: themes.irritation_theme,
      happy_theme: themes.happy_theme,
    },
    { onConflict: "author_id,log_date" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
