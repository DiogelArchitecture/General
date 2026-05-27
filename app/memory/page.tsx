import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserContext } from "@/lib/auth";
import { getMemoryLane } from "@/lib/history";

function prettyDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default async function MemoryPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect("/");
  if (!ctx.coupleId || !ctx.partner) redirect("/onboarding");

  const partnerName = ctx.partner.display_name || "your partner";
  const { kindnesses, landed, noticed } = await getMemoryLane(
    ctx.coupleId,
    ctx.userId,
    ctx.partner.id,
  );

  const empty = kindnesses.length === 0 && landed.length === 0 && noticed.length === 0;

  return (
    <main className="shell">
      <div className="top">
        <div>
          <div className="brand">Memory Lane</div>
          <div className="muted">
            {ctx.profile.display_name || "You"} &amp; {partnerName}
          </div>
        </div>
        <Link className="btn btn-ghost" href="/today">
          Back
        </Link>
      </div>

      {empty && (
        <div className="card anticipation">
          <div className="card-tag">Nothing here yet</div>
          <h2>Your story starts soon</h2>
          <p className="muted">
            As you log good moments and notice each other&apos;s little gestures,
            they&apos;ll gather here — a quiet record of the kindness between you.
          </p>
        </div>
      )}

      {kindnesses.length > 0 && (
        <div className="card">
          <div className="card-tag">Things I&apos;ve loved</div>
          <h2>Good moments with {partnerName}</h2>
          <p className="muted">The happy notes you&apos;ve written, just for you.</p>
          <div style={{ marginTop: 14 }}>
            {kindnesses.map((k, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  {prettyDate(k.date)}
                </div>
                <div style={{ fontSize: 15 }}>{k.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {landed.length > 0 && (
        <div className="card">
          <div className="card-tag">Gestures that landed</div>
          <h2>{partnerName} noticed</h2>
          <p className="muted">Little things you did that didn&apos;t go unseen.</p>
          <div style={{ marginTop: 14 }}>
            {landed.map((t, i) => (
              <div key={i} className="row" style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 15 }}>{t.title}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {prettyDate(t.date)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {noticed.length > 0 && (
        <div className="card">
          <div className="card-tag">You caught these</div>
          <h2>Gestures you noticed</h2>
          <p className="muted">Times you picked up on {partnerName}&apos;s quiet kindness.</p>
          <div style={{ marginTop: 14 }}>
            {noticed.map((t, i) => (
              <div key={i} className="row" style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 15 }}>{t.title}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {prettyDate(t.date)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
