"use client";

import type * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { AIProviderOption } from "@/lib/config/aiModels";
import type { AIModelSelection, BodyLayout, CampaignOps, EmailModuleKey, Product, ProductCopyStyle } from "@/lib/config/types";
import { flagTierCounts, segJsonKey, type GenBrief } from "@/lib/briefgen";
import { getBrandIntelligence, PROGRAM_INTELLIGENCE } from "@/lib/config/intelligence";
import { scoreFreshnessAgainstHistory } from "@/lib/quality/freshness";
import { analyzeListQuality, isPeakSend } from "@/lib/quality/listQuality";
import type { SendHistoryRow } from "@/lib/sendHistory";
import type { ProductLayout } from "@/lib/render/email";
import { CONSENT_OPTIONS, CUSTOM_PRODUCT_VALUE, OPS_PROVIDER_OPTIONS, type Slot } from "./studioShared";

export function CopyButton({ text, label = "Copy", className = "btn-ghost" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("ok");
        } catch {
          setState("err");
        }
        setTimeout(() => setState("idle"), 1500);
      }}
    >
      {state === "ok" ? "Copied ✓" : state === "err" ? "Copy failed" : label}
    </button>
  );
}

// Subject 42-58 (hard cap 60) and preheader 60-90 are the playbook bands; colour the char counts.
export function subjectLenColor(len: number): string {
  if (len >= 42 && len <= 58) return "var(--ok)";
  if (len <= 60 && len >= 36) return "var(--warn)";
  return "var(--bad)";
}
export function preheaderLenColor(len: number): string {
  if (len === 0) return "var(--muted)";
  if (len >= 60 && len <= 90) return "var(--ok)";
  if (len >= 50 && len <= 100) return "var(--warn)";
  return "var(--bad)";
}

export function relativeTime(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} day(s) ago`;
}

export function GenerationProgress({ elapsedSec, onCancel }: { elapsedSec: number; onCancel: () => void }) {
  const mins = Math.floor(elapsedSec / 60);
  const label = mins > 0 ? `${mins}m ${String(elapsedSec % 60).padStart(2, "0")}s` : `${elapsedSec}s`;
  const stage =
    elapsedSec < 20
      ? "Creating shared A/B foundations…"
      : elapsedSec < 60
      ? "Writing segment subject/body patches, then merging…"
      : "Still working through small segment batches — slower frontier models may take a few minutes.";
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="section-panel flex items-center gap-3">
      <span
        aria-hidden
        className="animate-spin shrink-0"
        style={{ display: "inline-block", width: 16, height: 16, borderRadius: 9999, border: "2px solid var(--border)", borderTopColor: "var(--text)" }}
      />
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium">Generating A + B — {label} elapsed</span>
        <span className="text-xs text-[var(--muted)]">{stage}</span>
      </div>
      <div className="flex-1" />
      <button onClick={onCancel} className="btn-ghost shrink-0">Cancel</button>
    </div>
  );
}

export function GenerationBudgetPanel({
  systemPrompt,
  userPrompt,
  segments,
  products,
  autoBatching,
  promptOverridesActive,
  modelA,
  modelB,
}: {
  systemPrompt: string;
  userPrompt: string;
  segments: number;
  products: number;
  autoBatching: boolean;
  promptOverridesActive: boolean;
  modelA: AIModelSelection;
  modelB: AIModelSelection;
}) {
  const inputTokens = estimateTokens(systemPrompt.length + userPrompt.length);
  const foundationOutput = 1400 + products * 260;
  const segmentOutput = segments * 720;
  const outputPerOption = autoBatching ? foundationOutput + segmentOutput : 1800 + segments * 850 + products * 220;
  const batchCount = autoBatching ? Math.max(1, segments) : 1;
  const baseCalls = autoBatching ? 2 + batchCount * 2 : batchCount * 2;
  const totalOutputBudget = outputPerOption * 2;
  const highRisk =
    promptOverridesActive && segments > 2 ||
    inputTokens > 9000 ||
    totalOutputBudget > 14000 ||
    [modelA, modelB].some((m) => modelOpsProfile(m).tier === "premium");
  return (
    <div className="section-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold">Generation budget</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">Estimate before spend: prompt size, expected output, batching, and model speed profile.</p>
        </div>
        <span className="status-pill" style={{ color: highRisk ? "var(--warn)" : "var(--ok)" }}>
          {highRisk ? "Watch cost/time" : "Healthy run"}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Summary k="Input estimate" v={`${inputTokens.toLocaleString()} tokens`} />
        <Summary k="Output estimate" v={`~${Math.round(totalOutputBudget / 1000)}k tokens`} />
        <Summary k="Base calls" v={`${baseCalls} call${baseCalls === 1 ? "" : "s"}`} />
        <Summary k="Batching" v={autoBatching ? `foundation + ${batchCount} segment patch${batchCount === 1 ? "" : "es"}` : promptOverridesActive && segments > 2 ? "Off: prompt edited" : "Single batch"} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
        <ModelBudgetCard label="Option A" selection={modelA} />
        <ModelBudgetCard label="Option B" selection={modelB} />
      </div>
      {promptOverridesActive && segments > 2 && (
        <div className="text-xs mt-2" style={{ color: "var(--warn)" }}>
          Custom prompt edits disable layered generation. Reset system/user prompt edits for more reliable large-segment runs.
        </div>
      )}
    </div>
  );
}

export function estimateTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

export function modelOpsProfile(selection: AIModelSelection): { tier: "fast" | "balanced" | "premium"; label: string } {
  const id = selection.model.toLowerCase();
  if (/opus|pro/.test(id) && !/mini|nano|flash-lite|lite/.test(id)) return { tier: "premium", label: "Premium quality, slower/costlier" };
  if (/haiku|flash|lite|mini|nano/.test(id)) return { tier: "fast", label: "Fast/economical" };
  return { tier: "balanced", label: "Balanced quality/speed" };
}

export function ModelBudgetCard({ label, selection }: { label: string; selection: AIModelSelection }) {
  const profile = modelOpsProfile(selection);
  const color = profile.tier === "premium" ? "var(--warn)" : profile.tier === "fast" ? "var(--ok)" : "var(--accent)";
  return (
    <div className="summary-tile">
      <div className="text-[10px] uppercase text-[var(--muted)]">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{selection.provider}</div>
      <div className="text-[11px] mono text-[var(--muted)] mt-0.5 truncate" title={selection.model}>{selection.model}</div>
      <div className="text-xs font-semibold mt-1" style={{ color }}>{profile.label}</div>
    </div>
  );
}

export function scoreColor(s?: number): string {
  const v = typeof s === "number" ? s : 100;
  return v >= 80 ? "var(--ok)" : v >= 55 ? "var(--warn)" : "var(--bad)";
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={id}>
      <span id={id} className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

export function Summary({ k, v }: { k: string; v: string }) {
  return (
    <div className="summary-tile">
      <div className="text-[10px] uppercase text-[var(--muted)]">{k}</div>
      <div className="mt-0.5 truncate" title={v}>{v}</div>
    </div>
  );
}

export function WorkflowSnapshot({
  brandName,
  send,
  offer,
  products,
  segments,
  score,
}: {
  brandName: string;
  send: string;
  offer: string;
  products: number;
  segments: number;
  score?: number;
}) {
  return (
    <div className="mb-5 grid grid-cols-2 md:grid-cols-5 gap-2">
      <SnapshotChip label="Brand" value={`${brandName} · ${send}`} />
      <SnapshotChip label="Offer stack" value={offer} />
      <SnapshotChip label="Products" value={`${products} selected`} tone={products > 6 ? "bad" : products ? "ok" : "warn"} />
      <SnapshotChip label="Segments" value={`${segments} variant${segments === 1 ? "" : "s"}`} tone={segments ? "ok" : "warn"} />
      <SnapshotChip label="Launch score" value={typeof score === "number" ? `${score}/100` : "Not generated"} tone={typeof score === "number" ? (score >= 85 ? "ok" : score >= 60 ? "warn" : "bad") : undefined} />
    </div>
  );
}

export function SnapshotChip({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color = tone ? `var(--${tone})` : "var(--muted)";
  return (
    <div className="snapshot-chip">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold truncate" title={value} style={{ color }}>{value}</div>
    </div>
  );
}

export function isPeakEvent(theme: string, sendDate: string): boolean {
  return isPeakSend(theme, sendDate);
}

export function SegmentQualityWarning({
  selectedCount,
  totalCount,
  audienceSource,
  segmentRule,
  theme,
  sendDate,
}: {
  selectedCount: number;
  totalCount: number;
  audienceSource: string;
  segmentRule: string;
  theme: string;
  sendDate: string;
}) {
  const result = analyzeListQuality({ selectedCount, totalCount, audienceSource, segmentRule, theme, sendDate });
  if (result.level === "ok") return null;
  return (
    <Banner level={result.level === "bad" ? "fail" : "warn"}>
      Segment-quality warning: {result.message}
    </Banner>
  );
}

export function RecentSendMemoryPanel({ history }: { history: SendHistoryRow[] }) {
  if (!history.length) {
    return (
      <div className="soft-panel text-xs text-[var(--muted)]">
        No recorded send memory yet. After a campaign is finalized, use <strong className="text-[var(--text)]">Record send memory</strong> in Output so future generations avoid repeated angles, openers, visuals, and heroes.
      </div>
    );
  }
  return (
    <div className="soft-panel">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold">Recent send memory</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">Injected as compact avoid rules during generation.</p>
        </div>
        <span className="badge-warn">{history.length}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {history.map((row) => (
          <div key={row.id} className="summary-tile">
            <div className="text-[10px] uppercase text-[var(--muted)]">{row.segment} · {row.sendDate || row.createdAt.slice(0, 10)} · {row.optionKey?.toUpperCase() || "send"}</div>
            <div className="text-sm font-semibold mt-0.5 truncate" title={[row.angle, row.framework].filter(Boolean).join(" · ")}>
              {[row.angle, row.framework].filter(Boolean).join(" · ") || "No route saved"}
            </div>
            <div className="text-xs text-[var(--muted)] mt-0.5 truncate" title={[row.openerMechanic, row.emotionalArc, row.visualPattern, row.heroSlug].filter(Boolean).join(" · ")}>
              {[row.openerMechanic, row.emotionalArc, row.visualPattern, row.heroSlug].filter(Boolean).join(" · ") || "No fatigue fields"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FreshnessPanel({
  result,
  historyCount,
}: {
  result: ReturnType<typeof scoreFreshnessAgainstHistory>;
  historyCount: number;
}) {
  const tone = result.score >= 80 ? "ok" : result.score >= 55 ? "warn" : "bad";
  return (
    <div className="section-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Freshness vs recent sends</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            {historyCount ? `Compared against ${historyCount} recorded send${historyCount === 1 ? "" : "s"}.` : "Record send memory after finalizing campaigns to activate this guard."}
          </p>
        </div>
        <span className={`badge-${tone}`}>{result.score}/100 · {result.label}</span>
      </div>
      <div className="text-xs text-[var(--muted)] mt-2">
        Top overlap: <strong className="text-[var(--text)]">{result.overlapElement}</strong>
        {result.notes.length > 0 && <span> · {result.notes.slice(0, 3).join(" · ")}</span>}
      </div>
    </div>
  );
}

export function WinTemplateRhythm() {
  const items = [
    ["Body rhythm", "3-5 short beats"],
    ["Visual cadence", "5-8 linked images"],
    ["Grid shape", "6-10 columns"],
    ["Emphasis", "2-4 accent cues"],
  ];
  return (
    <div className="section-panel">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold">Win-template rhythm</h3>
        <span className="text-xs text-[var(--muted)]">WinEmailTemps reference set</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="summary-tile">
            <div className="text-[10px] uppercase text-[var(--muted)]">{label}</div>
            <div className="text-sm font-semibold mt-0.5">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlaybookChecklist({
  brandId,
  hookContract,
  offer,
  productCount,
  segments,
  hasLastSend,
}: {
  brandId: string;
  hookContract: string;
  offer: string;
  productCount: number;
  segments: number;
  hasLastSend: boolean;
}) {
  const focusedGrid =
    brandId === "santa_fare"
      ? productCount > 0 && productCount <= 4
      : productCount >= 4 && productCount <= 6 && productCount % 2 === 0;
  const items = [
    {
      label: "Hook contract",
      value: hookContract.trim() ? "Locked by brief" : "Model will construct it",
      tone: hookContract.trim() ? "ok" : "warn",
    },
    {
      label: "One promise",
      value: segments ? `${segments} segment thread${segments === 1 ? "" : "s"}` : "No segment selected",
      tone: segments ? "ok" : "bad",
    },
    {
      label: "Price proof",
      value: /^No promo/i.test(offer) ? "No promo; use product facts" : "Offer must show in body + grid",
      tone: /^No promo/i.test(offer) ? "warn" : "ok",
    },
    {
      label: "Grid shape",
      value: focusedGrid ? "Playbook range" : brandId === "santa_fare" ? "Aim for 4 products" : "Aim for 4-6 even",
      tone: focusedGrid ? "ok" : "warn",
    },
    {
      label: "Rotation",
      value: hasLastSend ? "Avoid rule supplied" : "Add last-send avoid if known",
      tone: hasLastSend ? "ok" : "warn",
    },
    {
      label: "Subject order",
      value: "Generated last from finished copy",
      tone: "ok",
    },
  ] as const;

  return (
    <div className="section-panel">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold">Playbook operator checklist</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">From email-campaign-playbook.html: lock one hook, prove it, then generate subjects last.</p>
        </div>
        <span className="text-xs text-[var(--muted)]">Pre-generation QA</span>
      </div>
      <div className="playbook-grid">
        {items.map((item) => (
          <div key={item.label} className={`playbook-card playbook-card-${item.tone}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase text-[var(--muted)]">{item.label}</div>
              <span className="playbook-status">{item.tone}</span>
            </div>
            <div className="text-sm font-semibold mt-1">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OpsReadinessPanel({ ops, segments }: { ops: CampaignOps; segments: number }) {
  const provider = OPS_PROVIDER_OPTIONS.find(([value]) => value === ops.provider)?.[1] || "SendGrid";
  const consentLabel = CONSENT_OPTIONS.find(([value]) => value === ops.consentBasis)?.[1] || "Purchase/opt-in";
  const items = [
    {
      label: "Provider",
      value: provider,
      tone: "ok",
    },
    {
      label: "Sender",
      value: ops.senderEmail?.trim() ? ops.senderEmail : "Add verified sender",
      tone: ops.senderEmail?.trim() ? "ok" : "warn",
    },
    {
      label: "Audience",
      value: ops.audienceSource?.trim() ? `${segments} segment${segments === 1 ? "" : "s"} from source` : "List/source missing",
      tone: ops.audienceSource?.trim() && segments > 0 ? "ok" : "bad",
    },
    {
      label: "Segment rule",
      value: ops.segmentRule?.trim() ? "Routing rule documented" : "Map segments to list/filter",
      tone: ops.segmentRule?.trim() ? "ok" : "warn",
    },
    {
      label: "Consent",
      value: `${consentLabel}${ops.doubleOptIn ? " + double opt-in" : ""}`,
      tone: ops.consentBasis === "unknown" ? "bad" : "ok",
    },
    {
      label: "Suppression",
      value: ops.suppressionNotes?.trim() ? "Exclusions documented" : "Add bounces/unsubs/recent buyers",
      tone: ops.suppressionNotes?.trim() ? "ok" : "warn",
    },
    {
      label: "Tracking",
      value: ops.trackClicks === false ? "Click tracking off" : ops.utmPlan?.trim() ? "Clicks + UTM ready" : "UTM needed",
      tone: ops.trackClicks === false ? "warn" : ops.utmPlan?.trim() ? "ok" : "bad",
    },
    {
      label: "Schedule",
      value: ops.scheduleWindow?.trim() || "No send window",
      tone: ops.scheduleWindow?.trim() ? "ok" : "warn",
    },
  ] as const;
  const okCount = items.filter((item) => item.tone === "ok").length;
  const hasBlocking = items.some((item) => item.tone === "bad");

  return (
    <div className="section-panel">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold">Campaign ops readiness</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">Production checks inspired by Keila: sender, audience, consent, tracking, and scheduling.</p>
        </div>
        <span className={`text-xs font-semibold ${hasBlocking ? "text-[var(--bad)]" : "text-[var(--ok)]"}`}>{okCount}/{items.length} ready</span>
      </div>
      <div className="playbook-grid">
        {items.map((item) => (
          <div key={item.label} className={`playbook-card playbook-card-${item.tone}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase text-[var(--muted)]">{item.label}</div>
              <span className="playbook-status">{item.tone}</span>
            </div>
            <div className="text-sm font-semibold mt-1">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormatCoverage({ brief }: { brief: GenBrief }) {
  const scan = JSON.stringify({ banner: brief.banner, body: brief.body, products: brief.products });
  const accent = scan.match(/==[^=]+==/g)?.length || 0;
  const bold = scan.match(/\*\*[^*]+\*\*/g)?.length || 0;
  const links = scan.match(/\[[^\]]+\]\((?:slug:[a-z0-9_-]+|home)\)/gi)?.length || 0;
  const chips = [
    { label: "Accent color", value: `${accent}`, ok: accent >= 1 && accent <= 6 },
    { label: "Bold beats", value: `${bold}`, ok: bold >= 1 },
    { label: "Hyperlinks", value: `${links}`, ok: links >= 1 },
  ];
  return (
    <div className="section-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold mr-1">Formatting coverage</span>
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="text-xs rounded-full border px-2.5 py-1"
            style={{
              borderColor: chip.ok ? "var(--ok)" : "var(--warn)",
              color: chip.ok ? "var(--ok)" : "var(--warn)",
              background: "var(--surface-2)",
            }}
          >
            {chip.label}: {chip.value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ABContrastPanel({ a, b }: { a: GenBrief; b: GenBrief }) {
  const aCd = a.creative_direction || {};
  const bCd = b.creative_direction || {};
  const aCounts = flagTierCounts([...(a._flags || []), ...(a._advisory || [])]);
  const bCounts = flagTierCounts([...(b._flags || []), ...(b._advisory || [])]);
  const sameRoute = routeText(aCd) && routeText(aCd) === routeText(bCd);
  const sameAngle = aCd.angle && aCd.angle === bCd.angle;
  const sameFramework = aCd.framework && aCd.framework === bCd.framework;
  const sameTechnique = aCd.concept?.techniquePlan?.lead && aCd.concept.techniquePlan.lead === bCd.concept?.techniquePlan?.lead;
  const risk = sameRoute || sameAngle || sameFramework || sameTechnique;
  return (
    <div className="section-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold">A/B contrast snapshot</h3>
          <p className="text-xs text-[var(--muted)]">Checks whether the test is a real challenger, not a synonym swap.</p>
        </div>
        <span className="status-pill" style={{ color: risk ? "var(--warn)" : "var(--ok)" }}>
          {risk ? "Review contrast" : "Distinct routes"}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <ContrastCard
          label="Option A"
          route={routeText(aCd) || "No route"}
          angle={aCd.angle || "No angle"}
          framework={aCd.framework || "No framework"}
          technique={aCd.concept?.techniquePlan?.lead || "No technique"}
          model={[a._provider, a._model].filter(Boolean).join(" · ") || "AI"}
          score={a._score}
          techniqueScore={a._technique_score}
          issues={`${aCounts.errors} err · ${aCounts.serious} serious · ${aCounts.structural} structural`}
        />
        <ContrastCard
          label="Option B"
          route={routeText(bCd) || "No route"}
          angle={bCd.angle || "No angle"}
          framework={bCd.framework || "No framework"}
          technique={bCd.concept?.techniquePlan?.lead || "No technique"}
          model={[b._provider, b._model].filter(Boolean).join(" · ") || "AI"}
          score={b._score}
          techniqueScore={b._technique_score}
          issues={`${bCounts.errors} err · ${bCounts.serious} serious · ${bCounts.structural} structural`}
        />
      </div>
      {risk && (
        <div className="text-xs mt-2" style={{ color: "var(--warn)" }}>
          Same-field risk: {[sameRoute && "route", sameAngle && "angle", sameFramework && "framework", sameTechnique && "technique"].filter(Boolean).join(", ")}. Add this to feedback if the options feel too close.
        </div>
      )}
    </div>
  );
}

export function routeText(cd: GenBrief["creative_direction"] | Record<string, unknown>): string {
  return [cd.branch, cd.brief_route].filter(Boolean).join(" · ");
}

export function ContrastCard({
  label,
  route,
  angle,
  framework,
  technique,
  model,
  score,
  techniqueScore,
  issues,
}: {
  label: string;
  route: string;
  angle: string;
  framework: string;
  technique: string;
  model: string;
  score?: number;
  techniqueScore?: number;
  issues: string;
}) {
  return (
    <div className="summary-tile">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-xs font-bold" style={{ color: scoreColor(score) }}>{typeof score === "number" ? `${score}/100` : "—"}</div>
      </div>
      <div className="text-sm font-semibold mt-1 truncate" title={route}>{route}</div>
      <div className="text-xs text-[var(--muted)] mt-1">{angle} · {framework}</div>
      <div className="text-xs text-[var(--muted)] mt-1">Technique: {technique}{typeof techniqueScore === "number" ? ` · ${techniqueScore}/100` : ""}</div>
      <div className="text-[11px] mono text-[var(--muted)] mt-1 truncate" title={model}>{model}</div>
      <div className="text-[11px] text-[var(--muted)] mt-1">{issues}</div>
    </div>
  );
}

export function StepCard({
  n, title, done, status, open, summary, onOpen, children,
}: {
  n: number; title: string; done: boolean; status: "ok" | "warn" | "bad"; open: boolean; summary: string; onOpen: () => void; children: React.ReactNode;
}) {
  const indexClass = open
    ? "step-index-open"
    : done
      ? "step-index-done"
      : status === "bad"
        ? "step-index-bad"
        : status === "warn"
          ? "step-index-warn"
          : "step-index-idle";
  return (
    <div className={`step-card ${open ? "step-card-open" : ""}`}>
      <button onClick={onOpen} className="step-button" aria-expanded={open}>
        <span className={`step-index ${indexClass}`}>
          {done && !open ? "✓" : !open && status === "bad" ? "!" : n}
        </span>
        <span className="flex-1">
          <span className="text-sm font-semibold">{title}</span>
          {!open && <span className="block text-xs text-[var(--muted)] mt-0.5 truncate">{summary}</span>}
        </span>
        <span className="step-action">{open ? "Collapse" : done ? "Edit" : "Open"}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-[var(--border)]">{children}</div>}
    </div>
  );
}

export function PerfPanel({ brandId, hero, productCount }: { brandId: string; hero?: string; productCount: number }) {
  const intel = getBrandIntelligence(brandId);
  if (!intel) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const heroAligned = !!hero && intel.heroes.some((h) => norm(h) === norm(hero));
  const countNote =
    productCount > 6
      ? { c: "var(--bad)", t: `${productCount} products — 7+ correlates with overcrowded fail templates` }
      : productCount === 0
      ? { c: "var(--warn)", t: "No products selected yet" }
      : { c: "var(--ok)", t: `${productCount} products — healthy range` };
  return (
    <div className="section-panel">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Performance intelligence</h3>
        <span className="text-xs text-[var(--muted)]">{PROGRAM_INTELLIGENCE.period}</span>
      </div>
      <p className="text-xs text-[var(--muted)] mb-2">{intel.headline}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="summary-tile bg-[var(--surface)]">
          <div className="text-[10px] uppercase text-[var(--muted)]">Benchmark</div>
          <div className="mt-0.5">{intel.benchmark.split(";")[0]}</div>
        </div>
        <div className="summary-tile bg-[var(--surface)]">
          <div className="text-[10px] uppercase text-[var(--muted)]">Hero</div>
          <div className="mt-0.5" style={{ color: heroAligned ? "var(--ok)" : "var(--warn)" }}>
            {hero || "none"} — {heroAligned ? "in proven pool ✓" : "needs a strong reason"}
          </div>
        </div>
        <div className="summary-tile bg-[var(--surface)]">
          <div className="text-[10px] uppercase text-[var(--muted)]">Product count</div>
          <div className="mt-0.5" style={{ color: countNote.c }}>{countNote.t}</div>
        </div>
      </div>
      <div className="text-xs text-[var(--muted)] mt-2">
        <strong className="text-[var(--text)]">Avoid:</strong> {intel.avoid.slice(0, 4).join(" · ")}
      </div>
    </div>
  );
}

export function Banner({ level, children }: { level: "warn" | "fail"; children: React.ReactNode }) {
  const color = level === "fail" ? "var(--bad)" : "var(--warn)";
  return (
    <div className="section-panel text-sm" style={{ borderColor: color, color }}>
      {children}
    </div>
  );
}

export function PromptBlock({
  title, subtitle, value, edited, onChange, onReset,
}: {
  title: string;
  subtitle: string;
  value: string;
  edited: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(title === "Performance context");
  return (
    <div className="prompt-block">
      <div className="prompt-header">
        <button type="button" onClick={() => setOpen((v) => !v)} className="prompt-toggle" aria-expanded={open}>
          <div className="text-sm font-semibold">
            {title}
            {edited && <span className="ml-2 text-xs text-[var(--accent-2)]">· edited</span>}
          </div>
          <div className="text-xs text-[var(--muted)]">{subtitle}</div>
        </button>
        <span className="text-xs text-[var(--muted)]">{value.length} chars</span>
        <CopyButton text={value} />
        <button onClick={onReset} disabled={!edited} className="btn-ghost">Reset</button>
      </div>
      {open && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="prompt-body mono text-xs leading-relaxed p-4 outline-none resize-y"
          style={{ height: 220 }}
        />
      )}
    </div>
  );
}

export function VariantTabs({
  variants, active, onSelect, labelFor, incompleteFor,
}: {
  variants: string[]; active: string; onSelect: (v: string) => void; labelFor?: (v: string) => string; incompleteFor?: (v: string) => boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {variants.map((v) => (
        <button key={v} onClick={() => onSelect(v)}
          title={incompleteFor?.(v) ? "This segment is missing generated copy" : undefined}
          className={`choice-pill ${active === v ? "choice-pill-active" : ""}`}>
          {labelFor ? labelFor(v) : v}
          {incompleteFor?.(v) && <span aria-hidden style={{ color: "var(--bad)" }}> ⚠</span>}
        </button>
      ))}
    </div>
  );
}

export function SubjectOptionsPanel({
  brief,
  segment,
  onUse,
}: {
  brief: GenBrief;
  segment: string;
  onUse: (subject: string, preheader: string, style?: string, modelHint?: string, sharedThread?: string) => void;
}) {
  const line = brief.subject_lines?.[segJsonKey(segment)];
  const options = line?.options || [];
  const [open, setOpen] = useState(false);
  if (!line || !options.length) return null;
  return (
    <div className="subject-drawer">
      <button type="button" onClick={() => setOpen((v) => !v)} className="subject-drawer-head" aria-expanded={open}>
        <span>
          <span className="text-sm font-semibold">Subject options</span>
          <span className="text-xs text-[var(--muted)] ml-2">{options.length} styles</span>
        </span>
        <span className="text-xs text-[var(--muted)]">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-2 p-3">
          {options.map((o, i) => {
            const active = o.subject === line.subject && o.preheader === line.preheader;
            return (
              <div key={`${o.subject}-${i}`} className={`option-card ${active ? "option-card-active" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      {o.model_hint || "AI"} · {o.style || `Option ${i + 1}`}
                    </div>
                    <div className="text-sm font-semibold">{o.subject}</div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">{o.preheader}</div>
                    {o.shared_thread && <div className="text-[11px] text-[var(--accent-2)] mt-1">Thread: {o.shared_thread}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onUse(o.subject, o.preheader, o.style, o.model_hint, o.shared_thread)}
                    disabled={active}
                    className="btn-ghost shrink-0"
                  >
                    {active ? "Using" : "Use"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ModelSelector({
  label,
  value,
  onChange,
  providers,
}: {
  label: string;
  value: AIModelSelection;
  onChange: (v: AIModelSelection) => void;
  providers: AIProviderOption[];
}) {
  const provider = providers.find((p) => p.id === value.provider) || providers[0];
  const selectedModelId = value.provider === provider.id && value.model ? value.model : provider.models[0].id;
  const listedModel = provider.models.find((m) => m.id === selectedModelId);
  const model = listedModel || { id: selectedModelId, label: `Current: ${selectedModelId}`, note: "Saved/newer model ID" };
  const modelOptions = listedModel ? provider.models : [model, ...provider.models];
  return (
    <div className="section-panel p-3">
      <div className="text-xs font-semibold text-[var(--muted)] mb-2">{label}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          aria-label={`${label} provider`}
          value={provider.id}
          onChange={(e) => {
            const next = providers.find((p) => p.id === e.target.value) || providers[0];
            onChange({ provider: next.id, model: next.models[0].id });
          }}
          className="input"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select
          aria-label={`${label} model`}
          value={model.id}
          onChange={(e) => onChange({ provider: provider.id, model: e.target.value })}
          className="input"
        >
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>
      <div className="text-[11px] text-[var(--muted)] mt-1">
        {model.note ? `${model.note} · ` : ""}<code>{model.id}</code>
      </div>
    </div>
  );
}

export function MiniProductBlock({ lines }: { lines: { text: string; style: "headline" | "badge" | "usp" | "review" | "price" | "sub" }[] }) {
  const colorMap: Record<string, string> = {
    headline: "font-bold text-[11px] uppercase tracking-wide",
    badge: "text-[9px] font-bold px-1 rounded",
    usp: "text-[9px] text-[var(--muted)] flex items-center gap-0.5",
    review: "text-[9px] italic text-[var(--muted)]",
    price: "text-[11px] font-bold",
    sub: "text-[9px] text-[var(--muted)]",
  };
  const styleMap: Partial<Record<string, React.CSSProperties>> = {
    badge: { background: "#fef9c3", color: "#78350f", border: "1px solid #fde047" },
    review: { borderLeft: "2px solid var(--border)", paddingLeft: 4 },
  };
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-2 w-full flex flex-col gap-0.5 text-left">
      <div className="h-8 rounded mb-1" style={{ background: "var(--border)" }} />
      {lines.map((l, i) => (
        <span key={i} className={colorMap[l.style]} style={styleMap[l.style]}>
          {l.style === "usp" && <span style={{ color: "var(--ok)", fontSize: 9, fontWeight: 800 }}>+</span>}
          {l.text}
        </span>
      ))}
    </div>
  );
}

export function ProductStylePicker({ value, onChange }: { value: ProductCopyStyle; onChange: (v: ProductCopyStyle) => void }) {
  const opts: { id: ProductCopyStyle; label: string; when: string; lines: Parameters<typeof MiniProductBlock>[0]["lines"] }[] = [
    {
      id: "headline_winner",
      label: "Headline winner",
      when: "Default — works for any send",
      lines: [
        { text: "BEST SUPPORT EVER", style: "headline" },
        { text: "Wire-free all day", style: "usp" },
        { text: "Snap-on in 3 sec", style: "usp" },
        { text: "From 💲12.99", style: "sub" },
      ],
    },
    {
      id: "benefit_pair",
      label: "Benefit pair",
      when: "Pain-point heavy campaigns",
      lines: [
        { text: "NO WIRE PAIN", style: "headline" },
        { text: "Digs in → instant relief", style: "usp" },
        { text: "Slides on → all-day fit", style: "usp" },
        { text: "Comfort you can feel", style: "sub" },
      ],
    },
    {
      id: "proof_badge",
      label: "Proof badge",
      when: "When reviews are strong",
      lines: [
        { text: "★4.9 · 2,300+ Reviews", style: "badge" },
        { text: '"Forgot it\'s there!" — Helen', style: "review" },
        { text: "Wire-free comfort", style: "usp" },
        { text: "Front snap closure", style: "usp" },
      ],
    },
    {
      id: "urgency_badge",
      label: "Urgency / scarcity",
      when: "Low-stock or flash-sale sends",
      lines: [
        { text: "SELLING OUT", style: "badge" },
        { text: "CLAIM YOURS", style: "headline" },
        { text: "Only a few left at 💲12.99", style: "sub" },
        { text: "Ships in 24 hrs", style: "usp" },
      ],
    },
    {
      id: "price_prominent",
      label: "Price prominent",
      when: "Steep discounts / price-led",
      lines: [
        { text: "💲12.99 — Today Only", style: "price" },
        { text: "SAVE 35%", style: "badge" },
        { text: "Wire-free lift & support", style: "sub" },
        { text: "All-day comfort", style: "usp" },
      ],
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`choice-card flex flex-col gap-1.5 items-stretch text-left p-2 ${value === o.id ? "choice-card-active" : ""}`}
          >
            <MiniProductBlock lines={o.lines} />
            <div className="text-xs font-semibold leading-tight">{o.label}</div>
            <div className="text-[10px] text-[var(--muted)] leading-tight">{o.when}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LayoutPicker({ count, value, onChange }: { count: number; value: ProductLayout; onChange: (v: ProductLayout) => void }) {
  // Offer arrangements that make sense for the number of products in the email.
  const opts: { id: ProductLayout; label: string; rows: number[] }[] = [
    { id: "stack", label: `Stacked · 1×${count}`, rows: Array.from({ length: Math.min(count, 4) }, () => 1) },
  ];
  if (count >= 2) opts.push({ id: "two", label: `2 per row · ${Math.ceil(count / 2)} rows`, rows: Array.from({ length: Math.min(Math.ceil(count / 2), 3) }, () => 2) });
  if (count >= 3) opts.push({ id: "three", label: `3 per row · ${Math.ceil(count / 3)} rows`, rows: Array.from({ length: Math.min(Math.ceil(count / 3), 2) }, () => 3) });
  if (count >= 3) opts.push({ id: "hero_grid", label: "Hero + 2 per row", rows: [1, 2, 2] });

  return (
    <div className="mb-3 soft-panel">
      <div className="text-xs text-[var(--muted)] mb-1">Product layout</div>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => {
          const active = value === o.id;
          return (
            <button key={o.id} onClick={() => onChange(o.id)}
              className={`choice-card flex flex-col items-center gap-1 ${active ? "choice-card-active" : ""}`}>
              <span className="flex flex-col gap-0.5 w-9">
                {o.rows.map((perRow, ri) => (
                  <span key={ri} className="flex gap-0.5">
                    {Array.from({ length: perRow }, (_, ci) => (
                      <span key={ci} className="flex-1 h-2 rounded-sm" style={{ background: active ? "var(--accent)" : "var(--border)" }} />
                    ))}
                  </span>
                ))}
              </span>
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BodyLayoutPicker({
  value,
  moduleLayout,
  onChange,
  onModuleLayoutChange,
}: {
  value: BodyLayout;
  moduleLayout: EmailModuleKey[];
  onChange: (v: BodyLayout) => void;
  onModuleLayoutChange: (v: EmailModuleKey[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const opts: { id: BodyLayout; label: string; rows: string[] }[] = [
    { id: "continuous", label: "Continuous body", rows: ["Body", "P.S.", "Products"] },
    { id: "interspersed", label: "Opener + products", rows: ["Opener", "Products", "Bridge/P.S."] },
    { id: "custom", label: "Custom flow", rows: ["Drag", "Modules", "Below"] },
  ];
  const presets: { label: string; value: EmailModuleKey[] }[] = [
    { label: "2 + 2 story", value: ["hero", "body_1", "products_1_2", "body_2", "products_3_4", "body_3", "products_5_6"] },
    { label: "Proof sandwich", value: ["hero", "body_1", "products_1_2", "products_3_4", "body_2", "products_5_6", "body_3"] },
    { label: "Hero first grid", value: ["hero", "products_1_2", "body_1", "products_3_4", "body_2", "products_5_6", "body_3"] },
  ];
  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...moduleLayout];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onModuleLayoutChange(next);
  };
  return (
    <div className="mb-3 soft-panel">
      <div className="text-xs text-[var(--muted)] mb-1">Body placement</div>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              className={`choice-card min-w-40 ${active ? "choice-card-active" : ""}`}
            >
              <span className="font-semibold block mb-1">{o.label}</span>
              <span className="flex flex-col gap-0.5">
                {o.rows.map((r) => (
                  <span key={r} className="block rounded-sm px-2 py-0.5" style={{ background: active ? "rgba(35,102,90,.12)" : "var(--surface-2)" }}>{r}</span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => onModuleLayoutChange(p.value)} className="btn-ghost">
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
        <div className="flex flex-wrap gap-1.5">
          {moduleLayout.map((key, index) => (
            <button
              key={`${key}-${index}`}
              type="button"
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex != null) move(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`rounded border px-2.5 py-1 text-xs cursor-grab ${value === "custom" ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] text-[var(--muted)]"}`}
              title="Drag to reorder"
            >
              {moduleLabel(key)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function moduleLabel(key: EmailModuleKey): string {
  return {
    hero: "Banner",
    body_1: "Text 1",
    products_1_2: "Products 1-2",
    body_2: "Text 2",
    products_3_4: "Products 3-4",
    body_3: "Text 3",
    products_5_6: "Products 5-6",
  }[key];
}

export function ProductSlotCard({
  index, slot, catalog, usedSlugs, recentSlugs, onPick, onUrl, onCustomChange, onScrape, onToggleUsp, onAddCustomUsp, onSetCustomUsp, onRemove,
}: {
  index: number;
  slot: Slot;
  catalog: Product[];
  /** All slugs currently picked across all slots — used to disable duplicate options. */
  usedSlugs: string[];
  /** Slugs used in the last 3 sends — shown with a "recent" badge. */
  recentSlugs: string[];
  onPick: (slug: string) => void;
  onUrl: (url: string) => void;
  onCustomChange: (patch: Partial<Slot>) => void;
  onScrape: (url: string) => Promise<string>;
  onToggleUsp: (usp: string) => void;
  onAddCustomUsp: () => void;
  onSetCustomUsp: (uspIndex: number, value: string) => void;
  onRemove: () => void;
}) {
  const [showUrl, setShowUrl] = useState(!!slot.url);
  const [scrapeStatus, setScrapeStatus] = useState("");
  const scrapeRequestRef = useRef(0);
  const autoScrapedUrlRef = useRef("");
  const cat = catalog.find((p) => p.slug === slot.slug);
  const isCustom = !!slot.isCustom;
  const selectValue = isCustom ? CUSTOM_PRODUCT_VALUE : slot.slug;
  const displayName = isCustom ? slot.customName || "custom product" : cat?.name || "Product";
  // Pool = catalog USPs + any scraped from the customer URL (deduped).
  const pool = Array.from(new Set([...(cat?.usps || []), ...(slot.scrapedUsps || []), ...(slot.scrapedFeatures || [])]));
  // Custom USPs are selected entries not in the pool (rendered as editable inputs).
  const customUsps = slot.usps.map((u, j) => ({ u, j })).filter(({ u }) => !pool.includes(u));
  const isRecent = !isCustom && slot.slug ? recentSlugs.includes(slot.slug) : false;

  async function runScrape(url: string) {
    if (!url || !/^https?:\/\//i.test(url)) return;
    const requestId = ++scrapeRequestRef.current;
    setScrapeStatus("Fetching product page…");
    const status = await onScrape(url);
    if (scrapeRequestRef.current === requestId) setScrapeStatus(status);
  }

  useEffect(() => {
    if (isCustom || slot.url) setShowUrl(true);
  }, [isCustom, slot.url]);

  // Auto-scrape when the parent sets a URL (e.g. on product pick) and we have no scraped USPs yet.
  useEffect(() => {
    const shouldAutoScrape =
      !isCustom &&
      !!cat?.url &&
      slot.url === cat.url &&
      autoScrapedUrlRef.current !== slot.url &&
      (!slot.scrapedUsps || slot.scrapedUsps.length === 0);
    if (shouldAutoScrape) {
      autoScrapedUrlRef.current = slot.url;
      runScrape(slot.url);
    }
    // Only react to URL or scrapedUsps changes, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.url, slot.slug, cat?.url, isCustom, slot.scrapedUsps?.length]);

  return (
    <div className={`product-slot-card ${index === 0 ? "product-slot-hero" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{index === 0 ? "Hero product" : `Support ${index + 1}`}</span>
        <div className="flex items-center gap-2">
          {isRecent && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--warn-soft, #fef3c7)", color: "var(--warn-text, #92400e)" }}>
              recent
            </span>
          )}
          {index > 0 && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove support product ${index + 1}`}
              className="text-xs text-[var(--muted)] hover:text-[var(--bad)]"
            >
              remove
            </button>
          )}
        </div>
      </div>
      <select value={selectValue} aria-label={`${index === 0 ? "Hero" : `Support ${index + 1}`} product`} onChange={(e) => onPick(e.target.value)} className="input">
        <option value="">— select product —</option>
        {catalog.map((p) => {
          const alreadyUsed = usedSlugs.includes(p.slug) && p.slug !== slot.slug;
          const recentLabel = recentSlugs.includes(p.slug) ? " · recent" : "";
          return (
            <option key={p.slug} value={p.slug} disabled={alreadyUsed}>
              {alreadyUsed ? `✗ ${p.name}` : `${p.name}${recentLabel}`} · 💲{p.price}
            </option>
          );
        })}
        <option value={CUSTOM_PRODUCT_VALUE}>Other product… paste URL</option>
      </select>

      {(slot.slug || isCustom) && (
        <>
          {isCustom && (
            <div className="custom-product-fields">
              <label className="field">
                <span>Product name</span>
                <input
                  value={slot.customName || ""}
                  aria-label="Custom product name"
                  onChange={(e) => onCustomChange({ customName: e.target.value })}
                  placeholder="Auto-detected after scouting"
                  className="input text-xs"
                />
              </label>
              <label className="field">
                <span>Price</span>
                <input
                  value={slot.customPrice || ""}
                  aria-label="Custom product price"
                  onChange={(e) => onCustomChange({ customPrice: e.target.value })}
                  placeholder="e.g. 19.99"
                  className="input text-xs"
                />
              </label>
              <label className="field custom-product-proof">
                <span>Review or proof</span>
                <input
                  value={slot.customReview || ""}
                  aria-label="Custom product review"
                  onChange={(e) => onCustomChange({ customReview: e.target.value })}
                  placeholder="Optional source-backed quote or proof"
                  className="input text-xs"
                />
              </label>
            </div>
          )}
          {showUrl ? (
            <div className="flex flex-col gap-1">
              <input
                value={slot.url}
                aria-label={`${displayName} customer URL`}
                onChange={(e) => onUrl(e.target.value)}
                onBlur={(e) => runScrape(e.target.value)}
                placeholder={isCustom ? "Paste product page URL, then blur or scout" : "https://… (blur to auto-extract USPs)"}
                className="input mono text-xs"
              />
              {isCustom && (
                <button type="button" onClick={() => runScrape(slot.url)} disabled={!/^https?:\/\//i.test(slot.url)} className="btn-subtle text-left self-start">
                  Scout page for details
                </button>
              )}
              {scrapeStatus && (
                <span className="text-[11px]" style={{ color: scrapeStatus.startsWith("✓") ? "var(--ok)" : "var(--muted)" }}>
                  {scrapeStatus}
                </span>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => setShowUrl(true)} className="btn-subtle text-left self-start">Override customer URL</button>
          )}

          <fieldset className="usp-grid">
            <legend className="sr-only">USPs for {displayName}</legend>
            {pool.map((usp) => (
              <label key={usp} className={`usp-pill ${slot.usps.includes(usp) ? "usp-pill-selected" : ""}`}>
                <input type="checkbox" checked={slot.usps.includes(usp)} onChange={() => onToggleUsp(usp)} className="sr-only" />
                <span className="usp-dot" aria-hidden />
                <span>{usp}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1">
            {customUsps.map(({ u, j }) => (
              <input key={`c${j}`} value={u} aria-label={`Custom USP ${j + 1}`} onChange={(e) => onSetCustomUsp(j, e.target.value)} placeholder="Custom USP" className="input text-xs" />
            ))}
            <button type="button" onClick={onAddCustomUsp} className="btn-subtle text-left self-start">+ Add custom USP</button>
          </div>
          {(cat?.review || slot.customReview) && <div className="text-[11px] italic text-[var(--muted)]">{slot.customReview || cat?.review}</div>}
          {isCustom && slot.scrapedImage && <div className="text-[11px] text-[var(--muted)] truncate">Image detected: {slot.scrapedImage}</div>}
        </>
      )}
    </div>
  );
}
