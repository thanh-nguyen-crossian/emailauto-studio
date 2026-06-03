import { NextRequest, NextResponse } from "next/server";
import { generateAllVariants } from "@/lib/anthropic";
import { BRANDS } from "@/lib/config/brands";
import type { Campaign } from "@/lib/config/types";
import { HttpError, requireActiveUser } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60; // allow time for one Claude call per tier

function validate(body: unknown): { ok: true; campaign: Campaign } | { ok: false; error: string } {
  const c = body as Partial<Campaign>;
  if (!c || typeof c !== "object") return { ok: false, error: "Missing body" };
  if (!c.brandId || !BRANDS[c.brandId]) return { ok: false, error: "Unknown or missing brandId" };
  if (!Array.isArray(c.tiers) || c.tiers.length === 0) return { ok: false, error: "Select at least one tier" };
  if (!Array.isArray(c.productTypes) || c.productTypes.length === 0)
    return { ok: false, error: "Select at least one product type" };

  const brand = BRANDS[c.brandId];
  const validCodes = new Set(brand.productSegments.map((s) => s.code));
  const bad = c.productTypes.filter((p) => !validCodes.has(p));
  if (bad.length) return { ok: false, error: `Invalid product types for ${brand.name}: ${bad.join(", ")}` };

  const campaign: Campaign = {
    brandId: c.brandId,
    sendDate: c.sendDate || new Date().toISOString().slice(0, 10),
    tiers: c.tiers,
    productTypes: c.productTypes,
    layout: c.layout || brand.layout,
    offer: c.offer || "Limited-time offer",
    hookContract: c.hookContract || "",
    recipientName: c.recipientName || "son.nln",
  };
  return { ok: true, campaign };
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

  // Optional reviewed/edited prompts from the "prompts" step.
  const promptsRaw = (body as { prompts?: { system?: string; byTier?: Record<string, string> } }).prompts;
  const overrides = promptsRaw
    ? { system: promptsRaw.system, byTier: promptsRaw.byTier }
    : undefined;

  try {
    const { copy, errors } = await generateAllVariants(v.campaign, overrides);
    return NextResponse.json({ copy, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const status = message.includes("ANTHROPIC_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
