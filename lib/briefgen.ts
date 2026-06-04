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
  style?: string;
  model_hint?: string;
  shared_thread?: string;
  options?: GenSubjectOption[];
}
export interface GenSubjectOption {
  style: string;
  model_hint: string;
  subject: string;
  preheader: string;
  shared_thread: string;
}
export interface GenBanner {
  logo_stars: string;
  main_text: string;
  sub_text: string;
  main_text_1?: string;
  main_text_2?: string;
  sub_text_1?: string;
  sub_text_2?: string;
  image_guidance: string;
  review_quote: string;
  review_texts?: string[];
  main_image?: string;
  sub_image?: string;
  trust_booster?: string;
  emergency?: string;
  cta: string;
}
export interface GenProductBlock {
  slot: number;
  name: string;
  template_style?: string;
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
  playbook_dos_donts?: string;
  brand_rule_alignment?: string;
  accessibility_layout?: string;
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
  ps?: string;
  products: GenProductBlock[];
  quality_checks: GenQualityChecks;
  _flags?: Flag[];
  _score?: number;
  _provider?: string;
  _model?: string;
}

// ---- playbook constants (cleaned from the source file) ----
export const PLAYBOOK_ANGLES = ["Pain Relief", "Mechanism", "Proof", "Offer", "Reactivation", "Occasion/Gift"];
export const PLAYBOOK_FRAMEWORKS = ["PAS", "BAB", "Proof Ladder", "Mechanism", "Suspended Loop", "Short Sale"];
export const PLAYBOOK_REQUIRED_QA = [
  "click_reason", "hook_alignment", "proof_safety", "spam_risk", "optout_risk",
  "photo_watchout", "first_200px", "inline_link_plan", "layout_risk",
  "playbook_dos_donts", "brand_rule_alignment", "accessibility_layout",
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

const BRAND_COLOR_GOVERNANCE = `BRAND COLOR GOVERNANCE:
- BraGoddess: #a02338 to #d63268; one smiling mature woman model.
- GentsLux: #002850 to #1d3d56; restrained masculine styling.
- LuxFitting: #e7324a to #fe397b; elegant movement or silhouette model.
- SantaFare: #890106 to #c00f28; premium gifting cues.
- Use one clear hero product in the banner; no busy multi-model collage unless the brief specifically asks for it.`;

const EMAIL_CAMPAIGN_PLAYBOOK_RULES = `EMAIL-CAMPAIGN-PLAYBOOK.HTML HARD RULES:
- One Hook Contract controls everything: segment insight + emotion/curiosity + hero product + price/proof + urgency + avoid rule.
- Generate subject/preheader last from the finished hook, banner, body, grid, and CTA; never let the subject invent a new promise.
- Preheader must add a new beat: deadline, reveal, proof, price, scale, or urgency. Never repeat the subject.
- Body opener must be a 2-3 sentence named micro-story or direct problem; never bullet/checkmark opener, generic greeting, generic thanks, or feature list.
- Add one natural product-name hyperlink by paragraph 2 using [Product Name](slug:productslug). Link text must be the product name, never "click here".
- Price or exact offer must be visible in subject/body/product blocks when supplied; shipping threshold must appear in body when supplied.
- Product grid: 4-6 products, even count preferred, no 7+ crowding, no orphan final row. SantaFare defaults to 4 focused products.
- Product block sub_text must include visible price/offer context when promo is supplied; each block needs 2 pain-to-relief benefits.
- CTA system: one primary action, 2-4 words, action verb + product or benefit; grid CTAs are secondary.
- First 200px must show hero product + hook + price/offer signal + brand palette + CTA path.
- Use supplied proof only: reviews, ratings, guarantees, material specs, stock, shipping, price, or product facts. If proof is missing, write qualitative benefit instead.
- Technical/layout brief must mention mobile readability, image max-width/height-auto, HTML/CSS CTA, descriptive alt text, dark-mode safety, and role=presentation tables.
- Do not use fake Re/Fwd, grammar errors, unsupported medical/age claims, invented reviewers, invented numbers, "don't let X go to waste", or multiple unrelated hooks.`;

const WIN_EMAIL_FORMATTING_RULES = `WINEMAILTEMPS FORMATTING + SENDGRID RHYTHM:
- Real reference emails use short SendGrid text beats, linked images, and 2-up product columns. Write copy that supports 3-5 concise text paragraphs, 5-8 linked image/product moments, and 6-10 column modules.
- Use renderer-safe inline formatting tokens in body/banner/product copy: ==key phrase== for brand-accent bold, **key phrase** for bold, [Product Name](slug:productslug) for product links, and [short text](home) for the homepage.
- Place 2-4 accent/bold beats across the body, prioritising exact price/offer, proof, product name, deadline, or customer-name moment. Do not color generic greetings.
- Use exactly one natural product-name hyperlink by paragraph 2, then keep later links purposeful. Never use "click here" as link text.
- Product sub_text may use ==...== around exact price/offer; product main_text stays short ALL CAPS; CTA fields must be plain text because the renderer styles CTA buttons.
- Keep body paragraphs 1-2 sentences each. Use a P.S. only when it adds a new proof, urgency, or curiosity beat.`;

const CONTENT_CREATION_CHAIN_RULES = `CONTENT CREATION CHAIN:
- Map every angle and promise back to supplied Audience Insight + Product USP + Context. Do not invent a USP or proof point.
- Insight and USP must match: the product mechanism/benefit must resolve the stated pain, desire, or objection.
- Framework is message order; flow is how it unfolds in the email. Keep the same promise across subject, hero, body, product grid, CTA, and P.S.
- Brief fields are execution specs for copy/design/dev. Keep strategy/QA in UI, and keep exported production brief focused on execution.`;

const SUBJECT_OPTION_RULES = `SUBJECT/PREHEADER OPTION RULES:
- For EACH segment, produce at least 3 subject/preheader options in subject_lines[segment].options.
- Options must use distinct styles and model_hint labels: Claude strategic, Gemini curiosity, ChatGPT direct-response. If the selected provider writes all text, still label the option by the lens.
- Pick the best pair as subject_lines[segment].subject and preheader.
- Every pair must have a shared_thread: one exact hero product, offer/price, proof, urgency, or emotional phrase that also appears in the hero banner/body.
- Subject, hero banner, and body must share at least one clear thing. Never let a subject introduce a new angle.`;

const BODY_COPY_RULES = `BODY + P.S. RULES:
- Body copy for each segment must be <=150 words total, persona-signed, and cover the campaign theme's concrete parts: trigger/occasion, offer or price, hero product, proof/risk reducer, urgency when supplied, and CTA path.
- If bodyLayout is continuous, write 3-5 short paragraphs in one flow before product blocks.
- If bodyLayout is interspersed, write only 1 opener paragraph before product blocks and at most 1 short bridge paragraph after. Do not split two or more storytelling paragraphs around products.
- Add ps as a separate 10-15 word line. It must hit harder than the body: proof, deadline, curiosity, or sharp risk reducer.`;

const PRODUCT_BLOCK_TEMPLATE_RULES = `PRODUCT BLOCK TEMPLATE RULES:
- headline_winner: winning default. Main text carries the click; use 2-4 words, ALL CAPS. Use exactly 2 USPs, each <=5 words.
- benefit_pair: two compact pain->relief benefits, each <=5 words. Main text stays <=4 words.
- proof_badge: badge/review does the trust work; USPs stay <=4 words and no invented numbers.
- Product blocks should feel like headline-led winning templates, not catalog feature paragraphs.`;

const BANNER_BRIEF_FORMAT = `BANNER BRIEF FORMAT:
- banner.image_guidance MUST be a compact bullet list, not a paragraph.
- Use 4-6 bullets, each 12 words or fewer.
- Cover: first-200px hook, hero product visibility, price/offer signal, palette, composition/crop, CTA path.
- Split banner into main_text_1, main_text_2, sub_text_1, sub_text_2, cta, review_texts, main_image, sub_image, trust_booster, and emergency.
- main_image describes the dominant hero-product image; sub_image describes the support/close-up image or motion cue.
- trust_booster is supplied proof or risk reducer only; emergency is urgency/deadline only.
- Do not add decorative-only direction; every bullet must clarify the product, offer, or action.`;

const BRAND_PLAYBOOK_RULES: Record<string, string> = {
  bra_goddess: `BRAND RULEBOOK - BraGoddess:
DO: Sandra voice; emotion-first + offer second; Daisy/Posy/ZipLacy/SonaShape hero pool; comfort, support, lift, and fit relief; deep rose/crimson #a02338-#d63268.
DON'T: generic empowerment, gratitude opener, bubblegum #f33e8a, muddy #953336, repeated name in subject+preheader, "don't let X go to waste".
SUBJECT: 45-55 chars; name in subject OR preheader; use o.f.f / 💲; preheader adds tension or deadline.`,
  gents_lux: `BRAND RULEBOOK - GentsLux:
DO: Jordan voice; curiosity + scarcity; JettJeans/FlexCamo first, IcyShorts/StretchMotions where relevant; movement mechanism, waistband, cooling, durability; deep navy #002850-#1d3d56.
DON'T: cute puns, over-luxury language, grammar errors, loud hype, weak navy #26508d/#013faa/#183647, over-specified subject discounts.
SUBJECT: 48-58 chars; name mid-subject; imply offer in subject, reveal scale in preheader.`,
  lux_fitting: `BRAND RULEBOOK - LuxFitting:
DO: Adele voice; price-anchored sensory promise; StretchActive/Icy Shorts/SoftyGrace/AiryGrace/LinenGlam hero pool; outfit ease, comfort, practical tip; #e7324a/#fe397b.
DON'T: mixed hooks, "Be hurry!", unsupported health claims, red #d51c18, dull pink #d5255c, birthday+spring+discount+countdown stacking.
SUBJECT: 44-56 chars; specific price/% every time; 💲 or spaced O.F.F; preheader escalates.`,
  santa_fare: `BRAND RULEBOOK - SantaFare:
DO: Mary voice; suspended loop + gifting; Pouchic/TimelessMark/BygoneMark/Snowflake first; named gifting micro-story; 4 products; deep scarlet #890106-#c00f28.
DON'T: bright cheerfulness, pink #d43268, orange-red #d02c16, broad off-season sends, generic accessory grid, countdown-clock energy.
SUBJECT: 42-56 chars; name often in preheader; use SAVING/O.F.F; reluctant deadline or revelation.`,
};

// ---- validation pattern banks ----
const SPAM_WORDS = ["free!", "winner", "congratulations", "click here", "limited time offer", "act now", "urgent"];
const WEAK_COPY = ["i hope this email finds you well", "meet your new favorite", "amazing value", "great quality", "don't miss out", "dont miss out"];
const OPTOUT_RISK = ["for older women", "hide your", "fix your body", "anti aging", "look younger", "flaws"];
const UNSUPPLIED_PROOF = ["clinically proven", "doctor recommended", "medically proven", "guaranteed results", "thousands of customers", "rated #1", "scientifically proven"];
const WEAK_CTA = ["click here", "learn more", "shop now", "discover more", "see more"];
const HOOK_STACK = ["birthday", "anniversary", "spring", "summer", "mother", "review", "thank", "countdown", "last chance", "ending", "comfort", "sale", "gift", "free shipping"];
const BULLET_OPENER = /^\s*(?:[•*-]|✅|✓|✔|\d+\.)\s+/;
const MARKDOWN_PRODUCT_LINK = /\[[^\]]+\]\(slug:[a-z0-9_-]+\)/i;
const MARKDOWN_ANY_LINK = /\[[^\]]+\]\((?:slug:[a-z0-9_-]+|home)\)/i;
const ACCENT_MARKER = /==[^=]+==/g;
const BOLD_MARKER = /\*\*[^*]+\*\*/g;
const THEME_STOPWORDS = new Set(["sale", "email", "campaign", "offer", "promo", "spring", "summer", "winter", "fall", "thank", "thanks"]);

// ---- helpers ----
export function segJsonKey(id: string): string {
  return "seg_" + id.replace(/-/g, "_");
}
export function urgencyLabel(u: Urgency): string {
  return { h24: "24 hrs - ends midnight tonight", h48: "48 hrs", weekend: "Weekend only", none: "No hard deadline" }[u] || u;
}
export function promoLine(c: Campaign): string {
  const parts = [c.offerValue, c.offerShipping].map((p) => p?.trim()).filter(Boolean);
  if (!parts.length) return `No promo this send. Urgency: ${urgencyLabel(c.urgency)}.`;
  return `${parts.join(" + ")} - ${urgencyLabel(c.urgency)}`;
}
function bodyLayoutLabel(c: Campaign): string {
  return c.bodyLayout === "interspersed"
    ? "interspersed: one opener before product blocks, then at most one bridge/P.S. after"
    : "continuous: one uninterrupted body section before product blocks";
}
function productCopyStyleLabel(c: Campaign): string {
  const style = c.productCopyStyle || "headline_winner";
  return {
    headline_winner: "headline_winner: winning template default, short headline does the work, USPs stay tiny",
    benefit_pair: "benefit_pair: two compact pain-to-relief benefit cues",
    proof_badge: "proof_badge: trust badge/review leads, USPs stay minimal",
  }[style];
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
function significantWords(s: string): string[] {
  return norm(s).split(" ").filter((w) => w.length >= 4 && !THEME_STOPWORDS.has(w));
}
function sharesContentThread(subjectish: string, bodyish: string, products: Product[], campaign: Campaign): boolean {
  const left = norm(subjectish);
  const right = norm(bodyish);
  if (!left || !right) return false;
  const offerNums = promoLine(campaign).match(/\d+(?:\.\d+)?/g) || [];
  if (offerNums.some((n) => left.includes(n) && right.includes(n))) return true;
  const productTokens = products.flatMap((p) => significantWords(p.name));
  if (productTokens.some((w) => left.includes(w) && right.includes(w))) return true;
  return significantWords(subjectish).some((w) => right.includes(w));
}

// ---- prompt builders ----
/** The clause appended to Option B's system prompt forcing a different angle + framework than A. */
export function contrastInstruction(optionADirection: GenCreativeDirection): string {
  return `\nCRITICAL CONTRAST REQUIREMENT:\nOption A used Angle: ${optionADirection.angle}, Framework: ${optionADirection.framework}.\nYou MUST choose a DIFFERENT angle AND a DIFFERENT framework for Option B. State them in creative_direction BEFORE writing copy. Reusing either is INVALID.`;
}

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
    .map((id) => `"${segJsonKey(id)}": {
      "subject": "<selected best subject, 42-58 chars, hard cap 60>",
      "preheader": "<selected paired preheader, 60-90 chars>",
      "style": "<selected style>",
      "model_hint": "<Claude strategic|Gemini curiosity|ChatGPT direct-response>",
      "shared_thread": "<exact shared product/offer/proof/urgency/emotion also used in banner/body>",
      "options": [
        {"style": "strategic", "model_hint": "Claude strategic", "subject": "<option 1>", "preheader": "<paired preheader>", "shared_thread": "<same promise thread>"},
        {"style": "curiosity", "model_hint": "Gemini curiosity", "subject": "<option 2>", "preheader": "<paired preheader>", "shared_thread": "<same promise thread>"},
        {"style": "direct-response", "model_hint": "ChatGPT direct-response", "subject": "<option 3>", "preheader": "<paired preheader>", "shared_thread": "<same promise thread>"}
      ]
    }`)
    .join(",\n    ");
  const bodyKeys = campaign.segments
    .map((id) => `"${segJsonKey(id)}": "<segment ${id} body copy variant>"`)
    .join(",\n    ");
  const bodySchemaHint = campaign.bodyLayout === "interspersed"
    ? "<max 150 words; paragraph 1 opener before products, paragraph 2 optional bridge after products; use ==accent==, **bold**, and [Product Name](slug:productslug)>"
    : "<max 150 words; 3-5 short continuous paragraphs using ==accent==, **bold**, and [Product Name](slug:productslug)>";
  const productSlots = products
    .map(
      (_, i) => `{
      "slot": ${i + 1},
      "name": "<product name>",
      "template_style": "<${campaign.productCopyStyle || "headline_winner"}>",
      "main_text": "<ALL CAPS <=5 words>",
      "sub_text": "<descriptor with visible price/offer when supplied; may use ==accent== around exact price/offer>",
      "popup_badge": "<e.g. BESTSELLER|LOW STOCK|98% LOVED>",
      "usps": ["<verb/adj-led USP>", "<USP 2>"],
      "review": "<short customer quote - Name>",
      "cta": "<2-4 word plain-text CTA, no markdown>"
    }`
    )
    .join(",\n    ");

  const contrast = isOptionB && optionADirection ? contrastInstruction(optionADirection) : "";
  const winning = campaign.winningContent?.trim()
    ? `\nWINNING REFERENCE EMAIL (mirror its structure, pacing, hook style - write all-new copy):\n---\n${campaign.winningContent.trim().slice(0, 1800)}\n---`
    : "";
  const perfContext = campaign.customPerfContext?.trim()
    ? `CUSTOM PERFORMANCE CONTEXT (user-edited; use as campaign guidance, never expose to customers):\n${campaign.customPerfContext.trim()}`
    : `PERFORMANCE INTELLIGENCE (decision support only; never expose to customers):\n${intelligencePromptBlock(campaign.brandId)}`;

  return `You are an expert email copywriter for ${brand.name}.
Brand persona: ${brand.persona} (${brand.voice})
Layout: ${brand.layout}

PRODUCTS:
${productContext}

SEGMENTS FOR THIS SEND:
${segContext}

BODY LAYOUT:
${bodyLayoutLabel(campaign)}

PRODUCT BLOCK TEMPLATE:
${productCopyStyleLabel(campaign)}

${PLAYBOOK_RULES}

${PROMPT_CONTRACT}

${PLAYBOOK_ENFORCEMENT}

${EMAIL_CAMPAIGN_PLAYBOOK_RULES}

${CONTENT_CREATION_CHAIN_RULES}

${SUBJECT_OPTION_RULES}

${BODY_COPY_RULES}

${BRAND_PLAYBOOK_RULES[campaign.brandId] || ""}

${BRAND_COLOR_GOVERNANCE}

${BANNER_BRIEF_FORMAT}

${WIN_EMAIL_FORMATTING_RULES}

${PRODUCT_BLOCK_TEMPLATE_RULES}

${perfContext}
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
    "main_text": "<legacy combined headline mirror>",
    "sub_text": "<legacy combined support mirror>",
    "main_text_1": "<ALL CAPS headline line 1, <=8 words>",
    "main_text_2": "<ALL CAPS headline line 2, <=8 words>",
    "sub_text_1": "<supporting line 1>",
    "sub_text_2": "<supporting line 2>",
    "image_guidance": "- <compact bullet: first-200px hook + hero product>\n- <compact bullet: price/offer signal>\n- <compact bullet: crop/composition/model/product visibility>\n- <compact bullet: brand palette>\n- <compact bullet: CTA path>",
    "review_quote": "<supplied quote with name, or empty>",
    "review_texts": ["<short review/proof text>", "<optional second proof text>"],
    "main_image": "<dominant hero-product image direction>",
    "sub_image": "<supporting close-up/secondary image direction>",
    "trust_booster": "<supplied proof/risk reducer only>",
    "emergency": "<urgency/deadline signal only>",
    "cta": "<2-4 word CTA>"
  },
  "body": {
    "base": "${bodySchemaHint}",
    ${bodyKeys}
  },
  "ps": "<10-15 words, hard-hitting proof/deadline/curiosity/risk reducer>",
  "products": [
    ${productSlots}
  ],
  "quality_checks": {
    "click_reason": "", "hook_alignment": "", "proof_safety": "",
    "spam_risk": "<low|medium|high + reason>", "optout_risk": "<low|medium|high + reason>",
    "photo_watchout": "", "first_200px": "", "inline_link_plan": "", "layout_risk": "",
    "playbook_dos_donts": "<confirm playbook dos followed and don'ts avoided>",
    "brand_rule_alignment": "<confirm brand-specific rulebook compliance>",
    "accessibility_layout": "<mobile/image/CTA/table accessibility checks>"
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
Hook Contract input: ${campaign.hookContract?.trim() || "Model must construct one before writing from the selected segment, hero product, offer, urgency, proof, and avoid rules."}
Promo: ${promoLine(campaign)}
Body layout: ${bodyLayoutLabel(campaign)}
Product block template: ${productCopyStyleLabel(campaign)}
Recipient token: ${campaign.recipientName}${lastSend}

Generate Option ${isB ? "B" : "A"} now. Lead with a strong creative direction, then write all copy sections.`;
}

// ---- validation ----
function addFlag(b: GenBrief, type: Flag["type"], msg: string) {
  (b._flags ||= []).push({ type, msg });
}

export function validateBrief(brief: GenBrief, campaign: Campaign, products: Product[] = []): GenBrief {
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
    const opts = Array.isArray(v.options) ? v.options : [];
    if (s.length > 60) addFlag(brief, "warn", `${seg} subject over hard cap (${s.length} > 60)`);
    else if (s.length > subjectMax) addFlag(brief, "warn", `${seg} subject above target (${s.length} > ${subjectMax})`);
    if (s && s.length < 42) addFlag(brief, "warn", `${seg} subject may be too short (${s.length})`);
    if (p && (p.length < 60 || p.length > 90)) addFlag(brief, "warn", `${seg} preheader length ${p.length} (target 60-90)`);
    if (/{{\s*first_name\s*}}/i.test(s) && /{{\s*first_name\s*}}/i.test(p)) addFlag(brief, "warn", `${seg} repeats {{first_name}} in subject + preheader`);
    if (!/{{\s*first_name\s*}}/i.test(s + " " + p)) addFlag(brief, "warn", `${seg} missing {{first_name}} in subject/preheader pair`);
    if (similarity(s, p) > 0.55) addFlag(brief, "warn", `${seg} subject and preheader too similar`);
    if (opts.length < 3) addFlag(brief, "warn", `${seg} needs 3+ subject/preheader options`);
    opts.forEach((o, i) => {
      if (!o.style) addFlag(brief, "warn", `${seg} option ${i + 1} missing style`);
      if (!o.model_hint) addFlag(brief, "warn", `${seg} option ${i + 1} missing model_hint`);
      if (!o.shared_thread) addFlag(brief, "warn", `${seg} option ${i + 1} missing shared_thread`);
      if ((o.subject || "").length > 60) addFlag(brief, "warn", `${seg} option ${i + 1} subject over hard cap`);
      if (o.preheader && (o.preheader.length < 60 || o.preheader.length > 90)) {
        addFlag(brief, "warn", `${seg} option ${i + 1} preheader length ${o.preheader.length} (target 60-90)`);
      }
    });
    const hits = HOOK_STACK.filter((w) => (s + " " + p).toLowerCase().includes(w));
    if (hits.length >= 4) addFlag(brief, "warn", `${seg} stacking hooks: ${hits.join(", ")}`);
  });

  const body = brief.body || {};
  campaign.segments.forEach((id) => {
    if (!body[segJsonKey(id)]) addFlag(brief, "warn", "Missing body variant for segment " + id);
  });

  const richText = JSON.stringify({ ba: brief.banner, bo: brief.body, p: brief.products });
  const accentMarks = richText.match(ACCENT_MARKER)?.length || 0;
  const boldMarks = richText.match(BOLD_MARKER)?.length || 0;
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
  const bannerMain = [banner.main_text_1, banner.main_text_2, banner.main_text].filter(Boolean).join("\n");
  const bannerSub = [banner.sub_text_1, banner.sub_text_2, banner.sub_text].filter(Boolean).join("\n");
  (bannerMain || "").split(/\n|<br\s*\/?>/i).forEach((line) => {
    if (wordCount(line) > 8) addFlag(brief, "warn", `Banner line over 8 words: "${line.trim()}"`);
  });
  (["main_text_1", "main_text_2", "sub_text_1", "sub_text_2", "main_image", "sub_image", "trust_booster", "emergency"] as const).forEach((f) => {
    if (!banner[f]) addFlag(brief, "warn", `Structured hero banner missing: ${f}`);
  });
  if (banner.cta && WEAK_CTA.includes(banner.cta.toLowerCase())) addFlag(brief, "warn", `Weak banner CTA: "${banner.cta}"`);
  const bannerBullets = String(banner.image_guidance || "").split(/\n+/).filter((line) => /^\s*[-•]/.test(line));
  if (banner.image_guidance && (bannerBullets.length < 4 || bannerBullets.length > 6)) {
    addFlag(brief, "warn", "Banner image guidance should be 4-6 compact bullets");
  }
  bannerBullets.forEach((line) => {
    const text = line.replace(/^\s*[-•]\s*/, "");
    if (wordCount(text) > 12) addFlag(brief, "warn", `Banner bullet over 12 words: "${line.trim()}"`);
  });

  const opener = (body.base || Object.values(body)[0] || "").slice(0, 250);
  if (BULLET_OPENER.test(opener)) addFlag(brief, "warn", "Body opens with a bullet/checkmark list");
  if (richText && accentMarks + boldMarks < 2) {
    addFlag(brief, "warn", "Final output needs 2+ bold/accent formatting beats from WinEmailTemps patterns");
  }
  if (accentMarks > 6) addFlag(brief, "warn", "Too many accent-color beats; reserve color for offer, proof, product, or deadline");
  if (richText && !MARKDOWN_ANY_LINK.test(richText)) {
    addFlag(brief, "warn", "Final output needs at least one renderer-safe hyperlink");
  }
  Object.entries(body).forEach(([seg, text]) => {
    const paras = String(text || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const firstTwoParas = paras.slice(0, 2).join("\n\n");
    if (text && wordCount(text) > 150) addFlag(brief, "warn", `${seg} body over 150 words (${wordCount(text)})`);
    if (campaign.bodyLayout === "interspersed" && paras.length > 2) {
      addFlag(brief, "warn", `${seg} interspersed body should be opener + one short bridge only`);
    }
    if (text && !MARKDOWN_PRODUCT_LINK.test(firstTwoParas)) {
      addFlag(brief, "warn", `${seg} missing product-name markdown link by paragraph 2`);
    }
    if (campaign.bodyLayout !== "interspersed" && text && paras.length < 3) addFlag(brief, "warn", `${seg} body below 3-paragraph win-template rhythm`);
    if (campaign.bodyLayout !== "interspersed" && text && paras.length > 6) addFlag(brief, "warn", `${seg} body above 5-paragraph win-template rhythm`);
    const themeWords = significantWords(campaign.theme);
    const themeHits = themeWords.filter((w) => norm(text).includes(w)).length;
    if (themeWords.length && themeHits === 0) addFlag(brief, "warn", `${seg} body may miss campaign theme cues`);
    const subjectish = `${sl[seg]?.subject || ""} ${sl[seg]?.preheader || ""}`;
    const bodyish = `${bannerMain} ${bannerSub} ${text}`;
    if (subjectish && bodyish && !sharesContentThread(subjectish, bodyish, products, campaign)) {
      addFlag(brief, "warn", `${seg} subject, hero, and body need a clearer shared thread`);
    }
  });

  const psWords = wordCount(brief.ps || "");
  if (!brief.ps) addFlag(brief, "warn", "Missing P.S. line");
  else if (psWords < 10 || psWords > 15) addFlag(brief, "warn", `P.S. should be 10-15 words (${psWords})`);

  const prods = brief.products || [];
  if (campaign.brandId !== "santa_fare" && prods.length > 6) addFlag(brief, "warn", "7+ product blocks (overcrowding risk)");
  if (campaign.brandId === "santa_fare" && prods.length > 4) addFlag(brief, "warn", "SantaFare should default to 4 products unless the brief gives a clear exception");
  if (campaign.brandId !== "santa_fare" && prods.length > 0 && prods.length < 4) {
    addFlag(brief, "warn", "Product grid below 4 products; playbook default is 4-6 for BG/GL/LF");
  }
  const offerNumbers = promoLine(campaign).match(/\d+(?:\.\d+)?/g) || [];
  prods.forEach((p, i) => {
    if (wordCount(p.main_text) > 5) addFlag(brief, "warn", `Product ${i + 1} main text over 5 words`);
    if ((campaign.productCopyStyle || "headline_winner") === "headline_winner" && wordCount(p.main_text) > 4) {
      addFlag(brief, "warn", `Product ${i + 1} headline-winner main text should be <=4 words`);
    }
    if (!Array.isArray(p.usps) || p.usps.length < 2) addFlag(brief, "warn", `Product ${i + 1} needs >=2 USPs`);
    (p.usps || []).forEach((u, j) => {
      if (wordCount(u) > 5) addFlag(brief, "warn", `Product ${i + 1} USP ${j + 1} over 5 words`);
    });
    if (p.cta && WEAK_CTA.includes(p.cta.toLowerCase())) addFlag(brief, "warn", `Product ${i + 1} weak CTA`);
    if (p.cta && (wordCount(p.cta) < 2 || wordCount(p.cta) > 4)) addFlag(brief, "warn", `Product ${i + 1} CTA should be 2-4 words`);
    if (p.cta && /==|\*\*|__|\[[^\]]+\]\(/.test(p.cta)) addFlag(brief, "warn", `Product ${i + 1} CTA should be plain text; button styling handles formatting`);
    if (offerNumbers.length && !offerNumbers.some((n) => JSON.stringify(p).includes(n))) {
      addFlag(brief, "warn", `Product ${i + 1} may be missing visible price/offer context`);
    }
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
