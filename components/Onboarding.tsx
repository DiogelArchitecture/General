"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Onboarding({
  initialName,
  alreadyInCouple,
}: {
  initialName: string;
  alreadyInCouple: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(initialName);
  const [nameSaved, setNameSaved] = useState(!!initialName);
  const [mode, setMode] = useState<"choose" | "join">("choose");
  const [joinCode, setJoinCode] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // If a couple was already created (waiting for the partner), surface the code.
  useEffect(() => {
    if (!alreadyInCouple) return;
    (async () => {
      const { data } = await supabase.from("couples").select("invite_code").maybeSingle();
      if (data?.invite_code) setInviteCode(data.invite_code);
    })();
  }, [alreadyInCouple, supabase]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setError("Session expired — please sign in again.");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name.trim() })
      .eq("id", user.id);
    setBusy(false);
    if (error) setError(error.message);
    else setNameSaved(true);
  }

  async function createCouple() {
    setError("");
    setBusy(true);
    const { data, error } = await supabase.rpc("create_couple");
    setBusy(false);
    if (error) setError(error.message);
    else if (data?.invite_code) setInviteCode(data.invite_code);
  }

  async function joinCouple(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await supabase.rpc("join_couple", { p_code: joinCode.trim().toUpperCase() });
    setBusy(false);
    if (error) setError(error.message);
    else router.push("/today");
  }

  if (!nameSaved) {
    return (
      <form className="card" onSubmit={saveName}>
        <div className="card-tag">Step 1 of 2</div>
        <h2>What should we call you?</h2>
        <p className="muted">Your partner will see this name.</p>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Adam"
          maxLength={40}
          required
        />
        <button className="btn btn-block" style={{ marginTop: 14 }} disabled={busy}>
          Continue
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    );
  }

  // Created a couple — show the code and wait for the partner to join.
  if (inviteCode) {
    return (
      <div className="card">
        <div className="card-tag">Step 2 of 2</div>
        <h2>Invite your partner</h2>
        <p className="muted">
          Share this code with your partner. They sign in, choose “Join”, and
          enter it.
        </p>
        <div className="code">{inviteCode}</div>
        <button
          className="btn btn-block"
          onClick={() => router.refresh()}
          disabled={busy}
        >
          We&apos;re connected — continue
        </button>
        <p className="muted" style={{ marginTop: 10 }}>
          (This button works once they&apos;ve joined.)
        </p>
      </div>
    );
  }

  if (mode === "join") {
    return (
      <form className="card" onSubmit={joinCouple}>
        <div className="card-tag">Step 2 of 2</div>
        <h2>Enter your partner&apos;s code</h2>
        <input
          className="input"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="6-character code"
          maxLength={6}
          autoCapitalize="characters"
          required
        />
        <button className="btn btn-block" style={{ marginTop: 14 }} disabled={busy}>
          Join
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          style={{ marginTop: 10 }}
          onClick={() => setMode("choose")}
        >
          Back
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    );
  }

  return (
    <div className="card">
      <div className="card-tag">Step 2 of 2</div>
      <h2>Connect with your partner</h2>
      <p className="muted">One of you starts a couple; the other joins with the code.</p>
      <button
        className="btn btn-block"
        style={{ marginTop: 14 }}
        onClick={createCouple}
        disabled={busy}
      >
        Start a new couple
      </button>
      <button
        className="btn btn-ghost btn-block"
        style={{ marginTop: 10 }}
        onClick={() => setMode("join")}
        disabled={busy}
      >
        I have a code to join
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
