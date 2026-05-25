import { createClient } from "./supabase/server";

export interface Person {
  id: string;
  display_name: string;
}

export interface UserContext {
  userId: string;
  profile: Person;
  coupleId: string | null;
  partner: Person | null;
}

// Resolves who's logged in, their couple, and their partner — all under RLS.
export async function getUserContext(): Promise<UserContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: membership } = await supabase
    .from("couple_members")
    .select("couple_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const coupleId = membership?.couple_id ?? null;
  let partner: Person | null = null;

  if (coupleId) {
    const { data: members } = await supabase
      .from("couple_members")
      .select("user_id")
      .eq("couple_id", coupleId);
    const partnerId = (members ?? [])
      .map((m: { user_id: string }) => m.user_id)
      .find((id: string) => id !== user.id);
    if (partnerId) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", partnerId)
        .maybeSingle();
      if (p) partner = p as Person;
    }
  }

  return {
    userId: user.id,
    profile: (profile as Person) ?? { id: user.id, display_name: "" },
    coupleId,
    partner,
  };
}
