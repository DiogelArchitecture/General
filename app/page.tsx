import { redirect } from "next/navigation";
import { getUserContext } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export default async function Home() {
  const ctx = await getUserContext();
  if (ctx) redirect("/today");

  return (
    <main className="shell">
      <div className="brand">Hidden Agenda</div>
      <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>
        A quietly thoughtful game for two.
      </h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        Each evening you each note one small thing. Each day the app gives you a
        gentle, secret mission — and your partner tries to notice. No scores to
        settle, no fingers pointed. Just two people quietly delighting each other.
      </p>
      <LoginForm />
    </main>
  );
}
