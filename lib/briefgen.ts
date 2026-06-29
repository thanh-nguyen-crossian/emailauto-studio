// Generation engine ported from email-brief-generator.html: one combined prompt produces the
// per-segment copy AND the design brief, with A/B contrasting options and a validation pass.

import { BRANDS, bodyHomepageLinkPolicy, missingRequiredProducts, requiredProducts as requiredCatalogProducts } from "./config/brands";
import { intelligencePromptBlock, getBrandIntelligence } from "./config/intelligence";
import { performanceFeedbackPromptBlock } from "./performance/feedback";
import { promptRuleBlock } from "./config/playbook";
import type { Brand, Campaign, Product, Urgency, BodyVarietyProfile } from "./config/types";
import { analyzeProductPriceOutliers } from "./quality/productData";
import { conceptPrompt, type EmailConcept } from "./concept";
import { getTechnique, selectTechniquePlan, techniquePlanPrompt, type TechniquePlan } from "./config/techniques";

// Token budget logger (AI_PROMPT_DEBUG=on)
const PROMPT_DEBUG = /^(1|true|on|yes)$/i.test(process.env.AI_PROMPT_DEBUG || "");
/** Approximate token count: 1 token ≈ 4 chars (GPT/Claude heuristic). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
/**
 * Budget thresholds — warn if exceeded (regression guard, not a hard cap).
 * Targets from plan C5: system prompt ≤ 3,500t (aspirational after full C4);
 * set regression ceiling at 10,000t until layered generation reaches C4 target.
 */
const PROMPT_BUDGET_SYSTEM = 10_000;
const PROMPT_BUDGET_PATCH = 2_000;

function logPromptBudget(label: string, text: string, budget: number): void {
  if (!PROMPT_DEBUG) return;
  const tokens = estimateTokens(text);
  const over = tokens > budget;
  const marker = over ? "⚠️  OVER BUDGET" : "✓";
  console.log(`[PromptBudget] ${label}: ~${tokens}t / ${budget}t ${marker}`);
  if (over) {
    console.warn(`[PromptBudget] ${label} exceeds regression ceiling (${tokens} > ${budget}). Check for prompt growth.`);
  }
}

export const PROMPT_REGISTRY_VERSION = "emailstudio-email-brief-v2026-06-16.1";

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
  concept?: EmailConcept;
  branch?: string;
  brief_route?: string;
  source_pattern?: string;
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
  main_text_3?: string;
  sub_text_1?: string;
  sub_text_2?: string;
  sub_text_3?: string;
  image_guidance: string;
  review_quote: string;
  review_texts?: string[];
  main_image?: string;
  sub_image?: string;
  trust_booster?: string;
  emergency?: string;
  cta: string;
  options?: GenBannerOption[];
}
export interface GenBannerOption {
  label: string;
  model_hint: string;
  main_text_1: string;
  main_text_2: string;
  main_text_3: string;
  sub_text_1: string;
  sub_text_2: string;
  sub_text_3: string;
  cta: string;
  review_texts: string[];
  main_image: string;
  sub_image: string;
  trust_booster: string;
  emergency: string;
  image_guidance: string;
}
export interface GenProductBlock {
  slot: number;
  name: string;
  template_style?: string;
  main_image?: string;
  sub_image?: string;
  alt_text?: string;
  image_notes?: string;
  /** Legacy field kept so older saved generations still load, but new prompts no longer request it. */
  image_options?: GenProductImageOption[];
  main_text: string;
  sub_text: string;
  popup_badge: string;
  usps: string[];
  review: string;
  cta: string;
}
export interface GenProductImageOption {
  label: string;
  model_hint: string;
  main_image: string;
  sub_image: string;
  overlay_copy: string;
  alt_text: string;
  notes: string;
}
export interface GenBodyOption {
  label: string;
  model_hint: string;
  body: string;
  ps: string;
  placement_note: string;
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
  playbook_dos_donts: string;
  brand_rule_alignment: string;
  accessibility_layout: string;
  opener_mechanic: string;
  hook_coherence: string;
  cta_assessment: string;
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
  body_options?: Record<string, GenBodyOption[]>;
  ps?: string;
  products: GenProductBlock[];
  quality_checks: GenQualityChecks;
  /** Hard compliance and send-readiness findings. These can drive repair/blocking. */
  _flags?: Flag[];
  /** Creative/style advisories for UI coaching. These never drive repair/blocking. */
  _advisory?: Flag[];
  _score?: number;
  _creative_score?: number;
  _technique_score?: number;
  _technique_coverage?: TechniqueCoverage;
  _provider?: string;
  _model?: string;
  _prompt_version?: string;
  body_variety?: BodyVarietyProfile;
}

export interface TechniqueCoverage {
  score: number;
  lead: string;
  checks: Record<
    | "plan_present"
    | "lead_surfaced"
    | "single_lead"
    | "personalization"
    | "persona_signoff"
    | "question_or_curiosity"
    | "brand_concision"
    | "value_payoff"
    | "power_cta"
    | "offer_cap"
    | "formatting"
    | "low_sales_pressure"
    | "emoji_budget",
    boolean
  >;
  notes: string[];
}

// ---- playbook constants (cleaned from the source file) ----
export const PLAYBOOK_ANGLES = ["Pain Relief", "Mechanism", "Proof", "Offer", "Reactivation", "Occasion/Gift"];
export const PLAYBOOK_FRAMEWORKS = ["PAS", "BAB", "Proof Ladder", "Mechanism", "Suspended Loop", "Short Sale"];
export const PLAYBOOK_REQUIRED_QA = [
  "click_reason", "hook_alignment", "proof_safety", "spam_risk", "optout_risk",
  "photo_watchout", "first_200px", "inline_link_plan", "layout_risk",
  "playbook_dos_donts", "brand_rule_alignment", "accessibility_layout",
  "opener_mechanic", "hook_coherence", "cta_assessment",
];

const PRODUCT_IMAGE_BRIEF_RULES = `PRODUCT IMAGE BRIEF RULES (one product image direction per generated email option):
- Each product block needs main_image, sub_image, alt_text, and image_notes.
- main_image: primary product photo direction — specify angle, framing, background, model/flat-lay, lighting, and visible product area.
- sub_image: close-up detail, texture highlight, secondary angle, or motion cue that supports the main image.
- alt_text: screen-reader description — product name + benefit context; no "image of".
- image_notes: one designer tip — palette alignment, safe zone margin, crop, or brand rule reference.
- Product block main_text, sub_text, popup_badge, usps, review, and cta are the text to bake inside the image; the HTML renderer will not add captions or CTA under product images.
- Do not create nested product image A/B options. Option A/B exists at the full-email level.`;

const BRAND_PLAYBOOK_RULES: Record<string, string> = {
  bra_goddess: `BRAND RULEBOOK - BraGoddess:
DO: Sandra voice (first-person singular "I/my/me" — Sandra is ALWAYS the grammatical subject); emotion-first + offer second; Daisy Bra, Posy Bra, and ZoeShape fixed as the top trio; rotate their internal lead order by theme/segment fit; comfort, support, lift, and fit relief; named-character anecdote (first name + relationship + specific outcome, no invented age/date/rating); soft social urgency with specific time anchor (midnight tonight, 24 hours); deep rose/crimson #a02338-#d63268. No homepage markdown links in body copy — product links only.
DON'T: generic empowerment, gratitude opener ("We're so grateful", "BraGoddess is proud to present"), brand-as-announcer copy, bubblegum #f33e8a, muddy #953336, repeated name in subject+preheader, "don't let X go to waste", feature-list checkmark opener (✅ ✅ ✅ structure), invented promotion-tied counts ("X women grabbed this week"), anonymous star ratings (4.9/5, "5 stars for comfort"), clinical/study claims ("studies show", "scientifically proven"), passive urgency ("ending soon", "limited time", "while stocks last", "if you've been meaning to").
PROOF: named friend/neighbor/customer + first name + relationship + comfort outcome ONLY — no invented age, date, count, rating, or verification label. Sensory qualitative language is fine ("felt like nothing", "wore it all day"); fabricated counts and ratings are not.
SUBJECT: 38-58 chars (sweet spot 44-52); name AFTER emotional hook — never as first word; one emoji max; time anchor in at least one pair (midnight/24 hours/tonight); use o.f.f / 💲; preheader adds tension or deadline.`,
  gents_lux: `BRAND RULEBOOK - GentsLux:
DO: Jordan voice (Jordan is ALWAYS grammatical subject — "I noticed", "I grabbed", never "GentsLux offers"); curiosity + scarcity; JettJeans, Icy Shorts, and AirFlexion fixed as the top trio; rotate their internal lead order by theme/segment fit; lifestyle scene-setting opener (coffee + remote, seasonal errand); mechanism copy around movement, waistband, cooling, durability; budget-aware senior/practical-buyer framing when the segment calls for it; one useful fit/cooling tip; understated confidence; deep navy #002850-#1d3d56.
DON'T: brand-as-announcer ("GentsLux offers", "GentsLux is proud to present"), cute puns, over-luxury language, grammar errors, loud hype, weak navy #26508d/#013faa/#183647, over-specified subject discounts, invented promotion-tied counts ("X men switched this week"), anonymous star ratings, clinical claims, passive urgency ("ending soon", "limited time", "if you've been meaning to").
OFFER: if supplied, state storewide/no code/no exclusions/no limit, free-shipping threshold, deadline, and price/% plainly; never invent any of them.
PRODUCT BLOCKS: headline under 6w; two USP chips under 4w; compact review/proof texture using supplied proof or qualitative unlabeled sensory language ONLY — no invented ratings, counts, or verifications.
SUBJECT: 33-55 chars (sweet spot 33-43); time anchor required in at least one pair (midnight/24 hours/tonight only — not "ending soon"); name mid-subject; imply offer in subject, reveal scale in preheader.`,
  lux_fitting: `BRAND RULEBOOK - LuxFitting:
DO: Adele voice (Adele is ALWAYS grammatical subject); price-anchored sensory promise; StretchActive, Icy Shorts, and SoftyGrace fixed as the top trio; rotate their internal lead order by theme/segment fit; outfit ease, comfort, budget-aware senior/practical-buyer framing when the segment calls for it; salutation "Dearest [first_name]," or "Hi [first_name]," (not "Hello"); seasonal styling/comfort tip in "My [Month] Tip:" format; #e7324a/#fe397b.
DON'T: mixed hooks, "Be hurry!", external health statistics (CDC, clinical, "studies show"), ageist framing, red #d51c18, dull pink #d5255c, birthday+spring+discount+countdown stacking, anonymous star ratings, invented counts tied to the promotion ("X women this week"), passive urgency ("ending soon", "limited time").
OFFER: if supplied, state storewide/no code/no exclusions/no limit, free-shipping threshold, deadline, and price/% plainly; never invent any of them.
PRODUCT BLOCKS: headline under 6w; two USP chips under 4w; compact review/proof texture using supplied proof or qualitative sensory language ONLY — no invented ratings, counts, or verifications.
SUBJECT: 44-56 chars (hard cap 58); specific price/% every time; 💲 or spaced O.F.F; time anchor in at least one pair; preheader escalates.`,
  santa_fare: `BRAND RULEBOOK - SantaFare:
DO: Mary voice (strict first-person singular "I/my/me" — never "we think", "our team"); suspended loop + gifting; Pouchic + TimelessMark first, BygoneMark support; named family member or close friend in gifting micro-story; 4 products; mystery gift in P.S.; deep scarlet #890106-#c00f28.
DON'T: bright cheerfulness, pink #d43268, orange-red #d02c16, broad off-season sends, generic accessory grid, countdown-clock energy, invented promotion-tied counts ("X customers said yes this week"), anonymous star ratings (4.9/5, "customers rated"), passive urgency ("ending soon", "limited time", "while stocks last", "if you've been meaning to").
PROOF: named family member or close friend + specific gifting moment — no invented ages, dates, ratings, or counts.
SUBJECT: 42-54 chars (hard cap 58); urgency anchor = "midnight tonight" ONLY — never "ending soon" or "limited time"; name often in preheader; use SAVING/O.F.F; reluctant deadline or revelation.`,
};

const SUBJECT_DEVICE_DESCRIPTIONS: Record<string, string> = {
  "open-loop": "open a curiosity gap the email resolves — pose a question, name a tension, leave the outcome unstated",
  "pattern-interrupt": "break the scan pattern with an unexpected first word, number, or structure that stops the thumb",
  "playful-conceit": "commit to one unexpected metaphor, analogy, or character POV for the entire subject/preheader pair",
  "social-proof-tease": "drop a supplied social signal (named customer outcome, supplied review fragment, or verified best-seller rank) without fully explaining it — never invent a count, rating, or verification label",
  "deadline-whisper": "imply scarcity or time constraint quietly — no hype words, no exclamation marks",
  "check-in": "speak directly to the reader's current state or unfinished action (\"Still thinking?\", \"You added X…\")",
};

function subjectDeviceLayer(brand: Brand): string {
  const emojiRule =
    brand.emojiPolicy === "yes"
      ? "Emoji budget: 0 or 1 leading emoji where it enhances tone; no double-stacked emojis or emojis in preheaders."
      : brand.emojiPolicy === "sparing"
      ? "Emoji budget: one emoji only for gifting/occasion-specific sends; leave subjects plain by default."
      : "Emoji budget: no emojis — plain text only.";
  const deviceList = brand.subjectDevices
    .map((d) => `  • ${d}: ${SUBJECT_DEVICE_DESCRIPTIONS[d] ?? d}`)
    .join("\n");
  return `Subject device library for ${brand.name}:
${deviceList}
${emojiRule}
REQUIREMENT: the 3 subject options for each segment MUST each use a different device from the list above. Do not write three variations of the same opening mechanic.`;
}

// ---- validation pattern banks ----
const SPAM_WORDS = ["free!", "winner", "congratulations", "click here", "limited time offer", "act now", "urgent"];
const WEAK_COPY = ["i hope this email finds you well", "meet your new favorite", "meet the ", "meet your ", "introducing the ", "amazing value", "great quality", "don't miss out", "dont miss out", "be hurry"];
// LLM-tell phrases that signal AI-generated copy and erode trust/deliverability.
const AI_SLOP_PHRASES = [
  "seamlessly", "leverage", "leveraging", "ignite your", "igniting", "empower yourself", "empowers you",
  "furthermore,", "in conclusion,", "in summary,", "to summarize,",
  "dive into", "delve into", "delving into", "transformative", "game-changer", "game changer",
  "game-changing", "revolutionize", "cutting-edge", "state-of-the-art", "unlock the power",
  "elevate your", "elevate the", "harness the power", "take your to the next level",
  "journey to", "experience the magic", "it's more than just", "it's not just a",
];
const BODY_HARD_SELL_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "act now", pattern: /\bact now\b/gi },
  { label: "buy now", pattern: /\bbuy now\b/gi },
  { label: "hurry", pattern: /\bhurry\b/gi },
  { label: "don't miss", pattern: /\bdon'?t miss(?: out)?\b/gi },
  { label: "last chance", pattern: /\blast chance\b/gi },
  { label: "claim now", pattern: /\bclaim (?:now|yours|this|it|them)\b/gi },
  { label: "grab now", pattern: /\bgrab (?:now|yours|this|it|them|these)\b/gi },
  { label: "rush", pattern: /\brush\b/gi },
  { label: "selling out", pattern: /\bselling out\b/gi },
  { label: "before gone", pattern: /\bbefore (?:it'?s|they'?re|these are) gone\b/gi },
];
const BRAND_PERSONA_NAMES: Record<string, string> = {
  bra_goddess: "Sandra",
  gents_lux: "Jordan",
  lux_fitting: "Adele",
  santa_fare: "Mary",
};
const OPTOUT_RISK = ["for older women", "hide your", "fix your body", "anti aging", "look younger", "flaws"];
const UNSUPPLIED_PROOF = ["clinically proven", "doctor recommended", "medically proven", "guaranteed results", "thousands of customers", "rated #1", "scientifically proven", "studies show", "research shows", "data shows", "as seen on", "award-winning", "9 out of 10"];
const UNSUPPLIED_PROOF_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "unsupplied 5-star count", pattern: /\b(?:over\s+)?\d{2,}[\w+ -]*(?:5[- ]?star|five[- ]?star|ratings?|reviews?)\b/i },
  { label: "unsupplied star rating score", pattern: /\b\d(?:\.\d)?\s*\/\s*5\s*stars?\b/i },
  { label: "unsupplied audience count", pattern: /\b(?:loved by|trusted by|chosen by|worn by)\s+(?:over\s+)?\d{2,}[\w+ -]*(?:women|men|customers|shoppers|buyers)\b/i },
  { label: "unsupplied sold/customer scale", pattern: /\b\d{3,}\+?\s+(?:sold|customers|shoppers|buyers|reviews|ratings)\b/i },
  { label: "unsupplied promotion-tied count", pattern: /\b\d[\d,]*\s+(?:women|men|customers|shoppers|people)\s+(?:grabbed|bought|ordered|snagged|chose|switched|already)\b/i },
  { label: "unsupplied mass social proof", pattern: /\bover\s+\d[\d,.]*\s*(?:million|thousand|M|k)?\s*(?:women|men|customers|shoppers|buyers)\b/i },
  { label: "unsupplied percent claim", pattern: /\b\d+%\s+of\s+(?:women|men|customers|shoppers|buyers|people)\b/i },
  { label: "unsupplied verified label", pattern: /\bverified\s+(?:buyer|customer|review|purchase|rating)\b/i },
  { label: "unsupplied review age/date", pattern: /\b(?:age(?:d)?\s+\d{2}|\d{2}\s*(?:years?|yrs?)\s*old|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*20\d{2})?)\b/i },
  { label: "unsupplied stock/shipping fact", pattern: /\b(?:only\s+\d+\s+left|left\s+in\s+stock|ships?\s+(?:in|within)\s+\d+\s*(?:hours?|days?)|delivers?\s+(?:in|within)\s+\d+\s*(?:hours?|days?))\b/i },
  { label: "unsupplied medical outcome", pattern: /\b(?:clinically|doctor(?:-|\s)?recommended|medically|reduces?\s+swelling|improves?\s+circulation|treats?\s+(?:arthritis|sciatica)|cures?|heals?)\b/i },
  { label: "unsupplied study/research claim", pattern: /\b(?:studies?\s+show|research\s+(?:shows?|finds?|suggests?)|data\s+shows?|scientists?\s+(?:say|found|recommend)|experts?\s+(?:say|recommend|agree))\b/i },
];
const WEAK_CTA = ["click here", "learn more", "shop now", "discover more", "see more"];
const HOOK_STACK = ["birthday", "anniversary", "spring", "summer", "mother", "review", "thank", "countdown", "last chance", "ending", "comfort", "sale", "gift", "free shipping"];
const BULLET_OPENER = /^\s*(?:[•*-]|✅|✓|✔|\d+\.)\s+/;
const MARKDOWN_PRODUCT_LINK = /\[[^\]]+\]\(slug:[a-z0-9_-]+\)/i;
const MARKDOWN_HOME_LINK = /\[[^\]]+\]\(home\)/gi;
const MARKDOWN_ANY_LINK = /\[[^\]]+\]\((?:slug:[a-z0-9_-]+|home)\)/i;
const ACCENT_MARKER = /==[^=]+==/g;
const BOLD_MARKER = /\*\*[^*]+\*\*/g;
const THEME_STOPWORDS = new Set(["sale", "email", "campaign", "offer", "promo", "spring", "summer", "winter", "fall", "thank", "thanks"]);
const HARD_SELL_COMMANDS = new Set(["act now", "hurry", "claim now", "grab now", "rush"]);
const SCHEMA_PLACEHOLDER_PATTERN = /<[^>]+>|120-150 words|product\(slug:slug\)|main text 1:?\s*$|- bullet\s*\n\s*- bullet/i;

// ---- body variety system ----
function hashSeed(s: string): number {
  let h = 0;
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const VARIETY_BANKS: Record<string, {
  characters: { name: string; role: string }[];
  painPoints: string[];
  sensoryPhrases: string[];
}> = {
  bra_goddess: {
    characters: [
      { name: "Dorothy", role: "neighbor" },
      { name: "Carol", role: "friend" },
      { name: "Rose", role: "sister" },
      { name: "Margaret", role: "woman from my book club" },
      { name: "Linda", role: "coworker" },
      { name: "Helen", role: "customer who wrote in" },
      { name: "Sharon", role: "repeat buyer" },
      { name: "Claire", role: "woman from our community" },
      { name: "Judith", role: "longtime subscriber" },
      { name: "Martha", role: "friend from church" },
      { name: "Ellen", role: "retired teacher" },
      { name: "Nina", role: "customer service caller" },
      { name: "Patricia", role: "daily comfort shopper" },
      { name: "Susan", role: "reader who replied last week" },
      { name: "Joanne", role: "woman comparing sizes" },
      { name: "Elaine", role: "customer buying for travel" },
      { name: "Betty", role: "friend who avoids underwire" },
      { name: "Marilyn", role: "VIP buyer" },
      { name: "Ruth", role: "woman who wanted front closure" },
      { name: "Cynthia", role: "customer shopping for softer straps" },
    ],
    painPoints: [
      "underwire digging in by noon",
      "straps that slip off the shoulder all day",
      "cups that gap or wrinkle under clothes",
      "a bra that rides up in the back",
      "side boning that leaves marks at the end of the day",
      "reaching behind the back for tiny hooks",
      "red strap marks after a long errand day",
      "support that feels firm for one hour and harsh by dinner",
      "bra edges showing through a light summer top",
      "the uncomfortable choice between lift and softness",
      "adjusting the band every time you stand up",
      "fuller cups that still spill at the sides",
      "a neckline that needs shape without underwire",
      "hot fabric that feels heavy in warm weather",
      "a closure that twists when fingers are tired",
      "straps that dig once a purse is on the shoulder",
      "bras that feel fine in the mirror but not in the car",
      "support panels that scratch near the underarm",
      "the drawer full of bras that never feel quite right",
      "comfort that disappears after the first wash",
    ],
    sensoryPhrases: [
      "no digging, no pinching",
      "feels like a second skin",
      "so light you forget you're wearing it",
      "lifts without squeezing",
      "buttery soft against the skin",
      "soft support that stays put",
      "smooth under a simple tee",
      "gentle lift without the bite",
      "easy front closure, no twisting",
      "cooler than a heavy padded bra",
      "wide straps that settle softly",
      "a clean shape without wire pressure",
      "light on the shoulders by evening",
      "fabric that moves when you breathe",
      "support you do not have to keep fixing",
      "soft edges that do not scratch",
      "a smoother line under summer layers",
      "the quiet relief of no red marks",
      "secure without feeling locked in",
      "easy to fasten, easy to forget",
    ],
  },
  gents_lux: {
    characters: [
      { name: "Frank P.", role: "longtime subscriber" },
      { name: "Marcus", role: "guy from my gym" },
      { name: "David", role: "subscriber who emailed me" },
      { name: "Tony", role: "coworker" },
      { name: "Ray", role: "customer" },
      { name: "Calvin", role: "customer who travels for work" },
      { name: "Eddie", role: "weekend golfer" },
      { name: "Paul", role: "reader who hates stiff denim" },
      { name: "Victor", role: "subscriber comparing fits" },
      { name: "Henry", role: "dad who walks everywhere" },
      { name: "Sam", role: "warehouse manager" },
      { name: "George", role: "repeat buyer" },
      { name: "Leo", role: "customer service caller" },
      { name: "Brian", role: "guy dressing for casual Fridays" },
      { name: "Nate", role: "outdoor weekend buyer" },
      { name: "Walter", role: "man who wanted cooler shorts" },
      { name: "Chris", role: "customer who sits through long drives" },
      { name: "Derek", role: "subscriber who asked about stretch" },
      { name: "Mason", role: "builder who needs durable pants" },
      { name: "Alan", role: "customer shopping a cleaner fit" },
    ],
    painPoints: [
      "stiff denim that restricts movement all day",
      "shorts that ride up mid-walk",
      "jeans that look professional but feel like a straitjacket",
      "camo that looks cool but runs hot after an hour",
      "pants that won't stretch when you actually need them to",
      "waistbands that dig after lunch",
      "thick fabric that feels heavy in humid weather",
      "pants that bag at the knees by afternoon",
      "shorts that cling when you sit in the car",
      "jeans that pass the mirror test but fail the stairs",
      "pockets that pull and wrinkle the whole fit",
      "casual pants that look too sloppy for dinner",
      "fabric that chafes during a long walk",
      "camo that feels loud instead of sharp",
      "stretch pants that lose shape after one wear",
      "denim that pinches when you bend down",
      "shorts that look fine standing but tight sitting",
      "a fit that makes warm-weather errands feel heavier",
      "pants that cannot handle work-to-weekend plans",
      "cheap-looking shine on supposedly premium fabric",
    ],
    sensoryPhrases: [
      "moves with you, not against you",
      "cool on skin even when it's hot out",
      "four-way stretch you actually feel",
      "lightweight — like it's barely there",
      "built to wear everywhere, all day",
      "clean enough for dinner, easy enough for errands",
      "stretch that snaps back, not sags out",
      "room where you bend, structure where it counts",
      "a waistband that sits flat without biting",
      "breathes better than heavy denim",
      "soft inside, sharp outside",
      "handles stairs, drives, and long walks",
      "light fabric with a real shape",
      "cooler legs without looking underdressed",
      "durable without feeling stiff",
      "smooth movement from hip to knee",
      "keeps its line after hours of sitting",
      "utility you can feel in the first step",
      "the rare pair that does not need breaking in",
      "structured comfort without the gym-pant look",
    ],
  },
  lux_fitting: {
    characters: [
      { name: "Rachel", role: "woman who reached out to me" },
      { name: "Joanne", role: "longtime customer" },
      { name: "Susan", role: "woman from our community" },
      { name: "Claire", role: "subscriber who messaged us" },
      { name: "Pam", role: "customer" },
      { name: "Megan", role: "teacher who is on her feet" },
      { name: "Lisa", role: "customer who wanted summer pieces" },
      { name: "Diane", role: "reader shopping for travel outfits" },
      { name: "Natalie", role: "woman comparing fit notes" },
      { name: "Erin", role: "repeat buyer" },
      { name: "Monica", role: "customer who avoids clingy fabric" },
      { name: "April", role: "subscriber who loves soft sets" },
      { name: "Teresa", role: "woman rebuilding her basics drawer" },
      { name: "Kim", role: "customer who walks after work" },
      { name: "Angela", role: "reader asking about opacity" },
      { name: "Valerie", role: "mom needing quick outfits" },
      { name: "Sophie", role: "customer shopping between sizes" },
      { name: "Rebecca", role: "woman who wanted breathable layers" },
      { name: "Laura", role: "loyal buyer from last season" },
      { name: "Janice", role: "subscriber who dislikes tight waistbands" },
    ],
    painPoints: [
      "activewear that goes sheer when you bend over",
      "leggings that roll down mid-workout",
      "shorts that dig in when you sit",
      "clothes that don't move with your body",
      "nothing in the closet that fits properly off the rack",
      "a waistband that folds the second you move",
      "fabric that clings in the heat",
      "tops that pull across the chest but hang loose elsewhere",
      "leggings that feel supportive until the first squat",
      "outfits that look put together but feel restrictive",
      "shorts that bunch under a longer top",
      "pants that lose shape after a few hours",
      "seams that rub during a walk",
      "thin fabric that shows every line",
      "a closet full of pieces that do not pair easily",
      "summer layers that feel heavier than they look",
      "a fit that needs constant adjusting",
      "comfortable basics that still look too plain",
      "a dressy-casual gap before errands or lunch",
      "stretch that squeezes instead of smoothing",
    ],
    sensoryPhrases: [
      "cool and breathable from the first wear",
      "smooths without squeezing",
      "stretches four ways without going sheer",
      "hugs the right places without restricting movement",
      "feels like wearing nothing at all",
      "soft stretch that keeps its shape",
      "easy movement without the thin-fabric worry",
      "light on skin, polished in the mirror",
      "a waistband that lies flat",
      "moves through errands without tugging",
      "smooth under tees and tunics",
      "breathable enough for warm afternoons",
      "gentle hold, not compression pressure",
      "fabric with drape instead of cling",
      "opaque when you bend and walk",
      "comfortable enough to forget, neat enough to wear out",
      "a clean line without pinching",
      "soft seams that stay quiet",
      "stretch that follows, not fights",
      "the kind of easy fit you reach for twice a week",
    ],
  },
  santa_fare: {
    characters: [
      { name: "Michelle", role: "my sister" },
      { name: "Karen", role: "a close friend" },
      { name: "Janet", role: "someone I know" },
      { name: "Diane", role: "a longtime customer" },
      { name: "Barbara", role: "who asked me for gift ideas" },
      { name: "Elaine", role: "friend shopping for a niece" },
      { name: "Patricia", role: "customer planning early gifts" },
      { name: "Nancy", role: "woman who loves personalized pieces" },
      { name: "Gloria", role: "reader buying for her daughter" },
      { name: "Catherine", role: "repeat holiday buyer" },
      { name: "Anne", role: "friend who avoids generic gifts" },
      { name: "Molly", role: "customer who wanted a keepsake" },
      { name: "Theresa", role: "subscriber planning birthdays" },
      { name: "Lillian", role: "woman who likes practical luxury" },
      { name: "Paula", role: "customer shopping for travel gifts" },
      { name: "Rebecca", role: "friend who keeps a gift drawer" },
      { name: "Carmen", role: "buyer comparing leather finishes" },
      { name: "Donna", role: "reader looking for a thoughtful surprise" },
      { name: "Marie", role: "customer choosing initials" },
      { name: "Angela", role: "woman buying for a winter trip" },
    ],
    painPoints: [
      "no idea what to get them for their birthday",
      "wanting something personal but practical, not just a gift card",
      "needing a gift that travels well and lasts",
      "finding something they'd never splurge on for themselves",
      "they already have everything — except something really thoughtful",
      "a present that feels chosen without feeling overdone",
      "finding a keepsake that still gets used",
      "a small luxury that does not look last-minute",
      "wanting the personalization to feel subtle, not flashy",
      "needing a gift that can be mailed easily",
      "choosing something pretty that will not sit in a drawer",
      "a birthday that is close enough to need a decision",
      "a holiday gift that works beyond the holiday",
      "finding an option that feels grown-up and warm",
      "wanting a gift with texture, not another gadget",
      "a travel-friendly piece that feels special",
      "not knowing their exact size or style",
      "a gift that says thoughtfulness without a long explanation",
      "choosing a premium-looking piece within budget",
      "a recipient who notices small finishing details",
    ],
    sensoryPhrases: [
      "the kind of gift they'll reach for every single day",
      "soft leather that only gets better with age",
      "substantial but never heavy",
      "luxurious to carry, easy to love",
      "opens smoothly, closes clean — that quality you can feel",
      "a keepsake feel in a practical size",
      "smooth hardware and a clean close",
      "rich color without holiday clutter",
      "personal detail that feels quietly special",
      "soft grain you notice in the hand",
      "a gift that looks considered immediately",
      "light enough to carry, polished enough to remember",
      "warm heritage color with premium texture",
      "a small piece with a grown-up finish",
      "the kind of detail that makes wrapping feel easy",
      "classic enough for daily use",
      "personal without being overly sweet",
      "clean edges, thoughtful finish, lasting feel",
      "a little luxury that travels well",
      "practical beauty they can use right away",
    ],
  },
};

const CREATIVE_LEVER_BANKS: Record<string, {
  creativeLenses: string[];
  proofRoles: string[];
  subjectStyles: string[];
  visualDirections: string[];
}> = {
  bra_goddess: {
    creativeLenses: [
      "fit rescue: one specific discomfort becomes the reason to click",
      "confidence ritual: the product upgrades a familiar daily routine",
      "first-look comfort reward for buyers who already trust the brand",
      "collection completion: bra plus support item feels like the missing piece",
      "front-closure ease: make the fastening moment the practical breakthrough",
      "summer underlayer relief: lighter support under warm-weather clothes",
      "drawer audit: replace the bra she keeps avoiding with one easy choice",
      "noon discomfort reversal: show the moment comfort usually breaks down",
      "soft support reassurance: make lift feel gentle, not medical or corrective",
      "return-to-favorite: reconnect a previous buyer to why Daisy/Posy worked",
      "occasion-ready comfort: dress, tee, errands, or travel needs a calmer bra",
      "fit confidence bridge: solve visible lines, shifting straps, or gapping",
      "small mechanism, big relief: closure, straps, panels, or fabric drive click",
      "quiet proof note: one supplied customer sentence makes the choice believable",
      "price permission: value removes hesitation after the comfort reason lands",
      "gentle urgency: time limit sounds like a practical reminder from Sandra",
      "support pairing: hero plus companion pieces answer related comfort pains",
      "first-wear promise: emphasize what she should notice within minutes",
      "mature fit realism: speak to everyday movement, not generic confidence",
      "private recommendation: Sandra shares one item before the offer closes",
    ],
    proofRoles: [
      "use the supplied review as a quiet reassurance, not the headline",
      "use price as the proof of why now, then comfort as the reason to stay",
      "use product mechanism as proof: closure, straps, lift, smoothing, fabric",
      "use shipping/return facts only as friction removal near the action",
      "use the hero product's USP as the proof anchor in paragraph 1",
      "use one tactile phrase as soft proof, then name the product",
      "use a supplied customer quote only if it exactly matches product context",
      "use offer value to lower risk, not to replace the human reason",
      "use product order as proof: hero solves main pain, supports solve adjacent pains",
      "use before-after feeling language without fake clinical or medical claims",
      "use fit detail as proof instead of broad empowerment language",
      "use front-closure or strap detail as the designer-visible proof cue",
      "use review text as a trust booster near banner/body transition",
      "use price and shipping together only when both are supplied",
      "use one named pain as proof that the send understands the reader",
      "use brand persona sign-off as reassurance, not pressure",
      "use markdown product link early as proof-path clarity",
      "use supplied page USP over invented bestseller/rating language",
      "use calm urgency to explain timing, not scarcity theatrics",
      "use product image notes to reinforce proof visually",
    ],
    subjectStyles: [
      "emotion-first with price second",
      "soft curiosity with comfort payoff",
      "specific pain relief with deadline beat",
      "warm personal note with offer reveal",
      "front-snap mechanism with name token in preheader",
      "reader pain question with exact price in the answer",
      "Sandra note with one concrete comfort clue",
      "quiet deadline with product benefit first",
      "one body-comfort moment plus shipping cue",
      "review-fragment curiosity with offer in preheader",
      "drawer/fit problem with hero product reveal",
      "soft reactivation note without guilt language",
      "single product relief promise under 55 chars",
      "price permission after comfort image",
      "strap/band/closure detail as the subject hook",
      "gentle personal recommendation",
      "offer as courtesy, not headline blast",
      "summer underlayer clue",
      "fit fix with one tactile word",
      "calm last-call phrasing without panic",
    ],
    visualDirections: [
      "mature model, natural smile, hero bra clearly visible, rose-crimson palette",
      "close crop on fit/support detail with simple price badge",
      "soft lifestyle dressing moment with product and CTA above fold",
      "clean product-forward hero with one comfort proof line",
      "front-closure close-up paired with a warm model crop",
      "simple dresser or morning-routine scene, no cluttered collage",
      "rose background with product edge and strap detail readable",
      "two-image hierarchy: hero worn shot plus closure macro",
      "soft fabric texture panel behind a concise comfort headline",
      "above-fold price chip balanced with one support cue",
      "mature model in a light top showing smooth neckline",
      "side-support detail callout with restrained arrows",
      "front-on fit shot with deep crimson CTA contrast",
      "calm welcome-back banner with generous white space",
      "review chip near hero product, no fake rating wall",
      "comfort comparison: no-wire visual cue without medical tone",
      "supporting product pair shown smaller under the hero",
      "mobile-safe headline stacked in three short lines",
      "warm indoor light, fabric color true, no neon pink",
      "product-first composition with Sandra-note handwriting accent",
    ],
  },
  gents_lux: {
    creativeLenses: [
      "mechanism reveal: show why the pants move better",
      "understated scarcity: the useful item may not stay at this price",
      "wardrobe completion: the missing bottom/top makes existing pieces work harder",
      "premium practicality: sharp enough outside, comfortable enough all day",
      "sit-and-bend test: prove comfort in a normal man's day",
      "heat management: make cooling/breathability the practical reason",
      "work-to-weekend bridge: one pair handles both without looking sloppy",
      "fit upgrade: cleaner silhouette without stiff denim tradeoff",
      "utility detail: pockets, waistband, stretch, or fabric carries the proof",
      "plainspoken recommendation: Jordan names why this pair earned the send",
      "low-hype scarcity: limited timing without shouting",
      "outfit math: fewer decisions because the hero pair goes with more",
      "movement before price: physical benefit first, offer second",
      "durability confidence: built-for-use angle only from supplied USPs",
      "weather-ready practical: hot day, long drive, walk, or casual dinner",
      "comfort reset: replace the pair he keeps tolerating",
      "premium restraint: sharper look through details, not luxury claims",
      "quick decision: one reason, one price, one direct CTA",
      "repeat-wear proof: why a previous buyer reaches for the item again",
      "hero-detail contrast: zoom into the one feature competitors miss",
    ],
    proofRoles: [
      "use one material/mechanism fact as the trust anchor",
      "use price reveal as the payoff after curiosity",
      "use supplied review as plainspoken evidence from another man",
      "use durability/cooling/stretch as proof only when supplied by product USPs",
      "use movement language tied to a supplied stretch or fabric USP",
      "use waistband/pocket detail as proof if present in product data",
      "use restrained review language, no fake verified badges or ratings",
      "use price as the nudge after the practical problem is solved",
      "use product order as proof: hero fit first, support products as alternates",
      "use one exact offer/shipping fact, not multiple discount claims",
      "use visual proof notes to show bend, walk, sit, or cooling",
      "use segment context to explain why this man needs this item now",
      "use scarcity only as timing, not fear",
      "use fabric hand-feel as qualitative proof when no numbers exist",
      "use a direct CTA after the product has earned it",
      "use supplied page facts before performance-intelligence assumptions",
      "use premium finish as proof through visual detail, not adjectives",
      "use one review line near the risk reducer",
      "use product URL/slug link early to keep the click path clear",
      "use optout-safe language; never insult old clothes or body shape",
    ],
    subjectStyles: [
      "curiosity gap with offer reveal in preheader",
      "scarcity with restrained language",
      "mechanism-first promise",
      "direct practical problem",
      "movement test with price second",
      "cooling/weather cue with product reveal",
      "clean-fit promise without hype",
      "Jordan note with one plainspoken detail",
      "limited timing framed as useful reminder",
      "work-to-weekend hook",
      "waistband or stretch mechanism clue",
      "understated review fragment",
      "practical question answered in preheader",
      "price anchor after benefit",
      "VIP/restock-style curiosity without false scarcity",
      "driver/walker/sitter use-case subject",
      "wardrobe fix with exact hero product",
      "one-word tactile lead plus offer",
      "plain sale subject with stronger preheader",
      "gift-for-him angle only when theme supports it",
    ],
    visualDirections: [
      "deep navy product-forward studio shot, no loud hype",
      "movement pose showing bend/walk/sit without stiffness",
      "detail shot of waistband/pockets/fabric with restrained badge",
      "outdoor practical scene with CTA and price visible above fold",
      "side-by-side standing and seated crop to prove ease",
      "navy backdrop with fabric texture and one price chip",
      "walking stride shot, product fit readable, no busy street scene",
      "pocket/waistband macro with short mechanism label",
      "casual dinner or travel-ready look, restrained contrast",
      "cooling fabric close-up with blue-gray light, no icy gimmicks",
      "hero jeans centered with support shorts/camo smaller below",
      "model bending or stepping up, CTA still above fold",
      "product flat-lay with belt/shoe context, not luxury props",
      "dark navy CTA bar with clean product depth shadow",
      "review chip as simple text, no fake star wall",
      "mobile-first large product crop and compact headline",
      "outdoor practical shot with neutral background",
      "fabric stretch arrows used sparingly and clearly",
      "work-to-weekend outfit transition visual",
      "plainspoken offer badge; avoid neon, flames, or loud sale graphics",
    ],
  },
  lux_fitting: {
    creativeLenses: [
      "sensory price anchor: the feel makes the price surprising",
      "outfit ease: one piece solves a daily getting-ready problem",
      "movement confidence: fabric follows the body without fuss",
      "practical seasonal tip: one styling/use moment justifies the send",
      "opacity reassurance: bend/walk confidence without overexplaining",
      "waistband relief: comfort starts where other pieces fail",
      "closet gap: one easy piece makes more outfits work",
      "heat-friendly dressing: light fabric solves the seasonal problem",
      "polished comfort: errands-to-lunch use case without athleisure cliche",
      "fit forgiveness: smooths gently without body-shaming",
      "repeat-wear staple: why this belongs in weekly rotation",
      "travel-ready ease: packable, breathable, simple styling",
      "soft structure: shape and drape instead of compression",
      "movement proof: show the product behaving during normal activity",
      "price permission: offer appears after the tactile reason",
      "customer-note opener: one woman names the fit issue",
      "seasonal transition: a piece that handles cool morning and warm afternoon",
      "top-and-bottom pairing: product blocks act like outfit solutions",
      "low-risk try: link early, remove hesitation calmly",
      "fresh basics refresh: update a familiar wardrobe category",
    ],
    proofRoles: [
      "use price as the quick decision proof",
      "use sensory language as the reason to click, not vague empowerment",
      "use supplied review as a tactile confirmation",
      "use fabric/stretch mechanism as proof when the product USP supports it",
      "use opacity/smoothing only when product facts support the claim",
      "use waistband or seam detail as the concrete trust cue",
      "use styling context as proof of usefulness, not decoration",
      "use exact offer/shipping after the body problem is clear",
      "use review text as one quiet confirmation, not the lead",
      "use product image notes to show drape, movement, or fabric weight",
      "use segment motivation to change the risk reducer",
      "use supplied page cues before broad confidence language",
      "use CTA only after one product link and one proof beat",
      "use tactile vocabulary as qualitative proof, never fake metrics",
      "use product grid order to build outfit logic",
      "use color/palette notes to keep visual trust high",
      "use one practical occasion as the reason for urgency",
      "use price as permission, not pressure",
      "use a single hook across surfaces to avoid fatigue",
      "use optout-safe language; never shame fit, size, or age",
    ],
    subjectStyles: [
      "price-anchored sensory comparison",
      "specific comfort question",
      "outfit problem with quick reveal",
      "deadline escalation without panic",
      "soft fabric cue with offer in preheader",
      "waistband/fit relief question",
      "outfit-ready benefit with exact product",
      "seasonal use case plus price",
      "movement verb subject line",
      "reader note from Sarah/Mia persona style",
      "quiet urgency with tactile payoff",
      "review-fragment plus price anchor",
      "closet refresh without generic sale wording",
      "opacity/smoothness clue",
      "travel/errand moment hook",
      "one easy fit promise",
      "product-name curiosity with comfort preheader",
      "offer as helpful detail",
      "warm-weather fabric lead",
      "simple direct subject, richer preheader",
    ],
    visualDirections: [
      "movement silhouette with product shape readable and pink-red palette",
      "close textile/drape detail with concise price badge",
      "bright but elegant outfit-ready scene, no crowded collage",
      "product-forward hero with one practical styling cue",
      "model walking or reaching, waistband and drape readable",
      "fabric texture close-up beside full-body outfit shot",
      "clean pink-red CTA with large mobile-safe headline",
      "one hero piece styled three-quarter view, no color-strip clutter",
      "soft natural light, product edges clear, no over-filtering",
      "before-errands/lunch scene with practical accessory only",
      "opacity/movement visual cue without awkward pose",
      "paired product blocks arranged like outfit choices",
      "textile detail panel behind one concise comfort line",
      "review chip near product, not a fake rating wall",
      "price badge small but readable above fold",
      "seasonal backdrop secondary to product fit",
      "model smiling in full-body crop, fabric silhouette clear",
      "simple drawer/closet refresh scene with hero product front",
      "supporting images show seam, waistband, or drape",
      "avoid thin fonts; use high-contrast accent sparingly",
    ],
  },
  santa_fare: {
    creativeLenses: [
      "suspended gifting loop: something thoughtful is nearly unclaimed",
      "named gift story: one recipient moment makes the product desirable",
      "reluctant deadline: calm urgency without countdown energy",
      "personalization value: the small detail makes the gift feel chosen",
      "practical keepsake: beauty plus everyday use makes the gift easier",
      "recipient-specific choice: one person/use case guides product order",
      "quiet luxury reveal: premium feel without loud luxury wording",
      "early planner note: useful reminder for people who buy ahead",
      "not-a-gift-card alternative: personal, tangible, still safe",
      "travel-ready gift: small leather piece as daily companion",
      "heritage color story: warm red/scarlet visual carries brand memory",
      "personal detail payoff: initials, finish, texture, or closure make it special",
      "gift drawer rescue: something ready for the next date on the calendar",
      "understated occasion: birthday, anniversary, holiday, or thank-you angle",
      "last-minute without panic: decision help, not countdown pressure",
      "recipient delight: imagine the first use, not abstract sentiment",
      "premium within reach: offer removes hesitation after the story",
      "small object, big thought: compact gift feels considered",
      "keepsake-plus-utility: durable use case supports emotional value",
      "Mary's private recommendation: a warm note about who this fits",
    ],
    proofRoles: [
      "use material/personalization facts as proof of thoughtfulness",
      "use price as the reason to act after the gift story",
      "use supplied review as a gentle trust cue, not a fake verified claim",
      "use shipping/deadline only when supplied and relevant to gifting",
      "use leather/finish/closure facts from product data as proof",
      "use recipient use-case as proof of practicality",
      "use personalization as emotional proof only when supplied",
      "use exact offer after the gift feels meaningful",
      "use review text sparingly and faithfully if it matches the product",
      "use product order as proof: safest gift first, special details after",
      "use visual notes to show texture and scale clearly",
      "use holiday/birthday timing only if theme or send date supports it",
      "use calm urgency as planning help, not fear",
      "use material words over unsupported luxury claims",
      "use a single keepsake reason across subject, banner, and body",
      "use markdown product link early to make the gift concrete",
      "use shipping or archive facts only when supplied",
      "use gift-fit benefits instead of broad sentimental language",
      "use support products as alternate recipient/use-case paths",
      "use optout-safe, non-guilting reminder language",
    ],
    subjectStyles: [
      "suspended loop with name in preheader",
      "reluctant deadline reveal",
      "gift status curiosity",
      "thoughtful recommendation with price or saving second",
      "recipient story with product clue",
      "personalized detail plus offer in preheader",
      "gift drawer/early planner hook",
      "keepsake utility question",
      "heritage color or leather texture lead",
      "birthday/occasion cue without hook stacking",
      "Mary note with practical gift reveal",
      "quiet luxury curiosity",
      "not-a-gift-card alternative",
      "travel-ready gift angle",
      "small detail, big thought subject",
      "last-minute decision help without panic",
      "review-fragment gift trust",
      "exact price after emotional cue",
      "one recipient use case",
      "simple direct gift offer with warm preheader",
    ],
    visualDirections: [
      "deep scarlet gift scene with product close-up and calm CTA",
      "hands/personalization detail, premium texture, no cheerful clutter",
      "recipient moment with Pouchic or TimelessMark visible above fold",
      "clean product pair with engraving detail and reluctant deadline badge",
      "macro leather grain plus full product scale shot",
      "warm gift table scene, one product hero, minimal ribbon",
      "initials/engraving close-up if supplied, no fake personalization",
      "heritage red backdrop with readable gold/cream contrast",
      "hands opening pouch/wallet, product clearly visible",
      "recipient-use scene secondary to product detail",
      "small premium price badge placed away from engraving/detail",
      "gift-note handwriting accent, not a full text card",
      "four-product guide layout with clear recipient/use-case labels",
      "mobile-first hero: product, CTA, one gift line above fold",
      "review chip near the object, no star-wall proof",
      "travel bag/purse context showing practical size",
      "timeless product cutout on deep scarlet with soft shadow",
      "avoid pink, neon, or busy holiday ornament piles",
      "texture and closure detail as supporting image",
      "calm urgency ribbon with true deadline only",
    ],
  },
};

const OPENER_MECHANICS: {
  key: BodyVarietyProfile["openerMechanic"];
  label: string;
  directive: (char: string, role: string, pain: string, persona: string) => string;
}[] = [
  {
    key: "story",
    label: "Named Micro-Story",
    directive: (char, role, pain, persona) =>
      `Open with a 2-3 sentence micro-story about ${char} (${role}) — mention them by name. The story ties "${pain}" to discovering the hero product as the solution. Price appears in sentence 1 or 2. Do NOT open with ${persona}'s own opinion — this is ${char}'s story.`,
  },
  {
    key: "fact",
    label: "Fact / Product Truth",
    directive: (_char, _role, pain, _persona) =>
      `Open with one source-backed product truth or supplied fact tied to "${pain}". If no hard fact is supplied, use a concrete qualitative product truth from the product USPs. Do not invent numbers, ratings, stock, or guarantees.`,
  },
  {
    key: "question",
    label: "Reader Question",
    directive: (_char, _role, pain, _persona) =>
      `Open with one natural question about "${pain}" or the campaign occasion, then answer it with the hero product and offer by sentence 2. Keep it conversational, not quiz-like.`,
  },
  {
    key: "re_engagement",
    label: "Re-engagement",
    directive: (_char, _role, pain, _persona) =>
      `Open by acknowledging it has been a while — without apologising. Immediately name "${pain}" as the reason for reaching out now, then reveal the product as the answer. Do not use "I hope this email finds you well."`,
  },
  {
    key: "insider_reveal",
    label: "Insider Reveal",
    directive: (_char, _role, pain, persona) =>
      `Open as ${persona} sharing something exclusive before anyone else: "I wanted you to see this first..." Frame the product or offer as an early/private reveal tied to solving "${pain}". Exclusive framing only — not a broadcast.`,
  },
  {
    key: "occasion",
    label: "Occasion / Timing",
    directive: (_char, _role, pain, _persona) =>
      `Open by tying "${pain}" to a specific upcoming moment, season, or occasion named in the campaign theme. The product arrives as the natural solution for that moment. The offer is the confirmation, not the headline.`,
  },
  {
    key: "direct_problem",
    label: "Direct Problem",
    directive: (_char, _role, pain, _persona) =>
      `Open by naming "${pain}" directly in the first sentence — as though you already know {{first_name}} has experienced it. The product is the precise fix, named in sentence 2.`,
  },
  {
    key: "sensory_snapshot",
    label: "Sensory Snapshot",
    directive: (_char, _role, pain, _persona) =>
      `Open with one tactile or visual moment connected to "${pain}" — what the reader feels, sees, adjusts, carries, or notices. Name the hero product by sentence 2; no named character is required.`,
  },
  {
    key: "useful_tip",
    label: "Useful Tip",
    directive: (_char, _role, pain, persona) =>
      `Open with a short practical tip from ${persona} that helps with "${pain}", then make the hero product the easiest way to apply it. The tip must feel useful even before the offer appears.`,
  },
  {
    key: "customer_quote",
    label: "Customer Quote",
    directive: (char, role, pain, _persona) =>
      `Open with a compact quote-style line from ${char} (${role}) about "${pain}". If no supplied review supports a quote, keep it unlabeled voice-of-customer texture and do not add ratings, ages, dates, counts, or verified claims.`,
  },
  {
    key: "occasion_clock",
    label: "Occasion Clock",
    directive: (_char, _role, pain, _persona) =>
      `Open with a specific timing cue — a trip, event, warm afternoon, workday, birthday, weekend, or deadline — that makes "${pain}" relevant now. The product should feel naturally timed, not randomly discounted.`,
  },
];

const EMOTIONAL_ARCS: {
  key: BodyVarietyProfile["emotionalArc"];
  label: string;
  directive: string;
}[] = [
  { key: "pain_relief", label: "Pain → Relief", directive: "Body moves from naming the pain clearly → product as relief → offer as confirmation. End on resolution, not urgency." },
  { key: "curiosity_reveal", label: "Curiosity → Reveal", directive: "Body withholds the full picture early → builds curiosity → reveals the product + offer as the payoff. The offer is the reward for reading." },
  { key: "gratitude_surprise", label: "Gratitude → Surprise", directive: "Body opens with warm personal recognition → surprises with an offer the recipient did not expect. Gratitude is genuine, not a setup." },
  { key: "social_proof_invitation", label: "Social Proof → Invitation", directive: "Body leads with what others (or the named character) experienced → invites {{first_name}} to have the same experience. Proof first, pitch second." },
];

const SEGMENT_BODY_MOVES = [
  {
    label: "Recognition -> useful next step",
    directive: "open by recognizing what this buyer already values, then make the hero product feel like the natural next useful piece",
  },
  {
    label: "Objection -> quiet proof",
    directive: "open from the likely hesitation, then answer it with one supplied USP, review, return, price, or shipping fact",
  },
  {
    label: "Use moment -> product fit",
    directive: "open inside a specific wear/gift/use moment, then show why the product fits that moment better than a generic option",
  },
  {
    label: "Low-risk return",
    directive: "open softly for someone who has not clicked or bought recently, then lower friction before asking for the click",
  },
  {
    label: "Completion bridge",
    directive: "connect what this segment likely bought or browsed before to the missing complementary product in this send",
  },
  {
    label: "Sensory proof",
    directive: "lead with a tactile or visual detail from the product, then let the offer support that believable product reason",
  },
  {
    label: "Reluctant urgency",
    directive: "state the time limit calmly as a constraint, not excitement; the brand sounds helpful, not pushy",
  },
] as const;

const SEGMENT_SOFT_SELL_MODES = [
  "The offer appears after the human reason, as a helpful detail.",
  "Use one calm CTA sentence; avoid hurry/grab/claim language in the body.",
  "Make the urgency reluctant or practical, never countdown energy.",
  "Use a service tone that explains the choice before asking for action.",
  "Let product proof do the selling; the discount should not carry the paragraph.",
] as const;

const BANNER_PATTERN_BANK = [
  "single hero product with one proof chip and a quiet price badge above fold",
  "two-beat visual: lifestyle/use moment first, product detail second",
  "mechanism close-up with compact benefit callout and CTA in the first 200px",
  "review/proof card beside hero product, no fake rating wall",
  "before/after feeling split using product detail rather than body-shaming",
  "occasion-clock banner: timing cue, product resolution, restrained deadline",
  "private-note banner with generous negative space and one handwritten accent",
  "product guide banner with clear hero/support hierarchy, not a collage",
  "split hero/detail layout: product on one side, tactile close-up or proof chip on the other",
  "editorial masthead layout: short headline, small price/reveal deck, product as magazine cover",
  "comparison strip layout: problem state -> product detail -> relief state, no body-shaming",
  "stacked mobile-first layout: headline, product, CTA, trust chip all visible before scroll",
  "three-panel image storyboard: use moment, mechanism detail, offer/CTA resolution",
] as const;

const PRODUCT_GRID_PATTERN_BANK = [
  "hero-plus-support: slot 1 gets the full promise, support products solve adjacent needs",
  "mechanism ladder: every product row uses a different mechanism or material proof",
  "use-case guide: each product owns a distinct wear/gift/use situation",
  "price staircase: hero value first, support products framed as easy add-ons",
  "risk reducer grid: fit, material, shipping/returns, and review proof each appear once",
  "visual-detail grid: each block names one image detail designers can show",
  "occasion bundle: product order tells a planning or outfit/gift sequence",
  "minimalist winner grid: very short headlines, tiny USPs, strong visual note",
  "wide hero row plus 2-up support rows: hero gets a larger overlay, supports stay clipped",
  "alternating overlay grid: each product changes headline placement, badge shape, and image crop",
  "ranked guide grid: #1 hero pick, #2 risk reducer, #3 add-on, #4 gift/outfit/use case",
  "comparison grid: each product owns a different pain -> relief contrast",
  "editorial shopping guide: product blocks read like curated picks, not catalog tiles",
] as const;

const PRODUCT_BLOCK_ROLE_BANK = [
  "main_text is an emotional headline; sub_text carries price/proof; USPs stay clipped",
  "main_text names the mechanism; popup_badge carries the proof/offer",
  "main_text names the use case; USPs split pain and relief",
  "main_text is a review-like fragment; sub_text clarifies product value",
  "main_text is a direct fit/gift problem; CTA resolves it",
  "main_text is tactile/sensory; image_notes prove it visually",
  "main_text is the occasion cue; sub_text gives the practical reason",
  "main_text is the product truth; CTA stays calm and specific",
  "main_text is a ranked pick label; popup_badge gives the reason it earned the slot",
  "main_text is a compact question; sub_text answers with the product benefit",
  "main_text is a tiny guide headline; USPs are the decision filters",
  "main_text is a benefit-first punchline; image_notes specify the crop that proves it",
] as const;

const CTA_STYLE_BANK = [
  "calm directive: action verb + product/object, no urgency shout",
  "specific object CTA: name hero/support product when space allows",
  "soft try-on CTA: low-risk, comfort/gift/use oriented",
  "deadline-aware CTA: time signal without panic",
  "proof-led CTA: acts after the proof beat, not before it",
  "private-note CTA: feels like a recommendation from the persona",
  "guide-style CTA: choose/see/find language, not hard sell",
  "offer-clear CTA: price/value implied but not repeated everywhere",
] as const;

const BODY_PLACEMENT_BANK = [
  "continuous: one compact body before product rows; product grid then closes the promise",
  "interspersed-light: opener before row 1, one bridge after row 1, P.S. after products",
  "hero-story-grid: banner -> body opener -> products -> short proof bridge -> P.S.",
  "tip-first: useful tip/body opener -> hero product row -> supporting products -> P.S.",
  "proof-first: short proof paragraph -> banner/product action -> segment-specific close",
  "occasion-clock: timing opener -> hero product -> support rows -> reluctant deadline P.S.",
] as const;

const COPY_TACTIC_BANK = [
  "concise/direct: short sentences, one clean promise, no filler",
  "personalization: {{first_name}} in subject OR preheader, plus segment-specific motive in body",
  "emoji restraint: 0-1 relevant emoji where the brand allows it, never decorative clutter",
  "value-oriented: exact price, discount, bundle value, or shipping threshold as one clear reason",
  "numbers/lists: one concrete number, rank, or list-style phrase when supplied or clearly non-factual",
  "trendy/plainspoken: contemporary phrasing without forced slang or dated internet voice",
  "wordplay/pun/idiom: one brand-safe turn of phrase that clarifies the benefit",
  "actionable power words: choose, try, see, find, save, wear, gift — not hard-sell commands",
  "light humor: one warm wink only when it fits the brand and product risk",
  "FOMO: real deadline/scarcity/early access only; no fake stock or countdown pressure",
  "question: one self-identifying question that the next sentence answers",
  "educational tip: one practical fit, style, comfort, material, or gifting insight",
  "UGC/emotional story: supplied review or unlabeled qualitative customer texture; no fake metrics",
  "pain/benefit contrast: name one specific friction, then the product relief",
  "data/facts: supplied facts only; otherwise write qualitative product truths",
  "curiosity: withhold one useful detail the body or preheader resolves",
  "praise/honor: make loyal or high-value readers feel recognized, not flattered cheaply",
  "smart-deal instinct: frame savings as a clever, earned choice rather than greed",
] as const;

type CreativeRouteProfile = {
  branch: string;
  route: string;
  sourcePattern: string;
  angleBias: string;
  frameworkBias: string;
  subjectFamily: string;
  bannerPattern: string;
  bodyArchitecture: string;
  productPattern: string;
  visualPattern: string;
  proofTexture: string;
  avoid: string;
};

const CREATIVE_ROUTE_BANK: CreativeRouteProfile[] = [
  {
    branch: "AB",
    route: "Segment Reward / Thank-You Utility",
    sourcePattern: "Excel rows: Subject 21/22 + Body Part 1A + Product 1/3/5",
    angleBias: "recognition, useful next step, and exact offer value",
    frameworkBias: "BAB or Short Sale",
    subjectFamily: "warm personal note or soft curiosity, offer revealed second",
    bannerPattern: "single hero-product reward banner with price/offer badge above fold",
    bodyArchitecture: "recognition opener -> product fit -> offer detail -> soft CTA",
    productPattern: "headline-led 2-up grid; product 1 is the obvious hero, support products solve adjacent pains",
    visualPattern: "clean product-forward hero plus one lifestyle/detail support image",
    proofTexture: "supplied review or price proof only; no invented review counts",
    avoid: "generic gratitude opener, countdown panic, repeated 'thank you + sale' body skeleton",
  },
  {
    branch: "CD",
    route: "Curiosity / Suspended Loop",
    sourcePattern: "Excel rows: Subject CD + PreHeader CD + Banner A alternate",
    angleBias: "unresolved situation, missing item, or private reveal",
    frameworkBias: "Suspended Loop or PAS",
    subjectFamily: "curiosity gap with one concrete product/price clue",
    bannerPattern: "unresolved headline, product close-up, and a small reluctant-deadline badge",
    bodyArchitecture: "open loop -> tactile/product reveal -> proof/risk reducer -> click to resolve",
    productPattern: "hero pair or duo-first grid; support products act as answers to the open loop",
    visualPattern: "cropped detail, arrow/handwritten cue, or product transition/GIF note",
    proofTexture: "material/feature proof first, offer second",
    avoid: "solving the loop before the CTA, cheerful generic promo tone",
  },
  {
    branch: "EF",
    route: "Mechanism / Product Truth",
    sourcePattern: "Excel rows: product-image overlay notes + mechanism popouts",
    angleBias: "what the product does differently",
    frameworkBias: "Mechanism or Proof Ladder",
    subjectFamily: "specific mechanism or sensory comparison with price anchor",
    bannerPattern: "mechanism visual: stretch/cooling/closure/personalization detail with arrows or close crop",
    bodyArchitecture: "source-backed product truth -> pain relief -> price/offer -> CTA",
    productPattern: "every product row gets a different mechanism headline and tiny USP pair",
    visualPattern: "detail image, fabric/closure/engraving/pocket close-up, motion cue",
    proofTexture: "USPs and supplied reviews; no generic bestseller/rating claims",
    avoid: "catalog feature paragraphs, repeated 5-star badges without source",
  },
  {
    branch: "GH",
    route: "Occasion / Gift Guide",
    sourcePattern: "Excel rows: Theme + Banner + Products with seasonal designer notes",
    angleBias: "seasonal timing, gift/use occasion, and readiness",
    frameworkBias: "Occasion/Gift or BAB",
    subjectFamily: "occasion cue plus price/proof, not a stack of holidays",
    bannerPattern: "seasonal hero scene with restrained theme elements and clear CTA path",
    bodyArchitecture: "occasion moment -> product recommendation -> practical tip -> deadline",
    productPattern: "guide-like product order; each block has a different recipient/use case",
    visualPattern: "lifestyle scene plus product cutout; theme elements are secondary",
    proofTexture: "occasion-fit benefit language plus supplied product facts",
    avoid: "holiday pileups, decorative-only image guidance, off-brand palette drift",
  },
  {
    branch: "IJ",
    route: "Reactivation / Low-Risk Return",
    sourcePattern: "Excel rows: long-time-no-see body versions and segment variants",
    angleBias: "gentle return reason, risk removal, and a clear first product",
    frameworkBias: "Reactivation or PAS",
    subjectFamily: "restrained comeback note with one concrete reason to reopen",
    bannerPattern: "welcome-back product hero with softer urgency and friction reducer",
    bodyArchitecture: "acknowledge silence -> low-risk reason -> product link -> offer as courtesy",
    productPattern: "hero first, then easiest add-ons; CTAs sound helpful rather than aggressive",
    visualPattern: "simple, calm layout; no crowded collage; clear product and button path",
    proofTexture: "fit/material/shipping/return facts when supplied",
    avoid: "we missed you cliches, guilt pressure, hard 'claim/grab' commands",
  },
  {
    branch: "KL",
    route: "Proof / Review Ladder",
    sourcePattern: "Excel rows: Review + Featured Product proof copy",
    angleBias: "one supplied quote or product fact builds belief before offer",
    frameworkBias: "Proof Ladder or Mechanism",
    subjectFamily: "plainspoken proof question or quote-fragment with offer in preheader",
    bannerPattern: "review/proof chip, hero product, and one outcome line",
    bodyArchitecture: "named/supplied proof -> why it matters -> product fit -> CTA",
    productPattern: "proof badges only when supplied; otherwise use unattributed benefit chips",
    visualPattern: "review card or handwritten proof note near product, not a fake rating wall",
    proofTexture: "strictly supplied review text, price, USP, or qualitative benefit",
    avoid: "invented counts, fake 4.9/5 claims, unsupported '1M sold' badges",
  },
];

export function selectVarietyProfile(campaign: Campaign, nonce = ""): BodyVarietyProfile {
  const seedSource = [
    campaign.brandId,
    campaign.sendDate,
    campaign.theme,
    campaign.offerValue,
    campaign.offerShipping,
    campaign.segments.join("|"),
    nonce,
  ].join("::");
  const seed = hashSeed(seedSource);
  const pickSurface = <T,>(bank: readonly T[], salt: string): T =>
    bank[hashSeed(`${seedSource}:${salt}`) % bank.length];
  const pickSurfaceSet = <T,>(bank: readonly T[], salt: string, count: number): T[] => {
    const picked: T[] = [];
    let offset = 0;
    while (picked.length < Math.min(count, bank.length) && offset < bank.length * 2) {
      const item = bank[hashSeed(`${seedSource}:${salt}:${offset}`) % bank.length];
      if (!picked.includes(item)) picked.push(item);
      offset++;
    }
    return picked;
  };
  const banks = VARIETY_BANKS[campaign.brandId] || VARIETY_BANKS.bra_goddess;
  const levers = CREATIVE_LEVER_BANKS[campaign.brandId] || CREATIVE_LEVER_BANKS.bra_goddess;
  const persona = BRANDS[campaign.brandId]?.persona || "Sandra";

  const lastMechanic = campaign.lastSend?.openerMechanic;
  const availableMechanics = OPENER_MECHANICS.filter((m) => m.key !== lastMechanic);
  const mechanic = availableMechanics[seed % availableMechanics.length];

  const lastArc = campaign.lastSend?.emotionalArc;
  const availableArcs = EMOTIONAL_ARCS.filter((a) => a.key !== lastArc);
  // Block arcs that conflict with the selected route's framework to prevent contradictory
  // prompt layers (e.g. gratitude_surprise opener is in the WEAK_COPY deny-list, so it can't
  // combine with BAB which forces a "before" state that reads as gratitude).
  const routeForA = selectCreativeRoute(campaign, false, nonce);
  const incompatibleArcs: Partial<Record<string, BodyVarietyProfile["emotionalArc"][]>> = {
    "BAB": ["gratitude_surprise"],
    "Short": ["curiosity_reveal"],    // Short Sale needs direct premise, not a withheld reveal
    "Suspended": ["pain_relief"],     // Suspended Loop must withhold; pain_relief resolves too early
  };
  const frameworkKey = routeForA.frameworkBias.split(" ")[0];
  const blockedArcs = incompatibleArcs[frameworkKey] || [];
  const compatibleArcs = availableArcs.filter((a) => !blockedArcs.includes(a.key as BodyVarietyProfile["emotionalArc"]));
  const arc = (compatibleArcs.length ? compatibleArcs : availableArcs)[(seed >> 5) % (compatibleArcs.length || availableArcs.length)];

  const char = banks.characters[(seed >> 3) % banks.characters.length];
  const pain = banks.painPoints[(seed >> 7) % banks.painPoints.length];
  const sensory = banks.sensoryPhrases[(seed >> 11) % banks.sensoryPhrases.length];
  const creativeLens = levers.creativeLenses[(seed >> 13) % levers.creativeLenses.length];
  const proofRole = levers.proofRoles[(seed >> 15) % levers.proofRoles.length];
  const subjectStyle = levers.subjectStyles[(seed >> 17) % levers.subjectStyles.length];
  const visualDirection = levers.visualDirections[(seed >> 19) % levers.visualDirections.length];
  const bannerPattern = pickSurface(BANNER_PATTERN_BANK, "banner-pattern");
  const productGridPattern = pickSurface(PRODUCT_GRID_PATTERN_BANK, "product-grid");
  const productBlockRole = pickSurface(PRODUCT_BLOCK_ROLE_BANK, "product-role");
  const ctaStyle = pickSurface(CTA_STYLE_BANK, "cta-style");
  const bodyPlacement = pickSurface(BODY_PLACEMENT_BANK, "body-placement");
  const copyTactics = pickSurfaceSet(COPY_TACTIC_BANK, "copy-tactics", 5);

  return {
    openerMechanic: mechanic.key,
    openerMechanicLabel: mechanic.label,
    namedCharacter: char.name,
    characterRole: char.role,
    painPoint: pain,
    sensoryPhrase: sensory,
    emotionalArc: arc.key,
    emotionalArcLabel: arc.label,
    creativeLens,
    proofRole,
    subjectStyle,
    visualDirection,
    bannerPattern,
    productGridPattern,
    productBlockRole,
    ctaStyle,
    bodyPlacement,
    copyTactics,
    _openerDirective: mechanic.directive(char.name, char.role, pain, persona),
    _arcDirective: arc.directive,
  } as BodyVarietyProfile & { _openerDirective: string; _arcDirective: string };
}

function selectCreativeRoute(campaign: Campaign, isOptionB: boolean, nonce = ""): CreativeRouteProfile {
  const seed = hashSeed([
    campaign.brandId,
    campaign.sendDate,
    campaign.theme,
    campaign.offerValue,
    campaign.offerShipping,
    campaign.segments.join("|"),
    campaign.lastSend?.angle || "",
    nonce,
  ].join("::"));
  const aIndex = seed % CREATIVE_ROUTE_BANK.length;
  if (!isOptionB) return CREATIVE_ROUTE_BANK[aIndex];
  // Always use an odd offset so B lands on the opposite even/odd parity from A,
  // guaranteeing all 6 routes (including CD, GH, KL at odd indices) are reachable.
  const half = Math.floor(CREATIVE_ROUTE_BANK.length / 2);
  const oddOffset = ((seed % half) * 2) + 1;
  return CREATIVE_ROUTE_BANK[(aIndex + oddOffset) % CREATIVE_ROUTE_BANK.length];
}

function creativeRoutePrompt(campaign: Campaign, isOptionB: boolean, nonce = ""): string {
  const route = selectCreativeRoute(campaign, isOptionB, nonce);
  return `Excel-style production branch for Option ${isOptionB ? "B" : "A"}:
• Branch: ${route.branch}
• Brief route: ${route.route}
• Source pattern to emulate: ${route.sourcePattern}
• Angle bias: ${route.angleBias}
• Preferred framework: ${route.frameworkBias}
• Subject/preheader family: ${route.subjectFamily}
• Banner pattern: ${route.bannerPattern}
• Body architecture: ${route.bodyArchitecture}
• Product-grid pattern: ${route.productPattern}
• Visual pattern: ${route.visualPattern}
• Proof texture: ${route.proofTexture}
• Avoid: ${route.avoid}
Treat the body architecture "${route.bodyArchitecture}" as a suggested arc, not a fixed paragraph order. You may reorder, compress, or extend the stages for freshness as long as the single hook contract stays coherent across subject, banner, body, product blocks, and CTA.
Write creative_direction.branch="${route.branch}", creative_direction.brief_route="${route.route}", and creative_direction.source_pattern="${route.sourcePattern}". Do not repeat a prior skeleton when another natural arc fits the hook better.`;
}

export function creativeSurfaceVarietyPrompt(campaign: Campaign, optionLabel: "A" | "B"): string {
  const variety = campaign.bodyVariety as (BodyVarietyProfile & { _openerDirective?: string; _arcDirective?: string }) | undefined;
  if (!variety) return "";
  return `Option ${optionLabel} variety: opener=${variety.openerMechanicLabel} (${variety._openerDirective || "intentional"}); arc=${variety.emotionalArcLabel} (${variety._arcDirective || "carry through body"}); lens=${variety.creativeLens}; proof=${variety.proofRole}; subject=${variety.subjectStyle}; banner=${variety.bannerPattern || variety.visualDirection}; visual=${variety.visualDirection}; products=${variety.productGridPattern || "distinct overlay roles"}; product_role=${variety.productBlockRole || "headline/proof/badge/USP/CTA split jobs"}; cta=${variety.ctaStyle || "specific calm 2-4 words"}; placement=${variety.bodyPlacement || bodyLayoutLabel(campaign)}; tactics=${(variety.copyTactics || []).join(", ") || "concise/direct plus 2-4 relevant tactics"}; optional_story=${variety.namedCharacter} (${variety.characterRole}); pain/sensory=${variety.painPoint}; ${variety.sensoryPhrase}. Apply across subject, preheader, banner, body, products, P.S.; use as rotation menu, not visible text.`;
}

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
  if (c.bodyLayout === "custom") {
    return `custom drag/drop module flow: ${(c.moduleLayout || []).join(" -> ") || "use supplied preset suggestions"}`;
  }
  return c.bodyLayout === "interspersed"
    ? "interspersed: one opener before product blocks, then at most one bridge/P.S. after"
    : "continuous: one uninterrupted body section before product blocks";
}
function strategyPromptLayer(c: Campaign): string {
  const s = c.strategy;
  if (!s) return "";
  const lines = [
    s.campaignGoal && `Campaign goal: ${s.campaignGoal}`,
    s.keyMessage && `Key message: ${s.keyMessage}`,
    s.storyline && `Storyline progression: ${s.storyline}`,
    s.painPoints && `Pain points to answer: ${s.painPoints}`,
    s.solutions && `Solutions/benefits to present: ${s.solutions}`,
    s.toneKeywords && `Tone/voice cues from source page: ${s.toneKeywords}`,
  ].filter(Boolean);
  if (!lines.length) return "";
  return `${lines.join("\n")}
Use this as strategic context only. If storyline is supplied, make this send feel like the next chapter in the customer journey rather than a standalone reset. Keep the locked playbook, brand voice, hook contract, proof safety, and SendGrid schema higher priority.`;
}
function opsPromptLayer(c: Campaign): string {
  const o = c.ops;
  if (!o) return "";
  const hasUserOpsSignal = [
    o.senderName,
    o.senderEmail,
    o.replyTo,
    o.audienceSource,
    o.segmentRule,
    o.suppressionNotes,
    o.scheduleWindow,
    o.utmPlan,
    o.complianceNotes,
    o.doubleOptIn ? "double-opt-in" : "",
    o.publicArchive ? "public-archive" : "",
    o.trackOpens === false ? "opens-off" : "",
    o.trackClicks === false ? "clicks-off" : "",
    o.consentBasis === "unknown" ? "unknown-consent" : "",
  ].some(Boolean);
  if (!hasUserOpsSignal) return "";
  const tracking = [
    o.trackOpens === false ? "opens off" : "opens on",
    o.trackClicks === false ? "clicks off" : "clicks on",
    o.utmPlan && `UTM: ${o.utmPlan}`,
    o.publicArchive ? "public archive/link enabled" : "",
  ].filter(Boolean).join("; ");
  const lines = [
    `Provider: ${o.provider || "sendgrid"}`,
    (o.senderName || o.senderEmail || o.replyTo) && `Sender: ${[o.senderName, o.senderEmail].filter(Boolean).join(" <")}${o.senderEmail && o.senderName ? ">" : ""}${o.replyTo ? `; reply-to ${o.replyTo}` : ""}`,
    o.audienceSource && `Audience source: ${o.audienceSource}`,
    o.segmentRule && `Segment rule: ${o.segmentRule}`,
    `Consent: ${o.consentBasis || "prior_purchase_or_opt_in"}${o.doubleOptIn ? " + double opt-in" : ""}`,
    o.suppressionNotes && `Suppression hygiene: ${o.suppressionNotes}`,
    o.scheduleWindow && `Schedule window: ${o.scheduleWindow}`,
    tracking && `Tracking/link plan: ${tracking}`,
    o.complianceNotes && `Compliance notes: ${o.complianceNotes}`,
  ].filter(Boolean);
  return `${lines.join("\n")}
Use this for operational QA, link planning, and brief handoff only. Do not add a second footer or unsubscribe block; the renderer handles footer structure. If consent/suppression/tracking context is weak, surface the risk in quality_checks without making the recipient-facing copy legalistic.`;
}
function productCopyStyleLabel(c: Campaign): string {
  const labels: Record<string, string> = {
    headline_winner: "headline_winner: winning template default, short headline does the work, USPs stay tiny",
    benefit_pair: "benefit_pair: two compact pain-to-relief benefit cues",
    proof_badge: "proof_badge: trust badge/review leads, USPs stay minimal",
    urgency_badge: "urgency_badge: supplied scarcity/deadline popup_badge leads, action main_text, price + deadline in sub_text",
    price_prominent: "price_prominent: exact price or discount figure leads in sub_text, popup_badge shows savings signal",
  };
  return labels[c.productCopyStyle || "headline_winner"] || labels["headline_winner"];
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

export function segmentPromptContext(campaign: Campaign): string {
  return campaign.segments
    .map((id) => {
      const g = segGuidance(campaign.brandId, id);
      return `${id}: ${segLabel(campaign.brandId, id)} | ${segMeta(campaign.brandId, id)}${g ? " | " + g : ""}`;
    })
    .join("\n");
}

export function segmentBodyDirectionLines(campaign: Campaign): string {
  const seed = hashSeed([
    campaign.brandId,
    campaign.sendDate,
    campaign.theme,
    campaign.offerValue,
    campaign.offerShipping,
  ].join("::"));
  return campaign.segments
    .map((id, i) => {
      const label = segLabel(campaign.brandId, id);
      const meta = segMeta(campaign.brandId, id);
      const guidance = segGuidance(campaign.brandId, id) || meta || "Use the segment label as the buyer motivation.";
      const move = SEGMENT_BODY_MOVES[(seed + i * 2) % SEGMENT_BODY_MOVES.length];
      const softSell = SEGMENT_SOFT_SELL_MODES[(seed + i) % SEGMENT_SOFT_SELL_MODES.length];
      return `• body.${segJsonKey(id)} (${id} ${label}${meta ? ` — ${meta}` : ""}): audience motive: ${guidance} Entry point: ${move.label} — ${move.directive} Do NOT start with the same first 8 words as any other segment body in this option — the opener must name a situation specific to "${guidance || label}", not a generic pain. Soft-sell mode: ${softSell}`;
    })
    .join("\n");
}
function wordCount(s: string): number {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}
// Word-boundary lexeme match for the spam/weak/optout/proof banks. Substring matching produced
// false positives — e.g. the bank word "winner" matched the schema field value "headline_winner"
// on every brief, and "off" matched "offer". Anchor with \b only where the term edge is a word
// char so trailing-space phrases ("meet the ") still match.
function containsLexeme(haystack: string, term: string): boolean {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pre = /^\w/.test(term) ? "\\b" : "";
  const post = /\w$/.test(term) ? "\\b" : "";
  return new RegExp(`${pre}${esc}${post}`, "i").test(haystack);
}
function norm(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9{}]+/g, " ").replace(/\s+/g, " ").trim();
}
function stripCopyMarkup(s: string): string {
  return String(s || "")
    .replace(/\[([^\]]+)\]\((?:slug:[^)]+|home)\)/gi, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}
function firstParagraph(s: string): string {
  return stripCopyMarkup(s).split(/\n{2,}/).map((p) => p.trim()).find(Boolean) || "";
}
function openingStart(s: string): string {
  return norm(firstParagraph(s)).split(" ").filter(Boolean).slice(0, 8).join(" ");
}
function ngramSet(s: string, size = 5): Set<string> {
  const words = norm(stripCopyMarkup(s)).split(" ").filter((w) => w.length > 2 && !THEME_STOPWORDS.has(w));
  const grams = new Set<string>();
  for (let i = 0; i <= words.length - size; i++) {
    grams.add(words.slice(i, i + size).join(" "));
  }
  return grams;
}
function phraseOverlap(a: string, b: string, size = 5): number {
  const left = ngramSet(a, size);
  const right = ngramSet(b, size);
  const denom = Math.min(left.size, right.size);
  if (!denom) return 0;
  let shared = 0;
  left.forEach((gram) => {
    if (right.has(gram)) shared++;
  });
  return shared / denom;
}
function hardSellHits(s: string): string[] {
  const hits: string[] = [];
  BODY_HARD_SELL_PATTERNS.forEach(({ label, pattern }) => {
    pattern.lastIndex = 0;
    if (pattern.test(s)) hits.push(label);
  });
  return hits;
}
function similarity(a: string, b: string): number {
  const l = new Set(norm(a).split(" ").filter(Boolean));
  const r = new Set(norm(b).split(" ").filter(Boolean));
  if (!l.size || !r.size) return 0;
  const shared = [...l].filter((w) => r.has(w)).length;
  return shared / Math.max(l.size, r.size);
}
function significantWords(s: string): string[] {
  return norm(String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2")).split(" ").filter((w) => w.length >= 4 && !THEME_STOPWORDS.has(w));
}
function containsSignificantReference(text: string, reference?: string): boolean {
  if (!reference) return true;
  const target = norm(text);
  const compactTarget = target.replace(/\s+/g, "");
  const words = significantWords(reference);
  const compactReference = norm(reference).replace(/\s+/g, "");
  const checks = compactReference.length >= 4 ? [...words, compactReference] : words;
  return !checks.length || checks.some((w) => target.includes(w) || compactTarget.includes(w));
}
function findProductByReference(products: Product[], reference?: string): Product | undefined {
  const ref = String(reference || "").trim();
  if (!ref) return undefined;
  return products.find((product) =>
    containsSignificantReference(ref, product.name) ||
    containsSignificantReference(product.name, ref) ||
    (product.slug && norm(ref).includes(norm(product.slug)))
  );
}
function leadProductForBrief(brief: GenBrief, products: Product[]): Product | undefined {
  const hc = brief.creative_direction?.hook_contract;
  return findProductByReference(products, hc?.hero_product) ||
    findProductByReference(products, brief.products?.[0]?.name) ||
    products[0];
}
function sourceProductForBlock(block: GenProductBlock, products: Product[], fallbackIndex: number): Product | undefined {
  return findProductByReference(products, block.name) || products[fallbackIndex];
}
function blockReferencesProduct(block: GenProductBlock | undefined, product: Product): boolean {
  if (!block) return false;
  const surface = [
    block.name,
    block.template_style,
    block.main_text,
    block.sub_text,
    block.popup_badge,
    block.cta,
    ...(block.usps || []),
    block.main_image,
    block.sub_image,
    block.alt_text,
    block.image_notes,
  ].filter(Boolean).join(" ");
  return containsSignificantReference(surface, product.name) ||
    containsSignificantReference(product.name, block.name) ||
    Boolean(product.slug && norm(surface).includes(norm(product.slug)));
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
function hasOfferSignal(text: string, campaign: Campaign): boolean {
  const promo = promoLine(campaign);
  if (/^No promo/i.test(promo)) return true;
  const raw = String(text || "");
  const target = norm(text);
  const numbers = promo.match(/\d+(?:\.\d+)?/g) || [];
  if (numbers.some((n) => target.includes(n))) return true;
  // Promo glyph / percent signals.
  if (/💲|\d+\s*%/.test(raw)) return true;
  // Word-boundary keyword fallback — avoid matching 'off' inside offer/effort/comfortable/coffee.
  return /free shipping|\bship(?:ping)?\b|\bsav(?:e|ing|ings)\b|o\.f\.f|\bo\s+f\s+f\b|\boff\b/i.test(raw);
}
function hasAttributedReview(text: string): boolean {
  return /["“”']/.test(text) && /(?:—|-)\s*[A-Z][a-z]+(?:\s+[A-Z]\.?)?/.test(text);
}
function needsSourceBackedProof(text: string): boolean {
  return /\b(?:verified(?:\s+(?:buyer|customer|review|purchase))?|rated|rating|stars?|reviews?|customers?|sold|ordered|clinically|doctor(?:-|\s)?recommended|medically|medical(?:ly)?|guaranteed|guarantee|age(?:d)?\s+\d{2}|\d{2}\s*(?:years?|yrs?)\s*old|only\s+\d+\s+left|left\s+in\s+stock|ships?\s+(?:in|within)|shipping\s+(?:today|within|in)|delivered\s+(?:in|within)|20\d{2})\b/i.test(text);
}
function matchesSuppliedReview(text: string, source?: string): boolean {
  if (!text.trim()) return true;
  const requiresSource = needsSourceBackedProof(text);
  if (!hasAttributedReview(text) && !requiresSource) return true;
  if (!source) return !requiresSource;
  const t = norm(text);
  const s = norm(source);
  if (!s) return !requiresSource;
  // The email may quote one sentence of a longer supplied review (with its real attribution),
  // or restate it — accept containment in either direction after stripping the attribution tail.
  const tNoAttr = norm(text.replace(/\s*[—-]\s*[A-Za-z.][A-Za-z. ]*$/, ""));
  return t.includes(s) || s.includes(t) || (!!tNoAttr && s.includes(tNoAttr)) || !requiresSource;
}
function matchesAnySuppliedReview(text: string, products: Product[]): boolean {
  if (!String(text || "").trim() || !hasAttributedReview(text)) return true;
  return products.some((p) => matchesSuppliedReview(text, p.review));
}
function looksLikeSchemaPlaceholder(text?: string): boolean {
  return SCHEMA_PLACEHOLDER_PATTERN.test(String(text || ""));
}
function homeLinkCount(text: string): number {
  return String(text || "").match(MARKDOWN_HOME_LINK)?.length || 0;
}
function truncateForPrompt(text: string, max = 1200): string {
  const clean = String(text || "").trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + "\n[truncated]" : clean;
}
export function renderPromptLayers(layers: { title: string; body?: string }[]): string {
  return layers
    .map((layer) => ({ ...layer, body: layer.body?.trim() }))
    .filter((layer) => layer.body)
    .map((layer) => `## ${layer.title}\n${layer.body}`)
    .join("\n\n");
}

const CORE_PROMPT_LAYER = `Return JSON only. Build order: evidence → segment → hook contract → banner/body/products → subject/preheader → QA.
1 send = 1 promise. All copy surfaces (subject, preheader, hero, body, grid, CTA, P.S.) share ONE thread: [hero product by name] + [specific proof or price] + [concrete reader situation]. Each surface references ≥2 of those 3 thread elements. A thread anchored only by brand name or discount % is NOT a shared thread.
Proof policy — supplied only: ratings, counts (star scores, audience sizes, sold volumes), ages, dates, medical/health outcomes, study/research claims, stock quantities, shipping facts, prices, urgency, and guarantees must come from supplied product/campaign data or be marked "needs verification" — NEVER invented. Artificial review texture is permitted ONLY as: (a) unlabeled qualitative sensory language ("felt like wearing air"), or (b) a named-character anecdote with first name + relationship + specific outcome but NO invented age, date, rating, count, or verification label. PROHIBITED: anonymous star ratings (4.9/5, 5 stars), promotion-tied counts ("X women grabbed this week"), mass-audience claims ("over 1M women", "thousands"), study/research fabrications ("studies show", "research finds"), clinical claims not in product data, "award-winning", "best-selling", "verified purchase", "as seen on".
Prohibit: fake Re/Fwd, "click here", "learn more", guilt opener, "meet your new favorite", "don't let X go to waste", generic gratitude, grammar errors, unsupported medical/age claims, body/age shaming.
💲 instead of $; brand off-symbol rules; {{first_name}} in subj XOR prehdr only.`;

const CREATIVE_PROMPT_LAYER = `Guardrails are constraints, not a script. Let the model write fresh language.
A and B are STRUCTURALLY DIFFERENT emails — not synonym swaps. They must differ in ALL of: angle, framework, opener mechanic, body opening sentence, banner headline family, product-grid layout, product-block overlay layout, proof role, visual composition, CTA style, copy-tactic mix, and subject option lenses. Changing only wording, tone, or surface phrasing while keeping the same paragraph/product/banner structure IS NOT a valid A/B contrast. If Option A opens with a named micro-story, Option B must not. If Option A uses PAS, Option B must use a different framework. State the structural differences in creative_direction BEFORE writing any copy.
Rotate opener mechanics: story, fact, question, sensory snapshot, useful tip, customer quote, occasion clock, occasion, re-engagement, insider reveal, or direct problem. Avoid repeating the last-send structure.
Style rotation menu: concise/direct is always required; then choose a few relevant ingredients from personalization, emoji restraint, value, numbers/list framing, trendy/plainspoken language, wordplay/puns/idioms, actionable power words, light humor, FOMO, questions, educational content, UGC/emotional story, pain/benefit contrast, supplied data/facts, curiosity, praise/honor, and smart-deal instinct. Do not force every ingredient into one email.
Segment versions keep one hook but adapt motivation: loyal = recognition/first access; at-risk = proof/friction removal; new = quick education/next product; lapsed = low-risk return reason; high-return-risk = fit/material clarity.
Multi-segment body copy must not be cloned paragraph skeletons. Change the first sentence, proof/risk reducer, product bridge, and final line for every segment.`;

const TEMPLATE_CORPUS_PROMPT_LAYER = `WinEmailTemps/FailedEmailTemps corpus memory (58 EMLs — 29 winners, 29 failures, all 4 brands):
- Winners and failures share similar structure (~8 images, ~200 visible words). Quality = ONE promise paid off across every surface; length alone does not win.
- Winner hero images: 650px wide vertical or animated GIF; product/model clearly visible; single price/discount prominent; one short CTA or trust strip; clean brand palette. Occasion or thank-you decor supports product — never replaces it.
- Winner product tiles: square crop, 1-2 pain→relief callouts clipped short, price and CTA baked into the image. Decision aids, not miniature essays.
- Winner proof pattern: named character (first name + relationship) + one specific comfort/use outcome — no invented age, date, rating, count, or verification label.
- Winner urgency: "midnight tonight", "24 hours", or a specific time anchor. Passive phrases ("ending soon", "limited time", "while stocks last", "if you've been meaning to") appeared only in failures.
- Winner CTA language: first-person claim framing ("Claim X% O.F.F →", "Get Your X% SAVING →") outperforms imperative ("Shop Now", "Buy Now").
- Winner P.S.: always present; introduces net-new information (named product + color, supplied stock count, shipping threshold, mystery item, or styling tip) — never restates the body offer.
- Failure traps: broad seasonal/gratitude takeover, feature-list checkmark opener, invented counts tied to the promotion ("X women grabbed this week"), anonymous star ratings (4.9/5, "5 stars for comfort"), clinical/study claims not from product data, promotion-specific mass counts ("2,300 women this week", "150,000 women"), dark/heavy hero hiding the product, vague deadline language, brand-as-announcer copy ("BrandName offers…", "BrandName is proud to present").`;

const LEGACY_PROMPT_ALIGNMENT_BY_BRAND: Record<string, string> = {
  gents_lux: `Legacy prompt alignment for GentsLux:
- Use the old high-performing Jordan shape in compact form: senior/practical-buyer empathy, concise directness, useful fit/cooling advice, restrained humor, and smart-deal framing.
- If supplied, weave in storewide/no-code/no-exclusions/no-limit offer terms, free-shipping threshold, visible price/% and deadline. If not supplied, do not invent them.
- Product blocks need a desire headline (<6w), 2 clipped USP chips (<4w), one compact review/proof texture, one 2-word trust/urgency booster, and a visual mechanism note.
- Subject/preheader/banner/body must share hero product + proof/price + reader situation; rotate devices across value, numbers, question, FOMO, wordplay, action, education, UGC/story, pain→relief, praise, and curiosity.`,
  lux_fitting: `Legacy prompt alignment for LuxFitting:
- Use the old high-performing Adele shape in compact form: senior/practical-buyer empathy, sensory price hook, seasonal styling/comfort tips, warm light humor, and savvy-deal framing.
- If supplied, weave in storewide/no-code/no-exclusions/no-limit offer terms, free-shipping threshold, visible price/% and deadline. If not supplied, do not invent them.
- Product blocks need a desire headline (<6w), 2 clipped pain→relief USP chips (<4w), one compact review/proof texture, one 2-word trust/urgency booster, and a visual styling/mechanism note.
- Subject/preheader/banner/body must share hero product + proof/price + reader situation; rotate devices across personalization, emoji restraint, value, numbers, question, FOMO, wordplay, action, education, UGC/story, pain→relief, praise, and curiosity.`,
};

const COMPONENT_PROMPT_LAYER = `SUBJ: 42–58c (≤60 hard cap); 1 offer signal; {{first_name}} in subj XOR prehdr; 3 alt subjects with distinct devices.
PREHDR: 60–90c; new beat (proof/deadline/price/tension). Gmail ¶1: hero product + 1 offer/proof beat in first 150c.
BODY: 120–150w/seg; personal-note first; persona-signed; md product link by ¶2; 2–4 bold/accent/link beats; P.S. 10–15w; no hard-sell commands. Also emit body_options per segment: primary route + alternate route with different opener/proof/placement, not paraphrases.
OFFER: price/discount once in body (hero reveal) + once in P.S. Support products: 1 differentiating line each — no per-product price or "Free Shipping" repeat.
BANNER: main_text_1=tension/hook; main_text_2=proof/mech; main_text_3=resolution/offer. image_guidance: 4–6 bullets. Actual product/model visible, one large price/discount, CTA/trust strip, clean brand palette; occasion decor supports product, never replaces it. Emit 2 banner.options with different headline family + layout/composition (split hero/detail, editorial masthead, comparison strip, stacked mobile hero, storyboard, or guide layout).
PRODUCTS: 4–6 (even preferred; SF default 4). main_text ≤5w; CTA 2–4w plain text; USPs ≤5w; sub_text=price/proof/deadline. Copy bakes into images. Product tile should be square with full product crop, visible price, baked-in CTA, and 1–2 clipped mechanism/pain→relief callouts; no miniature essays. Each product block must have a different overlay role/use case/mechanism and a visibly different layout note (badge placement, crop, hierarchy, overlay position, ranked guide, comparison, or detail callout); template_style should name that role, not repeat the campaign default.
${PRODUCT_IMAGE_BRIEF_RULES}`;

const SENDGRID_HTML_PROMPT_LAYER = `SendGrid/WinEmailTemps April 2026 fit:
- Structure for renderer: hidden preheader, optional logo, linked hero image, concise caption text, short body modules, linked product-image modules, P.S., footer.
- Use renderer-safe tokens only in generated copy: ==accent==, **bold**, [Product](slug:slug), [home text](home). Do not output raw HTML in JSON copy fields.
- Product modules are image-only links in HTML; product block text/CTA is brief copy to bake inside images, not captions under images.
- Footer is handled by renderer: thanks line, product/purchase placeholders, opt-out-below sentence, reply/contact-list reminder, homepage, 1851 Central Park Loop address, Privacy Policy, Exchanges & Returns. Do not write a second footer in body/P.S.
- HTML expectations for QA: clicktracking off on links, descriptive alt text, max-width responsive images, role=module/table layout compatibility, light-background SendGrid design.`;

const PERFORMANCE_PROMPT_LAYER = `Pages are generally converting; assume email intent is the leak unless supplied page/product data says otherwise.
Access/Delivered drop -> improve lead/body/CTA path. PO/View drop -> improve product order, price clarity, fit proof, page-product match. Optout/spam risk -> softer urgency and narrower list.
Required proven trios must occupy the top product blocks, but internal lead order may rotate by campaign theme, segment motive, and A/B route: BG DaisyBra/PosyBra/ZoeShape; GL JettJeans/IcyShorts/AirFlexion; LF StretchActive/IcyShorts/SoftyGrace; SF Pouchic/TimelessMark.`;

const EXCEL_BRIEF_REFERENCE_LAYER = `Email Content.xlsx production-brief shape:
- Keep the output organized like the real brief rows: segment Subject/PreHeader, Theme, Banner, Body Part/Body, Products, Featured Product 1/3/5, and designer notes.
- Variation in those files comes from branch-level changes: AB/CD subject families, banner layout references, product order/overlay copy, body architecture, and proof texture. Do not treat A/B as synonym swaps.
- Product rows should read like image-overlay instructions: product image, main text, sub text/review/proof, popout/badge, CTA, and visual note. Keep HTML output structure unchanged; this is copy/image-brief guidance, not raw HTML.
- When proof such as 5-star counts, units sold, stock, shipping, ages, dates, verification labels, medical outcomes, or ratings is not supplied by the selected products/pages, write qualitative proof instead or mark "needs verification" in brief notes, never as final copy.`;

const BRAND_BRIEF_PATTERN_LAYER: Record<string, string> = {
  bra_goddess: `BraGoddess Email Content.xlsx pattern memory:
- Real sheets often split by segment-number subject rows, "Banner (2 version)", Body Part 1A, Product 1/3/5, and product-image overlays.
- Variety should come from fit problem, comfort proof, visual before/after or support detail, and product order. Avoid reusing a generic Sandra thank-you sale body.
- Designer notes should specify one mature smiling model, clear bra/support visibility, popout/review placement only when supplied, and readable rose/crimson hierarchy.`,
  gents_lux: `GentsLux Email Content.xlsx pattern memory:
- Real sheets lean on product motion, GIF/detail references, and mechanism popouts such as stretch, cooling, waistband, pocket, or durability.
- Body copy should sound restrained and practical. Curiosity is useful, but proof should be a product mechanism or supplied review, not hype.
- Product blocks should use different mechanism headlines per item; USPs stay clipped, masculine, and visual enough to bake into images.`,
  lux_fitting: `LuxFitting Email Content.xlsx pattern memory:
- Real sheets often use Body Part 1 with base plus segment variants, then product rows with popup, review, main text, visual detail, and styling cues.
- The best body route is sensory + price + outfit/use moment, not broad empowerment. Each segment should change the occasion, objection, or styling tip.
- Banner/design notes should keep movement/silhouette readable, avoid crowded countdown stacks, and keep pink-red palette clean.`,
  santa_fare: `SantaFare Email Content.xlsx pattern memory:
- Real sheets use AB/CD-style branches, handwritten or gift-note details, proof badges, and exact product/recipient visual directions.
- Copy should feel like Mary discovered a thoughtful gift for a specific person. Suspended loop and personalization should beat discount-first urgency.
- Default to 4 focused products; product rows should name recipient/use case, material/personalization detail, and restrained deep-scarlet visual direction.`,
};

function brandBriefPatternLayer(brandId: string): string {
  return BRAND_BRIEF_PATTERN_LAYER[brandId] || "";
}

export function brandPlaybookRuleBlock(brandId: string): string {
  return BRAND_PLAYBOOK_RULES[brandId] || "";
}

export function legacyPromptAlignmentLayer(brandId: string): string {
  return LEGACY_PROMPT_ALIGNMENT_BY_BRAND[brandId] || "";
}

export function templateCorpusPromptLayer(): string {
  return TEMPLATE_CORPUS_PROMPT_LAYER;
}

export function requiredProductInstruction(brandId: string): string {
  const required = requiredCatalogProducts(brandId);
  if (!required.length) return "";
  return `Required top products in every email: ${required.map((p) => `${p.name} (slug:${p.slug})`).join(", ")}. They must occupy the first ${required.length} product blocks. Their internal order is flexible: choose the lead product by campaign theme, segment motive, and A/B route; explain the ordering in product roles/image notes.`;
}

export function bodyHomepageLinkInstruction(brandId: string): string {
  const brand = BRANDS[brandId];
  const policy = bodyHomepageLinkPolicy(brandId);
  if (policy === "forbidden") {
    return `${brand?.name || "This brand"} body copy must NOT include homepage markdown links like [text](home). Use product links only; the renderer handles footer/homepage links.`;
  }
  if (policy === "required") {
    return `${brand?.name || "This brand"} body copy must include exactly one natural homepage markdown link [short text](home) in every selected segment body and body option. Keep product markdown links too.`;
  }
  return "Homepage markdown links are optional in body copy; footer homepage links are handled by the renderer.";
}

export function campaignThemeInstruction(campaign: Campaign): string {
  const theme = campaign.theme?.trim();
  if (!theme) return "";
  return `Campaign theme anchor: "${theme}". Treat this as the send's reason-now, not metadata. Echo it concretely in creative_direction.hook_contract, at least one subject/preheader option per segment, the banner, each segment body opener, product-image notes, and P.S. If the theme is broad, translate it into a specific use moment tied to the send date, segment motive, or product lead.`;
}

// ---- prompt builders ----
/** The clause appended to Option B's system prompt forcing a different angle + framework than A. */
export function contrastInstruction(optionADirection: GenCreativeDirection): string {
  const route = optionADirection.brief_route || optionADirection.branch || optionADirection.differentiator || "?";
  const concept = optionADirection.concept;
  const avoid = {
    angle: optionADirection.angle || "unknown",
    framework: optionADirection.framework || "unknown",
    route,
    opener_mechanic: concept?.openerMechanic || "unknown",
    creative_device: concept?.creativeDevice || optionADirection.source_pattern || "unknown",
    format: concept?.format || optionADirection.branch || "unknown",
    proof_path: concept?.proofPath || "unknown",
    lead_product: optionADirection.hook_contract?.hero_product || "unknown",
  };
  return `\nCRITICAL CONTRAST REQUIREMENT:
Option A fingerprint:
${JSON.stringify(avoid)}

Option B must choose a visibly different route on these axes before writing copy:
1. angle
2. framework
3. opener_mechanic
4. creative_device / subject family
5. banner layout pattern
6. product-grid emphasis
7. body architecture
8. proof path
9. lead product or lead-product use case

State the new B choices in creative_direction first. Reusing Option A's route, skeleton, or opening move is invalid even if the words differ.`;
}

export function buildSystemPrompt(
  campaign: Campaign,
  products: Product[],
  isOptionB: boolean,
  optionADirection?: GenCreativeDirection,
  nonce = "",
  concept?: EmailConcept
): string {
  const brand = BRANDS[campaign.brandId];
  const productContext = products
    .map((p, i) => {
      const usps = (p.usps || []).filter(Boolean);
      return `${i + 1}${i === 0 ? " HERO" : ""}. ${p.name} | slug:${p.slug} | ${p.url || "no URL"} | 💲${p.price} | USP: ${usps.join("; ") || "none"} | review: ${p.review || "none"}`;
    })
    .join("\n");
  const segContext = segmentPromptContext(campaign);

  const [dev0 = "open-loop", dev1 = "pattern-interrupt", dev2 = "playful-conceit"] = brand.subjectDevices;
  const subjectSchema = campaign.segments
    .map((id) => `"${segJsonKey(id)}":{"subject":"","preheader":"","style":"","model_hint":"","shared_thread":"","options":[{"style":"${dev0}","model_hint":"${dev0}","subject":"","preheader":"","shared_thread":""},{"style":"${dev1}","model_hint":"${dev1}","subject":"","preheader":"","shared_thread":""},{"style":"${dev2}","model_hint":"${dev2}","subject":"","preheader":"","shared_thread":""}]}`)
    .join(",\n    ");
  const bodySchema = campaign.segments
    .map((id) => `"${segJsonKey(id)}":""`)
    .join(",\n    ");
  const bodyOptionsSchema = campaign.segments
    .map((id) => `"${segJsonKey(id)}":[{"label":"Primary ${isOptionB ? "B" : "A"} route","model_hint":"","body":"","ps":"","placement_note":""},{"label":"Alternate route","model_hint":"","body":"","ps":"","placement_note":""}]`)
    .join(",\n    ");
  const bodySchemaHint = campaign.bodyLayout === "interspersed"
    ? "120-150 words; opener before products, optional bridge after; use ==accent==, **bold**, [Product](slug:slug)"
    : campaign.bodyLayout === "custom"
      ? "120-150 words; 1-3 modular paragraphs; use ==accent==, **bold**, [Product](slug:slug)"
      : "120-150 words; 3-5 short paragraphs; use ==accent==, **bold**, [Product](slug:slug)";
  const productSchema = products
    .map(
      (_, i) => `{"slot":${i + 1},"name":"","template_style":"${campaign.productCopyStyle || "headline_winner"}","main_text":"","sub_text":"","popup_badge":"","usps":["",""],"review":"","cta":"","main_image":"","sub_image":"","alt_text":"","image_notes":""}`
    )
    .join(",\n    ");

  const contrast = isOptionB && optionADirection ? contrastInstruction(optionADirection) : "";
  const selectedTechniquePlan = concept?.techniquePlan || selectTechniquePlan(campaign, {
    isOptionB,
    nonce,
    branch: selectCreativeRoute(campaign, isOptionB, nonce).branch,
  });
  const winning = campaign.winningContent?.trim()
    ? `Mirror structure/pacing only; write new copy:\n${truncateForPrompt(campaign.winningContent, 900)}`
    : "";
  const perfContext = campaign.customPerfContext?.trim()
    ? truncateForPrompt(campaign.customPerfContext, 1200)
    : intelligencePromptBlock(campaign.brandId);
  const outputSchema = `{
  "creative_direction": {
    "angle": "<${PLAYBOOK_ANGLES.join("|")}>",
    "framework": "<${PLAYBOOK_FRAMEWORKS.join("|")}>",
    "branch": "",
    "brief_route": "",
    "source_pattern": "",
    "hook_contract": { "segment_insight": "", "emotion": "", "hero_product": "", "proof_or_price": "", "urgency": "", "avoid_rule": "" },
    "flow": "<one sentence: banner to CTA journey>",
    "differentiator": "<what makes this option distinct>"
  },
  "subject_lines": {
    ${subjectSchema}
  },
  "theme": "<visual brief for the designer>",
  "banner": {
    "logo_stars":"","main_text_1":"","main_text_2":"","main_text_3":"",
    "sub_text_1":"","sub_text_2":"","sub_text_3":"","image_guidance":"- bullet\n- bullet\n- bullet\n- bullet",
    "review_quote":"","review_texts":[""],"main_image":"","sub_image":"","trust_booster":"","emergency":"","cta":"",
    "options":[
      {"label":"${isOptionB ? "B1" : "A1"}","model_hint":"","main_text_1":"","main_text_2":"","main_text_3":"","sub_text_1":"","sub_text_2":"","sub_text_3":"","cta":"","review_texts":[""],"main_image":"","sub_image":"","trust_booster":"","emergency":"","image_guidance":"- bullet\n- bullet\n- bullet\n- bullet"},
      {"label":"${isOptionB ? "B2" : "A2"}","model_hint":"","main_text_1":"","main_text_2":"","main_text_3":"","sub_text_1":"","sub_text_2":"","sub_text_3":"","cta":"","review_texts":[""],"main_image":"","sub_image":"","trust_booster":"","emergency":"","image_guidance":"- bullet\n- bullet\n- bullet\n- bullet"}
    ]
  },
  "body": {
    "base": "${bodySchemaHint}",
    ${bodySchema}
  },
  "body_options": {
    ${bodyOptionsSchema}
  },
  "ps": "",
  "products": [
    ${productSchema}
  ],
  "quality_checks": {
    "click_reason":"specific|weak|missing","hook_alignment":"aligned|weak|missing","proof_safety":"supplied|needs_review|invented_risk","spam_risk":"low|medium|high","optout_risk":"low|medium|high","photo_watchout":"clear|needs_review|missing",
    "first_200px":"cta_visible|cta_late|missing","inline_link_plan":"ready|weak|missing","layout_risk":"low|medium|high","playbook_dos_donts":"pass|review|fail","brand_rule_alignment":"aligned|review|off_brand",
    "accessibility_layout":"ready|review|missing","opener_mechanic":"story|fact|question|sensory_snapshot|useful_tip|customer_quote|occasion_clock|direct_problem|occasion|re_engagement|insider_reveal","hook_coherence":"fresh|reused|unclear","cta_assessment":"clear|weak|missing"
  }
}`;

  const assembled = renderPromptLayers([
    {
      title: "Prompt Registry",
      body: `Prompt id/version: ${PROMPT_REGISTRY_VERSION}. Keep output compatible with this JSON schema; do not mention this id in recipient-facing copy.`,
    },
    {
      title: "Role",
      body: `You are an expert ecommerce email copywriter for ${brand.name}. Persona: ${brand.persona}. Voice: ${brand.voice}. Layout: ${brand.layout}.`,
    },
    {
      title: "Campaign Inputs",
      body: `Products:\n${productContext}\n\nSegments:\n${segContext}\n\nBody layout: ${bodyLayoutLabel(campaign)}\nProduct copy template: ${productCopyStyleLabel(campaign)}`,
    },
    { title: "Core Rules", body: CORE_PROMPT_LAYER },
    { title: "Creative Variation", body: CREATIVE_PROMPT_LAYER },
    { title: "Template Corpus Memory", body: templateCorpusPromptLayer() },
    { title: "Legacy Prompt Alignment", body: legacyPromptAlignmentLayer(campaign.brandId) },
    { title: "Surface Variety Contract", body: creativeSurfaceVarietyPrompt(campaign, isOptionB ? "B" : "A") },
    { title: "Production Brief Pattern", body: creativeRoutePrompt(campaign, isOptionB, nonce) },
    { title: "Chosen Concept", body: concept ? conceptPrompt(concept, isOptionB ? "B" : "A") : "" },
    { title: "Technique Plan", body: techniquePlanPrompt(selectedTechniquePlan) },
    { title: "Component Rules", body: COMPONENT_PROMPT_LAYER },
    { title: "Campaign Theme Anchor", body: campaignThemeInstruction(campaign) },
    { title: "Required Products", body: requiredProductInstruction(campaign.brandId) },
    { title: "Body Homepage Link Policy", body: bodyHomepageLinkInstruction(campaign.brandId) },
    ...(campaign.bodyFocus !== "grid" ? [{
      title: "Body Focus",
      body: `HERO MODE: body prose centres on ONE lead product story.
The lead product earns the full narrative — micro-story, proof beat, emotional arc. It may be any required/selected product when the theme and segment justify it.
Each support product earns AT MOST one cumulative sentence in the body — not a per-product paragraph.
Recommended collector line: "Plus: [Product A](slug:a), [Product B](slug:b), and more — starting at 💲X."
Do NOT write individual offer lines or USP lists for support products in the body prose.
The product image grid still renders all slots (that is a layout concern, not a copy concern).
This rule applies to every segment in body[segKey].`,
    }] : [{
      title: "Body Focus",
      body: `GRID MODE: body prose may address each featured product individually with one differentiating line each. Still observe the offer-mention cap from Component Rules.`,
    }]),
    { title: "SendGrid HTML Fit", body: SENDGRID_HTML_PROMPT_LAYER },
    { title: "Email Content XLSX Reference", body: EXCEL_BRIEF_REFERENCE_LAYER },
    { title: "Brand Brief Pattern Memory", body: brandBriefPatternLayer(campaign.brandId) },
    { title: "Brand Rules", body: BRAND_PLAYBOOK_RULES[campaign.brandId] || "" },
    { title: "Playbook Rules", body: promptRuleBlock(campaign.brandId, "prompt") },
    { title: "Subject Devices", body: subjectDeviceLayer(brand) },
    { title: "Performance Lens", body: `${PERFORMANCE_PROMPT_LAYER}\n${perfContext}` },
    { title: "Adaptive Performance Feedback", body: performanceFeedbackPromptBlock(campaign.performanceHistory, campaign.brandId) },
    { title: "Option Contrast", body: contrast },
    { title: "Winning Reference", body: winning },
    {
      title: "Output Contract",
      body: `Return ONLY valid JSON. No prose, no markdown fence. Escape quotes inside strings.\n${outputSchema}`,
    },
  ]);
  logPromptBudget(`buildSystemPrompt(${campaign.brandId}, optB=${isOptionB})`, assembled, PROMPT_BUDGET_SYSTEM);
  return assembled;
}

function recentSendHistoryPrompt(campaign: Campaign): string {
  const rows = (campaign.recentSendHistory || []).slice(0, 8);
  if (!rows.length) return "";
  return `\nRECENT SEND FATIGUE MEMORY — do not repeat these unless the user explicitly asks:
${rows.map((row, index) => {
  const parts = [
    `segment ${row.segment}`,
    row.sendDate && `date ${row.sendDate}`,
    row.angle && `angle ${row.angle}`,
    row.framework && `framework ${row.framework}`,
    row.openerMechanic && `opener ${row.openerMechanic}`,
    row.emotionalArc && `arc ${row.emotionalArc}`,
    row.visualPattern && `visual ${row.visualPattern}`,
    row.heroSlug && `hero ${row.heroSlug}`,
  ].filter(Boolean);
  return `${index + 1}. ${parts.join(" | ")}`;
}).join("\n")}
Choose a fresh angle/framework/opener/visual route for this send and call out the rotation in quality_checks.hook_coherence.`;
}

export function buildUserPrompt(campaign: Campaign, isB: boolean): string {
  const ls = campaign.lastSend;
  const lastSend =
    ls && (ls.hero || ls.angle || ls.ctr || ls.note)
      ? `\nLast send: CTR ${ls.ctr || "?"}%, hero "${ls.hero || "?"}", angle ${ls.angle || "?"}.${ls.note ? " Note: " + ls.note : ""} Rotate away from this.`
      : "";
  const recentAvoid =
    campaign.recentProductSlugs?.length
      ? `\nProduct rotation — these slugs appeared in the last 3 sends; avoid featuring them as hero or lead unless no better alternative exists: ${campaign.recentProductSlugs.join(", ")}.`
      : "";
  const fatigueAvoid = recentSendHistoryPrompt(campaign);

  const variety = campaign.bodyVariety as (BodyVarietyProfile & { _openerDirective?: string; _arcDirective?: string }) | undefined;
  const effectiveVariety = variety;

  const varietyMandate = effectiveVariety
    ? `\nCREATIVE VARIETY DIRECTION — required constraints, not a script:
• Opener mechanic to use: ${effectiveVariety.openerMechanicLabel} — ${effectiveVariety._openerDirective || ""}
• Creative lens: ${effectiveVariety.creativeLens}
• Proof role: ${effectiveVariety.proofRole}
• Subject style to favor: ${effectiveVariety.subjectStyle}
• Visual direction to favor: ${effectiveVariety.visualDirection}
• Banner pattern: ${effectiveVariety.bannerPattern}
• Product grid pattern: ${effectiveVariety.productGridPattern}
• Product block role: ${effectiveVariety.productBlockRole}
• CTA style: ${effectiveVariety.ctaStyle}
• Body placement: ${effectiveVariety.bodyPlacement}
• Copy tactic rotation: ${(effectiveVariety.copyTactics || []).join("; ")}
• Optional story seed: ${effectiveVariety.namedCharacter} (${effectiveVariety.characterRole}). Use this named person only if it helps the chosen opener; do not force a character into fact/question/direct-problem openers.
• Pain territory: "${effectiveVariety.painPoint}" — use this pain scenario or a fresh close variant in the first 1-2 sentences.
• Sensory territory: "${effectiveVariety.sensoryPhrase}" — include this phrase or a fresh equivalent.
• Emotional arc: ${effectiveVariety.emotionalArcLabel} — ${effectiveVariety._arcDirective || ""}
Write naturally in the brand persona, avoid repeating sentence skeletons from prior campaigns, and record the opener mechanic label in quality_checks.opener_mechanic. Banner, product blocks, subject options, body copy, P.S., and CTA must all reflect the surface contract.`
    : "";
  const openerFallback = !effectiveVariety
    ? `\nOPENER MECHANIC — required: choose one from: story (named person discovers a solution), fact (one product truth), question (answered by sentence 2), sensory_snapshot (tactile/visual moment), useful_tip, customer_quote, occasion_clock, direct_problem, occasion, re_engagement, or insider_reveal. Do NOT open with a gratitude statement, bullet list, "Meet X", or "Introducing X". Record your choice in quality_checks.opener_mechanic.`
    : "";
  const segmentBodyMandate = campaign.segments.length > 1
    ? `\nSEGMENT BODY DIFFERENTIATION — required:
Keep one Hook Contract across all segments, but body text must be meaningfully different by segment. Do not rewrite the same paragraph skeleton with different nouns.
${segmentBodyDirectionLines(campaign)}
For every segment body, change all four: first sentence entry point, proof/risk reducer, product bridge sentence, and final sign-off/CTA sentence.
Reader-position rule: each segment must anchor the reader at a DIFFERENT position in their brand relationship. Loyal/high-freq segments: reader is in a use moment — open there. At-risk/lapsed segments: reader who has not engaged — open with the gap before the product. New/browse segments: reader who is uncertain — open with a product truth before social proof. Never let two segments begin from the same reader position.`
    : "";
  const winToneMandate = `\nWINEMAILTEMPS TONE CALIBRATION — required:
Recent winning emails read like a short personal note: one concrete moment or pain, then product fit, then offer as a helpful detail. The body should not sound like a sale alert.
Use a calm, useful recommendation register: human reason first, product proof second, offer/urgency as a practical detail. Avoid hard-sell command stacks, alarm language, and recycled example phrasing.
Mention price/offer/urgency clearly, but limit the body to one sales command at most. Let the product proof and segment motive do most of the selling.`;

  return renderPromptLayers([
    {
      title: "Generation Request",
      body: `Generate Option ${isB ? "B" : "A"} as a complete email brief. Lead with creative_direction, then fill every JSON section.`,
    },
    {
      title: "Campaign",
      body: `Brand: ${BRANDS[campaign.brandId].name}
Send date: ${campaign.sendDate}
Theme: ${campaign.theme}
Hook input: ${campaign.hookContract?.trim() || "Construct one from segment, hero product, offer, urgency, proof, avoid rules."}
Promo: ${promoLine(campaign)}
Body layout: ${bodyLayoutLabel(campaign)}
Product template: ${productCopyStyleLabel(campaign)}
Recipient token: ${campaign.recipientName}
${requiredProductInstruction(campaign.brandId)}
${campaignThemeInstruction(campaign)}
${bodyHomepageLinkInstruction(campaign.brandId)}${lastSend}${recentAvoid}${fatigueAvoid}`,
    },
    { title: "Strategy Intake", body: strategyPromptLayer(campaign) },
    { title: "Campaign Operations", body: opsPromptLayer(campaign) },
    { title: "Creative Variety", body: varietyMandate || openerFallback },
    { title: "Segment Body Differentiation", body: segmentBodyMandate },
    { title: "Tone Calibration", body: winToneMandate },
  ]);
}

// ---- validation ----
function addFlag(b: GenBrief, type: Flag["type"], msg: string) {
  (b._flags ||= []).push({ type, msg });
}

function normalizePrimarySubjectSelections(brief: GenBrief) {
  Object.values(brief.subject_lines || {}).forEach((line) => {
    const firstComplete = (line.options || []).find((option) => option.subject?.trim() && option.preheader?.trim());
    if (!line.subject?.trim() && firstComplete?.subject) line.subject = firstComplete.subject;
    if (!line.preheader?.trim() && firstComplete?.preheader) line.preheader = firstComplete.preheader;
    if (!line.style && firstComplete?.style) line.style = firstComplete.style;
    if (!line.model_hint && firstComplete?.model_hint) line.model_hint = firstComplete.model_hint;
    if (!line.shared_thread && firstComplete?.shared_thread) line.shared_thread = firstComplete.shared_thread;
  });
}

// Single source of truth for flag severity, co-located with the messages addFlag emits so the
// classifier can't silently desync from the wording. Consumed by the tiered score below, by the
// quality-repair gating in lib/anthropic.ts (which imports isHighImpactFlag), and by the UI.
export type FlagTier = "serious" | "structural" | "cosmetic";
// SERIOUS: compliance / proof safety / a broken-promise the marketer must not send.
const SERIOUS_FLAG =
  /spam word|opt-out risk|invented proof|possibly invented|brand avoid pattern|review looks invented|missing persona|hook contract missing|body too short|body over \d+|missing product-name markdown|homepage link|required product|visible price\/offer|sounds too salesy|hard-sell command|hero banner should|weak\/generic copy|non-playbook (?:angle|framework)|a\/b (?:angles|frameworks) are the same|a\/b brief routes|a\/b creative_direction must|a\/b opener mechanics are the same|missing required field|missing subject\/preheader|missing selected (?:subject|preheader)|subject\/preheader missing offer signal|body contains \{\{first_name\}\}|hook contract hero_product .* does not match|body\.base is empty|body repeats price/i;
// STRUCTURAL: weakens the test or coherence but is still sendable.
const STRUCTURAL_FLAG =
  /too similar|same body structure|repeat the same angle|shared thread|shares too much structure|copy is too similar|layout direction is too similar|creative direction text is too similar|creative direction missing (?:production branch|brief route|source pattern)|schema placeholder|stacking hooks|needs 3\+ subject|distinct style\/model lenses|needs 2 editable|body options|banner options|product block roles|body opener should name|miss campaign theme|opens with a bullet|product introduction|below 3-paragraph|above 5-paragraph|interspersed body should|preheader adds no new beat|reactivation guilt\/apology opener|ops .*(?:missing|unknown)|utm plan missing/i;

export function flagTier(msg: string): FlagTier {
  if (SERIOUS_FLAG.test(msg)) return "serious";
  if (STRUCTURAL_FLAG.test(msg)) return "structural";
  return "cosmetic";
}
/** True for serious/structural warnings — used to gate the targeted quality-repair pass. */
export function isHighImpactFlag(msg: string): boolean {
  return flagTier(msg) !== "cosmetic";
}

// Repair is narrower than scoring. These are safety/compliance/deliverability issues where a
// model rewrite helps; stylistic nudges (paragraph rhythm, P.S. length, banner beats, enums) stay
// advisory so the repair pass does not average every creative route back to one template.
const COMPLIANCE_REPAIR_FLAG =
  /spam word|opt-out risk|possibly invented proof|invented proof|review looks invented|subject over hard cap|subject above target|subject may be too short|preheader length|repeats \{\{first_name\}\}|missing \{\{first_name\}\}|missing selected subject|missing selected preheader|missing subject\/preheader|subject\/preheader missing offer signal|body contains \{\{first_name\}\}|homepage link|required product|visible price\/offer|hard-sell command|sounds too salesy|brand avoid pattern|merge-tag|unbalanced|missing required field|schema placeholder|sender email missing|consent basis unknown|utm plan missing|body repeats price/i;

export function isComplianceRepairFlag(msg: string): boolean {
  return COMPLIANCE_REPAIR_FLAG.test(msg);
}

const COMPLIANCE_VALIDATION_FLAG =
  /spam word|opt-out risk|possibly invented proof|invented proof|review looks invented|subject over hard cap|subject above target|subject may be too short|preheader length|repeats \{\{first_name\}\}|missing \{\{first_name\}\}|missing selected subject|missing selected preheader|missing subject\/preheader|subject\/preheader missing offer signal|body contains \{\{first_name\}\}|body over \d+|homepage link|required product|visible price\/offer|hard-sell command|sounds too salesy|brand avoid pattern|merge-tag|unbalanced|missing required field|schema placeholder|sender email missing|audience source missing|consent basis unknown|utm plan missing|missing product-name markdown|body\.base is empty/i;

export function isComplianceValidationFlag(flag: Flag): boolean {
  return flag.type === "error" || COMPLIANCE_VALIDATION_FLAG.test(flag.msg);
}

export function splitValidationFlags(flags: Flag[] = []): { compliance: Flag[]; advisory: Flag[] } {
  const compliance: Flag[] = [];
  const advisory: Flag[] = [];
  for (const flag of flags) {
    if (isComplianceValidationFlag(flag)) compliance.push(flag);
    else advisory.push(flag);
  }
  return { compliance, advisory };
}

const FLAG_TIER_WEIGHT: Record<FlagTier, number> = { serious: 10, structural: 5, cosmetic: 2 };
const COSMETIC_WEIGHT_CAP = 16; // all cosmetic warnings together cost at most this much

/**
 * Tiered 0-100 score. The old flat `warnings*6` drove a perfectly sendable brief to 0 on ~17
 * cosmetic warnings (length nudges, optional banner fields), making PASS/REVIEW/FIX meaningless.
 * Now each error costs 25, each warning is weighted by tier, and the cosmetic pile is capped so
 * polish noise can't masquerade as a failing brief.
 */
export function scoreBrief(flags: Flag[] = []): number {
  let penalty = 0;
  let cosmetic = 0;
  for (const f of flags) {
    if (f.type === "error") { penalty += 25; continue; }
    const tier = flagTier(f.msg);
    if (tier === "cosmetic") cosmetic += FLAG_TIER_WEIGHT.cosmetic;
    else penalty += FLAG_TIER_WEIGHT[tier];
  }
  penalty += Math.min(cosmetic, COSMETIC_WEIGHT_CAP);
  return Math.max(0, 100 - penalty);
}

export function scoreCreative(flags: Flag[] = []): number {
  const structural = flags.filter((f) => f.type === "warn" && flagTier(f.msg) === "structural").length;
  const cosmetic = flags.filter((f) => f.type === "warn" && flagTier(f.msg) === "cosmetic").length;
  return Math.max(0, 100 - structural * 6 - Math.min(24, cosmetic * 2));
}

function repeatedNgrams(text: string, size = 4): number {
  const grams = new Map<string, number>();
  const words = norm(stripCopyMarkup(text)).split(" ").filter((w) => w.length > 2 && !THEME_STOPWORDS.has(w));
  for (let i = 0; i <= words.length - size; i++) {
    const gram = words.slice(i, i + size).join(" ");
    grams.set(gram, (grams.get(gram) || 0) + 1);
  }
  return [...grams.values()].filter((count) => count > 1).length;
}

export function computeCreativityScore(brief: GenBrief): number {
  const bodyText = briefBodyText(brief);
  if (!bodyText.trim()) return 0;
  let score = 100;
  const openers = Object.entries(brief.body || {})
    .filter(([key]) => key !== "base")
    .map(([, value]) => firstParagraph(String(value || "")));
  const openerSurface = openers.join("\n").toLowerCase();
  const bodyNorm = norm(bodyText);
  const bodyWords = wordCount(bodyText);
  const salesCommands = hardSellHits(bodyText);

  if (/^(you have|you've|if you|when you|this is|meet |introducing )/i.test(openers[0] || "")) score -= 12;
  if (/^i hope this email finds you well/i.test(openers[0] || "")) score -= 16;
  if (bodyWords < 90) score -= 16;
  if (bodyWords < 60) score -= 8;
  if (salesCommands.length >= 2) score -= 12;
  if (/\b(?:congratulations|winner|once in a lifetime|claim yours|hurry|buy now)\b/i.test(bodyText)) score -= 10;
  const hasHumanMoment = /\b(neighbor|friend|customer|wife|husband|dad|mom|mary|sandra|jordan|adele|told me|mentioned|noticed|called|wrote|said)\b/i.test(bodyText);
  const hasProductMoment = /\b(front snap|wire[- ]?free|strap|band|cup|fabric|waistband|pocket|stretch|cooling|drape|leather|engraving|monogram|closure|fit|price|deadline|shipping|guarantee|review|texture|silhouette|support)\b/i.test(bodyText);
  if (!hasHumanMoment && !hasProductMoment) score -= 10;
  if (!/\b(kitchen|drive|desk|walk|morning|afternoon|closet|drawer|weekend|birthday|gift|summer|trip|work|dinner|mirror|checkout|errand|office|travel)\b/i.test(bodyText) && !hasProductMoment) score -= 8;
  if (repeatedNgrams(bodyText, 4) > 6) score -= 12;
  const mechanismRepeats = [...bodyNorm.matchAll(/\b(?:quick dry|ice silk|front snap|wire free|stretch|cooling|free shipping|o f f|saving)\b/g)].length;
  if (mechanismRepeats > 8) score -= 12;
  const productLineCount = bodyText.split(/\n+/).filter((line) => /\s[—-]\s.*(?:💲|\$\d|free shipping|o\.f\.f|saving)/i.test(line)).length;
  if (productLineCount >= 3) score -= 14;
  if (new Set(openers.map(openingStart).filter(Boolean)).size < Math.min(2, openers.length)) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function bodyWordBand(brandId: string): { min: number; max: number } {
  if (brandId === "gents_lux") return { min: 80, max: 130 };
  if (brandId === "santa_fare") return { min: 100, max: 130 };
  return { min: 120, max: 150 };
}

function copyForTechniqueScan(brief: GenBrief): string {
  return stripCopyMarkup(JSON.stringify({
    cd: brief.creative_direction,
    subject_lines: brief.subject_lines,
    banner: brief.banner,
    body: brief.body,
    ps: brief.ps,
    products: brief.products,
  }));
}

function bodySegmentTexts(brief: GenBrief): string[] {
  return Object.entries(brief.body || {})
    .filter(([key]) => key !== "base")
    .map(([, value]) => String(value || ""))
    .filter((value) => value.trim());
}

function countEmoji(text: string): number {
  return (text.replace(/💲/g, "").match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
}

function countLeadSignals(text: string, campaign: Campaign, plan?: TechniquePlan): Record<string, boolean> {
  const surface = norm(text);
  const bodyStart = norm(firstParagraph(text));
  return {
    occasion: /\b(christmas|valentine|halloween|labor day|black friday|new year|mother'?s day|earth day|graduation|birthday|friday|sunday|holiday|season)\b/i.test(text) ||
      (!!plan?.occasionName && surface.includes(norm(plan.occasionName))),
    ugc_story: /\b([A-Z][a-z]+)\s+(?:told|mentioned|wrote|called|asked|said|noticed|emailed|replied)\b/.test(text) ||
      /\bmy (?:dad|neighbor|friend|sister|coworker|customer|wife|husband)\b/i.test(text),
    curiosity_gap: /\?/.test(text) || /\b(did you know|ever notice|wonder why|what if|sound familiar|the reason|one detail|secret|mystery)\b/i.test(text),
    fact_data: /\b\d+(?:\.\d+)?\s*(?:%|hours?|days?|seconds?|minutes?|years?|stars?|reviews?|wears?|orders?)\b/i.test(text) ||
      /\b(did you know|study|average|most men|most women|rule of thumb)\b/i.test(text),
    pain_relief: /\b(digging|pinch|slip|gap|ride up|stiff|restrict|heavy|cling|sweat|chafe|friction|pain|pressure|adjust|uncomfortable|problem)\b/i.test(text),
    honor_vip: /\b(private|reserved|set aside|early access|just for you|solid customer|vip|thank you|reward|exclusive|chosen)\b/i.test(text),
    fomo_scarcity: /\b(ends|midnight|last|almost gone|only|24 hours|48 hours|two days|weekend|while open|before it closes|limited)\b/i.test(text),
    direct_offer: hasOfferSignal(bodyStart || text.slice(0, 220), campaign),
  };
}

function surfacedLead(plan: TechniquePlan | undefined, text: string, campaign: Campaign): boolean {
  if (!plan?.lead) return false;
  const signals = countLeadSignals(text, campaign, plan);
  return !!signals[plan.lead];
}

function hasValuePayoffText(text: string): boolean {
  return /#(?:tip|quicktip|hack|stylehack|caretip|fittip|comforttip|gifttip)|did you know|fun fact|quick fact|one simple rule|rule of thumb|tip:/i.test(text);
}

function hasPersonaSignoff(brief: GenBrief, campaign: Campaign): boolean {
  const personaName = BRAND_PERSONA_NAMES[campaign.brandId];
  if (!personaName) return true;
  const signOffSurface = `${briefBodyText(brief)} ${brief.ps || ""}`.toLowerCase();
  return new RegExp(`\\b${personaName.toLowerCase()}\\b`).test(signOffSurface);
}

function hasQuestionOrCuriosity(brief: GenBrief): boolean {
  const allBodyText = Object.values(brief.body || {}).map((v) => stripCopyMarkup(String(v || ""))).join(" ");
  return /\?/.test(allBodyText) || /\b(did you know|ever notice|wonder why|imagine if|sound familiar|ever feel|ever tried|remember when|what if)\b/i.test(allBodyText);
}

function hasPowerCtas(brief: GenBrief): boolean {
  const ctas = [
    brief.banner?.cta,
    ...(brief.products || []).map((p) => p.cta),
  ].filter((v): v is string => !!v?.trim());
  if (!ctas.length) return false;
  return ctas.every((cta) => /\b(shop|try|grab|see|get|find|choose|wear|start|open|save|build|upgrade|claim)\b/i.test(cta) && !WEAK_CTA.includes(cta.toLowerCase()));
}

function offerCapOk(brief: GenBrief): boolean {
  return bodySegmentTexts(brief).every((text) => {
    const priceMentions = (text.match(/💲\d|\$\d|\b\d+\s*%\s*(?:off|o\.f\.f|saving)/gi) || []).length;
    const shipMentions = (text.match(/free\s+(?:shipping|ship)/gi) || []).length;
    return priceMentions <= MAX_BODY_OFFER_MENTIONS && shipMentions <= 1;
  });
}

export function computeTechniqueCoverage(brief: GenBrief, campaign: Campaign): TechniqueCoverage {
  const plan = brief.creative_direction?.concept?.techniquePlan;
  const rawSurface = JSON.stringify(brief);
  const scan = copyForTechniqueScan(brief);
  const bodyTexts = bodySegmentTexts(brief);
  const band = bodyWordBand(campaign.brandId);
  const segmentKeys = campaign.segments.map(segJsonKey);
  const subjectLines = brief.subject_lines || {};
  const selectedSubjectPairs = segmentKeys
    .map((key) => `${subjectLines[key]?.subject || ""} ${subjectLines[key]?.preheader || ""}`)
    .filter((value) => value.trim());
  const allBodiesWithinBand = bodyTexts.length > 0 && bodyTexts.every((text) => {
    const words = wordCount(text);
    return words >= band.min && words <= band.max;
  });
  const leadSignals = countLeadSignals(scan, campaign, plan);
  const allowedSupportSignals = new Set([plan?.lead, ...(plan?.seasoning || []), "direct_offer", "fomo_scarcity"].filter(Boolean));
  const competingLeadSignals = Object.entries(leadSignals)
    .filter(([id, active]) => active && !allowedSupportSignals.has(id))
    .map(([id]) => id);
  const checks: TechniqueCoverage["checks"] = {
    plan_present: !!plan?.lead,
    lead_surfaced: surfacedLead(plan, scan, campaign),
    single_lead: competingLeadSignals.length <= 4,
    personalization: selectedSubjectPairs.length > 0 && selectedSubjectPairs.every((pair) => /{{\s*first_name\s*}}/i.test(pair)),
    persona_signoff: hasPersonaSignoff(brief, campaign),
    question_or_curiosity: hasQuestionOrCuriosity(brief),
    brand_concision: allBodiesWithinBand,
    value_payoff: campaign.brandId === "gents_lux" ? hasValuePayoffText(`${briefBodyText(brief)} ${brief.ps || ""}`) : true,
    power_cta: hasPowerCtas(brief),
    offer_cap: offerCapOk(brief),
    formatting: (rawSurface.match(ACCENT_MARKER)?.length || 0) + (rawSurface.match(BOLD_MARKER)?.length || 0) >= 2 && MARKDOWN_ANY_LINK.test(rawSurface),
    low_sales_pressure: bodyTexts.every((text) => hardSellHits(text).length <= 1),
    emoji_budget: countEmoji(`${briefBodyText(brief)} ${brief.ps || ""}`) <= (BRANDS[campaign.brandId]?.emojiPolicy === "yes" ? 1 : 0),
  };
  const notes: string[] = [];
  if (!checks.plan_present) notes.push("No technique plan on creative_direction.concept");
  if (plan?.lead && !checks.lead_surfaced) notes.push(`Lead technique not clearly surfaced: ${getTechnique(plan.lead)?.rule || plan.lead}`);
  if (!checks.single_lead) notes.push(`Copy may stack competing lead hooks (${competingLeadSignals.slice(0, 3).join(", ")}); keep one dominant entry point`);
  if (!checks.brand_concision) notes.push(`Body word count should sit in the ${band.min}-${band.max} band for this brand`);
  if (!checks.value_payoff) notes.push("GentsLux needs a useful #Tip/#QuickTip/Dig-you-know payoff");
  if (!checks.low_sales_pressure) notes.push("Body has multiple hard-sell commands; keep offer pressure calm");
  if (!checks.emoji_budget) notes.push("Emoji count exceeds the brand budget");

  const weights: Record<keyof TechniqueCoverage["checks"], number> = {
    plan_present: 8,
    lead_surfaced: 14,
    single_lead: 8,
    personalization: 8,
    persona_signoff: 8,
    question_or_curiosity: 8,
    brand_concision: 10,
    value_payoff: 8,
    power_cta: 7,
    offer_cap: 8,
    formatting: 6,
    low_sales_pressure: 5,
    emoji_budget: 2,
  };
  const score = (Object.keys(weights) as (keyof TechniqueCoverage["checks"])[])
    .reduce((total, key) => total + (checks[key] ? weights[key] : 0), 0);
  return { score, lead: plan?.lead || "missing", checks, notes };
}

/** Tier counts for UI ("serious vs polish") — lets REVIEW distinguish real risk from cosmetics. */
export function flagTierCounts(flags: Flag[] = []): { serious: number; structural: number; cosmetic: number; errors: number } {
  const counts = { serious: 0, structural: 0, cosmetic: 0, errors: 0 };
  for (const f of flags) {
    if (f.type === "error") counts.errors++;
    else counts[flagTier(f.msg)]++;
  }
  return counts;
}

function validateProductData(brief: GenBrief, products: Product[]): void {
  analyzeProductPriceOutliers(products).forEach((warning) => {
    addFlag(brief, "warn", `Product ${warning.index + 1} ${warning.message}`);
  });
}

const MAX_BODY_OFFER_MENTIONS = 2;
const MAX_BODY_DISCOUNT_MENTIONS = 3;

export function validateBrief(brief: GenBrief, campaign: Campaign, products: Product[] = []): GenBrief {
  const incomingAdvisory = Array.isArray(brief._advisory) ? brief._advisory : [];
  brief._flags = [];
  normalizePrimarySubjectSelections(brief);
  const brand = BRANDS[campaign.brandId];
  const subjectMax = brand?.subjectMax || 58;
  const subjectMin = brand?.subjectMin || 42;
  const bodyBand = bodyWordBand(campaign.brandId);
  const homepagePolicy = bodyHomepageLinkPolicy(campaign.brandId);
  const requiredCatalog = requiredCatalogProducts(campaign.brandId);

  (["creative_direction", "subject_lines", "theme", "banner", "body", "products", "quality_checks"] as const).forEach(
    (f) => {
      if (!brief[f]) addFlag(brief, "error", "Missing required field: " + f);
    }
  );
  const missingRequired = missingRequiredProducts(campaign.brandId, products.map((product) => product.slug));
  if (missingRequired.length) {
    addFlag(
      brief,
      "error",
      `${brand?.name || "Brand"} required product missing from campaign selection: ${missingRequired.map((product) => product.name).join(", ")}`
    );
  }
  if (campaign.ops) {
    if (!campaign.ops.senderEmail?.trim()) addFlag(brief, "warn", "Ops sender email missing — confirm verified sender before ESP sync");
    if (!campaign.ops.audienceSource?.trim()) addFlag(brief, "warn", "Ops audience source missing — document list/import/source before send");
    if (!campaign.ops.segmentRule?.trim()) addFlag(brief, "warn", "Ops segment rule missing — confirm who receives each variant");
    if (campaign.ops.consentBasis === "unknown") addFlag(brief, "warn", "Ops consent basis unknown — confirm opt-in and suppression before send");
    if (campaign.ops.trackClicks !== false && !campaign.ops.utmPlan?.trim()) addFlag(brief, "warn", "UTM plan missing while click tracking is enabled");
  }

  const sl = brief.subject_lines || {};
  campaign.segments.forEach((id) => {
    if (!sl[segJsonKey(id)]) addFlag(brief, "error", "Missing subject/preheader for segment " + id);
  });
  Object.entries(sl).forEach(([seg, v]) => {
    const s = v.subject || "", p = v.preheader || "";
    const opts = Array.isArray(v.options) ? v.options : [];
    if (!s.trim()) addFlag(brief, "warn", `${seg} missing selected subject`);
    if (!p.trim()) addFlag(brief, "warn", `${seg} missing selected preheader`);
    if (s.length > 60) addFlag(brief, "warn", `${seg} subject over hard cap (${s.length} > 60)`);
    else if (s.length > subjectMax) addFlag(brief, "warn", `${seg} subject above target (${s.length} > ${subjectMax})`);
    if (s && s.length < subjectMin) addFlag(brief, "warn", `${seg} subject may be too short (${s.length} < ${subjectMin})`);
    if (p && (p.length < 60 || p.length > 90)) addFlag(brief, "warn", `${seg} preheader length ${p.length} (target 60-90)`);
    if (/{{\s*first_name\s*}}/i.test(s) && /{{\s*first_name\s*}}/i.test(p)) addFlag(brief, "warn", `${seg} repeats {{first_name}} in subject + preheader`);
    if (!/{{\s*first_name\s*}}/i.test(s + " " + p)) addFlag(brief, "warn", `${seg} missing {{first_name}} in subject/preheader pair`);
    if (s && !hasOfferSignal(s + " " + (p || ""), campaign)) {
      addFlag(brief, "warn", `${seg} subject/preheader missing offer signal — include price, %, o.f.f, 💲, or shipping cue`);
    }
    if (s && p) {
      const subjNorm = norm(s);
      const preheaderNewWords = norm(p).split(/\s+/).filter((w) => w.length > 3 && !subjNorm.includes(w));
      if (preheaderNewWords.length < 2) addFlag(brief, "warn", `${seg} preheader adds no new beat — add offer details, social proof, or deadline not in the subject`);
    }
    if (similarity(s, p) > 0.55) addFlag(brief, "warn", `${seg} subject and preheader too similar`);
    if (opts.length < 3) addFlag(brief, "warn", `${seg} needs 3+ subject/preheader options`);
    opts.forEach((o, i) => {
      if (!o.style) addFlag(brief, "warn", `${seg} option ${i + 1} missing style`);
      if (!o.model_hint) addFlag(brief, "warn", `${seg} option ${i + 1} missing model_hint`);
      if (!o.shared_thread) addFlag(brief, "warn", `${seg} option ${i + 1} missing shared_thread`);
      if (!o.subject?.trim()) addFlag(brief, "warn", `${seg} option ${i + 1} missing subject`);
      if (!o.preheader?.trim()) addFlag(brief, "warn", `${seg} option ${i + 1} missing preheader`);
      if ((o.subject || "").length > 60) addFlag(brief, "warn", `${seg} option ${i + 1} subject over hard cap`);
      if (o.subject && o.subject.length < subjectMin) addFlag(brief, "warn", `${seg} option ${i + 1} subject too short (${o.subject.length} < ${subjectMin})`);
      if (o.preheader && (o.preheader.length < 60 || o.preheader.length > 90)) {
        addFlag(brief, "warn", `${seg} option ${i + 1} preheader length ${o.preheader.length} (target 60-90)`);
      }
      if (o.subject && !hasOfferSignal((o.subject || "") + " " + (o.preheader || ""), campaign)) {
        addFlag(brief, "warn", `${seg} option ${i + 1} subject/preheader missing offer signal`);
      }
      if (o.subject && !/{{\s*first_name\s*}}/i.test((o.subject || "") + " " + (o.preheader || ""))) {
        addFlag(brief, "warn", `${seg} option ${i + 1} missing {{first_name}}`);
      }
      if (o.subject && similarity(o.subject, s) > 0.78) {
        addFlag(brief, "warn", `${seg} option ${i + 1} too similar to the primary subject`);
      }
    });
    const optionStyles = opts.map((o) => norm(o.style || o.model_hint || "")).filter(Boolean);
    if (optionStyles.length >= 3 && new Set(optionStyles).size < 3) {
      addFlag(brief, "warn", `${seg} subject options need distinct style/model lenses`);
    }
    for (let i = 0; i < opts.length; i++) {
      for (let j = i + 1; j < opts.length; j++) {
        if (similarity(opts[i].subject || "", opts[j].subject || "") > 0.78) {
          addFlag(brief, "warn", `${seg} subject options ${i + 1}/${j + 1} are too similar`);
        }
        if (similarity(opts[i].preheader || "", opts[j].preheader || "") > 0.78) {
          addFlag(brief, "warn", `${seg} preheader options ${i + 1}/${j + 1} are too similar`);
        }
      }
    }
    const hits = HOOK_STACK.filter((w) => (s + " " + p).toLowerCase().includes(w));
    if (hits.length >= 4) addFlag(brief, "warn", `${seg} stacking hooks: ${hits.join(", ")}`);
  });

  const body = brief.body || {};
  if (!body.base || !String(body.base).trim()) addFlag(brief, "error", "body.base is empty — shared body foundation is required");
  campaign.segments.forEach((id) => {
    if (!body[segJsonKey(id)]) addFlag(brief, "warn", "Missing body variant for segment " + id);
  });
  Object.entries(body).forEach(([key, value]) => {
    if (looksLikeSchemaPlaceholder(value)) addFlag(brief, "warn", `${key} still contains schema placeholder text`);
  });

  const richText = JSON.stringify({ ba: brief.banner, bo: brief.body, p: brief.products });
  const accentMarks = richText.match(ACCENT_MARKER)?.length || 0;
  const boldMarks = richText.match(BOLD_MARKER)?.length || 0;
  const themeWords = significantWords(campaign.theme);
  const themeSurface = JSON.stringify({ cd: brief.creative_direction, s: brief.subject_lines, ba: brief.banner, bo: brief.body, p: brief.products, ps: brief.ps });
  const themeSurfaceHits = themeWords.filter((w) => norm(themeSurface).includes(w)).length;
  if (themeWords.length && themeSurfaceHits === 0) {
    addFlag(brief, "warn", `Brief may miss campaign theme anchor "${campaign.theme}" across hook, subject, banner, body, products, and P.S.`);
  }
  const full = JSON.stringify({ s: brief.subject_lines, t: brief.theme, ba: brief.banner, bo: brief.body, p: brief.products }).toLowerCase();
  SPAM_WORDS.forEach((w) => containsLexeme(full, w) && addFlag(brief, "warn", `Spam word: "${w}"`));
  WEAK_COPY.forEach((w) => containsLexeme(full, w) && addFlag(brief, "warn", `Weak/generic copy: "${w}"`));
  AI_SLOP_PHRASES.forEach((w) => containsLexeme(full, w) && addFlag(brief, "warn", `AI-tell phrase — rewrite: "${w}"`));
  OPTOUT_RISK.forEach((w) => containsLexeme(full, w) && addFlag(brief, "warn", `Opt-out risk wording: "${w}"`));
  UNSUPPLIED_PROOF.forEach((w) => containsLexeme(full, w) && addFlag(brief, "warn", `Possibly invented proof: "${w}"`));
  UNSUPPLIED_PROOF_PATTERNS.forEach(({ label, pattern }) => {
    if (pattern.test(full)) addFlag(brief, "warn", `Possibly invented proof: ${label}`);
  });
  const intel = getBrandIntelligence(campaign.brandId);
  intel?.avoid.forEach((pat) => {
    const scan = pat.replace(/^hyperbole like\s+/i, "").toLowerCase();
    if (scan.length > 8 && full.includes(scan)) addFlag(brief, "warn", `Brand avoid pattern: "${pat}"`);
  });

  const cd = brief.creative_direction || ({} as GenCreativeDirection);
  if (cd.angle && !PLAYBOOK_ANGLES.includes(cd.angle)) addFlag(brief, "warn", "Non-playbook angle: " + cd.angle);
  if (cd.framework && !PLAYBOOK_FRAMEWORKS.includes(cd.framework)) addFlag(brief, "warn", "Non-playbook framework: " + cd.framework);
  if (!cd.branch) addFlag(brief, "warn", "Creative direction missing production branch");
  if (!cd.brief_route) addFlag(brief, "warn", "Creative direction missing brief route");
  if (!cd.source_pattern) addFlag(brief, "warn", "Creative direction missing source pattern");
  const hc = cd.hook_contract || ({} as GenHookContract);
  (["segment_insight", "emotion", "hero_product", "proof_or_price", "urgency", "avoid_rule"] as const).forEach((f) => {
    if (!hc[f]) addFlag(brief, "warn", "Hook contract missing: " + f);
  });
  if (hc.hero_product && products.length && !findProductByReference(products, hc.hero_product)) {
    addFlag(brief, "warn", `Hook contract hero_product "${hc.hero_product}" does not match any selected product`);
  }

  const banner = brief.banner || ({} as GenBanner);
  const bannerMain = [banner.main_text_1, banner.main_text_2, banner.main_text_3, banner.main_text].filter(Boolean).join("\n");
  const bannerSub = [banner.sub_text_1, banner.sub_text_2, banner.sub_text_3, banner.sub_text].filter(Boolean).join("\n");
  const heroProductName = leadProductForBrief(brief, products)?.name || hc.hero_product;
  const bannerSurface = [bannerMain, bannerSub, banner.main_image, banner.sub_image, banner.image_guidance].filter(Boolean).join("\n");
  if (heroProductName && !containsSignificantReference(bannerSurface, heroProductName)) {
    addFlag(brief, "warn", "Hero banner should visibly reference the hook/hero product");
  }
  (bannerMain || "").split(/\n|<br\s*\/?>/i).forEach((line) => {
    if (wordCount(line) > 8) addFlag(brief, "warn", `Banner line over 8 words: "${line.trim()}"`);
  });
  (["main_text_1", "main_text_2", "main_text_3", "sub_text_1", "sub_text_2", "sub_text_3", "main_image", "sub_image", "trust_booster", "emergency"] as const).forEach((f) => {
    if (!banner[f]) addFlag(brief, "warn", `Structured hero banner missing: ${f}`);
  });
  const bannerHeadlineLines = [banner.main_text_1, banner.main_text_2, banner.main_text_3].filter(Boolean) as string[];
  for (let i = 0; i < bannerHeadlineLines.length; i++) {
    for (let j = i + 1; j < bannerHeadlineLines.length; j++) {
      if (similarity(bannerHeadlineLines[i], bannerHeadlineLines[j]) > 0.62) {
        addFlag(brief, "warn", `Banner headline lines ${i + 1}/${j + 1} repeat the same angle`);
      }
    }
  }
  const bannerSupportLines = [banner.sub_text_1, banner.sub_text_2, banner.sub_text_3].filter(Boolean) as string[];
  for (let i = 0; i < bannerSupportLines.length; i++) {
    for (let j = i + 1; j < bannerSupportLines.length; j++) {
      if (similarity(bannerSupportLines[i], bannerSupportLines[j]) > 0.68) {
        addFlag(brief, "warn", `Banner support lines ${i + 1}/${j + 1} are too similar`);
      }
    }
  }
  if (banner.cta && WEAK_CTA.includes(banner.cta.toLowerCase())) addFlag(brief, "warn", `Weak banner CTA: "${banner.cta}"`);
  if (banner.cta && (wordCount(banner.cta) < 2 || wordCount(banner.cta) > 4)) addFlag(brief, "warn", `Banner CTA should be 2-4 words ("${banner.cta}" = ${wordCount(banner.cta)} words)`);
  const bannerBullets = String(banner.image_guidance || "").split(/\n+/).filter((line) => /^\s*[-•]/.test(line));
  if (banner.image_guidance && (bannerBullets.length < 4 || bannerBullets.length > 6)) {
    addFlag(brief, "warn", "Banner image guidance should be 4-6 compact bullets");
  }
  if (looksLikeSchemaPlaceholder(banner.image_guidance)) addFlag(brief, "warn", "Banner image guidance still contains schema placeholder text");
  [banner.review_quote, ...(banner.review_texts || [])].filter(Boolean).forEach((review) => {
    if (!matchesAnySuppliedReview(String(review), products)) {
      addFlag(brief, "warn", "Banner review looks invented; use supplied review text or unattributed proof language");
    }
  });
  bannerBullets.forEach((line) => {
    const text = line.replace(/^\s*[-•]\s*/, "");
    if (wordCount(text) > 12) addFlag(brief, "warn", `Banner bullet over 12 words: "${line.trim()}"`);
  });
  const bannerOptions = Array.isArray(banner.options) ? banner.options : [];
  if (bannerOptions.length < 2) {
    addFlag(brief, "warn", "Banner needs 2 editable options with different headline families and image compositions");
  }
  bannerOptions.forEach((option, i) => {
    if (!option.label?.trim()) addFlag(brief, "warn", `Banner option ${i + 1} missing label`);
    if (!option.model_hint?.trim()) addFlag(brief, "warn", `Banner option ${i + 1} missing model_hint`);
    const optionMainLines = [option.main_text_1, option.main_text_2, option.main_text_3].filter(Boolean);
    const optionSubLines = [option.sub_text_1, option.sub_text_2, option.sub_text_3].filter(Boolean);
    if (optionMainLines.length < 3) addFlag(brief, "warn", `Banner option ${i + 1} needs 3 main text beats`);
    if (optionSubLines.length < 2) addFlag(brief, "warn", `Banner option ${i + 1} needs supporting sub text beats`);
    optionMainLines.forEach((line) => {
      if (wordCount(line) > 8) addFlag(brief, "warn", `Banner option ${i + 1} line over 8 words: "${line.trim()}"`);
    });
    if (option.cta && WEAK_CTA.includes(option.cta.toLowerCase())) addFlag(brief, "warn", `Banner option ${i + 1} weak CTA`);
    if (option.cta && (wordCount(option.cta) < 2 || wordCount(option.cta) > 4)) {
      addFlag(brief, "warn", `Banner option ${i + 1} CTA should be 2-4 words`);
    }
  });
  for (let i = 0; i < bannerOptions.length; i++) {
    for (let j = i + 1; j < bannerOptions.length; j++) {
      if (similarity(bannerOptionText(bannerOptions[i]), bannerOptionText(bannerOptions[j])) > 0.68) {
        addFlag(brief, "warn", `Banner options ${i + 1}/${j + 1} are too similar; change headline family, image composition, proof role, or CTA style`);
      }
    }
  }

  const opener = (body.base || Object.values(body)[0] || "").slice(0, 250);
  if (BULLET_OPENER.test(opener)) addFlag(brief, "warn", "Body opens with a bullet/checkmark list");
  if (/^(meet |this is |introducing )/i.test(opener.trim())) {
    addFlag(brief, "warn", "Body opener looks like a product introduction ('Meet X / Introducing X') — use the selected opener mechanic instead");
  }
  const personaName = BRAND_PERSONA_NAMES[campaign.brandId];
  if (personaName) {
    // Scope the sign-off check to where a sign-off legitimately lives (body + P.S.), with a word
    // boundary — not a substring scan of the whole JSON (which false-passes on names in product/image fields).
    const signOffSurface = `${briefBodyText(brief)} ${brief.ps || ""}`.toLowerCase();
    if (!new RegExp(`\\b${personaName.toLowerCase()}\\b`).test(signOffSurface)) {
      addFlag(brief, "warn", `Body copy missing persona sign-off — "${personaName}" should appear in the body or P.S.`);
    }
  }
  // Check for question or curiosity beat across all body segments
  {
    // Strip markdown links (which may contain ? in URL query strings) before checking
    const allBodyText = [body.base || "", ...campaign.segments.map((id) => String(body[segJsonKey(id)] || ""))]
      .map(stripCopyMarkup)
      .join(" ");
    const hasQuestion = /\?/.test(allBodyText);
    const hasCuriosityGap = /\b(did you know|ever notice|wonder why|imagine if|sound familiar|ever feel|ever tried|ever had|remember when|what if)\b/i.test(allBodyText);
    if (!hasQuestion && !hasCuriosityGap) {
      addFlag(brief, "warn", "Body missing a question or curiosity beat — playbook R4: add one genuine question or curiosity gap");
    }
  }
  // GentsLux must include a #Tip / educational sign-off
  if (campaign.brandId === "gents_lux") {
    const allBodyText = [body.base || "", ...campaign.segments.map((id) => String(body[segJsonKey(id)] || "")), brief.ps || ""].join(" ");
    const hasValuePayoff = /#tip|#quicktip|#hack|#hemminghack|#stylehack|did you know|fun fact|quick fact/i.test(allBodyText);
    if (!hasValuePayoff) {
      addFlag(brief, "warn", "GentsLux body missing educational sign-off — playbook R22: add a #Tip, #QuickTip, or 'Did you know' line");
    }
  }
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
    const homeLinks = homeLinkCount(String(text || ""));
    if (seg !== "base" && text && homepagePolicy === "forbidden" && homeLinks > 0) {
      addFlag(brief, "error", `${seg} body includes forbidden homepage link; ${brand?.name || "this brand"} body copy must use product links only`);
    }
    if (seg !== "base" && text && homepagePolicy === "required" && homeLinks === 0) {
      addFlag(brief, "error", `${seg} body missing required homepage link; add one natural [text](home) link`);
    }
    if (seg !== "base" && text && homepagePolicy === "required" && homeLinks > 1) {
      addFlag(brief, "warn", `${seg} body has ${homeLinks} homepage links; keep exactly one natural homepage link`);
    }
    if (text && /{{\s*first_name\s*}}/i.test(text)) {
      addFlag(brief, "warn", `${seg} body contains {{first_name}} — merge tags belong in subject/preheader only`);
    }
    if (text && /we('ve| have)?\s+(missed|been missing)\s+you|(we'?re|we are)\s+sorry|we\s+apologize|feel\s+bad\s+(that|about)|it's been\s+a\s+while\s+since/i.test(String(text).slice(0, 250))) {
      addFlag(brief, "warn", `${seg} reactivation guilt/apology opener — lead with value, not an apology`);
    }
    if (text && wordCount(text) > bodyBand.max) addFlag(brief, "warn", `${seg} body over ${bodyBand.max} words (${wordCount(text)})`);
    if (text && wordCount(text) < bodyBand.min) addFlag(brief, "warn", `${seg} body too short (${wordCount(text)} words; target ${bodyBand.min}-${bodyBand.max})`);
    if (campaign.bodyLayout === "interspersed" && paras.length > 2) {
      addFlag(brief, "warn", `${seg} interspersed body should be opener + one short bridge only`);
    }
    if (text && !MARKDOWN_PRODUCT_LINK.test(firstTwoParas)) {
      addFlag(brief, "warn", `${seg} missing product-name markdown link by paragraph 2`);
    }
    if (text && !hasOfferSignal(text, campaign)) {
      addFlag(brief, "warn", `${seg} body needs visible price/offer or shipping threshold`);
    }
    const hardSell = hardSellHits(String(text || ""));
    const hardCommand = hardSell.find((label) => HARD_SELL_COMMANDS.has(label));
    if (hardCommand) {
      addFlag(brief, "warn", `${seg} body uses a hard-sell command (${hardCommand}); keep the body personal-note first and move action pressure to CTA/offer context`);
    } else if (hardSell.length > 1) {
      addFlag(brief, "warn", `${seg} body sounds too salesy (${[...new Set(hardSell)].slice(0, 3).join(", ")}); make the offer a helpful detail, not a command stack`);
    }
    // Offer-repetition check: count distinct price / shipping mentions in segment body.
    const PRICE_LIKE = /💲\d|\$\d|\b\d+\s*%\s*(?:off|o\.f\.f|saving)/gi;
    const FREE_SHIP = /free\s+(?:shipping|ship)/gi;
    const bodySegText = String(body[seg] || "");
    const priceMentions = (bodySegText.match(PRICE_LIKE) || []).length;
    const shipMentions = (bodySegText.match(FREE_SHIP) || []).length;
    if (priceMentions > MAX_BODY_OFFER_MENTIONS) {
      addFlag(brief, "error", `${seg} body repeats price/discount ${priceMentions}× (max ${MAX_BODY_OFFER_MENTIONS}); state offer once at hero reveal, once in P.S.`);
    }
    if (shipMentions > 1) {
      addFlag(brief, "warn", `${seg} body repeats "free shipping" ${shipMentions}× — mention once max`);
    }
    if (text && heroProductName && !containsSignificantReference(firstTwoParas, heroProductName)) {
      addFlag(brief, "warn", `${seg} body opener should name or clearly reference the hero product`);
    }
    const isContinuous = campaign.bodyLayout !== "interspersed" && campaign.bodyLayout !== "custom";
    if (isContinuous && text && paras.length < 3) addFlag(brief, "warn", `${seg} body below 3-paragraph win-template rhythm`);
    if (isContinuous && text && paras.length > 6) addFlag(brief, "warn", `${seg} body above 5-paragraph win-template rhythm`);
    const subjectish = `${sl[seg]?.subject || ""} ${sl[seg]?.preheader || ""}`;
    const bodyish = `${bannerMain} ${bannerSub} ${text}`;
    const sharedThreadOk = !subjectish.trim() || !bodyish.trim() || sharesContentThread(subjectish, bodyish, products, campaign);
    const segmentThemeHits = themeWords.filter((w) => norm(text).includes(w)).length;
    // Only flag off-theme when the body ALSO fails to share a thread with subject/hero/offer. A body
    // that connects via synonym/paraphrase shouldn't be forced to literally keyword-stuff the theme word.
    if (themeWords.length && segmentThemeHits === 0 && !sharedThreadOk) addFlag(brief, "warn", `${seg} body may miss campaign theme cues`);
    if (!sharedThreadOk) {
      addFlag(brief, "warn", `${seg} subject, hero, and body need a clearer shared thread`);
    }
    (sl[seg]?.options || []).forEach((option, i) => {
      const optionThread = `${option.subject || ""} ${option.preheader || ""} ${option.shared_thread || ""}`;
      if (optionThread.trim() && bodyish && !sharesContentThread(optionThread, bodyish, products, campaign)) {
        addFlag(brief, "warn", `${seg} subject option ${i + 1} needs a clearer shared thread with hero/body`);
      }
    });
  });
  const bodyOnly = Object.entries(body)
    .filter(([key]) => key !== "base")
    .map(([, value]) => String(value || ""))
    .join("\n\n");
  const discountMentions = (bodyOnly.match(/\b\d+\s*%\s*(?:off|o\.f\.f|saving)\b/gi) || []).length;
  if (discountMentions > MAX_BODY_DISCOUNT_MENTIONS) {
    addFlag(brief, "warn", `Body repeats discount percentage ${discountMentions}× (target ${MAX_BODY_DISCOUNT_MENTIONS} or fewer); make the offer a detail, not the structure`);
  }
  const segmentBodies = Object.entries(body).filter(([key, text]) => key !== "base" && wordCount(String(text || "")) >= 80);
  for (let i = 0; i < segmentBodies.length; i++) {
    for (let j = i + 1; j < segmentBodies.length; j++) {
      const [leftKey, leftText] = segmentBodies[i];
      const [rightKey, rightText] = segmentBodies[j];
      const fullSimilarity = similarity(String(leftText), String(rightText));
      const openerSimilarity = similarity(firstParagraph(String(leftText)), firstParagraph(String(rightText)));
      const sharedPhraseOverlap = phraseOverlap(String(leftText), String(rightText));
      const leftOpeningStart = openingStart(String(leftText));
      const rightOpeningStart = openingStart(String(rightText));
      const sameOpeningStart = !!leftOpeningStart && leftOpeningStart === rightOpeningStart;
      // Multi-segment sends intentionally share ONE Hook Contract, so an identical first-8-words is
      // expected — require a secondary signal before calling it a cloned structure.
      const structureDup =
        openerSimilarity > 0.68 ||
        sharedPhraseOverlap > 0.28 ||
        (sameOpeningStart && (openerSimilarity > 0.5 || sharedPhraseOverlap > 0.15));
      if (fullSimilarity > 0.74) {
        addFlag(brief, "warn", `${leftKey} and ${rightKey} body variants are too similar; adapt motivation/risk reducer by segment`);
      } else if (structureDup) {
        addFlag(brief, "warn", `${leftKey} and ${rightKey} share the same body structure; change the opener, proof/risk reducer, bridge, and final CTA sentence`);
      }
    }
  }
  const bodyOptionsBySegment = brief.body_options || {};
  campaign.segments.forEach((id) => {
    const key = segJsonKey(id);
    const options = Array.isArray(bodyOptionsBySegment[key]) ? bodyOptionsBySegment[key] : [];
    if (options.length < 2) {
      addFlag(brief, "warn", `${key} needs 2 editable body options with different opener/proof/placement routes`);
    }
    options.forEach((option, i) => {
      const optionFirstTwoParas = String(option.body || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).slice(0, 2).join("\n\n");
      const optionHomeLinks = homeLinkCount(option.body || "");
      if (!option.label?.trim()) addFlag(brief, "warn", `${key} body option ${i + 1} missing label`);
      if (!option.model_hint?.trim()) addFlag(brief, "warn", `${key} body option ${i + 1} missing model_hint`);
      if (!option.body?.trim()) addFlag(brief, "warn", `${key} body option ${i + 1} missing body`);
      if (!option.placement_note?.trim()) addFlag(brief, "warn", `${key} body option ${i + 1} missing placement_note`);
      if (option.body && homepagePolicy === "forbidden" && optionHomeLinks > 0) {
        addFlag(brief, "error", `${key} body option ${i + 1} includes forbidden homepage link`);
      }
      if (option.body && homepagePolicy === "required" && optionHomeLinks === 0) {
        addFlag(brief, "error", `${key} body option ${i + 1} missing required homepage link`);
      }
      if (option.body && homepagePolicy === "required" && optionHomeLinks > 1) {
        addFlag(brief, "warn", `${key} body option ${i + 1} has ${optionHomeLinks} homepage links; keep exactly one`);
      }
      if (option.body && i > 0 && body[key] && similarity(option.body, body[key]) > 0.78) {
        addFlag(brief, "warn", `${key} body option ${i + 1} is too similar to the selected body; make the alternate route structurally different`);
      }
      if (option.body && !MARKDOWN_PRODUCT_LINK.test(optionFirstTwoParas)) {
        addFlag(brief, "warn", `${key} body option ${i + 1} missing product-name markdown link by paragraph 2`);
      }
    });
    const optionHints = options.map((option) => norm(`${option.label || ""} ${option.model_hint || ""}`)).filter(Boolean);
    if (optionHints.length >= 2 && new Set(optionHints).size < 2) {
      addFlag(brief, "warn", `${key} body options need distinct labels/model hints`);
    }
    for (let i = 0; i < options.length; i++) {
      for (let j = i + 1; j < options.length; j++) {
        if (similarity(bodyOptionText(options[i]), bodyOptionText(options[j])) > 0.70) {
          addFlag(brief, "warn", `${key} body options ${i + 1}/${j + 1} are too similar; change opener family, proof path, and placement note`);
        }
      }
    }
  });

  const psWords = wordCount(brief.ps || "");
  if (!brief.ps) addFlag(brief, "warn", "Missing P.S. line");
  else if (psWords < 10 || psWords > 15) addFlag(brief, "warn", `P.S. should be 10-15 words (${psWords})`);

  const prods = brief.products || [];
  validateProductData(brief, products);
  if (requiredCatalog.length) {
    const generatedProductSurface = prods
      .map((product) => [
        product.name,
        product.template_style,
        product.main_text,
        product.sub_text,
        product.popup_badge,
        product.cta,
        ...(product.usps || []),
        product.main_image,
        product.sub_image,
        product.alt_text,
        product.image_notes,
      ].filter(Boolean).join(" "))
      .join("\n");
    requiredCatalog.forEach((product) => {
      if (!containsSignificantReference(generatedProductSurface, product.name)) {
        addFlag(brief, "error", `${brand?.name || "Brand"} required product missing from generated product blocks: ${product.name}`);
      }
    });
    const topBlocks = prods.slice(0, requiredCatalog.length);
    const missingFromTop = requiredCatalog.filter((product) => !topBlocks.some((block) => blockReferencesProduct(block, product)));
    if (missingFromTop.length) {
      addFlag(
        brief,
        "error",
        `${brand?.name || "Brand"} required top products must occupy the first ${requiredCatalog.length} product blocks: ${missingFromTop.map((product) => product.name).join(", ")}`
      );
    }
  }
  if (campaign.brandId !== "santa_fare" && prods.length > 6) addFlag(brief, "warn", "7+ product blocks (overcrowding risk)");
  if (campaign.brandId === "santa_fare" && prods.length > 4) addFlag(brief, "warn", "SantaFare should default to 4 products unless the brief gives a clear exception");
  if (campaign.brandId !== "santa_fare" && products.length >= 4 && prods.length > 0 && prods.length < 4) {
    addFlag(brief, "warn", "Product grid below 4 products; playbook default is 4-6 for BG/GL/LF");
  }
  if (products.length % 2 === 0 && prods.length > 1 && prods.length % 2 === 1) {
    addFlag(brief, "warn", "Odd product count creates an orphan final row; playbook prefers even 2-up rows");
  }
  const offerNumbers = promoLine(campaign).match(/\d+(?:\.\d+)?/g) || [];
  prods.forEach((p, i) => {
    const sourceProduct = sourceProductForBlock(p, products, i);
    const sourceReview = sourceProduct?.review;
    if (p.name && products.length && !findProductByReference(products, p.name)) {
      addFlag(brief, "warn", `Product ${i + 1} name "${p.name}" does not match a selected product; keep product blocks tied to selected pages`);
    }
    if (wordCount(p.main_text) > 5) addFlag(brief, "warn", `Product ${i + 1} main text over 5 words`);
    if (!p.sub_text) addFlag(brief, "warn", `Product ${i + 1} missing sub_text`);
    else if (wordCount(p.sub_text) > 12) addFlag(brief, "warn", `Product ${i + 1} sub_text over 12 words (${wordCount(p.sub_text)})`);
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
    if (!matchesSuppliedReview(p.review || "", sourceReview)) {
      addFlag(brief, "warn", `Product ${i + 1} review looks invented; use supplied review or unattributed benefit language`);
    }
    const legacyImageOption = Array.isArray(p.image_options) ? p.image_options[0] : undefined;
    p.main_image ||= legacyImageOption?.main_image || "";
    p.sub_image ||= legacyImageOption?.sub_image || "";
    p.alt_text ||= legacyImageOption?.alt_text || "";
    p.image_notes ||= legacyImageOption?.notes || "";
    (["main_image", "sub_image", "alt_text", "image_notes"] as const).forEach((field) => {
      if (!p[field]) addFlag(brief, "warn", `Product ${i + 1} image brief missing ${field}`);
    });
  });
  const productRoles = prods.map((p) => norm(p.template_style || "")).filter(Boolean);
  if (prods.length >= 3 && new Set(productRoles).size < Math.min(3, productRoles.length)) {
    addFlag(brief, "warn", "Product block roles need more variety; template_style should name distinct use cases, mechanisms, or overlay roles");
  }
  const defaultProductStyle = norm(campaign.productCopyStyle || "headline_winner");
  if (productRoles.length >= 2 && productRoles.filter((role) => role === defaultProductStyle).length >= 2) {
    addFlag(brief, "warn", "Product block roles repeat the generic product template style; name the actual role/use case for each block");
  }
  const productCtas = prods.map((p) => norm(p.cta || "")).filter(Boolean);
  if (productCtas.length >= 3 && new Set(productCtas).size === 1) {
    addFlag(brief, "warn", "Product CTAs are identical across the grid; vary action language by product role");
  }
  for (let i = 0; i < prods.length; i++) {
    for (let j = i + 1; j < prods.length; j++) {
      if (similarity(prods[i].main_text || "", prods[j].main_text || "") > 0.72) {
        addFlag(brief, "warn", `Product ${i + 1}/${j + 1} image headlines are too similar`);
      }
    }
  }

  const qc = brief.quality_checks || ({} as GenQualityChecks);
  PLAYBOOK_REQUIRED_QA.forEach((f) => {
    if (!qc[f as keyof GenQualityChecks]) addFlag(brief, "warn", "Quality check missing: " + f);
  });
  if (brief.body_variety?.openerMechanicLabel && qc.opener_mechanic) {
    const requestedMechanic = norm(brief.body_variety.openerMechanicLabel).split(/\s+/)[0];
    const usedMechanic = norm(qc.opener_mechanic);
    if (requestedMechanic && requestedMechanic.length > 3 && !usedMechanic.includes(requestedMechanic)) {
      addFlag(brief, "warn", "Opener mechanic in quality_checks doesn't match body_variety — model may have ignored the variety profile");
    }
  }
  brief._creative_score = computeCreativityScore(brief);
  if (brief._creative_score < 70) {
    addFlag(brief, "warn", `Creative score ${brief._creative_score}/100 — add a concrete human or product moment and reduce repeated mechanism or offer phrasing`);
  }
  brief._technique_coverage = computeTechniqueCoverage(brief, campaign);
  brief._technique_score = brief._technique_coverage.score;
  if (brief._technique_score < 75) {
    addFlag(
      brief,
      "warn",
      `Technique coverage ${brief._technique_score}/100 — ${brief._technique_coverage.notes.slice(0, 2).join("; ") || "tighten playbook technique execution"}`
    );
  }

  const split = splitValidationFlags(brief._flags || []);
  brief._flags = split.compliance;
  brief._advisory = [...incomingAdvisory, ...split.advisory];
  brief._score = scoreBrief(brief._flags);
  return brief;
}

function rescoreBrief(brief: GenBrief): GenBrief {
  brief._score = scoreBrief(brief._flags || []);
  return brief;
}

export function validateCompliance(brief: GenBrief, campaign: Campaign, products: Product[] = []): GenBrief {
  return validateBrief(brief, campaign, products);
}

function briefBodyText(brief: GenBrief): string {
  return Object.entries(brief.body || {})
    .filter(([key]) => key !== "base")
    .map(([, value]) => value)
    .join("\n\n");
}

function briefBannerText(brief: GenBrief): string {
  const b = brief.banner || ({} as GenBanner);
  return [
    b.main_text,
    b.sub_text,
    b.main_text_1,
    b.main_text_2,
    b.main_text_3,
    b.sub_text_1,
    b.sub_text_2,
    b.sub_text_3,
    b.cta,
    b.main_image,
    b.sub_image,
    b.image_guidance,
  ].filter(Boolean).join("\n");
}

function bannerOptionText(option?: GenBannerOption): string {
  if (!option) return "";
  return [
    option.label,
    option.model_hint,
    option.main_text_1,
    option.main_text_2,
    option.main_text_3,
    option.sub_text_1,
    option.sub_text_2,
    option.sub_text_3,
    option.cta,
    option.main_image,
    option.sub_image,
    option.trust_booster,
    option.emergency,
    option.image_guidance,
    ...(option.review_texts || []),
  ].filter(Boolean).join("\n");
}

function bodyOptionText(option?: GenBodyOption): string {
  if (!option) return "";
  return [
    option.label,
    option.model_hint,
    option.body,
    option.ps,
    option.placement_note,
  ].filter(Boolean).join("\n");
}

function briefProductCopyText(brief: GenBrief): string {
  return (brief.products || [])
    .map((p) => [p.main_text, p.sub_text, p.popup_badge, p.cta, ...(p.usps || [])].filter(Boolean).join(" "))
    .join("\n");
}

function routeName(brief: GenBrief): string {
  const cd = brief.creative_direction || ({} as GenCreativeDirection);
  return norm([cd.branch, cd.brief_route].filter(Boolean).join(" "));
}

export function briefContrastIssues(a: GenBrief, b: GenBrief): string[] {
  const issues: string[] = [];
  const aCd = a.creative_direction || ({} as GenCreativeDirection);
  const bCd = b.creative_direction || ({} as GenCreativeDirection);
  const aRoute = routeName(a);
  const bRoute = routeName(b);
  if (!aRoute || !bRoute) {
    issues.push("A/B creative_direction must include different branch and brief_route values from the production route controls");
  } else if (aRoute === bRoute) {
    issues.push("A/B brief routes are the same; use different production branches, subject families, banner patterns, and body architectures");
  }
  if (aCd.angle && bCd.angle && aCd.angle === bCd.angle) {
    issues.push("A/B angles are the same");
  }
  if (aCd.framework && bCd.framework && aCd.framework === bCd.framework) {
    issues.push("A/B frameworks are the same");
  }
  if (aCd.concept && bCd.concept) {
    const conceptMatches = [
      aCd.concept.angle === bCd.concept.angle,
      aCd.concept.framework === bCd.concept.framework,
      aCd.concept.creativeDevice === bCd.concept.creativeDevice,
      aCd.concept.format === bCd.concept.format,
      aCd.concept.proofPath === bCd.concept.proofPath,
      aCd.concept.openerMechanic === bCd.concept.openerMechanic,
    ].filter(Boolean).length;
    if (conceptMatches > 3) {
      issues.push("A/B concept tuples overlap on too many axes; force a different device, format, proof path, and opener mechanic");
    }
    const aLead = aCd.concept.techniquePlan?.lead;
    const bLead = bCd.concept.techniquePlan?.lead;
    if (aLead && bLead && aLead === bLead) {
      issues.push("A/B technique leads are the same; choose a different lead method such as story vs fact, curiosity vs offer, or pain-relief vs VIP");
    }
  }
  const directionTextA = [aCd.flow, aCd.differentiator, aCd.source_pattern].filter(Boolean).join(" ");
  const directionTextB = [bCd.flow, bCd.differentiator, bCd.source_pattern].filter(Boolean).join(" ");
  if (directionTextA && directionTextB && similarity(directionTextA, directionTextB) > 0.7) {
    issues.push("A/B creative direction text is too similar; make the test hypothesis and route visibly different");
  }

  // Idea-level contrast: compare hook contract fields (A2-2).
  // Two briefs with the same emotional hook and segment insight are the same idea with different words.
  const aHc = aCd.hook_contract || ({} as GenHookContract);
  const bHc = bCd.hook_contract || ({} as GenHookContract);
  if (aHc.emotion && bHc.emotion && norm(aHc.emotion) === norm(bHc.emotion)) {
    issues.push("A/B hook contracts share the same emotion; B must target a different emotional register (e.g. A=relief → B=aspiration or curiosity)");
  }
  const aInsight = norm(aHc.segment_insight || "");
  const bInsight = norm(bHc.segment_insight || "");
  if (aInsight && bInsight && aInsight.length > 12 && similarity(aInsight, bInsight) > 0.72) {
    issues.push("A/B segment insights are too similar; B must frame the reader's problem or opportunity differently");
  }
  // Payoff check: differentiator should differ meaningfully
  const aPayoff = norm(aCd.differentiator || "");
  const bPayoff = norm(bCd.differentiator || "");
  if (aPayoff && bPayoff && aPayoff.length > 10 && similarity(aPayoff, bPayoff) > 0.75) {
    issues.push("A/B differentiators are too similar; each option must have a distinct proof path, hero emphasis, or offer angle");
  }

  const bodyA = briefBodyText(a);
  const bodyB = briefBodyText(b);
  if (bodyA && bodyB && (similarity(bodyA, bodyB) > 0.50 || phraseOverlap(bodyA, bodyB) > 0.18)) {
    issues.push("A/B body copy shares too much structure; change opener family, proof path, bridge, and CTA rhythm");
  }
  const aOpenerMechanic = a.quality_checks?.opener_mechanic;
  const bOpenerMechanic = b.quality_checks?.opener_mechanic;
  if (aOpenerMechanic && bOpenerMechanic) {
    const aMech = norm(aOpenerMechanic).split(/\s+/)[0];
    const bMech = norm(bOpenerMechanic).split(/\s+/)[0];
    if (aMech && aMech.length > 3 && aMech === bMech) {
      issues.push("A/B opener mechanics are the same; B must use a different entry point (story/fact/question/sensory_snapshot/useful_tip/customer_quote/occasion_clock/direct_problem/occasion/re_engagement/insider_reveal)");
    }
  }
  const varietyPairs: [keyof BodyVarietyProfile, string][] = [
    ["creativeLens", "creative lens"],
    ["proofRole", "proof role"],
    ["subjectStyle", "subject style"],
    ["visualDirection", "visual direction"],
    ["bannerPattern", "banner pattern"],
    ["productGridPattern", "product grid pattern"],
    ["productBlockRole", "product block role"],
    ["ctaStyle", "CTA style"],
    ["bodyPlacement", "body placement"],
    ["copyTactics", "copy tactic mix"],
  ];
  varietyPairs.forEach(([field, label]) => {
    const leftRaw = a.body_variety?.[field];
    const rightRaw = b.body_variety?.[field];
    const left = norm(Array.isArray(leftRaw) ? leftRaw.join(" ") : String(leftRaw || ""));
    const right = norm(Array.isArray(rightRaw) ? rightRaw.join(" ") : String(rightRaw || ""));
    if (left && right && left === right) {
      issues.push(`A/B ${label}s are the same; choose a different surface route for Option B`);
    }
  });
  const bannerA = briefBannerText(a);
  const bannerB = briefBannerText(b);
  if (bannerA && bannerB && similarity(bannerA, bannerB) > 0.68) {
    issues.push("A/B banner copy/layout direction is too similar; change headline route, visual composition, and proof placement");
  }
  const productA = briefProductCopyText(a);
  const productB = briefProductCopyText(b);
  if (productA && productB && similarity(productA, productB) > 0.72) {
    issues.push("A/B product block copy is too similar; change overlay headline pattern, badges, and CTA language");
  }

  // Hero product identity: same hero product AND same opener mechanic = twin ideas.
  const aHero = norm((a.products?.[0]?.name || aCd.hook_contract?.hero_product || ""));
  const bHero = norm((b.products?.[0]?.name || bCd.hook_contract?.hero_product || ""));
  const aOpener = norm(a.quality_checks?.opener_mechanic || "").split(/\s+/)[0];
  const bOpener = norm(b.quality_checks?.opener_mechanic || "").split(/\s+/)[0];
  if (
    aHero && bHero && aHero === bHero &&
    aOpener && bOpener && aOpener.length > 3 && aOpener === bOpener
  ) {
    issues.push("A/B share the same hero product AND opener mechanic; force B to lead with a different hero or use a different entry point (story/fact/question/sensory_snapshot/useful_tip/customer_quote/occasion_clock/direct_problem/occasion/re_engagement/insider_reveal)");
  }

  // Opener trigram Jaccard: if the first paragraphs share most 3-word sequences they are structurally the same.
  const aOpenerText = firstParagraph(briefBodyText(a));
  const bOpenerText = firstParagraph(briefBodyText(b));
  if (aOpenerText && bOpenerText) {
    const aTrigs = ngramSet(aOpenerText, 3);
    const bTrigs = ngramSet(bOpenerText, 3);
    const denom = Math.max(aTrigs.size, bTrigs.size);
    if (denom > 0) {
      let shared = 0;
      aTrigs.forEach((g) => { if (bTrigs.has(g)) shared++; });
      const jac = shared / denom;
      if (jac > 0.6) {
        issues.push(`A/B openers share too many trigrams (Jaccard ${jac.toFixed(2)} > 0.60); B must use a different opening sentence, voice, and entry mechanic`);
      }
    }
  }

  // Product-set identity: identical name order is not a valid A/B test.
  const aProdNames = (a.products || []).map((p) => norm(p.name || "")).filter(Boolean);
  const bProdNames = (b.products || []).map((p) => norm(p.name || "")).filter(Boolean);
  if (
    aProdNames.length >= 3 && bProdNames.length >= 3 &&
    aProdNames.join(",") === bProdNames.join(",")
  ) {
    issues.push("A/B product grid has identical product order; reorder or swap at least one support product in Option B to create a different editorial emphasis");
  }

  return issues;
}

export function validateBriefPair(a: GenBrief, b: GenBrief): [GenBrief, GenBrief] {
  const issues = briefContrastIssues(a, b);
  issues.forEach((issue) => {
    (a._advisory ||= []).push({ type: "warn", msg: issue });
    (b._advisory ||= []).push({ type: "warn", msg: issue });
  });
  return [rescoreBrief(a), rescoreBrief(b)];
}
