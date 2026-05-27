// Server-only. Sends the evening reflection nudge via Brevo's transactional
// email API (HTTP — no SMTP dependency). Reuses the Brevo account already set
// up for Supabase auth. Needs BREVO_API_KEY and BREVO_SENDER ("Name <addr>"
// or just an address). If either is missing, sending is a no-op so the cron
// never errors in environments without email configured.

function parseSender(): { name: string; email: string } | null {
  const raw = process.env.BREVO_SENDER;
  if (!raw) return null;
  const match = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) return { name: match[1] || "Hidden Agenda", email: match[2] };
  return { name: "Hidden Agenda", email: raw.trim() };
}

export async function sendReminderEmail(
  to: string,
  name: string,
  partnerName: string,
): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = parseSender();
  if (!apiKey || !sender || !to) return false;

  const greeting = name ? `Hi ${name},` : "Hi,";
  const html =
    `<p>${greeting}</p>` +
    `<p>It's time for tonight's reflection on Hidden Agenda — a quiet couple of ` +
    `minutes before bed. One good moment, one small grumble, and your guess at ` +
    `today's secret mission.</p>` +
    `<p>Your notes stay private to you, and they gently shape the little gestures ` +
    `you and ${partnerName} get tomorrow.</p>` +
    `<p>— Hidden Agenda</p>`;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to, name: name || undefined }],
        subject: "Tonight's reflection is ready",
        htmlContent: html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
