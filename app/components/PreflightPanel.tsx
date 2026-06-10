"use client";

import type { Flag } from "@/lib/briefgen";
import { flagTierCounts } from "@/lib/briefgen";
import type { BodyVarietyProfile } from "@/lib/config/types";

const CATEGORIES = [
  {
    label: "Message Promise",
    pattern: /subject|preheader|hook|first.name|segment|shared.thread|options|opener|body.variant|persona|sign.?off/i,
  },
  {
    label: "Offer / Product / Design",
    pattern: /product|cta|price|offer|banner|grid|image|200px|orphan|count|review|proof|p\.s\.|word/i,
  },
  {
    label: "Format / Spam",
    pattern: /spam|weak|bold|accent|markdown|link|bullet|paragraph|formatting/i,
  },
  {
    label: "Technical / Brand",
    pattern: /.*/i,
  },
] as const;

function categorize(msg: string): number {
  for (let i = 0; i < CATEGORIES.length - 1; i++) {
    if (CATEGORIES[i].pattern.test(msg)) return i;
  }
  return CATEGORIES.length - 1;
}

function VarietyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0 font-semibold text-[var(--muted)] w-20">{label}</span>
      <span className="text-[var(--text)]">{value}</span>
    </div>
  );
}

export function PreflightPanel({ flags, score, variety }: { flags?: Flag[]; score?: number; variety?: BodyVarietyProfile }) {
  const list = flags || [];
  const errors = list.filter((f) => f.type === "error");
  const warns = list.filter((f) => f.type === "warn");
  const s = typeof score === "number" ? score : 100;
  const tiers = flagTierCounts(list);
  const seriousCount = tiers.errors + tiers.serious;
  const scoreColor = s >= 80 ? "var(--ok)" : s >= 55 ? "var(--warn)" : "var(--bad)";
  const status = s >= 80 ? "PASS" : s >= 55 ? "REVIEW" : "FIX ERRORS";
  const statusDesc =
    seriousCount === 0
      ? s >= 80
        ? "Ready to export"
        : "Only polish/structural notes — review and send"
      : `${seriousCount} serious issue${seriousCount !== 1 ? "s" : ""} to resolve before sending`;

  const grouped = CATEGORIES.map((cat, i) => ({
    label: cat.label,
    items: list.filter((f) => categorize(f.msg) === i),
  }));

  return (
    <div className="section-panel">
      {variety && (
        <div className="mb-4 rounded-lg border p-3 flex flex-col gap-1.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-0.5">Body Variety — auto-selected</span>
          <div className="grid grid-cols-1 gap-1">
            <VarietyRow label="Opener" value={variety.openerMechanicLabel} />
            <VarietyRow label="Character" value={`${variety.namedCharacter} (${variety.characterRole})`} />
            <VarietyRow label="Pain focus" value={variety.painPoint} />
            <VarietyRow label="Sensory" value={`"${variety.sensoryPhrase}"`} />
            <VarietyRow label="Arc" value={variety.emotionalArcLabel} />
            <VarietyRow label="Lens" value={variety.creativeLens} />
            <VarietyRow label="Proof" value={variety.proofRole} />
            <VarietyRow label="Subject" value={variety.subjectStyle} />
            <VarietyRow label="Visual" value={variety.visualDirection} />
          </div>
        </div>
      )}
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">Pre-flight QA</h3>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            {errors.length > 0 && (
              <span style={{ color: "var(--bad)" }} className="font-semibold">
                {errors.length} error{errors.length !== 1 ? "s" : ""}
              </span>
            )}
            {errors.length > 0 && warns.length > 0 && (
              <span className="text-[var(--muted)]"> · </span>
            )}
            {warns.length > 0 && (
              <span style={{ color: "var(--warn)" }}>
                {warns.length} warning{warns.length !== 1 ? "s" : ""}
              </span>
            )}
            {list.length === 0 && (
              <span style={{ color: "var(--ok)" }}>No issues</span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-xl font-extrabold leading-none" style={{ color: scoreColor }}>
            {s}/100
          </span>
          <span className="status-pill" style={{ color: scoreColor }}>
            {status}
          </span>
          <span className="text-[10px] text-[var(--muted)] mt-0.5">{statusDesc}</span>
          {list.length > 0 && (
            <span className="text-[10px] text-[var(--muted)]">
              {tiers.errors > 0 ? `${tiers.errors} err · ` : ""}{tiers.serious} serious · {tiers.structural} structural · {tiers.cosmetic} polish
            </span>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div
          className="rounded-lg border p-3"
          style={{ borderColor: "var(--ok)", background: "rgba(15,112,79,0.05)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--ok)" }}>
            All checks passed
          </p>
          <p className="text-xs text-[var(--muted)] mt-1">
            Hook contract, subjects, body copy, product blocks, formatting, and self-QA checks all
            clear.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    {group.label}
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: group.items.some((f) => f.type === "error")
                        ? "rgba(180,35,35,0.1)"
                        : "rgba(148,88,0,0.1)",
                      color: group.items.some((f) => f.type === "error")
                        ? "var(--bad)"
                        : "var(--warn)",
                    }}
                  >
                    {group.items.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {group.items.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        className="status-pill shrink-0 mt-0.5"
                        style={{
                          color: f.type === "error" ? "var(--bad)" : "var(--warn)",
                        }}
                      >
                        {f.type === "error" ? "Error" : "Warn"}
                      </span>
                      <span
                        className="text-xs leading-relaxed"
                        style={{
                          color: f.type === "error" ? "var(--bad)" : "var(--warn)",
                        }}
                      >
                        {f.msg}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
