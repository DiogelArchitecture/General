// The app runs on a single "couple day" boundary. We use the local date of
// whoever's device, formatted as YYYY-MM-DD, as the key for entries and tasks.
// A ?devDate=YYYY-MM-DD override is honoured in non-production to make it easy
// to test the next-day loop without waiting.

export function todayKey(devDate?: string | null): string {
  if (devDate && /^\d{4}-\d{2}-\d{2}$/.test(devDate) && process.env.NODE_ENV !== "production") {
    return devDate;
  }
  return localDateKey(new Date());
}

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function previousKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return localDateKey(dt);
}

// Days between two YYYY-MM-DD keys (a - b), used for recency weighting.
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((da - db) / 86_400_000);
}
