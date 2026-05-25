"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="card">
        <div className="card-tag">Check your email</div>
        <h2>Magic link sent</h2>
        <p className="muted">
          We sent a sign-in link to <strong>{email}</strong>. Open it on this
          device to continue.
        </p>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={send}>
      <div className="card-tag">Sign in</div>
      <label className="label" htmlFor="email">
        Your email — we&apos;ll send a one-tap sign-in link
      </label>
      <input
        id="email"
        className="input"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="btn btn-block" style={{ marginTop: 14 }} disabled={loading}>
        {loading ? "Sending…" : "Send my link"}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
