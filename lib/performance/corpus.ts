import { supabaseAdmin } from "@/lib/supabaseAdmin";

// F1.7 — corpus auto-refresh from winners. Once F1.3 knows a send's real click rate, mine its
// subject line + body opener (stashed into send_history.data at record time — see
// creativeLeverRow/recordSyncLinkage in app/studio/StudioApp.tsx) into a live winning-copy corpus,
// replacing the static docs/corpus/*.json bootstrap with real, brand-specific exemplars.

export interface WinningExemplars {
  subjects: string[];
  openers: string[];
}

const MIN_HISTORY_FOR_CORPUS = 5;
const EMPTY: WinningExemplars = { subjects: [], openers: [] };

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  return out;
}

interface SendHistoryDataRow {
  delivered: number | null;
  unique_clicks: number | null;
  segment_code: string;
  data: { subject?: string; opener?: string } | null;
}

/**
 * Recompute the winning-copy corpus for a brand (optionally scoped to one segment) from the
 * caller's synced send history — top-quartile click rate, minimum 5 sends of history (per
 * docs/IMPROVEMENT_PLAN-2026-07-02.md F1.7). Live-computed, not cached; call sparingly (the F1.3
 * sync route calls it once per touched brand, not per row).
 */
export async function computeWinningExemplars(userId: string, brandId: string, segment?: string): Promise<WinningExemplars> {
  const admin = supabaseAdmin();
  let query = admin
    .from("send_history")
    .select("delivered,unique_clicks,segment_code,data")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .not("delivered", "is", null)
    .order("created_at", { ascending: false })
    .limit(150);
  if (segment) query = query.eq("segment_code", segment);
  const { data, error } = await query;
  if (error || !data) return EMPTY;

  const rows = (data as SendHistoryDataRow[]).filter((r) => (r.delivered || 0) > 0);
  if (rows.length < MIN_HISTORY_FOR_CORPUS) return EMPTY;

  const withCtr = rows.map((r) => ({ ...r, ctr: ((r.unique_clicks || 0) / (r.delivered || 1)) * 100 }));
  const sortedCtrs = withCtr.map((r) => r.ctr).sort((a, b) => a - b);
  const threshold = sortedCtrs[Math.floor(sortedCtrs.length * 0.75)];
  const winners = withCtr.filter((r) => r.ctr >= threshold && r.ctr > 0);

  return {
    subjects: dedupe(winners.map((w) => w.data?.subject || "").filter(Boolean)).slice(0, 5),
    openers: dedupe(winners.map((w) => w.data?.opener || "").filter(Boolean)).slice(0, 3),
  };
}

interface SnapshotPayloadRow {
  payload: { winningExemplars?: WinningExemplars } | null;
}

/**
 * Fast read path for generation time (Q3's few-shot exemplar prompt layer): the latest
 * performance_snapshots rollup already carries the last computed corpus, so generation never has
 * to run the corpus query itself.
 */
export async function getWinningExemplars(userId: string, brandId: string): Promise<WinningExemplars> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("performance_snapshots")
    .select("payload")
    .eq("user_id", userId)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return EMPTY;
  const row = data as SnapshotPayloadRow;
  return row.payload?.winningExemplars || EMPTY;
}
