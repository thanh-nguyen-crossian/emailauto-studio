"use client";

import type { Flag } from "@/lib/briefgen";

// Renders the validation flags + score the engine attaches to a generated option.
export function PreflightPanel({ flags, score }: { flags?: Flag[]; score?: number }) {
  const list = flags || [];
  const errors = list.filter((f) => f.type === "error");
  const warns = list.filter((f) => f.type === "warn");
  const s = typeof score === "number" ? score : 100;
  const scoreColor = s >= 85 ? "var(--ok)" : s >= 60 ? "var(--warn)" : "var(--bad)";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">Quality checks</h3>
        <span className="text-sm font-bold" style={{ color: scoreColor }}>
          {s}/100
        </span>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-[var(--ok)]">✅ No issues flagged.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {errors.concat(warns).map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span aria-hidden>{f.type === "error" ? "❌" : "⚠️"}</span>
              <span style={{ color: f.type === "error" ? "var(--bad)" : "var(--warn)" }}>{f.msg}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
