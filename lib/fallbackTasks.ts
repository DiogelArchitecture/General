import type { ThemeId } from "./themes";

// Used only when the Claude call fails, so the daily loop never dead-ends.
// Each is a small, kind, forward-looking gesture — never a correction.
const FALLBACK: Record<ThemeId, { title: string; instruction: string }[]> = {
  affection: [
    { title: "A longer hello", instruction: "Greet them with a proper, unhurried hug today — a few seconds longer than usual." },
    { title: "Reach out first", instruction: "Find one quiet moment to hold their hand without being asked." },
  ],
  appreciation: [
    { title: "Name one thing", instruction: "Tell them one specific thing you admire about them today, out loud." },
    { title: "Thank the small stuff", instruction: "Thank them for something they usually do without anyone noticing." },
  ],
  quality_time: [
    { title: "Ten phone-free minutes", instruction: "Put your phone in another room and give them ten fully present minutes." },
    { title: "Ask and listen", instruction: "Ask how their day really went and let them finish without steering it." },
  ],
  home_tidiness: [
    { title: "Quietly reset a space", instruction: "Tidy one shared area before they get to it, without mentioning it." },
    { title: "One less thing", instruction: "Take care of one small household task that's usually theirs." },
  ],
  help_chores: [
    { title: "Lighten the load", instruction: "Do one chore today that they'd normally have to think about." },
    { title: "Get ahead of it", instruction: "Handle a task before it becomes something they have to ask for." },
  ],
  listening: [
    { title: "Fully tuned in", instruction: "When they speak today, put everything down and give them your eyes." },
    { title: "Follow the thread", instruction: "Remember something they mention and ask about it later in the day." },
  ],
  thoughtfulness: [
    { title: "A small surprise", instruction: "Do one tiny considerate thing they're not expecting today." },
    { title: "Their favourite", instruction: "Bring or make something small that you know they like." },
  ],
  space: [
    { title: "Room to breathe", instruction: "Give them an easy, unprompted bit of time to themselves today." },
    { title: "No strings", instruction: "Encourage them to do their own thing for a while, happily." },
  ],
  communication: [
    { title: "Open and warm", instruction: "Share one honest, low-stakes thing about your day before they ask." },
    { title: "Check in gently", instruction: "Ask if there's anything on their mind, and just receive it." },
  ],
  fun: [
    { title: "A bit of play", instruction: "Bring one light, playful moment into the day — a joke, a tease, a song." },
    { title: "Lighten it up", instruction: "Suggest something small and fun together, just because." },
  ],
};

export function fallbackTask(
  theme: ThemeId,
  seed: number,
  avoid: { title: string }[] = [],
) {
  const options = FALLBACK[theme];
  if (avoid.length > 0) {
    const avoidTitles = new Set(avoid.map((a) => a.title));
    const fresh = options.filter((o) => !avoidTitles.has(o.title));
    if (fresh.length > 0) return fresh[seed % fresh.length];
  }
  return options[seed % options.length];
}
