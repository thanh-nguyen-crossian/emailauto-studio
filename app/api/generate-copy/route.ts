import { NextRequest, NextResponse } from "next/server";
import { generateOptions, providerConfigError, type GenerationEvent } from "@/lib/anthropic";
import type { GenBrief } from "@/lib/briefgen";
import { normalizeModelPair } from "@/lib/config/aiModels";
import { BRANDS, missingRequiredProducts } from "@/lib/config/brands";
import { RECIPIENT_NAME_TOKEN, type BodyLayout, type Campaign, type CampaignConsentBasis, type CampaignMailProvider, type CampaignOps, type CampaignStrategy, type EmailModuleKey, type LastSend, type OfferType, type Product, type ProductCopyStyle, type RecentSendMemory, type Urgency } from "@/lib/config/types";
import { requireActiveUser } from "@/lib/supabaseAdmin";
import { apiError, apiErrorFromCaught, apiOk, rateLimitedResponse } from "@/lib/api/respond";
import { createRateLimiter, requestRateKey } from "@/lib/api/rateLimit";
import { loadPerformanceHistory } from "@/lib/performance/serverHistory";

const VALID_MODULE_KEYS = new Set<string>(["hero","body_1","body_2","body_3","products_1_2","products_3_4","products_5_6"]);
const MAX_PRODUCTS = 6;
const MAX_TEXT = 1200;
const MAX_LONG_TEXT = 9000;
const VALID_MAIL_PROVIDERS = new Set<CampaignMailProvider>(["sendgrid", "smtp", "ses", "mailgun", "postmark", "local", "other"]);
const VALID_CONSENT_BASIS = new Set<CampaignConsentBasis>(["prior_purchase_or_opt_in", "double_opt_in", "manual_import", "winback_existing_customer", "unknown"]);
const VALID_OFFER_TYPES = new Set<OfferType>(["sitewide_pct", "fixed_price", "free_ship", "none"]);
const VALID_URGENCY = new Set<Urgency>(["h24", "h48", "weekend", "none"]);
const VALID_BODY_LAYOUTS = new Set<BodyLayout>(["continuous", "interspersed", "custom"]);
const VALID_BODY_FOCUS = new Set<"hero" | "grid">(["hero", "grid"]);
const VALID_PRODUCT_COPY_STYLES = new Set<ProductCopyStyle>(["headline_winner", "benefit_pair", "proof_badge", "urgency_badge", "price_prominent", "persona_pick", "story_review", "bundle_nudge", "new_arrival"]);

export const runtime = "nodejs";
// A/B generations run in parallel; B retries only when contrast collapses across route/copy shape.
// Keep a generous route ceiling for high-segment briefs and slower frontier models.
export const maxDuration = 300;

const GENERATE_RATE_LIMIT_PER_MIN = Math.max(0, Number(process.env.AI_GENERATE_RATE_LIMIT_PER_MIN || 6));
const generateRateLimiter = createRateLimiter({ windowMs: 60_000, max: GENERATE_RATE_LIMIT_PER_MIN });
const STREAMING_ENABLED = !/^(0|false|off|no)$/i.test(process.env.AI_GENERATION_STREAMING || "");

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

function cleanRecentSendHistory(input: unknown): RecentSendMemory[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const rows = input.slice(0, 12).map((raw) => {
    const row = raw as Partial<RecentSendMemory>;
    return {
      brandId: cleanText(row.brandId, 80),
      segment: cleanText(row.segment, 40),
      sendDate: cleanText(row.sendDate, 40),
      angle: cleanText(row.angle, 120),
      framework: cleanText(row.framework, 120),
      openerMechanic: cleanText(row.openerMechanic, 80),
      emotionalArc: cleanText(row.emotionalArc, 80),
      visualPattern: cleanText(row.visualPattern, 240),
      heroSlug: cleanText(row.heroSlug, 120),
      optionKey: row.optionKey === "a" || row.optionKey === "b" ? row.optionKey : undefined,
    };
  }).filter((row) => row.brandId && row.segment);
  return rows.length ? rows : undefined;
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
    bodyFocus: VALID_BODY_FOCUS.has(c.bodyFocus as "hero" | "grid") ? c.bodyFocus as "hero" | "grid" : "hero",
    hookContract: cleanText(c.hookContract, 700),
    recipientName: RECIPIENT_NAME_TOKEN,
    recentProductSlugs: Array.isArray(c.recentProductSlugs) ? c.recentProductSlugs.map((s) => cleanText(s, 120)).filter(Boolean).slice(0, 12) : undefined,
    recentSendHistory: cleanRecentSendHistory(c.recentSendHistory),
    lastSend: cleanLastSend(c.lastSend),
    strategy: cleanStrategy(c.strategy),
    ops: cleanOps(c.ops),
    winningContent: cleanText(c.winningContent, MAX_LONG_TEXT),
    customPerfContext: cleanText(c.customPerfContext, 2500),
  };
  const products = cleanProducts(c.products);
  if (typeof products === "string") return { ok: false, error: products };
  const missingRequired = missingRequiredProducts(c.brandId, products.map((product) => product.slug));
  if (missingRequired.length) {
    return {
      ok: false,
      error: `${brand.name} emails must include: ${missingRequired.map((product) => product.name).join(", ")}`,
    };
  }
  return { ok: true, campaign, products };
}

function wantsEventStream(req: NextRequest, body: unknown): boolean {
  const b = body as { stream?: unknown };
  return STREAMING_ENABLED && (b.stream === true || Boolean(req.headers.get("accept")?.includes("text/event-stream")));
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamGenerate(
  campaign: Campaign,
  products: Product[],
  overrides: { system?: string; user?: string } | undefined,
  models: ReturnType<typeof normalizeModelPair>,
  revision: { feedback?: string; existingOptions?: { a?: GenBrief; b?: GenBrief } } | undefined,
  requestSignal: AbortSignal
): Response {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  const generationController = new AbortController();
  const abortGeneration = () => {
    closed = true;
    generationController.abort();
    if (heartbeat) clearInterval(heartbeat);
  };
  requestSignal.addEventListener("abort", abortGeneration, { once: true });
  if (requestSignal.aborted) abortGeneration();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseFrame(event, data)));
        } catch {
          closed = true;
        }
      };
      const onEvent = (event: GenerationEvent) => send(event.type, event);
      send("stage", { type: "stage", stage: "queued", message: "Generation request accepted", elapsedMs: 0 });
      heartbeat = setInterval(() => send("heartbeat", { type: "heartbeat", elapsedMs: undefined }), 5_000);
      generateOptions(campaign, products, overrides, models, revision, onEvent, generationController.signal)
        .catch((err) => {
          if (!(err instanceof Error && err.name === "AbortError")) {
            send("error", { type: "error", message: err instanceof Error ? err.message : "Generation failed" });
          }
        })
        .finally(() => {
          if (heartbeat) clearInterval(heartbeat);
          closed = true;
          requestSignal.removeEventListener("abort", abortGeneration);
          try {
            controller.close();
          } catch {
            /* stream already gone */
          }
        });
    },
    cancel() {
      abortGeneration();
      requestSignal.removeEventListener("abort", abortGeneration);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: NextRequest) {
  let activeUser: { userId: string } | null = null;
  try {
    activeUser = await requireActiveUser(req);
  } catch (err) {
    return apiErrorFromCaught(err, { status: 401 });
  }

  const rateLimit = generateRateLimiter.check(requestRateKey(req, activeUser?.userId));
  if (rateLimit) return rateLimitedResponse(rateLimit.retryAfter, "Generation rate limit reached");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "bad_request", "Invalid JSON body");
  }

  const v = validate(body);
  if (!v.ok) return apiError(400, "bad_request", v.error);

  // Server-side truth for the performance feedback loop (F1.4) — replaces whatever the client
  // might send for performanceHistory; the client has no access to real CTR data.
  if (activeUser?.userId) {
    v.campaign.performanceHistory = await loadPerformanceHistory(activeUser.userId, v.campaign.brandId);
  }

  const po = (body as { promptOverrides?: { system?: string; user?: string } }).promptOverrides;
  const overrides = po && (po.system || po.user) ? { system: po.system, user: po.user } : undefined;
  const models = normalizeModelPair((body as { models?: Parameters<typeof normalizeModelPair>[0] }).models);
  // Fail fast (before the multi-minute call) if a selected provider has no key configured.
  const keyError = providerConfigError(models);
  if (keyError) return apiError(400, "bad_request", keyError);
  const revisionBody = body as { feedback?: string; existingOptions?: { a?: GenBrief; b?: GenBrief } };
  const revision = revisionBody.feedback?.trim()
    ? { feedback: revisionBody.feedback, existingOptions: revisionBody.existingOptions }
    : undefined;
  if (wantsEventStream(req, body)) {
    return streamGenerate(v.campaign, v.products, overrides, models, revision, req.signal);
  }
  let result;
  try {
    result = await generateOptions(v.campaign, v.products, overrides, models, revision, undefined, req.signal);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return apiError(499, "cancelled", "Generation cancelled");
    }
    return apiErrorFromCaught(err, { context: { route: "generate-copy" } });
  }
  if (result.error) {
    const isConfigError = /API_KEY|not set/i.test(result.error);
    return apiError(isConfigError ? 500 : 502, isConfigError ? "server_error" : "upstream_error", result.error);
  }
  return apiOk({ a: result.a, b: result.b, warning: result.warning });
}
