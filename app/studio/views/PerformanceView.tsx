"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { performanceFeedbackPromptBlock, type LeverStat, type PerformanceSignal, type SendOutcome } from "@/lib/performance/feedback";

type SummaryBrand = PerformanceSignal & { history?: SendOutcome[] };

interface PerformanceViewProps {
  brandId: string;
  brandName: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

function pct(n: number | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

function mean(values: number[]): number {
  const nums = values.filter((n) => Number.isFinite(n));
  return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;
}

function compactSignalLine(line: string): string {
  return line
    .replace(/^ADAPTIVE PERFORMANCE FEEDBACK.*?:/i, "Current prompt signal:")
    .replace(/\s+/g, " ")
    .trim();
}

function LeverTable({ title, rows, empty }: { title: string; rows: LeverStat[]; empty: string }) {
  return (
    <div className="section-panel">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)]">
                <th className="py-1 pr-3">Lever</th>
                <th className="py-1 pr-3">Value</th>
                <th className="py-1 pr-3">CTR</th>
                <th className="py-1">N</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row) => (
                <tr key={`${row.lever}:${row.value}`} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-3 text-[var(--muted)]">{row.lever}</td>
                  <td className="py-2 pr-3 font-medium">{row.value}</td>
                  <td className="py-2 pr-3">{pct(row.meanCtr)}</td>
                  <td className="py-2">{row.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)] mt-2">{empty}</p>
      )}
    </div>
  );
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${width}%` }} />
    </div>
  );
}

export function PerformanceView({ brandId, brandName, getAuthHeaders }: PerformanceViewProps) {
  const [data, setData] = useState<SummaryBrand | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/performance/summary?brandId=${encodeURIComponent(brandId)}`, {
        headers: await getAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not load performance summary");
      setData(json.brands?.[brandId] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load performance summary");
    } finally {
      setLoading(false);
    }
  }, [brandId, getAuthHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncStats() {
    setSyncing(true);
    setSyncNote(null);
    setError(null);
    try {
      const res = await fetch("/api/performance/sync", {
        method: "POST",
        headers: await getAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not sync SendGrid stats");
      setSyncNote(`Synced ${json.synced || 0} row(s); ${json.failed || 0} failed.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync SendGrid stats");
    } finally {
      setSyncing(false);
    }
  }

  const history = data?.history || [];
  const recent = history.slice(0, 12);
  const maxCtr = Math.max(0, ...recent.map((row) => row.metrics?.ctrPct || 0));
  const optionStats = useMemo(() => {
    return (["a", "b"] as const).map((option) => {
      const rows = history.filter((row) => row.optionKey === option && typeof row.metrics?.ctrPct === "number");
      return { option, samples: rows.length, ctr: mean(rows.map((row) => row.metrics?.ctrPct || 0)) };
    });
  }, [history]);
  const segmentStats = useMemo(() => {
    const groups = new Map<string, number[]>();
    history.forEach((row) => {
      if (!row.segment || typeof row.metrics?.ctrPct !== "number") return;
      groups.set(row.segment, [...(groups.get(row.segment) || []), row.metrics.ctrPct]);
    });
    return [...groups.entries()].map(([segment, values]) => ({ segment, ctr: mean(values), samples: values.length })).sort((a, b) => b.ctr - a.ctr);
  }, [history]);
  const insightLines = useMemo(() => {
    if (!history.length) return [];
    return performanceFeedbackPromptBlock(history, brandId)
      .split("\n")
      .map(compactSignalLine)
      .filter(Boolean)
      .slice(0, 4);
  }, [brandId, history]);

  return (
    <section className="flex flex-col gap-4">
      <div className="section-panel flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Performance loop</div>
          <h2 className="text-xl font-bold mt-1">{brandName} learning dashboard</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            SendGrid stats linked to send memory become prompt steering for future briefs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={load} disabled={loading || syncing} className="btn-ghost">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" onClick={syncStats} disabled={loading || syncing} className="btn-primary">
            {syncing ? "Syncing…" : "Sync SendGrid stats"}
          </button>
        </div>
      </div>

      {error && <div className="section-panel border-[var(--bad)] text-sm text-[var(--bad)]">{error}</div>}
      {syncNote && <div className="section-panel text-sm text-[var(--ok)]">{syncNote}</div>}

      {!loading && !history.length ? (
        <div className="section-panel">
          <h3 className="text-sm font-semibold">No synced performance yet</h3>
          <p className="text-sm text-[var(--muted)] mt-2">
            Sync a Design or Template, link its Single Send ID in Output, then run stats sync after SendGrid has engagement data.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="section-panel"><div className="text-xs text-[var(--muted)]">Sends</div><strong className="text-xl">{data?.sends || 0}</strong></div>
            <div className="section-panel"><div className="text-xs text-[var(--muted)]">Mean CTR</div><strong className="text-xl">{pct(data?.meanCtr)}</strong></div>
            <div className="section-panel"><div className="text-xs text-[var(--muted)]">Winner levers</div><strong className="text-xl">{data?.winners?.length || 0}</strong></div>
            <div className="section-panel"><div className="text-xs text-[var(--muted)]">Optout trend</div><strong className="text-xl">{data?.optoutRising ? "Rising" : "Stable"}</strong></div>
          </div>

          {insightLines.length > 0 && (
            <div className="section-panel">
              <h3 className="text-sm font-semibold">Prompt steering insight</h3>
              <div className="mt-2 flex flex-col gap-1">
                {insightLines.map((line, index) => (
                  <p key={`${line}:${index}`} className="text-sm text-[var(--muted)]">{line}</p>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LeverTable title="Lean into" rows={data?.winners || []} empty="Need at least a few synced sends before winner levers appear." />
            <LeverTable title="Rotate away" rows={data?.laggards || []} empty="No lagging levers with enough samples yet." />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="section-panel lg:col-span-2">
              <h3 className="text-sm font-semibold">Recent click-rate trend</h3>
              <div className="mt-3 flex flex-col gap-2">
                {recent.map((row, index) => (
                  <div key={`${row.date}:${row.segment}:${index}`} className="grid grid-cols-[92px_1fr_64px] gap-3 items-center text-sm">
                    <span className="text-[var(--muted)]">{row.segment || "all"} · {row.optionKey?.toUpperCase() || "?"}</span>
                    <MiniBar value={row.metrics?.ctrPct || 0} max={maxCtr} />
                    <strong className="text-right">{pct(row.metrics?.ctrPct)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-panel">
              <h3 className="text-sm font-semibold">A/B average</h3>
              <div className="mt-3 flex flex-col gap-2">
                {optionStats.map((row) => (
                  <div key={row.option} className="flex items-center justify-between text-sm border-t border-[var(--border)] pt-2">
                    <span>Option {row.option.toUpperCase()}</span>
                    <strong>{row.samples ? `${pct(row.ctr)} · n=${row.samples}` : "—"}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LeverTable title="Hero ranking" rows={data?.heroRanking || []} empty="No hero-product CTR yet." />
            <div className="section-panel">
              <h3 className="text-sm font-semibold">Segment spread</h3>
              <div className="mt-3 flex flex-col gap-2">
                {segmentStats.length ? segmentStats.map((row) => (
                  <div key={row.segment} className="flex items-center justify-between text-sm border-t border-[var(--border)] pt-2">
                    <span className="font-mono">{row.segment}</span>
                    <strong>{pct(row.ctr)} · n={row.samples}</strong>
                  </div>
                )) : <p className="text-sm text-[var(--muted)]">No segment-level stats yet.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
