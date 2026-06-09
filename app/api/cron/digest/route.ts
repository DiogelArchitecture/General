import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildWeeklyDigest } from "@/lib/digest";
import { sendDigestEmail } from "@/lib/email";

// Sunday-evening weekly digest. Same auth + opt-out + addressing scheme as the
// evening reminder cron — reuses notify_opt_in so flipping the toggle on the
// hub silences both. Skips couples with no activity at all this week so the
// inbox isn't peppered with empty "you did nothing" emails.

export const dynamic = "force-dynamic";

function londonToday(): string {
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

  const { data: members } = await db.from("couple_members").select("couple_id, user_id");
  const byCouple = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = byCouple.get(m.couple_id) ?? [];
    list.push(m.user_id);
    byCouple.set(m.couple_id, list);
  }

  const pairedIds: string[] = [];
  const partnerOf = new Map<string, string>();
  const coupleOf = new Map<string, string>();
  for (const [coupleId, ids] of byCouple.entries()) {
    if (ids.length !== 2) continue;
    const [a, b] = ids;
    partnerOf.set(a, b);
    partnerOf.set(b, a);
    coupleOf.set(a, coupleId);
    coupleOf.set(b, coupleId);
    pairedIds.push(a, b);
  }
  if (pairedIds.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const { data: profiles } = await db
    .from("profiles")
    .select("id, display_name, email, notify_opt_in")
    .in("id", pairedIds);
  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string }) => [p.id, p] as const),
  );

  let sent = 0;
  for (const id of pairedIds) {
    const me = profileMap.get(id) as
      | { id: string; display_name: string; email: string; notify_opt_in: boolean }
      | undefined;
    if (!me) continue;
    if (!me.notify_opt_in || !me.email) continue;

    const partnerId = partnerOf.get(id);
    const coupleId = coupleOf.get(id);
    if (!partnerId || !coupleId) continue;
    const partner = profileMap.get(partnerId) as { display_name?: string } | undefined;
    const partnerName = partner?.display_name || "your partner";

    const digest = await buildWeeklyDigest(coupleId, id, partnerId, partnerName, today);
    const noActivity =
      digest.missionsYouDid === 0 &&
      digest.missionsPartnerDid === 0 &&
      digest.gesturesYouNoticed === 0 &&
      digest.gesturesPartnerNoticed === 0;
    if (noActivity) continue;

    const ok = await sendDigestEmail(me.email, me.display_name || "", digest);
    if (ok) sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
