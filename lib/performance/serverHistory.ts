import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { SendOutcome } from "./feedback";

// Server-side (service-role) loader for DB-backed send performance — the "truth" half of the
// feedback loop (docs/IMPROVEMENT_PLAN-2026-07-02.md F1.4). Deliberately click-based (CTR =
// unique_clicks/delivered), not open-based: Apple Mail Privacy Protection auto-opens tracking
// pixels for a large share of recipients, inflating open rate into noise (see
// docs/optimization-roadmap.md T1-01). Only rows with synced metrics (`delivered` populated by
// the F1.3 stats-sync route) count — unsynced rows have no signal yet.

interface SendHistoryMetricsRow {
  created_at: string;
  send_date: string | null;
  brand_id: string;
  segment_code: string;
  option_key: "a" | "b" | null;
  angle: string | null;
  framework: string | null;
  opener_mechanic: string | null;
  emotional_arc: string | null;
  hero_slug: string | null;
  delivered: number | null;
  unique_clicks: number | null;
  unsubscribes: number | null;
  revenue: number | null;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function toOutcome(row: SendHistoryMetricsRow): SendOutcome {
  const delivered = row.delivered ?? 0;
  const hasMetrics = delivered > 0;
  return {
    date: row.send_date || row.created_at,
    brandId: row.brand_id,
    segment: row.segment_code,
    angle: row.angle || undefined,
    framework: row.framework || undefined,
    openerMechanic: row.opener_mechanic || undefined,
    emotionalArc: row.emotional_arc || undefined,
    hero: row.hero_slug || undefined,
    optionKey: row.option_key || undefined,
    metrics: hasMetrics
      ? {
          ctrPct: round(((row.unique_clicks ?? 0) / delivered) * 100),
          optoutPerDeliveredPct: round(((row.unsubscribes ?? 0) / delivered) * 100),
        }
      : undefined,
  };
}

/**
 * Load the caller's last `limit` synced send-history rows for a brand, mapped to SendOutcome[]
 * for `derivePerformanceSignal`/`performanceFeedbackPromptBlock`. Returns [] on any DB error or
 * when Supabase isn't configured — generation must never fail because performance data is
 * unavailable, it should just fall back to today's behavior (no adaptive signal).
 */
export async function loadPerformanceHistory(userId: string, brandId: string, limit = 20): Promise<SendOutcome[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const { data, error } = await supabaseAdmin()
      .from("send_history")
      .select(
        "created_at,send_date,brand_id,segment_code,option_key,angle,framework,opener_mechanic,emotional_arc,hero_slug,delivered,unique_clicks,unsubscribes,revenue"
      )
      .eq("user_id", userId)
      .eq("brand_id", brandId)
      .not("delivered", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as SendHistoryMetricsRow[]).map(toOutcome);
  } catch {
    return [];
  }
}
