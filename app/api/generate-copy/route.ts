import { NextRequest, NextResponse } from "next/server";
import { generateOptions } from "@/lib/anthropic";
import { selectVarietyProfile } from "@/lib/briefgen";
import { normalizeModelPair } from "@/lib/config/aiModels";
import { BRANDS } from "@/lib/config/brands";
import { RECIPIENT_NAME_TOKEN, type BodyVarietyProfile, type Campaign, type EmailModuleKey, type Product } from "@/lib/config/types";

const VALID_MODULE_KEYS = new Set<string>(["hero","body_1","body_2","body_3","products_1_2","products_3_4","products_5_6"]);
import type { GenBrief } from "@/lib/briefgen";
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
    offerShipping: c.offerShipping || "",
    urgency: c.urgency || "none",
    offer: c.offer || "",
    bodyLayout: c.bodyLayout || "continuous",
    moduleLayout: Array.isArray(c.moduleLayout)
      ? (c.moduleLayout as string[]).filter((k) => VALID_MODULE_KEYS.has(k)) as EmailModuleKey[]
      : undefined,
    productCopyStyle: c.productCopyStyle || "headline_winner",
    hookContract: c.hookContract || "",
    recipientName: RECIPIENT_NAME_TOKEN,
    recentProductSlugs: Array.isArray(c.recentProductSlugs) ? c.recentProductSlugs as string[] : undefined,
    lastSend: c.lastSend,
    winningContent: c.winningContent,
    customPerfContext: c.customPerfContext,
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

  // Compute variety profile and attach to campaign so the prompt builder can use it.
  const variety = selectVarietyProfile(v.campaign);
  const campaignWithVariety = { ...v.campaign, bodyVariety: variety };
  // Strip the ephemeral directive strings before storing/returning (keep only display fields).
  const cleanVariety: BodyVarietyProfile = {
    openerMechanic: variety.openerMechanic,
    openerMechanicLabel: variety.openerMechanicLabel,
    namedCharacter: variety.namedCharacter,
    characterRole: variety.characterRole,
    painPoint: variety.painPoint,
    sensoryPhrase: variety.sensoryPhrase,
    emotionalArc: variety.emotionalArc,
    emotionalArcLabel: variety.emotionalArcLabel,
    creativeLens: variety.creativeLens,
    proofRole: variety.proofRole,
    subjectStyle: variety.subjectStyle,
    visualDirection: variety.visualDirection,
  };

  const po = (body as { promptOverrides?: { system?: string; user?: string } }).promptOverrides;
  const overrides = po && (po.system || po.user) ? { system: po.system, user: po.user } : undefined;
  const models = normalizeModelPair((body as { models?: Parameters<typeof normalizeModelPair>[0] }).models);
  const revisionBody = body as { feedback?: string; existingOptions?: { a?: GenBrief; b?: GenBrief } };
  const revision = revisionBody.feedback?.trim()
    ? { feedback: revisionBody.feedback, existingOptions: revisionBody.existingOptions }
    : undefined;
  const result = await generateOptions(campaignWithVariety, v.products, overrides, models, revision);
  if (result.error) {
    const status = result.error.includes("ANTHROPIC_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }
  if (result.a) result.a.body_variety = cleanVariety;
  if (result.b) result.b.body_variety = cleanVariety;
  return NextResponse.json({ a: result.a, b: result.b });
}
