import { NextRequest } from "next/server";
import { requireActiveUser, supabaseAdmin } from "@/lib/supabaseAdmin";
import { apiError, apiErrorFromCaught, apiOk } from "@/lib/api/respond";
import { derivePerformanceSignal, type SendOutcome } from "@/lib/performance/feedback";
import { BRANDS } from "@/lib/config/brands";

// F1.3's second endpoint + F1.5's data source: lever-level aggregates per brand for the
// PerformanceView dashboard and the "insights" strip. Read-only, no external calls — everything
// here is already synced into send_history by app/api/performance/sync.

export const runtime = "nodejs";
export const maxDuration = 20;

interface SendHistorySummaryRow {
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
}

function toOutcome(row: SendHistorySummaryRow): SendOutcome {
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
    optionKey: row.option_key || undefined,
    metrics:
      delivered > 0
        ? {
            ctrPct: Math.round(((row.unique_clicks || 0) / delivered) * 10000) / 100,
            optoutPerDeliveredPct: Math.round(((row.unsubscribes || 0) / delivered) * 10000) / 100,
          }
        : undefined,
  };
}

export async function GET(req: NextRequest) {
  let activeUser: { userId: string } | null = null;
  try {
    activeUser = await requireActiveUser(req);
  } catch (err) {
    return apiErrorFromCaught(err, { status: 401 });
  }
  if (!activeUser) return apiOk({ brands: {} });

  const brandId = req.nextUrl.searchParams.get("brandId") || undefined;
  if (brandId && !BRANDS[brandId]) return apiError(400, "bad_request", "Unknown brandId");

  const admin = supabaseAdmin();
  let query = admin
    .from("send_history")
    .select(
      "created_at,send_date,brand_id,segment_code,option_key,angle,framework,opener_mechanic,emotional_arc,hero_slug,delivered,unique_clicks,unsubscribes"
    )
    .eq("user_id", activeUser.userId)
    .not("delivered", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (brandId) query = query.eq("brand_id", brandId);

  const { data, error } = await query;
  if (error) return apiErrorFromCaught(new Error(error.message), { status: 500, context: { route: "performance/summary" } });

  const outcomes = ((data || []) as SendHistorySummaryRow[]).map(toOutcome);
  const brandIds = brandId ? [brandId] : Array.from(new Set(outcomes.map((o) => o.brandId).filter(Boolean))) as string[];

  const brands: Record<string, ReturnType<typeof derivePerformanceSignal> & { history: SendOutcome[] }> = {};
  for (const id of brandIds) {
    const brandHistory = outcomes.filter((o) => o.brandId === id);
    brands[id] = { ...derivePerformanceSignal(brandHistory, id), history: brandHistory.slice(0, 60) };
  }

  return apiOk({ brands });
}
