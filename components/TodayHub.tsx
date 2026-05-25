"use client";

import { useCallback, useEffect, useState } from "react";
import { THEMES } from "@/lib/themes";

interface Mission {
  id: string;
  title: string;
  instruction: string;
  status: "assigned" | "completed";
  guessed?: boolean;
  noticed?: boolean;
}
interface Reveal {
  title: string;
  instruction: string;
  theme_label: string;
  guessed_label: string;
  guess_text: string;
  is_correct: boolean;
}
interface State {
  paired: boolean;
  date: string;
  loggedToday?: boolean;
  mission?: Mission | null;
  guess?: { guessable: boolean; reveal: Reveal | null };
}

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

export default function TodayHub({ partnerName }: { partnerName: string }) {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);

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
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  if (loading) return <div className="muted">Loading…</div>;
  if (!state) return <div className="error">Couldn&apos;t load. Try refreshing.</div>;

  return (
    <>
      <MissionCard mission={state.mission ?? null} partnerName={partnerName} />
      <GuessCard
        guessable={state.guess?.guessable ?? false}
        reveal={state.guess?.reveal ?? null}
        partnerName={partnerName}
        onDone={refresh}
      />
      <LogCard loggedToday={!!state.loggedToday} partnerName={partnerName} onDone={refresh} />
    </>
  );
}

function MissionCard({ mission, partnerName }: { mission: Mission | null; partnerName: string }) {
  const [busy, setBusy] = useState(false);

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
    return (
      <div className="card">
        <div className="card-tag">The reveal</div>
        <h2>{partnerName}&apos;s mission was…</h2>
        <p style={{ fontSize: 16 }}>
          <strong>{shown.title}</strong> — {shown.instruction}
        </p>
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

function LogCard({
  loggedToday,
  partnerName,
  onDone,
}: {
  loggedToday: boolean;
  partnerName: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(!loggedToday);
  const [irritation, setIrritation] = useState("");
  const [happy, setHappy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(loggedToday);

  async function submit() {
    if (!irritation.trim() && !happy.trim()) {
      setError("Add at least one note.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withDev({ irritation_text: irritation, happy_text: happy })),
    });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }
    setSaved(true);
    setOpen(false);
    setIrritation("");
    setHappy("");
    onDone();
  }

  if (saved && !open) {
    return (
      <div className="card">
        <div className="card-tag">Tonight&apos;s note</div>
        <div className="row">
          <span className="pill good">Saved for today ✓</span>
          <button className="btn btn-ghost" onClick={() => setOpen(true)}>
            Edit
          </button>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          Stays private to you. It quietly shapes {partnerName}&apos;s missions.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-tag">Tonight&apos;s note · private to you</div>
      <h2>How was today with {partnerName}?</h2>
      <label className="label" style={{ marginTop: 10 }}>
        One thing that grated a little
      </label>
      <textarea
        className="textarea"
        value={irritation}
        onChange={(e) => setIrritation(e.target.value)}
        placeholder="Kept just between you and the app."
        maxLength={1000}
      />
      <label className="label" style={{ marginTop: 12 }}>
        One thing that made you happy
      </label>
      <textarea
        className="textarea"
        value={happy}
        onChange={(e) => setHappy(e.target.value)}
        placeholder="Something they did that you loved."
        maxLength={1000}
      />
      <button className="btn btn-block" style={{ marginTop: 14 }} onClick={submit} disabled={busy}>
        {busy ? "Saving…" : "Save tonight’s note"}
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
