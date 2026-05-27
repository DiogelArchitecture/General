import { redirect } from "next/navigation";
import { getUserContext } from "@/lib/auth";
import TodayHub from "@/components/TodayHub";

export default async function TodayPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect("/");
  if (!ctx.coupleId || !ctx.partner) redirect("/onboarding");

  return (
    <main className="shell">
      <div className="top">
        <div>
          <div className="brand">Hidden Agenda</div>
          <div className="muted">
            {ctx.profile.display_name || "You"} &amp; {ctx.partner.display_name || "Partner"}
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <button className="btn btn-ghost" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <TodayHub
        partnerName={ctx.partner.display_name || "your partner"}
        userId={ctx.userId}
      />
    </main>
  );
}
