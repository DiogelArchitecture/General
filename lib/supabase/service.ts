import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS, so it is ONLY ever imported by /api
// route handlers running on the server. It performs the cross-partner reads
// (task generation, reveal) that RLS deliberately forbids to the browser.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
