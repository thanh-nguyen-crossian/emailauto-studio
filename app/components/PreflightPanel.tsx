"use client";

import type { CheckResult } from "@/lib/preflight";

const ICON: Record<CheckResult["level"], string> = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
};

const COLOR: Record<CheckResult["level"], string> = {
  pass: "#3ecf8e",
  warn: "#f5c451",
  fail: "#ff6b6b",
};

export function PreflightPanel({ results }: { results: CheckResult[] }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <h3 className="text-sm font-semibold mb-3 text-[var(--text)]">Pre-flight checks</h3>
      <ul className="flex flex-col gap-2">
        {results.map((r) => (
          <li key={r.id} className="flex items-start gap-2 text-sm">
            <span aria-hidden>{ICON[r.level]}</span>
            <span>
              <span className="font-medium" style={{ color: COLOR[r.level] }}>
                {r.label}
              </span>
              <span className="text-[var(--muted)]"> — {r.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
