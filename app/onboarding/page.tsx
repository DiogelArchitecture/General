import { redirect } from "next/navigation";
import { getUserContext } from "@/lib/auth";
import Onboarding from "@/components/Onboarding";

export default async function OnboardingPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect("/");
  if (ctx.coupleId && ctx.partner) redirect("/today");

  return (
    <main className="shell">
      <div className="top">
        <div className="brand">Hidden Agenda</div>
      </div>
      <Onboarding
        initialName={ctx.profile.display_name}
        alreadyInCouple={!!ctx.coupleId}
      />
    </main>
  );
}
