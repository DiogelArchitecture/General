import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendReminderEmail } from "@/lib/email";

// Daily evening nudge (Vercel Cron). Emails everyone who is paired, opted in,
// hasn't logged today, and hasn't already been reminded today. Protected by a
// shared secret so only the cron can trigger it.
//
// v1 simplification: a single fixed UK send time (see vercel.json). No per-user
// timezones yet — fine for a couple in one place; revisit before wider release.

export const dynamic = "force-dynamic";

function londonToday(): string {
  // en-CA renders as YYYY-MM-DD; pin to UK so the "day" matches the app.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = londonToday();
  const db = createServiceClient();

  // Couples with exactly two members are "paired".
  const { data: members } = await db.from("couple_members").select("couple_id, user_id");
  const byCouple = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = byCouple.get(m.couple_id) ?? [];
    list.push(m.user_id);
    byCouple.set(m.couple_id, list);
  }

  const partnerOf = new Map<string, string>();
  const pairedIds: string[] = [];
  for (const ids of byCouple.values()) {
    if (ids.length !== 2) continue;
    const [a, b] = ids;
    partnerOf.set(a, b);
    partnerOf.set(b, a);
    pairedIds.push(a, b);
  }

  if (pairedIds.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const [profilesRes, loggedRes] = await Promise.all([
    db
      .from("profiles")
      .select("id, display_name, email, notify_opt_in, last_reminded")
      .in("id", pairedIds),
    db.from("entries").select("author_id").eq("log_date", today).in("author_id", pairedIds),
  ]);

  const profile = new Map(
    (profilesRes.data ?? []).map((p: { id: string }) => [p.id, p] as const),
  );
  const loggedToday = new Set((loggedRes.data ?? []).map((e: { author_id: string }) => e.author_id));

  let sent = 0;
  for (const id of pairedIds) {
    const me = profile.get(id) as
      | { id: string; display_name: string; email: string; notify_opt_in: boolean; last_reminded: string | null }
      | undefined;
    if (!me) continue;
    if (!me.notify_opt_in || !me.email) continue;
    if (me.last_reminded === today) continue;
    if (loggedToday.has(id)) continue;

    const partnerId = partnerOf.get(id);
    const partner = partnerId ? (profile.get(partnerId) as { display_name?: string } | undefined) : undefined;
    const partnerName = partner?.display_name || "your partner";

    const ok = await sendReminderEmail(me.email, me.display_name || "", partnerName);
    if (ok) {
      await db.from("profiles").update({ last_reminded: today }).eq("id", id);
      sent++;
    }
  }

  return NextResponse.json({ ok: true, sent });
}
