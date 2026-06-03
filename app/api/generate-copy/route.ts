import { NextRequest, NextResponse } from "next/server";
import { generateOptions } from "@/lib/anthropic";
import { BRANDS } from "@/lib/config/brands";
import type { Campaign, Product } from "@/lib/config/types";
import { HttpError, requireActiveUser } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
// Two sequential generations (A, then B) scale with segment count: ~84s for 1 segment, ~122s for 2,
// plus a possible B-contrast retry. 120s was too low (2+ segments timed out → non-JSON error page).
export const maxDuration = 300;

function validate(body: unknown): { ok: true; campaign: Campaign; products: Product[] } | { ok: false; error: string } {
  const c = body as Partial<Campaign> & { products?: Product[] };
  if (!c || typeof c !== "object") return { ok: false, error: "Missing body" };
  if (!c.brandId || !BRANDS[c.brandId]) return { ok: false, error: "Unknown or missing brandId" };
  if (!Array.isArray(c.segments) || c.segments.length === 0) return { ok: false, error: "Select at least one segment" };

  const brand = BRANDS[c.brandId];
  const valid = new Set(brand.productSegments.map((s) => s.code));
  const bad = c.segments.filter((s) => !valid.has(s));
  if (bad.length) return { ok: false, error: `Invalid segments for ${brand.name}: ${bad.join(", ")}` };

  const campaign: Campaign = {
    brandId: c.brandId,
    sendDate: c.sendDate || new Date().toISOString().slice(0, 10),
    segments: c.segments,
    layout: c.layout || brand.layout,
    theme: c.theme || "Limited-time offer",
    offerType: c.offerType || "none",
    offerValue: c.offerValue || "",
    urgency: c.urgency || "none",
    offer: c.offer || "",
    hookContract: c.hookContract || "",
    recipientName: c.recipientName || "son.nln",
    lastSend: c.lastSend,
    winningContent: c.winningContent,
  };
  const products = Array.isArray(c.products) ? c.products : [];
  return { ok: true, campaign, products };
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

  const v = validate(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const result = await generateOptions(v.campaign, v.products);
  if (result.error) {
    const status = result.error.includes("ANTHROPIC_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ a: result.a, b: result.b });
}
