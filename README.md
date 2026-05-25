# Hidden Agenda

A quietly thoughtful daily game for couples. Each evening you each privately note
one thing that grated and one thing that made you happy about the other. The next
day the app gives each of you a small, secret **mission** — a kind gesture drawn
from the themes your partner has been noticing (steered by what's come up, how
often, and how recently). Your partner then tries to **notice/guess** what your
mission was, and it's revealed.

**The point:** missions are always framed as positive gestures. Your raw notes
are never shown to your partner, the person doing a mission never sees *why* it
was chosen, and the AI is hard-constrained never to reference a complaint. The
irritation you log only nudges *which area* a mission lands in — never its wording.

## Stack

- **Next.js (App Router) + React** — UI and serverless API routes, deploys to Vercel.
- **Supabase** — Postgres + email magic-link auth + Row Level Security for sync.
- **Claude API** (`@anthropic-ai/sdk`) — generates each mission; key stays server-side.

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). This creates the tables, the `create_couple` / `join_couple` functions, and all RLS policies.
3. In **Authentication → URL Configuration**, add your site URL and the redirect URL `http://localhost:3000/auth/callback` (and your production `https://<domain>/auth/callback`).
4. From **Project Settings → API**, copy the Project URL, the `anon` public key, and the `service_role` key.

### 2. Environment
Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # server-only, never exposed to the browser
ANTHROPIC_API_KEY=sk-ant-...       # server-only
```

The app works without `ANTHROPIC_API_KEY` — it falls back to a hand-written task
library and a keyword classifier, so you can try the full loop immediately and
switch AI on later.

### 3. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### 4. Deploy (Vercel)
Push to GitHub, import the repo in Vercel, and set the same four environment
variables in the Vercel project settings. Add your production
`https://<domain>/auth/callback` to the Supabase redirect URLs.

## How to test the whole loop (two players)

1. Open the app in a normal window and an incognito window — sign in as two
   different emails.
2. Pair them: one taps **Start a new couple** and shares the 6-character code;
   the other taps **Join** and enters it.
3. Both write tonight's note (one irritation + one happy).
4. Advance to "the next day": append `?devDate=YYYY-MM-DD` (a date after today) to
   the URL on both windows — e.g. `/today?devDate=2026-05-26`. Opening the page
   generates that day's missions. (The `devDate` override is ignored in production.)
5. Each window now shows a private mission, and a guess prompt for the partner's
   mission. Submit a guess to trigger the reveal.

## Privacy model (where it's enforced)

- `entries` are readable **only by their author** (RLS) — a partner can never read
  your raw notes.
- `tasks` are readable **only by the doer**, and expose just the positive action.
  The chosen theme and internal rationale live in `task_internals`, which has RLS
  on with **no policies**, so no browser session can read them — only server
  routes using the service role.
- The guesser can't see the partner's mission until they submit a guess; the
  reveal is served by `/api/guess` after recording the guess.

## Not in this version (planned next)

Gamification (points/streaks/levels), a DISC-style onboarding quiz that tailors
mission tone, an insights/trends dashboard, and scheduled push/email nudges.

---

_Note: the repository also still contains the earlier `index.html` MOSI-6
walkthrough. It is unrelated to this app and is not served by the Next.js build;
remove it if you don't need it._
