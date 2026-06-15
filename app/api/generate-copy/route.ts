import { NextRequest, NextResponse } from "next/server";
import { generateOptions, providerConfigError } from "@/lib/anthropic";
import { selectVarietyProfile, type GenBrief } from "@/lib/briefgen";
import { normalizeModelPair } from "@/lib/config/aiModels";
import { BRANDS } from "@/lib/config/brands";
import { RECIPIENT_NAME_TOKEN, type BodyLayout, type BodyVarietyProfile, type Campaign, type CampaignConsentBasis, type CampaignMailProvider, type CampaignOps, type CampaignStrategy, type EmailModuleKey, type LastSend, type OfferType, type Product, type ProductCopyStyle, type Urgency } from "@/lib/config/types";
import { HttpError, requireActiveUser } from "@/lib/supabaseAdmin";

const VALID_MODULE_KEYS = new Set<string>(["hero","body_1","body_2","body_3","products_1_2","products_3_4","products_5_6"]);
const MAX_PRODUCTS = 6;
const MAX_TEXT = 1200;
const MAX_LONG_TEXT = 9000;
const VALID_MAIL_PROVIDERS = new Set<CampaignMailProvider>(["sendgrid", "smtp", "ses", "mailgun", "postmark", "local", "other"]);
const VALID_CONSENT_BASIS = new Set<CampaignConsentBasis>(["prior_purchase_or_opt_in", "double_opt_in", "manual_import", "winback_existing_customer", "unknown"]);
const VALID_OFFER_TYPES = new Set<OfferType>(["sitewide_pct", "fixed_price", "free_ship", "none"]);
const VALID_URGENCY = new Set<Urgency>(["h24", "h48", "weekend", "none"]);
const VALID_BODY_LAYOUTS = new Set<BodyLayout>(["continuous", "interspersed", "custom"]);
const VALID_PRODUCT_COPY_STYLES = new Set<ProductCopyStyle>(["headline_winner", "benefit_pair", "proof_badge", "urgency_badge", "price_prominent"]);

export const runtime = "nodejs";
// A/B generations run in parallel; B retries only when contrast collapses across route/copy shape.
// Keep a generous route ceiling for high-segment briefs and slower frontier models.
export const maxDuration = 300;

function cleanText(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanProducts(input: unknown): Product[] | string {
  if (!Array.isArray(input)) return [];
  if (input.length > MAX_PRODUCTS) return `Select ${MAX_PRODUCTS} or fewer products`;
  return input.map((p) => {
    const item = p as Partial<Product>;
    return {
      name: cleanText(item.name, 120),
      slug: cleanText(item.slug, 120),
      price: cleanText(item.price, 40),
      url: cleanText(item.url, 500),
      review: cleanText(item.review, 300),
      usps: Array.isArray(item.usps) ? item.usps.map((u) => cleanText(u, 140)).filter(Boolean).slice(0, 8) : [],
      hero: !!item.hero,
      segment: cleanText(item.segment, 40),
    };
  }).filter((p) => p.name && p.slug);
}

function cleanStrategy(input: unknown): CampaignStrategy | undefined {
  if (!input || typeof input !== "object") return undefined;
  const s = input as Partial<CampaignStrategy>;
  const strategy: CampaignStrategy = {
    campaignGoal: cleanText(s.campaignGoal, 220),
    keyMessage: cleanText(s.keyMessage, 260),
    storyline: cleanText(s.storyline, 700),
    painPoints: cleanText(s.painPoints, 500),
    solutions: cleanText(s.solutions, 500),
    toneSourceUrl: cleanText(s.toneSourceUrl, 500),
    toneKeywords: cleanText(s.toneKeywords, 260),
  };
  return Object.values(strategy).some(Boolean) ? strategy : undefined;
}

function cleanOps(input: unknown): CampaignOps | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Partial<CampaignOps>;
  const provider = VALID_MAIL_PROVIDERS.has(o.provider as CampaignMailProvider) ? o.provider as CampaignMailProvider : "sendgrid";
  const consentBasis = VALID_CONSENT_BASIS.has(o.consentBasis as CampaignConsentBasis)
    ? o.consentBasis as CampaignConsentBasis
    : "prior_purchase_or_opt_in";
  const ops: CampaignOps = {
    provider,
    senderName: cleanText(o.senderName, 100),
    senderEmail: cleanText(o.senderEmail, 160),
    replyTo: cleanText(o.replyTo, 160),
    audienceSource: cleanText(o.audienceSource, 220),
    segmentRule: cleanText(o.segmentRule, 450),
    consentBasis,
    doubleOptIn: !!o.doubleOptIn,
    suppressionNotes: cleanText(o.suppressionNotes, 450),
    scheduleWindow: cleanText(o.scheduleWindow, 180),
    trackOpens: o.trackOpens !== false,
    trackClicks: o.trackClicks !== false,
    utmPlan: cleanText(o.utmPlan, 300),
    publicArchive: !!o.publicArchive,
    complianceNotes: cleanText(o.complianceNotes, 450),
  };
  return ops;
}

function cleanLastSend(input: unknown): LastSend | undefined {
  if (!input || typeof input !== "object") return undefined;
  const l = input as Partial<LastSend>;
  const lastSend: LastSend = {
    ctr: cleanText(l.ctr, 20),
    hero: cleanText(l.hero, 120),
    angle: cleanText(l.angle, 120),
    note: cleanText(l.note, 500),
    openerMechanic: cleanText(l.openerMechanic, 60),
    emotionalArc: cleanText(l.emotionalArc, 60),
  };
  return Object.values(lastSend).some(Boolean) ? lastSend : undefined;
}

function validate(body: unknown): { ok: true; campaign: Campaign; products: Product[] } | { ok: false; error: string } {
  const c = body as Partial<Campaign> & { products?: Product[] };
  if (!c || typeof c !== "object") return { ok: false, error: "Missing body" };
  if (!c.brandId || !BRANDS[c.brandId]) return { ok: false, error: "Unknown or missing brandId" };
  if (!Array.isArray(c.segments) || c.segments.length === 0) return { ok: false, error: "Select at least one segment" };

  const brand = BRANDS[c.brandId];
  const valid = new Set(brand.productSegments.map((s) => s.code));
  const segments = Array.from(new Set(c.segments.map((s) => cleanText(s, 20)).filter(Boolean)));
  const bad = segments.filter((s) => !valid.has(s));
  if (!segments.length) return { ok: false, error: "Select at least one segment" };
  if (bad.length) return { ok: false, error: `Invalid segments for ${brand.name}: ${bad.join(", ")}` };

  const campaign: Campaign = {
    brandId: c.brandId,
    sendDate: c.sendDate || new Date().toISOString().slice(0, 10),
    segments,
    layout: c.layout || brand.layout,
    theme: cleanText(c.theme, 180) || "Limited-time offer",
    offerType: VALID_OFFER_TYPES.has(c.offerType as OfferType) ? c.offerType as OfferType : "none",
    offerValue: cleanText(c.offerValue, 80),
    offerShipping: cleanText(c.offerShipping, 80),
    urgency: VALID_URGENCY.has(c.urgency as Urgency) ? c.urgency as Urgency : "none",
    offer: cleanText(c.offer, 180),
    bodyLayout: VALID_BODY_LAYOUTS.has(c.bodyLayout as BodyLayout) ? c.bodyLayout as BodyLayout : "continuous",
    moduleLayout: Array.isArray(c.moduleLayout)
      ? (c.moduleLayout as string[]).filter((k) => VALID_MODULE_KEYS.has(k)) as EmailModuleKey[]
      : undefined,
    productCopyStyle: VALID_PRODUCT_COPY_STYLES.has(c.productCopyStyle as ProductCopyStyle) ? c.productCopyStyle as ProductCopyStyle : "headline_winner",
    hookContract: cleanText(c.hookContract, 700),
    recipientName: RECIPIENT_NAME_TOKEN,
    recentProductSlugs: Array.isArray(c.recentProductSlugs) ? c.recentProductSlugs.map((s) => cleanText(s, 120)).filter(Boolean).slice(0, 12) : undefined,
    lastSend: cleanLastSend(c.lastSend),
    strategy: cleanStrategy(c.strategy),
    ops: cleanOps(c.ops),
    winningContent: cleanText(c.winningContent, MAX_LONG_TEXT),
    customPerfContext: cleanText(c.customPerfContext, 2500),
  };
  const products = cleanProducts(c.products);
  if (typeof products === "string") return { ok: false, error: products };
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
  // Fail fast (before the multi-minute call) if a selected provider has no key configured.
  const keyError = providerConfigError(models);
  if (keyError) return NextResponse.json({ error: keyError }, { status: 400 });
  const revisionBody = body as { feedback?: string; existingOptions?: { a?: GenBrief; b?: GenBrief } };
  const revision = revisionBody.feedback?.trim()
    ? { feedback: revisionBody.feedback, existingOptions: revisionBody.existingOptions }
    : undefined;
  const result = await generateOptions(campaignWithVariety, v.products, overrides, models, revision);
  if (result.error) {
    const status = /API_KEY|not set/i.test(result.error) ? 500 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }
  if (result.a) result.a.body_variety = cleanVariety;
  if (result.b) result.b.body_variety = cleanVariety;
  return NextResponse.json({ a: result.a, b: result.b, warning: result.warning });
}
