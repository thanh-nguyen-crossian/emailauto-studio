"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

// Email + password sign in / sign up. On success the parent re-checks the session.
export function Auth({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const sb = supabase();
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) onAuthed();
        else setNotice("Account created. If email confirmation is on, check your inbox, then sign in.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuthed();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Dark, branded sign-in — independent of the app's light theme (scoped .auth-* styles).
    <main id="main-content" className="auth-root min-h-screen flex items-center justify-center px-6">
      <form onSubmit={submit} className="auth-card w-full max-w-sm flex flex-col gap-4 p-7 rounded-2xl">
        <div className="flex flex-col items-center gap-4 mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/crossian-logo.svg" alt="Crossian" className="h-8 w-auto" />
          <div className="text-center">
            <h1 className="text-xl font-bold">EmailAuto Studio</h1>
            <p className="text-sm auth-muted mt-1">
              {mode === "signin" ? "Sign in to your account" : "Create an account"}
            </p>
          </div>
        </div>
        <label htmlFor="auth-email" className="flex flex-col gap-1 text-sm">
          Email
          <input id="auth-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" autoComplete="email" />
        </label>
        <label htmlFor="auth-password" className="flex flex-col gap-1 text-sm">
          Password
          <input id="auth-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" autoComplete={mode === "signin" ? "current-password" : "new-password"} />
        </label>
        {error && <div className="text-xs" style={{ color: "#ff7a7a" }}>{error}</div>}
        {notice && <div className="text-xs" style={{ color: "#54d6a0" }}>{notice}</div>}
        <button type="submit" disabled={busy} className="auth-btn">
          {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null); }}
          className="text-xs auth-muted hover:opacity-80 underline self-center"
        >
          {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
        <style>{`
          .auth-root { background:#0b0d12; color:#e7eaf0; }
          .auth-card { background:#14171f; border:1px solid #242b39; box-shadow:0 12px 40px rgba(0,0,0,.45); }
          .auth-muted { color:#9aa3b2; }
          .auth-input { width:100%; background:#1b1f29; border:1px solid #2a3040; border-radius:8px; padding:9px 11px; color:#e7eaf0; font-size:14px; }
          .auth-input:focus { outline:none; border-color:#2f8d79; }
          .auth-btn { background:#23665a; color:#fff; border:none; border-radius:8px; padding:10px 16px; font-size:14px; font-weight:600; cursor:pointer; }
          .auth-btn:hover { background:#2a7768; }
          .auth-btn:disabled { opacity:.5; cursor:not-allowed; }
        `}</style>
      </form>
    </main>
  );
}
