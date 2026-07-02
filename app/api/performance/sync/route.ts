import { NextRequest } from "next/server";
import { requireActiveUser } from "@/lib/supabaseAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiErrorFromCaught, apiOk, rateLimitedResponse } from "@/lib/api/respond";
import { createRateLimiter, requestRateKey } from "@/lib/api/rateLimit";
import { getSingleSendClickStats, getSingleSendStats, SendGridApiError } from "@/lib/sendgrid";
import { derivePerformanceSignal, type SendOutcome } from "@/lib/performance/feedback";
import { computeWinningExemplars } from "@/lib/performance/corpus";

// F1.3 — the core of the feedback loop. Pulls SendGrid Single Send stats for every one of the
// caller's send_history rows that has a singlesend_id and stale (or missing) stats_synced_at,
// writes the metrics columns back, then recomputes a performance_snapshots rollup per brand.
//
// F1.6 note: this polling approach needs no SendGrid-side configuration (unlike the Event
// Webhook), which is why it ships first — see docs/IMPROVEMENT_PLAN-2026-07-02.md F1.3.

export const runtime = "nodejs";
export const maxDuration = 60;

const STATS_STALE_MS = 6 * 60 * 60 * 1000; // 6h
const MAX_ROWS_PER_SYNC = 40; // keep one sync call well inside maxDuration even with retries
const syncRateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

interface PendingRow {
  id: string;
  brand_id: string;
  singlesend_id: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries once on a 429 with a short backoff — SendGrid's Marketing Stats API has a real one. */
async function withRateLimitBackoff<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SendGridApiError && err.status === 429) {
      await sleep(1200);
      return fn();
    }
    throw err;
  }
}

export async function POST(req: NextRequest) {
  let activeUser: { userId: string } | null = null;
  try {
    activeUser = await requireActiveUser(req);
  } catch (err) {
    return apiErrorFromCaught(err, { status: 401 });
  }
  if (!activeUser) return apiOk({ synced: 0, failed: 0, brandsRolledUp: [], note: "Supabase not configured — nothing to sync locally." });

  const rateLimit = syncRateLimiter.check(requestRateKey(req, activeUser.userId));
  if (rateLimit) return rateLimitedResponse(rateLimit.retryAfter);

  const admin = supabaseAdmin();
  const staleBefore = new Date(Date.now() - STATS_STALE_MS).toISOString();

  const { data: pending, error: pendingErr } = await admin
    .from("send_history")
    .select("id,brand_id,singlesend_id")
    .eq("user_id", activeUser.userId)
    .not("singlesend_id", "is", null)
    .or(`stats_synced_at.is.null,stats_synced_at.lt.${staleBefore}`)
    .limit(MAX_ROWS_PER_SYNC);
  if (pendingErr) return apiErrorFromCaught(new Error(pendingErr.message), { status: 500, context: { route: "performance/sync" } });

  const rows = (pending || []) as PendingRow[];
  let synced = 0;
  let failed = 0;
  const failures: { singlesendId: string; error: string }[] = [];
  const touchedBrands = new Set<string>();

  for (const row of rows) {
    try {
      const [stats, clicksByUrl] = await Promise.all([
        withRateLimitBackoff(() => getSingleSendStats(row.singlesend_id)),
        withRateLimitBackoff(() => getSingleSendClickStats(row.singlesend_id)).catch(() => ({}) as Record<string, number>),
      ]);
      const { error: updateErr } = await admin
        .from("send_history")
        .update({
          delivered: stats.delivered,
          unique_opens: stats.uniqueOpens,
          unique_clicks: stats.uniqueClicks,
          bounces: stats.bounces,
          unsubscribes: stats.unsubscribes,
          spam_reports: stats.spamReports,
          clicks_by_url: clicksByUrl,
          stats_synced_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (updateErr) throw new Error(updateErr.message);
      synced += 1;
      touchedBrands.add(row.brand_id);
    } catch (err) {
      failed += 1;
      failures.push({ singlesendId: row.singlesend_id, error: err instanceof Error ? err.message : "sync failed" });
    }
  }

  // Recompute a rollup snapshot for every brand that just got fresh metrics, and fold any
  // newly top-quartile sends into the winning-copy corpus (F1.7).
  const brandsRolledUp: string[] = [];
  for (const brandId of touchedBrands) {
    try {
      const history = await loadBrandHistoryForRollup(admin, activeUser.userId, brandId);
      const signal = derivePerformanceSignal(history, brandId);
      const exemplars = await computeWinningExemplars(activeUser.userId, brandId);
      const today = new Date();
      const periodStart = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await admin.from("performance_snapshots").insert({
        user_id: activeUser.userId,
        brand_id: brandId,
        period_start: periodStart,
        period_end: today.toISOString().slice(0, 10),
        payload: { signal, winningExemplars: exemplars },
      });
      brandsRolledUp.push(brandId);
    } catch {
      // rollup is best-effort; the raw metrics are already saved above
    }
  }

  return apiOk({ synced, failed, failures, brandsRolledUp });
}

async function loadBrandHistoryForRollup(
  admin: ReturnType<typeof supabaseAdmin>,
  userId: string,
  brandId: string
): Promise<SendOutcome[]> {
  const { data } = await admin
    .from("send_history")
    .select("created_at,send_date,brand_id,segment_code,angle,framework,opener_mechanic,emotional_arc,hero_slug,delivered,unique_clicks,unsubscribes")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .not("delivered", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data || []) as {
    created_at: string;
    send_date: string | null;
    brand_id: string;
    segment_code: string;
    angle: string | null;
    framework: string | null;
    opener_mechanic: string | null;
    emotional_arc: string | null;
    hero_slug: string | null;
    delivered: number | null;
    unique_clicks: number | null;
    unsubscribes: number | null;
  }[]).map((row) => {
    const delivered = row.delivered || 0;
    return {
      date: row.send_date || row.created_at,
      brandId: row.brand_id,
      segment: row.segment_code,
      angle: row.angle || undefined,
      framework: row.framework || undefined,
      openerMechanic: row.opener_mechanic || undefined,
      emotionalArc: row.emotional_arc || undefined,
      hero: row.hero_slug || undefined,
      metrics: delivered > 0
        ? {
            ctrPct: Math.round(((row.unique_clicks || 0) / delivered) * 10000) / 100,
            optoutPerDeliveredPct: Math.round(((row.unsubscribes || 0) / delivered) * 10000) / 100,
          }
        : undefined,
    };
  });
}
