"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { THEMES } from "@/lib/themes";

interface Mission {
  id: string;
  title: string;
  instruction: string;
  status: "assigned" | "completed";
  swap_count?: number;
  guessed?: boolean;
  noticed?: boolean;
}
interface Stats {
  reflectionStreak: number;
  noticedCount: number;
}
interface Reveal {
  title: string;
  instruction: string;
  theme_label: string;
  guessed_label: string;
  guess_text: string;
  is_correct: boolean;
  completed_at?: string | null;
}
interface State {
  paired: boolean;
  date: string;
  loggedToday?: boolean;
  mission?: Mission | null;
  guess?: { guessable: boolean; reveal: Reveal | null };
  stats?: Stats;
  notifyOptIn?: boolean;
}

// The evening reflection unlocks at 19:30 local time.
const UNLOCK_HOUR = 19;
const UNLOCK_MIN = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// A ?devDate=YYYY-MM-DD in the URL flows through every request so the
// next-day loop can be exercised without waiting (ignored in production).
function devDate(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("devDate");
}
function withDev(body: Record<string, unknown> = {}) {
  const d = devDate();
  return d ? { ...body, devDate: d } : body;
}
// ?lock=1 forces the anticipation screen, ?lock=0 forces it unlocked — handy
// for previewing either side of 19:30 at any time of day.
function lockOverride(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("lock");
}

// "15:42" UTC ISO → "3:42pm" in the viewer's local time. Lowercase am/pm
// reads softer than the screaming "PM" the default formatter emits.
function formatClockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s?(AM|PM)$/i, (m) => m.trim().toLowerCase());
}

function msUntilUnlock(now: number): number {
  const u = new Date(now);
  u.setHours(UNLOCK_HOUR, UNLOCK_MIN, 0, 0);
  return u.getTime() - now; // > 0 while still locked
}
function isUnlocked(now: number): boolean {
  const o = lockOverride();
  if (o === "1") return false;
  if (o === "0") return true;
  return msUntilUnlock(now) <= 0;
}

// --- Day jottings: quick good/bad notes, stored per user per day on-device. ---
interface Jot {
  good: string[];
  bad: string[];
}
function jotKey(userId: string, date: string) {
  return `ha:jot:${userId}:${date}`;
}
function loadJot(userId: string, date: string): Jot {
  if (typeof window === "undefined") return { good: [], bad: [] };
  try {
    const raw = localStorage.getItem(jotKey(userId, date));
    if (raw) {
      const p = JSON.parse(raw);
      return {
        good: Array.isArray(p.good) ? p.good : [],
        bad: Array.isArray(p.bad) ? p.bad : [],
      };
    }
  } catch {
    // ignore malformed storage
  }
  return { good: [], bad: [] };
}
function saveJot(userId: string, date: string, j: Jot) {
  try {
    localStorage.setItem(jotKey(userId, date), JSON.stringify(j));
  } catch {
    // storage may be unavailable (private mode) — jottings just won't persist
  }
}

function ceremonyKey(userId: string, date: string) {
  return `ha:unlocked:${userId}:${date}`;
}
function ceremonyOpened(userId: string, date: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ceremonyKey(userId, date)) === "1";
  } catch {
    return false;
  }
}
function markCeremonyOpened(userId: string, date: string) {
  try {
    localStorage.setItem(ceremonyKey(userId, date), "1");
  } catch {
    // ignore
  }
}

export default function TodayHub({
  partnerName,
  userId,
}: {
  partnerName: string;
  userId: string;
}) {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<number>(() => Date.now());

  const refresh = useCallback(async () => {
    const d = devDate();
    const res = await fetch(`/api/state${d ? `?devDate=${d}` : ""}`, { cache: "no-store" });
    if (res.ok) setState(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
    };
  }, [refresh]);

  if (loading) return <div className="muted">Loading…</div>;
  if (!state) return <div className="error">Couldn&apos;t load. Try refreshing.</div>;

  const screen = !isUnlocked(now) ? (
    <Anticipation state={state} partnerName={partnerName} userId={userId} now={now} onDone={refresh} />
  ) : (
    <Evening state={state} partnerName={partnerName} userId={userId} onDone={refresh} />
  );

  return (
    <>
      <StatsBar stats={state.stats} />
      {screen}
      <ReminderToggle initial={state.notifyOptIn ?? true} />
    </>
  );
}

// A pair of soft, never-punitive numbers. Hidden until there's something warm
// to show (no "0 day streak").
function StatsBar({ stats }: { stats?: Stats }) {
  if (!stats) return null;
  const { reflectionStreak, noticedCount } = stats;
  if (reflectionStreak <= 0 && noticedCount <= 0) return null;

  return (
    <div className="chips" style={{ marginBottom: 16 }}>
      {reflectionStreak > 0 && (
        <span className="pill good">
          {reflectionStreak} {reflectionStreak === 1 ? "evening" : "evenings"} in a row
        </span>
      )}
      {noticedCount > 0 && (
        <span className="pill">
          {noticedCount} {noticedCount === 1 ? "gesture" : "gestures"} noticed
        </span>
      )}
    </div>
  );
}

// Opt in/out of the evening email nudge.
function ReminderToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notify_opt_in: next }),
    });
    setBusy(false);
    if (!res.ok) setOn(!next); // revert on failure
  }

  return (
    <div className="row" style={{ marginTop: 4, padding: "0 4px" }}>
      <span className="muted">Email me an evening reminder at 7:30</span>
      <button
        className={`pill${on ? " good" : ""}`}
        onClick={toggle}
        disabled={busy}
        type="button"
        style={{ cursor: "pointer", background: "transparent" }}
      >
        {on ? "On" : "Off"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Before 19:30 — anticipation: countdown, how-it-works, mission, guess, jotting.
// ---------------------------------------------------------------------------

function Anticipation({
  state,
  partnerName,
  userId,
  now,
  onDone,
}: {
  state: State;
  partnerName: string;
  userId: string;
  now: number;
  onDone: () => void;
}) {
  return (
    <>
      <CountdownCard now={now} />
      <HowItWorks />
      <MissionCard mission={state.mission ?? null} partnerName={partnerName} />
      <GuessCard
        guessable={state.guess?.guessable ?? false}
        reveal={state.guess?.reveal ?? null}
        partnerName={partnerName}
        onDone={onDone}
      />
      <QuickCapture userId={userId} date={state.date} />
    </>
  );
}

function CountdownCard({ now }: { now: number }) {
  let ms = msUntilUnlock(now);
  if (ms <= 0) ms += DAY_MS; // only happens under ?lock=1 preview
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="card anticipation">
      <div className="card-tag">Tonight at 7:30pm</div>
      <h2>Something quietly lovely is on its way…</h2>
      <p className="muted">
        Your evening reflection unlocks at 19:30. Until then, do your secret
        mission, take a guess, and catch the little moments as they happen.
      </p>
      <div className="countdown">
        {pad(h)}
        <span>:</span>
        {pad(m)}
        <span>:</span>
        {pad(s)}
      </div>
      <p className="muted">until tonight&apos;s unlock</p>
    </div>
  );
}

function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn btn-ghost btn-block"
        style={{ marginBottom: 16 }}
        onClick={() => setOpen(true)}
        type="button"
      >
        How does this work?
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-tag">How Hidden Agenda works</div>
            <p>
              Each day you&apos;re given one small, <strong>secret mission</strong> — a
              kind little gesture to weave naturally into your day. Do it quietly and
              see if your partner notices. They have a secret mission too, and you each
              try to guess the other&apos;s.
            </p>
            <p>
              Every evening at <strong>7:30</strong> you take a few quiet moments to
              answer three little things: one good moment, one small grumble, and your
              guess at today&apos;s task. Your notes stay <strong>private to you</strong> —
              they gently shape the missions you each get, so it keeps feeling more like
              the two of you. No scores, no blame. Just two people quietly delighting
              each other.
            </p>
            <button className="btn btn-block" onClick={() => setOpen(false)} type="button">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function QuickCapture({ userId, date }: { userId: string; date: string }) {
  const [jot, setJot] = useState<Jot>(() => loadJot(userId, date));
  const [good, setGood] = useState("");
  const [bad, setBad] = useState("");

  function add(kind: "good" | "bad") {
    const val = (kind === "good" ? good : bad).trim();
    if (!val) return;
    const next: Jot = { ...jot, [kind]: [...jot[kind], val] };
    setJot(next);
    saveJot(userId, date, next);
    if (kind === "good") setGood("");
    else setBad("");
  }
  function remove(kind: "good" | "bad", i: number) {
    const next: Jot = { ...jot, [kind]: jot[kind].filter((_, idx) => idx !== i) };
    setJot(next);
    saveJot(userId, date, next);
  }

  return (
    <div className="card">
      <div className="card-tag">Jot it down · just for you</div>
      <h2>Little moments today</h2>
      <p className="muted">
        Catch them as they happen — tonight you can turn these into your reflection.
      </p>

      <label className="label" style={{ marginTop: 14 }}>
        A good thing
      </label>
      <div className="capture-row">
        <input
          className="input"
          style={{ marginTop: 0 }}
          value={good}
          onChange={(e) => setGood(e.target.value)}
          placeholder="Something they did you loved"
          maxLength={200}
          onKeyDown={(e) => e.key === "Enter" && add("good")}
        />
        <button className="btn" onClick={() => add("good")} type="button">
          Add
        </button>
      </div>
      {jot.good.length > 0 && (
        <div className="chips">
          {jot.good.map((g, i) => (
            <button key={i} className="chip" type="button" onClick={() => remove("good", i)}>
              {g} ✕
            </button>
          ))}
        </div>
      )}

      <label className="label" style={{ marginTop: 16 }}>
        A bad thing
      </label>
      <div className="capture-row">
        <input
          className="input"
          style={{ marginTop: 0 }}
          value={bad}
          onChange={(e) => setBad(e.target.value)}
          placeholder="Something that grated a little"
          maxLength={200}
          onKeyDown={(e) => e.key === "Enter" && add("bad")}
        />
        <button className="btn" onClick={() => add("bad")} type="button">
          Add
        </button>
      </div>
      {jot.bad.length > 0 && (
        <div className="chips">
          {jot.bad.map((b, i) => (
            <button key={i} className="chip" type="button" onClick={() => remove("bad", i)}>
              {b} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// After 19:30 — the ceremony: unlock, then one question per screen, then a
// quiet summary.
// ---------------------------------------------------------------------------

function Evening({
  state,
  partnerName,
  userId,
  onDone,
}: {
  state: State;
  partnerName: string;
  userId: string;
  onDone: () => void;
}) {
  const loggedToday = !!state.loggedToday;
  const guessable = state.guess?.guessable ?? false;
  const reveal = state.guess?.reveal ?? null;
  const guessPending = guessable && !reveal;
  const allDone = loggedToday && !guessPending;

  const [opened, setOpened] = useState<boolean>(() => ceremonyOpened(userId, state.date));

  if (allDone) {
    return <EveningSummary state={state} partnerName={partnerName} />;
  }

  if (!opened) {
    return (
      <div className="card anticipation">
        <div className="card-tag">It&apos;s time</div>
        <h2>Tonight&apos;s reflection is ready</h2>
        <p className="muted">
          A quiet few moments before bed — three little things, one at a time.
        </p>
        <button
          className="btn btn-block"
          style={{ marginTop: 16 }}
          onClick={() => {
            markCeremonyOpened(userId, state.date);
            setOpened(true);
          }}
          type="button"
        >
          Unlock tonight ✨
        </button>
      </div>
    );
  }

  return (
    <ReflectionWizard
      state={state}
      partnerName={partnerName}
      userId={userId}
      onDone={onDone}
    />
  );
}

function ReflectionWizard({
  state,
  partnerName,
  userId,
  onDone,
}: {
  state: State;
  partnerName: string;
  userId: string;
  onDone: () => void;
}) {
  const jot = useMemo(() => loadJot(userId, state.date), [userId, state.date]);
  const guessable = state.guess?.guessable ?? false;
  const reveal = state.guess?.reveal ?? null;

  // Step list is fixed at mount so it doesn't shift as state refreshes mid-flow.
  const [steps] = useState<("good" | "bad" | "guess")[]>(() => {
    const s: ("good" | "bad" | "guess")[] = [];
    if (!state.loggedToday) s.push("good", "bad");
    s.push("guess");
    return s;
  });

  const [i, setI] = useState(0);
  const [good, setGood] = useState("");
  const [bad, setBad] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const step = steps[i];
  const n = steps.length;

  async function saveLog(): Promise<boolean> {
    setBusy(true);
    setError("");
    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withDev({ irritation_text: bad, happy_text: good })),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return false;
    }
    return true;
  }

  async function advanceFromBad() {
    if (!good.trim() && !bad.trim()) {
      setError("Add at least one note across these two screens.");
      return;
    }
    const ok = await saveLog();
    if (ok) setI((v) => v + 1);
  }

  if (step === "good") {
    return (
      <ReflectStep
        stepLabel={`Step 1 of ${n}`}
        tag="One good thing"
        title={`Something lovely about today with ${partnerName}?`}
        hint="Pick one from today's jottings, or write a fresh one."
        placeholder="Something they did that you loved."
        options={jot.good}
        value={good}
        setValue={setGood}
        onNext={() => {
          setError("");
          setI((v) => v + 1);
        }}
        nextLabel="Next"
        busy={false}
        error=""
      />
    );
  }

  if (step === "bad") {
    return (
      <ReflectStep
        stepLabel={`Step 2 of ${n}`}
        tag="One small grumble"
        title="And one thing that grated a little?"
        hint="Stays private to you. It only ever shapes which area tomorrow's mission lands in — never the wording."
        placeholder="Kept just between you and the app."
        options={jot.bad}
        value={bad}
        setValue={setBad}
        onNext={advanceFromBad}
        nextLabel={busy ? "Saving…" : "Save & continue"}
        busy={busy}
        error={error}
      />
    );
  }

  // step === "guess"
  return (
    <>
      <div className="step-label">{`Step ${n} of ${n} · the guess`}</div>
      {guessable ? (
        <GuessCard guessable reveal={reveal} partnerName={partnerName} onDone={onDone} />
      ) : (
        <div className="card">
          <div className="card-tag">The guess</div>
          <h2>No mission to guess just yet</h2>
          <p className="muted">
            Once {partnerName} has a mission, you&apos;ll guess it here. Tonight just
            primes the pump — your first missions arrive tomorrow once you&apos;ve both
            logged an evening.
          </p>
          <button className="btn btn-block" style={{ marginTop: 14 }} onClick={onDone} type="button">
            Finish for tonight
          </button>
        </div>
      )}
    </>
  );
}

function ReflectStep({
  stepLabel,
  tag,
  title,
  hint,
  placeholder,
  options,
  value,
  setValue,
  onNext,
  nextLabel,
  busy,
  error,
}: {
  stepLabel: string;
  tag: string;
  title: string;
  hint: string;
  placeholder: string;
  options: string[];
  value: string;
  setValue: (v: string) => void;
  onNext: () => void;
  nextLabel: string;
  busy: boolean;
  error: string;
}) {
  return (
    <>
      <div className="step-label">{stepLabel}</div>
      <div className="card">
        <div className="card-tag">{tag}</div>
        <h2>{title}</h2>
        <p className="muted">{hint}</p>
        {options.length > 0 && (
          <>
            <label className="label" style={{ marginTop: 12 }}>
              From today&apos;s jottings
            </label>
            <div className="chips">
              {options.map((o, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`chip${value === o ? " selected" : ""}`}
                  onClick={() => setValue(o)}
                >
                  {o}
                </button>
              ))}
            </div>
          </>
        )}
        <label className="label" style={{ marginTop: 14 }}>
          {options.length > 0 ? "Or write it now" : "Write it now"}
        </label>
        <textarea
          className="textarea"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          maxLength={1000}
        />
        <button
          className="btn btn-block"
          style={{ marginTop: 14 }}
          onClick={onNext}
          disabled={busy}
          type="button"
        >
          {nextLabel}
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    </>
  );
}

function EveningSummary({ state, partnerName }: { state: State; partnerName: string }) {
  return (
    <>
      <div className="card anticipation">
        <div className="card-tag">Tonight</div>
        <h2>All done for tonight 💛</h2>
        <p className="muted">
          Your notes are saved and private. They&apos;ll quietly shape tomorrow&apos;s
          missions. Sleep well.
        </p>
      </div>
      <MissionCard mission={state.mission ?? null} partnerName={partnerName} />
      {state.guess?.reveal && (
        <GuessCard
          guessable={false}
          reveal={state.guess.reveal}
          partnerName={partnerName}
          onDone={() => {}}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared cards (mission + guess) — used on both the day and evening screens.
// ---------------------------------------------------------------------------

function MissionCard({ mission, partnerName }: { mission: Mission | null; partnerName: string }) {
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [swapError, setSwapError] = useState("");

  async function complete() {
    setBusy(true);
    await fetch("/api/mission/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withDev()),
    });
    setBusy(false);
    window.location.reload();
  }

  async function swap() {
    setSwapping(true);
    setSwapError("");
    const res = await fetch("/api/mission/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withDev()),
    });
    const data = await res.json().catch(() => ({}));
    setSwapping(false);
    if (!res.ok) {
      setSwapError(data.error ?? "Couldn't swap right now");
      return;
    }
    window.location.reload();
  }

  const canSwap = !!mission && mission.status === "assigned" && (mission.swap_count ?? 0) < 1;

  if (!mission) {
    return (
      <div className="card">
        <div className="card-tag">Today&apos;s mission</div>
        <h2>Nothing yet — check back soon</h2>
        <p className="muted">
          Your mission appears once there&apos;s a little to go on. Keep sharing your
          evening notes and it&apos;ll be here tomorrow.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-tag">Today&apos;s mission · just for you</div>
      <h2>{mission.title}</h2>
      <p style={{ fontSize: 16 }}>{mission.instruction}</p>
      <p className="muted" style={{ marginTop: 6 }}>
        Do it naturally today and see if {partnerName} notices.
      </p>
      {mission.noticed && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(74,222,128,0.10)",
            border: "1px solid var(--good)",
          }}
        >
          💛 {partnerName} noticed — your gesture landed.
        </div>
      )}
      {mission.status === "completed" ? (
        <span className="pill good" style={{ marginTop: 12 }}>
          Done ✓
        </span>
      ) : (
        <button className="btn btn-block" style={{ marginTop: 14 }} onClick={complete} disabled={busy}>
          {busy ? "Saving…" : "I did it"}
        </button>
      )}
      {canSwap && (
        <button
          className="btn btn-ghost btn-block"
          style={{ marginTop: 8 }}
          onClick={swap}
          disabled={swapping}
          type="button"
        >
          {swapping ? "Finding another…" : "Not feeling this one? Swap it"}
        </button>
      )}
      {swapError && <div className="error">{swapError}</div>}
    </div>
  );
}

function GuessCard({
  guessable,
  reveal,
  partnerName,
  onDone,
}: {
  guessable: boolean;
  reveal: Reveal | null;
  partnerName: string;
  onDone: () => void;
}) {
  const [theme, setTheme] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localReveal, setLocalReveal] = useState<Reveal | null>(null);

  const shown = reveal ?? localReveal;

  if (shown) {
    const doneAt = shown.completed_at ? formatClockTime(shown.completed_at) : null;
    return (
      <div className="card">
        <div className="card-tag">The reveal</div>
        <h2>{partnerName}&apos;s mission was…</h2>
        <p style={{ fontSize: 16 }}>
          <strong>{shown.title}</strong> — {shown.instruction}
        </p>
        {doneAt && (
          <p className="muted" style={{ marginTop: 6 }}>
            {partnerName} did it around {doneAt}.
          </p>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <span className="muted">You guessed: {shown.guessed_label}</span>
          {shown.is_correct ? (
            <span className="pill good">You noticed! ✓</span>
          ) : (
            <span className="pill bad">Theme was {shown.theme_label}</span>
          )}
        </div>
        {shown.is_correct && (
          <p style={{ marginTop: 12, color: "var(--good)" }}>
            💛 You picked up on it without being told — that means {partnerName}&apos;s
            gesture truly landed. That noticing is the whole point.
          </p>
        )}
      </div>
    );
  }

  if (!guessable) {
    return (
      <div className="card">
        <div className="card-tag">Did you notice?</div>
        <h2>No mission to guess yet</h2>
        <p className="muted">
          Once {partnerName} has a mission today, you can guess what it was.
        </p>
      </div>
    );
  }

  async function submit() {
    if (!theme) {
      setError("Pick a category first.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withDev({ guessed_theme: theme, guess_text: text })),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }
    setLocalReveal(data.reveal);
    onDone();
  }

  return (
    <div className="card">
      <div className="card-tag">Did you notice?</div>
      <h2>What was {partnerName} up to today?</h2>
      <p className="muted">
        Think about your day together. Which area do you think their secret
        mission was in?
      </p>
      <div className="chips">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`chip${theme === t.id ? " selected" : ""}`}
            onClick={() => setTheme(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>
      <input
        className="input"
        style={{ marginTop: 12 }}
        placeholder="Optional: what exactly do you think they did?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={200}
      />
      <button className="btn btn-block" style={{ marginTop: 14 }} onClick={submit} disabled={busy}>
        {busy ? "Revealing…" : "Lock in my guess"}
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
