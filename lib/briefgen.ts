// Generation engine ported from email-brief-generator.html: one combined prompt produces the
// per-segment copy AND the design brief, with A/B contrasting options and a validation pass.

import { BRANDS } from "./config/brands";
import { intelligencePromptBlock, getBrandIntelligence } from "./config/intelligence";
import type { Campaign, Product, Urgency } from "./config/types";

// ---- generated output shape (snake_case, matching the prompt schema) ----
export interface GenHookContract {
  segment_insight: string;
  emotion: string;
  hero_product: string;
  proof_or_price: string;
  urgency: string;
  avoid_rule: string;
}
export interface GenCreativeDirection {
  angle: string;
  framework: string;
  hook_contract: GenHookContract;
  flow: string;
  differentiator: string;
}
export interface GenSubject {
  subject: string;
  preheader: string;
}
export interface GenBanner {
  logo_stars: string;
  main_text: string;
  sub_text: string;
  image_guidance: string;
  review_quote: string;
  cta: string;
}
export interface GenProductBlock {
  slot: number;
  name: string;
  main_text: string;
  sub_text: string;
  popup_badge: string;
  usps: string[];
  review: string;
  cta: string;
}
export interface GenQualityChecks {
  click_reason: string;
  hook_alignment: string;
  proof_safety: string;
  spam_risk: string;
  optout_risk: string;
  photo_watchout: string;
  first_200px: string;
  inline_link_plan: string;
  layout_risk: string;
}
export interface Flag {
  type: "error" | "warn";
  msg: string;
}
export interface GenBrief {
  creative_direction: GenCreativeDirection;
  subject_lines: Record<string, GenSubject>;
  theme: string;
  banner: GenBanner;
  body: Record<string, string>; // "base" + per-segment keys
  products: GenProductBlock[];
  quality_checks: GenQualityChecks;
  _flags?: Flag[];
  _score?: number;
}

// ---- playbook constants (cleaned from the source file) ----
export const PLAYBOOK_ANGLES = ["Pain Relief", "Mechanism", "Proof", "Offer", "Reactivation", "Occasion/Gift"];
export const PLAYBOOK_FRAMEWORKS = ["PAS", "BAB", "Proof Ladder", "Mechanism", "Suspended Loop", "Short Sale"];
export const PLAYBOOK_REQUIRED_QA = [
  "click_reason", "hook_alignment", "proof_safety", "spam_risk", "optout_risk",
  "photo_watchout", "first_200px", "inline_link_plan", "layout_risk",
];

const PLAYBOOK_RULES = `EMAIL COPY RULES (must follow):
- Subject line: 42-58 chars by brand, hard cap 60. No all-caps. Use {{first_name}} personalisation.
- Preheader: 60-90 chars. Complements subject, never repeats it.
- Never use spam words: free!, winner, congratulations, click here, limited time offer, act now, urgent.
- Replace $ with 💲 (spam filter). Write "off" as "o.f.f" in promotional price lines.
- P.S. line must add new information (social proof, scarcity, curiosity) - never restate the offer.
- Banner main text: all-caps, bold, <=8 words per line.
- Body: persona-signed. Open with pain acknowledgement OR a vivid moment. No "I hope this email finds you well."
- Product block main text: ALL CAPS, <=5 words.
- USPs: start with a verb or adjective. No filler ("Great quality", "Amazing value").
- CTAs: imperative verb + product name or benefit. No "Click here" or "Learn more".
- F-pattern: the complete hook (pain + product promise) must land within the first 200px / 3 lines.`;

const PROMPT_CONTRACT = `CONTENT QUALITY CONTRACT:
DO: make the click reason concrete (product, fit problem, occasion, proof, or price clear before the first CTA); use one dominant angle per option; respectful mature-audience language; designer-actionable image guidance (framing, pose, crop, lighting, product visibility); one risk reducer when relevant.
DON'T: body-shame/age-shame; stack unrelated hooks; invent scarcity/inventory/reviews/discount/shipping not supplied; repeat the same "reviews + thank you" structure; lead with generic gratitude or vague lifestyle copy; make photography guidance decorative.`;

const PLAYBOOK_ENFORCEMENT = `PLAYBOOK ALIGNMENT (must pass):
- Work in order INPUT -> ANGLE -> FRAMEWORK -> FLOW -> BRIEF -> QA. Subject lines do not choose the creative direction.
- Declare a Hook Contract: segment insight + emotion + hero product + proof/price + urgency + avoid rule.
- Subject and preheader are generated last and must not repeat each other. {{first_name}} in subject OR preheader, not both.
- Banner, body opener, inline link, product grid, CTA, subject, and preheader all prove the same one promise.
- Body opener: named micro-story or direct problem, 2-3 sentences. No bullet/checkmark opener. Add one natural product link by paragraph 2 (link text = product name).
- Product grid: 4-6 products (SantaFare defaults to 4). No 7+ crowding. CTA 2-4 words.
- Proof is supplied only (review/rating/material/shipping/price/inventory/guarantee); else write qualitative benefit.
- Visual brief names framing, model/product visibility, crop, lighting, brand palette, and the first-200px hook.`;

// ---- validation pattern banks ----
const SPAM_WORDS = ["free!", "winner", "congratulations", "click here", "limited time offer", "act now", "urgent"];
const WEAK_COPY = ["i hope this email finds you well", "meet your new favorite", "amazing value", "great quality", "don't miss out", "dont miss out"];
const OPTOUT_RISK = ["for older women", "hide your", "fix your body", "anti aging", "look younger", "flaws"];
const UNSUPPLIED_PROOF = ["clinically proven", "doctor recommended", "medically proven", "guaranteed results", "thousands of customers", "rated #1", "scientifically proven"];
const WEAK_CTA = ["click here", "learn more", "shop now", "discover more", "see more"];
const HOOK_STACK = ["birthday", "anniversary", "spring", "summer", "mother", "review", "thank", "countdown", "last chance", "ending", "comfort", "sale", "gift", "free shipping"];
const BULLET_OPENER = /^\s*(?:[•*-]|✅|✓|✔|\d+\.)\s+/;

// ---- helpers ----
export function segJsonKey(id: string): string {
  return "seg_" + id.replace(/-/g, "_");
}
export function urgencyLabel(u: Urgency): string {
  return { h24: "24 hrs - ends midnight tonight", h48: "48 hrs", weekend: "Weekend only", none: "No hard deadline" }[u] || u;
}
export function promoLine(c: Campaign): string {
  if (c.offerType === "none" || !c.offerValue) return `No promo this send. Urgency: ${urgencyLabel(c.urgency)}.`;
  return `${c.offerValue} - ${urgencyLabel(c.urgency)}`;
}
function segLabel(brandId: string, code: string): string {
  return BRANDS[brandId]?.productSegments.find((s) => s.code === code)?.label || code;
}
function segMeta(brandId: string, code: string): string {
  return BRANDS[brandId]?.productSegments.find((s) => s.code === code)?.meta || "";
}
function segGuidance(brandId: string, code: string): string {
  return BRANDS[brandId]?.productSegments.find((s) => s.code === code)?.guidance || "";
}
function wordCount(s: string): number {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}
function norm(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9{}]+/g, " ").replace(/\s+/g, " ").trim();
}
function similarity(a: string, b: string): number {
  const l = new Set(norm(a).split(" ").filter(Boolean));
  const r = new Set(norm(b).split(" ").filter(Boolean));
  if (!l.size || !r.size) return 0;
  const shared = [...l].filter((w) => r.has(w)).length;
  return shared / Math.max(l.size, r.size);
}

// ---- prompt builders ----
export function buildSystemPrompt(
  campaign: Campaign,
  products: Product[],
  isOptionB: boolean,
  optionADirection?: GenCreativeDirection
): string {
  const brand = BRANDS[campaign.brandId];
  const productContext = products
    .map((p, i) => {
      const usps = (p.usps || []).filter(Boolean);
      return `Product ${i + 1}${i === 0 ? " (HERO)" : ""}: ${p.name}\n  URL: ${p.url || "not supplied"}\n  Price: 💲${p.price}\n  USPs: ${usps.join(" | ")}\n  Review: ${p.review || ""}`;
    })
    .join("\n");
  const segContext = campaign.segments
    .map((id) => {
      const g = segGuidance(campaign.brandId, id);
      return `Segment ${id}: ${segLabel(campaign.brandId, id)} — ${segMeta(campaign.brandId, id)}${g ? `. ${g}` : ""}`;
    })
    .join("\n");

  const segKeys = campaign.segments
    .map((id) => `"${segJsonKey(id)}": {"subject": "<42-58 chars, hard cap 60>", "preheader": "<60-90 chars>"}`)
    .join(",\n    ");
  const bodyKeys = campaign.segments
    .map((id) => `"${segJsonKey(id)}": "<segment ${id} body copy variant>"`)
    .join(",\n    ");
  const productSlots = products
    .map(
      (_, i) => `{
      "slot": ${i + 1},
      "name": "<product name>",
      "main_text": "<ALL CAPS <=5 words>",
      "sub_text": "<descriptor with visible price/offer when supplied>",
      "popup_badge": "<e.g. BESTSELLER|LOW STOCK|98% LOVED>",
      "usps": ["<verb/adj-led USP>", "<USP 2>"],
      "review": "<short customer quote - Name>",
      "cta": "<2-4 word CTA>"
    }`
    )
    .join(",\n    ");

  const contrast =
    isOptionB && optionADirection
      ? `\nCRITICAL CONTRAST REQUIREMENT:\nOption A used Angle: ${optionADirection.angle}, Framework: ${optionADirection.framework}.\nYou MUST choose a DIFFERENT angle AND a DIFFERENT framework for Option B. State them in creative_direction BEFORE writing copy. Reusing either is INVALID.`
      : "";
  const winning = campaign.winningContent?.trim()
    ? `\nWINNING REFERENCE EMAIL (mirror its structure, pacing, hook style - write all-new copy):\n---\n${campaign.winningContent.trim().slice(0, 1800)}\n---`
    : "";

  return `You are an expert email copywriter for ${brand.name}.
Brand persona: ${brand.persona} (${brand.voice})
Layout: ${brand.layout}

PRODUCTS:
${productContext}

SEGMENTS FOR THIS SEND:
${segContext}

${PLAYBOOK_RULES}

${PROMPT_CONTRACT}

${PLAYBOOK_ENFORCEMENT}

PERFORMANCE INTELLIGENCE (decision support only; never expose to customers):
${intelligencePromptBlock(campaign.brandId)}
${contrast}${winning}

OUTPUT FORMAT — return ONLY a valid JSON object (no prose, no markdown fences). Escape any double-quote inside a string value as \\".

{
  "creative_direction": {
    "angle": "<${PLAYBOOK_ANGLES.join("|")}>",
    "framework": "<${PLAYBOOK_FRAMEWORKS.join("|")}>",
    "hook_contract": { "segment_insight": "", "emotion": "", "hero_product": "", "proof_or_price": "", "urgency": "", "avoid_rule": "" },
    "flow": "<one sentence: banner to CTA journey>",
    "differentiator": "<what makes this option distinct>"
  },
  "subject_lines": {
    ${segKeys}
  },
  "theme": "<visual brief for the designer>",
  "banner": {
    "logo_stars": "Logo + star rating line",
    "main_text": "<ALL CAPS headline, <=8 words/line>",
    "sub_text": "<supporting line>",
    "image_guidance": "<photo/GIF direction: framing, pose, crop, lighting, palette, first-200px hook>",
    "review_quote": "<supplied quote with name, or empty>",
    "cta": "<2-4 word CTA>"
  },
  "body": {
    "base": "<full persona-signed body copy, short scannable paragraphs>",
    ${bodyKeys}
  },
  "products": [
    ${productSlots}
  ],
  "quality_checks": {
    "click_reason": "", "hook_alignment": "", "proof_safety": "",
    "spam_risk": "<low|medium|high + reason>", "optout_risk": "<low|medium|high + reason>",
    "photo_watchout": "", "first_200px": "", "inline_link_plan": "", "layout_risk": ""
  }
}`;
}

export function buildUserPrompt(campaign: Campaign, isB: boolean): string {
  const ls = campaign.lastSend;
  const lastSend =
    ls && (ls.hero || ls.angle || ls.ctr || ls.note)
      ? `\nLast send: CTR ${ls.ctr || "?"}%, hero "${ls.hero || "?"}", angle ${ls.angle || "?"}.${ls.note ? " Note: " + ls.note : ""} Rotate away from this.`
      : "";
  return `Generate a complete email brief for this send:

Brand: ${BRANDS[campaign.brandId].name}
Send date: ${campaign.sendDate}
Campaign theme: ${campaign.theme}
Promo: ${promoLine(campaign)}
Recipient token: ${campaign.recipientName}${lastSend}

Generate Option ${isB ? "B" : "A"} now. Lead with a strong creative direction, then write all copy sections.`;
}

// ---- validation ----
function addFlag(b: GenBrief, type: Flag["type"], msg: string) {
  (b._flags ||= []).push({ type, msg });
}

export function validateBrief(brief: GenBrief, campaign: Campaign): GenBrief {
  brief._flags = [];
  const subjectMax = BRANDS[campaign.brandId]?.subjectMax || 58;

  (["creative_direction", "subject_lines", "theme", "banner", "body", "products", "quality_checks"] as const).forEach(
    (f) => {
      if (!brief[f]) addFlag(brief, "error", "Missing required field: " + f);
    }
  );

  const sl = brief.subject_lines || {};
  campaign.segments.forEach((id) => {
    if (!sl[segJsonKey(id)]) addFlag(brief, "error", "Missing subject/preheader for segment " + id);
  });
  Object.entries(sl).forEach(([seg, v]) => {
    const s = v.subject || "", p = v.preheader || "";
    if (s.length > 60) addFlag(brief, "warn", `${seg} subject over hard cap (${s.length} > 60)`);
    else if (s.length > subjectMax) addFlag(brief, "warn", `${seg} subject above target (${s.length} > ${subjectMax})`);
    if (s && s.length < 42) addFlag(brief, "warn", `${seg} subject may be too short (${s.length})`);
    if (p && (p.length < 60 || p.length > 90)) addFlag(brief, "warn", `${seg} preheader length ${p.length} (target 60-90)`);
    if (/{{\s*first_name\s*}}/i.test(s) && /{{\s*first_name\s*}}/i.test(p)) addFlag(brief, "warn", `${seg} repeats {{first_name}} in subject + preheader`);
    if (similarity(s, p) > 0.55) addFlag(brief, "warn", `${seg} subject and preheader too similar`);
    const hits = HOOK_STACK.filter((w) => (s + " " + p).toLowerCase().includes(w));
    if (hits.length >= 4) addFlag(brief, "warn", `${seg} stacking hooks: ${hits.join(", ")}`);
  });

  const body = brief.body || {};
  campaign.segments.forEach((id) => {
    if (!body[segJsonKey(id)]) addFlag(brief, "warn", "Missing body variant for segment " + id);
  });

  const full = JSON.stringify({ s: brief.subject_lines, t: brief.theme, ba: brief.banner, bo: brief.body, p: brief.products }).toLowerCase();
  SPAM_WORDS.forEach((w) => full.includes(w) && addFlag(brief, "warn", `Spam word: "${w}"`));
  WEAK_COPY.forEach((w) => full.includes(w) && addFlag(brief, "warn", `Weak/generic copy: "${w}"`));
  OPTOUT_RISK.forEach((w) => full.includes(w) && addFlag(brief, "warn", `Opt-out risk wording: "${w}"`));
  UNSUPPLIED_PROOF.forEach((w) => full.includes(w) && addFlag(brief, "warn", `Possibly invented proof: "${w}"`));
  const intel = getBrandIntelligence(campaign.brandId);
  intel?.avoid.forEach((pat) => {
    const scan = pat.replace(/^hyperbole like\s+/i, "").toLowerCase();
    if (scan.length > 8 && full.includes(scan)) addFlag(brief, "warn", `Brand avoid pattern: "${pat}"`);
  });

  const cd = brief.creative_direction || ({} as GenCreativeDirection);
  if (cd.angle && !PLAYBOOK_ANGLES.includes(cd.angle)) addFlag(brief, "warn", "Non-playbook angle: " + cd.angle);
  if (cd.framework && !PLAYBOOK_FRAMEWORKS.includes(cd.framework)) addFlag(brief, "warn", "Non-playbook framework: " + cd.framework);
  const hc = cd.hook_contract || ({} as GenHookContract);
  (["segment_insight", "emotion", "hero_product", "proof_or_price", "urgency", "avoid_rule"] as const).forEach((f) => {
    if (!hc[f]) addFlag(brief, "warn", "Hook contract missing: " + f);
  });

  const banner = brief.banner || ({} as GenBanner);
  (banner.main_text || "").split(/\n|<br\s*\/?>/i).forEach((line) => {
    if (wordCount(line) > 8) addFlag(brief, "warn", `Banner line over 8 words: "${line.trim()}"`);
  });
  if (banner.cta && WEAK_CTA.includes(banner.cta.toLowerCase())) addFlag(brief, "warn", `Weak banner CTA: "${banner.cta}"`);

  const opener = (body.base || Object.values(body)[0] || "").slice(0, 250);
  if (BULLET_OPENER.test(opener)) addFlag(brief, "warn", "Body opens with a bullet/checkmark list");

  const prods = brief.products || [];
  if (campaign.brandId !== "santa_fare" && prods.length > 6) addFlag(brief, "warn", "7+ product blocks (overcrowding risk)");
  prods.forEach((p, i) => {
    if (wordCount(p.main_text) > 5) addFlag(brief, "warn", `Product ${i + 1} main text over 5 words`);
    if (!Array.isArray(p.usps) || p.usps.length < 2) addFlag(brief, "warn", `Product ${i + 1} needs >=2 USPs`);
    if (p.cta && WEAK_CTA.includes(p.cta.toLowerCase())) addFlag(brief, "warn", `Product ${i + 1} weak CTA`);
  });

  const qc = brief.quality_checks || ({} as GenQualityChecks);
  PLAYBOOK_REQUIRED_QA.forEach((f) => {
    if (!qc[f as keyof GenQualityChecks]) addFlag(brief, "warn", "Quality check missing: " + f);
  });

  const errors = brief._flags.filter((f) => f.type === "error").length;
  const warnings = brief._flags.length - errors;
  brief._score = Math.max(0, 100 - errors * 25 - warnings * 6);
  return brief;
}
