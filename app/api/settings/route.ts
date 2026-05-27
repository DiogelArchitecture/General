import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth";

// Flip the caller's own evening-reminder opt-in. Goes through the RLS client,
// so a user can only ever update their own profile row.
export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.notify_opt_in !== "boolean") {
    return NextResponse.json({ error: "notify_opt_in must be a boolean" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ notify_opt_in: body.notify_opt_in })
    .eq("id", ctx.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, notify_opt_in: body.notify_opt_in });
}
