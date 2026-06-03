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
    <div className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm flex flex-col gap-4 p-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="flex flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/crossian-logo.svg" alt="Crossian" className="h-7 w-auto self-start" />
          <div>
            <h1 className="text-xl font-bold">EmailAuto Studio</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              {mode === "signin" ? "Sign in to your account" : "Create an account"}
            </p>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            autoComplete="email"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        </label>
        {error && <div className="text-xs text-[#ff6b6b]">{error}</div>}
        {notice && <div className="text-xs text-[#3ecf8e]">{notice}</div>}
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          className="text-xs text-[var(--muted)] hover:text-[var(--text)] underline"
        >
          {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
        <style>{`
          .input { width:100%; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:9px 11px; color:var(--text); font-size:14px; }
          .btn-primary { background:var(--accent); color:#fff; border:none; border-radius:8px; padding:10px 16px; font-size:14px; font-weight:600; cursor:pointer; }
          .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
        `}</style>
      </form>
    </div>
  );
}
