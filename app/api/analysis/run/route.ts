import { NextRequest, NextResponse } from "next/server";
import { runAnalysisBridge, type AnalysisBridgeError } from "@/lib/analysisBridge";
import { AI_PROVIDERS } from "@/lib/config/aiModels";
import { HttpError, requireActiveUser } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 300;

const VALID_SOURCES = new Set(["master_plan", "page_performance", "template_examples"]);
const VALID_PROVIDERS = new Set<string>(AI_PROVIDERS.map((provider) => provider.id));

function cleanText(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanList(value: unknown, maxItems = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, 160)).filter(Boolean).slice(0, maxItems);
}

function cleanPayload(body: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const input = (body || {}) as Record<string, unknown>;
  const mode = cleanText(input.mode, 20) === "ai" ? "ai" : "deterministic";
  const provider = cleanText(input.provider, 40);
  const model = cleanText(input.model, 120);
  const sources = Array.from(new Set(["master_plan", ...cleanList(input.sources, 6)])).filter((source) => VALID_SOURCES.has(source));
  const sheets = cleanList(input.sheets, 30);
  const timeline = input.timeline && typeof input.timeline === "object" ? input.timeline as Record<string, unknown> : {};
  const startMonth = cleanText(timeline.start_month, 7);
  const endMonth = cleanText(timeline.end_month, 7);

  if (mode === "ai" && !VALID_PROVIDERS.has(provider)) {
    return { ok: false, error: "Provider must be Claude, Gemini, or ChatGPT/OpenAI." };
  }
  for (const month of [startMonth, endMonth].filter(Boolean)) {
    if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Timeline months must use YYYY-MM." };
  }

  return {
    ok: true,
    value: {
      mode,
      provider: provider || undefined,
      model: model || undefined,
      sources,
      sheets,
      timeline: {
        start_month: startMonth || undefined,
        end_month: endMonth || undefined,
      },
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    await requireActiveUser(req);
  } catch (err) {
    const e = err as HttpError;
    return NextResponse.json({ error: e.message }, { status: e.status || 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cleaned = cleanPayload(body);
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });

  try {
    const data = await runAnalysisBridge("run", cleaned.value, 290_000);
    return NextResponse.json(data);
  } catch (err) {
    const e = err as AnalysisBridgeError;
    return NextResponse.json({ error: e.message }, { status: e.status || 502 });
  }
}
