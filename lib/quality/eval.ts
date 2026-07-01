// Golden-set + corpus eval harness.
//
// Output-quality changes (prompt edits, validator tweaks, scoring changes) are otherwise judged by
// vibes. This harness makes them measurable and deterministic — no model calls, no network:
//
//   1. GOLDEN SET — two hand-authored briefs (a strong one that follows the playbook, a weak one
//      that breaks it) scored through the real validateBrief + deliverability stack. The strong
//      brief MUST outscore the weak one; if a change inverts that, the change regressed quality.
//
//   2. CORPUS CALIBRATION — scores the team's real WinEmailTemps vs FailedEmailTemps subjects with
//      the deliverability scorer and checks the scorer isn't wrongly rejecting emails the team
//      actually shipped as winners (false-positive guard), and that winners trend at/above fails.
//
// The pure functions live here; the runnable entry point is app/api/eval/route.ts (it reads the
// .eml corpus from disk and calls these).

import { BRANDS } from "../config/brands";
import { briefContrastIssues, buildSystemPrompt, estimateTokens, validateBrief, type GenBrief } from "../briefgen";
import type { Campaign, Product } from "../config/types";
import { conceptDifferenceCount, selectEmailConceptPair } from "../concept";
import { selectTechniquePlan } from "../config/techniques";
import { toDeliverableBrief } from "../present/cleanBrief";
import { applySanitizeCopy, sanitizeCopy } from "../present/sanitizeCopy";
import { analyzeProductPriceOutliers } from "./productData";
import { analyzeDeliverability, type DeliverabilityReport } from "./deliverability";

// Anti-slop: LLM-tell phrases that erode inbox trust and signal AI-generated copy.
const SLOP_PHRASES = [
  "seamlessly", "leverage", "leveraging", "ignite your", "igniting", "empower yourself", "empowers you",
  "furthermore,", "in conclusion,", "in summary,", "to summarize,",
  "dive into", "delve into", "delving into", "transformative", "game-changer", "game changer",
  "game-changing", "revolutionize", "cutting-edge", "state-of-the-art", "unlock the power",
  "elevate your", "elevate the", "harness the power", "take your to the next level",
  "journey to", "experience the magic", "it's more than just", "it's not just a",
  "i hope this email finds you well", "dear valued customer", "as an esteemed",
];

export interface SlopResult {
  detected: string[];
  score: number; // 0 = clean, higher = more slop
  pass: boolean; // true when no slop detected
}

/** Scan a GenBrief's copy surfaces for AI-tell phrases. Pure function, no model calls. */
export function checkSlop(brief: GenBrief): SlopResult {
  const fullText = JSON.stringify({
    sl: brief.subject_lines,
    ba: brief.banner,
    bo: brief.body,
    p: brief.products,
  }).toLowerCase();
  const detected: string[] = [];
  for (const phrase of SLOP_PHRASES) {
    if (fullText.includes(phrase.toLowerCase())) detected.push(phrase);
  }
  return { detected, score: detected.length, pass: detected.length === 0 };
}

// ---- shared fixture campaign ----
export function goldenCampaign(): { campaign: Campaign; products: Product[] } {
  const brand = BRANDS.bra_goddess;
  // daisy, posy, zoeshape, activa — daisy/posy/zoeshape are BraGoddess's required top trio
  // (requiredProductSlugs in lib/config/brands.ts); using sonashape here previously made the
  // "strong" golden brief fail validation on a missing required product.
  const products = [brand.catalog[0], brand.catalog[1], brand.catalog[4], brand.catalog[3]];
  const campaign: Campaign = {
    brandId: "bra_goddess",
    sendDate: "2026-06-20",
    segments: ["21"],
    layout: "narrative",
    theme: "Early-summer comfort refresh",
    offerType: "fixed_price",
    offerValue: "💲12.99",
    offerShipping: "Free shipping 💲35+",
    urgency: "h48",
    offer: "💲12.99 + Free shipping 💲35+",
    bodyLayout: "continuous",
    productCopyStyle: "headline_winner",
    hookContract: "",
    recipientName: "{{first_name}}",
  };
  return { campaign, products };
}

// ---- golden briefs ----
function subjectOptions() {
  return [
    { style: "strategic", model_hint: "Claude strategic", subject: "The bra Dorothy won't take off, {{first_name}} — 💲12.99", preheader: "Wire-free lift, 3-second front snap, free shipping over 💲35 this week", shared_thread: "Daisy Bra + 💲12.99 + comfort" },
    { style: "curiosity", model_hint: "Gemini curiosity", subject: "Three seconds is all the Daisy asks, {{first_name}}", preheader: "The front-snap bra at 💲12.99 — free shipping past 💲35, ends soon", shared_thread: "Daisy Bra mechanism + price" },
    { style: "direct-response", model_hint: "ChatGPT direct", subject: "Your Daisy Bra is 💲12.99 today, {{first_name}}", preheader: "Wire-free lift, 3-second snap, free shipping over 💲35 — two days only", shared_thread: "Daisy Bra + 💲12.99 + deadline" },
  ];
}

export function strongBrief(): GenBrief {
  return {
    creative_direction: {
      angle: "Pain Relief",
      framework: "PAS",
      branch: "AB",
      brief_route: "Segment Reward / Thank-You Utility",
      source_pattern: "Excel rows: Subject 21 + Body Part 1A + Product 1/3/5",
      hook_contract: {
        segment_insight: "Daily comfort buyers want the underwire-free upgrade they already trust",
        emotion: "relief",
        hero_product: "Daisy Bra 3",
        proof_or_price: "💲12.99",
        urgency: "48 hours",
        avoid_rule: "no generic gratitude opener",
      },
      flow: "Hero comfort promise to a single front-snap product reward and one calm CTA",
      differentiator: "Named-neighbor micro-story opener with one mechanism proof",
      concept: {
        angle: "Pain Relief",
        framework: "PAS",
        creativeDevice: "open-loop",
        heroProductSlug: "daisybra",
        heroProductName: "Daisy Bra 3",
        format: "single-hero story",
        proofPath: "mechanism detail",
        openerMechanic: "story",
        techniquePlan: {
          lead: "ugc_story",
          seasoning: ["question_hook"],
          alwaysOn: ["personalization", "persona_warmth", "one_question", "emoji_budget", "power_verbs", "concision", "value_payoff"],
          valueTipId: "bg_tip_band_size",
          valueTip: "#FitFact: Your band should sit level in front and back. If it rides up, your band size is too big.",
        },
      },
    },
    subject_lines: {
      seg_21: {
        subject: "No more noon dig, {{first_name}} — 💲12.99 Daisy",
        preheader: "The 3-second front-snap bra, free shipping over 💲35 — two days only",
        style: "strategic",
        model_hint: "Claude strategic",
        shared_thread: "Daisy Bra + 💲12.99 + comfort",
        options: subjectOptions(),
      },
    },
    theme: "Soft early-summer comfort, one smiling mature model, deep-rose palette, hero Daisy Bra clearly visible",
    banner: {
      logo_stars: "★★★★★",
      main_text: "",
      sub_text: "",
      main_text_1: "By noon the digging starts",
      main_text_2: "Daisy snaps shut in 3 seconds",
      main_text_3: "Yours at 💲12.99 today",
      sub_text_1: "Wire-free lift, all-day soft",
      sub_text_2: "Front closure, no reaching back",
      sub_text_3: "Free shipping over 💲35",
      image_guidance: "- First 200px: smiling mature model in Daisy Bra\n- Hero product front-snap visible\n- 💲12.99 price badge top-right\n- Deep-rose palette, high contrast\n- CTA button below hero",
      review_quote: `"Forgot it's there!" — Helen R.`,
      review_texts: [`"Forgot it's there!" — Helen R.`],
      main_image: "Front-on mature model wearing Daisy Bra, natural smile, rose backdrop",
      sub_image: "Close crop on the 3-second front snap closure",
      trust_booster: "Loved by comfort-first shoppers",
      emergency: "Two days only",
      cta: "Shop Daisy",
    },
    body: {
      base:
        "My neighbor Dorothy mentioned the underwire digging in by noon — sound familiar? It's the exact thing I hear about most from women I talk to. So I wanted you to see the [Daisy Bra 3](slug:daisybra) before the weekend, while it's still at this price.\n\n" +
        "It snaps shut in front in about three seconds, then the ==wire-free lift== quietly does the rest — no reaching behind your back, no red marks at the end of a long day, no fidgeting under your clothes. Dorothy told me she now reaches for hers over everything else in the drawer, and honestly that's the review I trust most.\n\n" +
        "It's **💲12.99** through the next two days, and shipping is on us once you pass 💲35. Take a look while it's still open — I think you'll feel the difference the first time you put it on.\n\n— Sandra",
      seg_21:
        "My neighbor Dorothy mentioned the underwire digging in by noon — sound familiar? It's the exact thing I hear about most from women I talk to. So I wanted you to see the [Daisy Bra 3](slug:daisybra) before the weekend, while it's still at this price.\n\n" +
        "It snaps shut in front in about three seconds, then the ==wire-free lift== quietly does the rest — no reaching behind your back, no red marks at the end of a long day, no fidgeting under your clothes. Dorothy told me she now reaches for hers over everything else in the drawer, and honestly that's the review I trust most.\n\n" +
        "It's **💲12.99** through the next two days, and shipping is on us once you pass 💲35. Take a look while it's still open — I think you'll feel the difference the first time you put it on.\n\n— Sandra",
    },
    ps: "P.S. The front snap is the part everyone messages me about — try it.",
    products: [
      { slot: 1, name: "Daisy Bra 3", template_style: "headline_winner", main_text: "3-second snap", sub_text: "Wire-free lift, just 💲12.99", popup_badge: "Bestseller", usps: ["Front snap closure", "Wire-free lift"], review: `"Forgot it's there!" — Helen R.`, cta: "Shop Daisy", main_image: "Front-on model in Daisy Bra", sub_image: "Snap closure close-up", alt_text: "Daisy Bra 3 wire-free front-snap bra", image_notes: "Keep snap visible, rose palette" },
      { slot: 2, name: "Posy Bra", template_style: "headline_winner", main_text: "Smooths the back", sub_text: "💲19.99, free ship over 💲35", popup_badge: "Repeat buy", usps: ["Front-hook ease", "Smoothing panel"], review: `"My 2nd order!" — Sharon M.`, cta: "Shop Posy", main_image: "Model in Posy Bra side view", sub_image: "Back smoothing panel detail", alt_text: "Posy Bra smoothing front-hook bra", image_notes: "Show back panel" },
      { slot: 3, name: "ZoeShape", template_style: "headline_winner", main_text: "Smooths & shapes", sub_text: "💲19.99, ships free past 💲35", popup_badge: "Shaping favorite", usps: ["Side-bulge smoothing", "Full coverage lift"], review: `"Smooths everything!" — Barbara H.`, cta: "Shop ZoeShape", main_image: "Model in ZoeShape shaping fit", sub_image: "Side-smoothing panel detail", alt_text: "ZoeShape shaping wire-free bra", image_notes: "Show smooth silhouette" },
      { slot: 4, name: "Activa Bra 2.0", template_style: "headline_winner", main_text: "Wide soft straps", sub_text: "💲16.99, free ship over 💲35", popup_badge: "Upgraded", usps: ["Wide comfort straps", "All-day wear"], review: `"Best decision ever!" — Judith K.`, cta: "Shop Activa", main_image: "Model in Activa Bra 2.0", sub_image: "Wide strap detail", alt_text: "Activa Bra 2.0 wide-strap comfort bra", image_notes: "Highlight strap width" },
    ],
    quality_checks: {
      click_reason: "Front-snap comfort upgrade at a low price for daily buyers",
      hook_alignment: "Subject, banner, body, and hero all carry Daisy + 💲12.99 + noon-dig relief",
      proof_safety: "Only supplied reviews and prices used",
      spam_risk: "Low — 💲 glyph, no all-caps, single calm CTA",
      optout_risk: "Low — warm note, no guilt or shaming",
      photo_watchout: "One model, hero visible, no collage",
      first_200px: "Model + price badge + CTA",
      inline_link_plan: "One product link in paragraph 1, CTA buttons per product",
      layout_risk: "Even 4-product grid, no orphan row",
      playbook_dos_donts: "Emotion-first, offer second; no go-to-waste",
      brand_rule_alignment: "Sandra voice, deep-rose palette, Daisy hero",
      accessibility_layout: "Alt text on every image, readable contrast",
      opener_mechanic: "story",
      hook_coherence: "Single thread across all surfaces",
      cta_assessment: "Calm, 2-word CTAs, no hard-sell stack",
    },
  };
}

export function weakBrief(): GenBrief {
  return {
    creative_direction: {
      angle: "Discount",
      framework: "Spray",
      hook_contract: { segment_insight: "", emotion: "", hero_product: "", proof_or_price: "", urgency: "", avoid_rule: "" },
      flow: "",
      differentiator: "",
    },
    subject_lines: {
      seg_21: {
        subject: "ACT NOW!!! HUGE SALE $$$ DON'T MISS OUT 🔥🔥🔥",
        preheader: "ACT NOW!!!",
        options: [],
      },
    },
    theme: "sale",
    banner: {
      logo_stars: "",
      main_text: "BIGGEST SALE EVER",
      sub_text: "BUY NOW",
      image_guidance: "lots of products",
      review_quote: "Over 50,000 5-star reviews — clinically proven comfort!",
      cta: "click here",
    },
    body: {
      base:
        "I hope this email finds you well, {{first_name}}! CONGRATULATIONS — you're a winner! Don't miss out, act now and buy now before it's gone!!! This is a once in a lifetime, risk-free, 100% free offer. Hurry, claim yours now! Clinically proven, doctor recommended, guaranteed results for older women who want to hide your flaws.",
      seg_21:
        "I hope this email finds you well, {{first_name}}! CONGRATULATIONS — you're a winner! Don't miss out, act now and buy now before it's gone!!! Hurry, grab yours, claim now, last chance!",
    },
    ps: "Buy now!",
    products: [
      { slot: 1, name: "Daisy Bra 3", main_text: "AMAZING INCREDIBLE BRA YOU MUST BUY TODAY", sub_text: "", popup_badge: "", usps: [], review: "Rated #1 by thousands of customers", cta: "click here" },
    ],
    quality_checks: {
      click_reason: "", hook_alignment: "", proof_safety: "", spam_risk: "", optout_risk: "", photo_watchout: "",
      first_200px: "", inline_link_plan: "", layout_risk: "", playbook_dos_donts: "", brand_rule_alignment: "",
      accessibility_layout: "", opener_mechanic: "", hook_coherence: "", cta_assessment: "",
    },
  };
}

export interface GoldenScore {
  label: string;
  validationScore: number;
  validationErrors: number;
  validationWarnings: number;
  deliverabilityScore: number;
  deliverabilityGrade: DeliverabilityReport["grade"];
  deliverabilityBlocks: number;
}

function scoreBriefFixture(label: string, brief: GenBrief, campaign: Campaign, products: Product[]): GoldenScore {
  const validated = validateBrief(brief, campaign, products);
  const deliver = analyzeDeliverability(validated);
  const flags = validated._flags || [];
  return {
    label,
    validationScore: validated._score ?? 0,
    validationErrors: flags.filter((f) => f.type === "error").length,
    validationWarnings: flags.filter((f) => f.type === "warn").length,
    deliverabilityScore: deliver.score,
    deliverabilityGrade: deliver.grade,
    deliverabilityBlocks: deliver.counts.block,
  };
}

export interface GoldenSetResult {
  strong: GoldenScore;
  weak: GoldenScore;
  pass: boolean;
  reasons: string[];
}

/** Run the golden set: the strong brief must clearly beat the weak one on both axes. */
export function runGoldenSet(): GoldenSetResult {
  const { campaign, products } = goldenCampaign();
  const strong = scoreBriefFixture("strong", strongBrief(), campaign, products);
  const weak = scoreBriefFixture("weak", weakBrief(), campaign, products);
  const reasons: string[] = [];
  if (strong.validationScore <= weak.validationScore) reasons.push(`validation: strong (${strong.validationScore}) did not beat weak (${weak.validationScore})`);
  if (strong.deliverabilityScore <= weak.deliverabilityScore) reasons.push(`deliverability: strong (${strong.deliverabilityScore}) did not beat weak (${weak.deliverabilityScore})`);
  if (weak.deliverabilityBlocks === 0) reasons.push("deliverability: weak brief produced no block-level findings (scorer too lax)");
  if (strong.validationErrors > 0) reasons.push(`validation: strong brief has ${strong.validationErrors} hard errors (should be 0)`);
  return { strong, weak, pass: reasons.length === 0, reasons };
}

// ---- corpus calibration ----
export interface RawEmail {
  name: string;
  subject: string;
  bodyText?: string;
}

export interface CorpusEmailScore {
  name: string;
  subject: string;
  score: number;
  grade: DeliverabilityReport["grade"];
}

export interface CorpusResult {
  winners: CorpusEmailScore[];
  fails: CorpusEmailScore[];
  winnersMean: number;
  failsMean: number;
  separation: number;
  /** Winners the scorer would have wrongly blocked (grade F) — a scorer false-positive. */
  falsePositives: CorpusEmailScore[];
  pass: boolean;
  reasons: string[];
}

// ---- diversity measurement ----
export type DiversityFacet = "opener" | "angle" | "heroStory" | "subjectLines";

export interface DiversitySetResult {
  count: number;
  pairs: number;
  meanDistance: number;
  facetMeans: Record<DiversityFacet, number>;
}

export interface DiversityResult {
  intraCampaign: DiversitySetResult;
  interCampaign: DiversitySetResult;
  compliancePassRate: number;
  compliancePassed: number;
  complianceTotal: number;
  pass: boolean;
  notes: string[];
}

function cloneBrief(brief: GenBrief): GenBrief {
  return JSON.parse(JSON.stringify(brief)) as GenBrief;
}

function alternateStrongBrief(): GenBrief {
  const b = cloneBrief(strongBrief());
  b.creative_direction.angle = "Mechanism";
  b.creative_direction.framework = "Proof Ladder";
  b.creative_direction.branch = "EF";
  b.creative_direction.brief_route = "Mechanism / Product Truth";
  b.creative_direction.flow = "Front-snap mechanism to comfort proof to exact offer";
  b.creative_direction.differentiator = "Product-truth opener with closure proof instead of a named-neighbor story";
  b.subject_lines.seg_21.subject = "The 3-second Daisy detail, {{first_name}} — 💲12.99";
  b.subject_lines.seg_21.preheader = "Front-snap ease, wire-free lift, and free shipping over 💲35 for two days";
  b.banner.main_text_1 = "The snap does the hard part";
  b.banner.main_text_2 = "Daisy lifts without wire";
  b.banner.main_text_3 = "💲12.99 for two days";
  b.body.base =
    "The small front snap is the reason I wanted you to see [Daisy Bra 3](slug:daisybra) today. It closes in seconds, so the first relief is practical before the comfort even starts.\n\n" +
    "Then the ==wire-free lift== settles softly under a tee — no reaching back, no noon digging, no heavy padded feel. That is why this one keeps coming up in customer messages.\n\n" +
    "It is **💲12.99** for the next two days, with free shipping once your order passes 💲35. Open the Daisy page while the offer is still active.\n\n— Sandra";
  b.body.seg_21 = b.body.base;
  b.quality_checks.opener_mechanic = "fact";
  return b;
}

function visualStrongBrief(): GenBrief {
  const b = cloneBrief(strongBrief());
  b.creative_direction.angle = "Proof";
  b.creative_direction.framework = "Mechanism";
  b.creative_direction.branch = "KL";
  b.creative_direction.brief_route = "Proof / Review Ladder";
  b.creative_direction.flow = "Supplied review cue to Daisy comfort proof to exact offer";
  b.creative_direction.differentiator = "Review-led proof path with banner trust booster before product detail";
  b.subject_lines.seg_21.subject = "Helen's Daisy note for you, {{first_name}} — 💲12.99";
  b.subject_lines.seg_21.preheader = "A softer front-snap fit, free shipping over 💲35, and two days to try it";
  b.banner.main_text_1 = "Helen noticed the soft lift";
  b.banner.main_text_2 = "Daisy keeps the wire away";
  b.banner.main_text_3 = "💲12.99 while open";
  b.banner.review_quote = `"Forgot it's there!" — Helen R.`;
  b.body.base =
    "Helen's short note is why I put [Daisy Bra 3](slug:daisybra) first today: she said the comfort was easy to notice because the wire pressure was simply gone.\n\n" +
    "The front snap closes quickly, the ==wide soft support== stays smoother under a tee, and the lift comes without the hard edge that usually shows up by afternoon.\n\n" +
    "Daisy is **💲12.99** for the next two days, with free shipping after 💲35. It is a good time to see whether this is the softer fit your drawer has been missing.\n\n— Sandra";
  b.body.seg_21 = b.body.base;
  b.quality_checks.opener_mechanic = "proof";
  return b;
}

function firstBodyParagraph(brief: GenBrief): string {
  const body = brief.body || {};
  const first = Object.entries(body).find(([key, value]) => key !== "base" && String(value || "").trim())?.[1] || body.base || "";
  return String(first).split(/\n{2,}/)[0] || "";
}

function subjectSurface(brief: GenBrief): string {
  return Object.values(brief.subject_lines || {})
    .flatMap((s) => [s.subject, s.preheader, ...(s.options || []).flatMap((o) => [o.subject, o.preheader])])
    .filter(Boolean)
    .join(" ");
}

function heroStorySurface(brief: GenBrief): string {
  const cd = brief.creative_direction;
  const b = brief.banner || {};
  return [
    cd?.flow,
    cd?.differentiator,
    cd?.hook_contract?.segment_insight,
    cd?.hook_contract?.emotion,
    cd?.hook_contract?.proof_or_price,
    b.main_text,
    b.sub_text,
    b.main_text_1,
    b.main_text_2,
    b.main_text_3,
    b.sub_text_1,
    b.sub_text_2,
    b.sub_text_3,
    b.image_guidance,
  ].filter(Boolean).join(" ");
}

function diversityFacets(brief: GenBrief): Record<DiversityFacet, string> {
  const cd = brief.creative_direction || ({} as GenBrief["creative_direction"]);
  return {
    opener: firstBodyParagraph(brief),
    angle: [cd.angle, cd.framework, cd.branch, cd.brief_route, cd.differentiator].filter(Boolean).join(" "),
    heroStory: heroStorySurface(brief),
    subjectLines: subjectSurface(brief),
  };
}

function tokenNgrams(text: string, n = 2): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9{}]+/g, " ").split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return new Set();
  if (words.length < n) return new Set(words);
  const out = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

function jaccardDistance(a: string, b: string): number {
  const left = tokenNgrams(a);
  const right = tokenNgrams(b);
  if (!left.size && !right.size) return 0;
  let intersection = 0;
  left.forEach((item) => {
    if (right.has(item)) intersection++;
  });
  const union = left.size + right.size - intersection;
  return union ? 1 - intersection / union : 0;
}

function roundMetric(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function computeDiversitySet(briefs: GenBrief[]): DiversitySetResult {
  const facets = briefs.map(diversityFacets);
  const totals: Record<DiversityFacet, number> = { opener: 0, angle: 0, heroStory: 0, subjectLines: 0 };
  let pairs = 0;
  for (let i = 0; i < facets.length; i++) {
    for (let j = i + 1; j < facets.length; j++) {
      pairs++;
      (Object.keys(totals) as DiversityFacet[]).forEach((facet) => {
        totals[facet] += jaccardDistance(facets[i][facet], facets[j][facet]);
      });
    }
  }
  const facetMeans = (Object.keys(totals) as DiversityFacet[]).reduce((acc, facet) => {
    acc[facet] = roundMetric(pairs ? totals[facet] / pairs : 0);
    return acc;
  }, {} as Record<DiversityFacet, number>);
  const meanDistance = roundMetric(
    ((Object.values(facetMeans).reduce((a, b) => a + b, 0)) / (Object.keys(facetMeans).length || 1))
  );
  return { count: briefs.length, pairs, meanDistance, facetMeans };
}

function hardComplianceIssues(brief: GenBrief, campaign: Campaign, products: Product[]): string[] {
  const validated = validateBrief(cloneBrief(brief), campaign, products);
  return (validated._flags || [])
    .filter((f) => f.type === "error" || /spam word|opt-out risk|possibly invented proof|review looks invented|subject over hard cap|repeats \{\{first_name\}\}|missing \{\{first_name\}\}|body contains \{\{first_name\}\}|missing required field/i.test(f.msg))
    .map((f) => f.msg);
}

export function runDiversityEval(
  intraCampaignBriefs: GenBrief[] = [strongBrief(), alternateStrongBrief()],
  interCampaignBriefs: GenBrief[] = [strongBrief(), alternateStrongBrief(), visualStrongBrief()]
): DiversityResult {
  const { campaign, products } = goldenCampaign();
  const all = [...intraCampaignBriefs, ...interCampaignBriefs];
  const compliancePassed = all.filter((brief) => hardComplianceIssues(brief, campaign, products).length === 0).length;
  const complianceTotal = all.length;
  const compliancePassRate = complianceTotal ? roundMetric(compliancePassed / complianceTotal) : 1;
  const notes: string[] = [];
  if (compliancePassRate < 1) notes.push("One or more diversity fixtures failed a hard compliance check");
  return {
    intraCampaign: computeDiversitySet(intraCampaignBriefs),
    interCampaign: computeDiversitySet(interCampaignBriefs),
    compliancePassRate,
    compliancePassed,
    complianceTotal,
    pass: compliancePassRate === 1,
    notes,
  };
}

// ---- quality-overhaul acceptance checks ----
export interface QualityOverhaulCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface QualityOverhaulResult {
  pass: boolean;
  checks: QualityOverhaulCheck[];
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringValues);
  return [];
}

function copySurface(value: unknown): string {
  return stringValues(value).join("\n");
}

function redactTagsAndUrls(text: string): string {
  return text
    .replace(/\{\{.*?\}\}/g, "")
    .replace(/https?:\/\/[^\s)\]}>"']+/gi, "");
}

function check(name: string, pass: boolean, detail: string): QualityOverhaulCheck {
  return { name, pass, detail };
}

export function runQualityOverhaulEval(): QualityOverhaulResult {
  const { campaign, products } = goldenCampaign();
  const checks: QualityOverhaulCheck[] = [];

  const promoInput = "Deal: $12.99 + 80% off for {{first_name}}. See https://example.com/a?$keep=1. free! act now";
  const promoOnce = sanitizeCopy(promoInput, "bra_goddess");
  const promoTwice = sanitizeCopy(promoOnce, "bra_goddess");
  checks.push(check(
    "promo sanitizer is idempotent and URL-safe",
    promoOnce === promoTwice &&
      promoOnce.includes("💲12.99") &&
      promoOnce.includes("80% o.f.f") &&
      promoOnce.includes("https://example.com/a?$keep=1") &&
      !/\$\d/.test(redactTagsAndUrls(promoOnce)),
    promoOnce
  ));

  const sanitizedBrief = cloneBrief(strongBrief());
  sanitizedBrief.subject_lines.seg_21.subject = "Your Daisy is $12.99, {{first_name}}";
  sanitizedBrief.banner.main_text_3 = "80% OFF ends tonight";
  sanitizedBrief.body.seg_21 += "\n\nFree! Act now for $12.99.";
  applySanitizeCopy(sanitizedBrief, campaign.brandId);
  checks.push(check(
    "brief sanitizer covers generated copy surfaces",
    !/\$\d/.test(redactTagsAndUrls(copySurface({
      subject_lines: sanitizedBrief.subject_lines,
      banner: sanitizedBrief.banner,
      body: sanitizedBrief.body,
      ps: sanitizedBrief.ps,
      products: sanitizedBrief.products,
    }))) && /💲12\.99/.test(copySurface(sanitizedBrief)),
    "subject, banner, body, P.S., and products scanned"
  ));

  const leaky = cloneBrief(strongBrief());
  leaky.body.base = "ZONE 1\nseg_71\nSERIOUS QA flag\nheadline_winner\nGenerated later by segment patch.";
  leaky.subject_lines.seg_21.model_hint = "Claude strategic";
  leaky.subject_lines.seg_21.options = [
    { style: "Gemini curiosity", model_hint: "Gemini curiosity", subject: "Three seconds, {{first_name}}", preheader: "Daisy is 💲12.99", shared_thread: "Daisy" },
  ];
  const deliverableSurface = copySurface(toDeliverableBrief(leaky));
  checks.push(check(
    "deliverable brief hides scaffolding and provider labels",
    !/(ZONE|seg_\d|SERIOUS|QA flag|headline_winner|Claude|Gemini|ChatGPT|generated later|segment patch)/i.test(deliverableSurface),
    "string values scanned after toDeliverableBrief"
  ));

  const repeatedOffer = cloneBrief(strongBrief());
  repeatedOffer.body.seg_21 = "Daisy is 💲12.99. The Daisy price is 💲12.99. Tonight only, 💲12.99 plus free shipping. Free shipping makes it easier.";
  const repeatedValidated = validateBrief(repeatedOffer, campaign, products);
  checks.push(check(
    "offer repetition is a hard body-quality gate",
    (repeatedValidated._flags || []).some((f) => f.type === "error" && /repeats price\/discount/i.test(f.msg)),
    (repeatedValidated._flags || []).map((f) => f.msg).join(" | ")
  ));

  const priceWarnings = analyzeProductPriceOutliers([
    { slug: "a", name: "Normal A", price: "29.99" },
    { slug: "b", name: "Normal B", price: "32.99" },
    { slug: "c", name: "ArcticMove", price: "4.00" },
  ]);
  checks.push(check(
    "price outliers surface before sending",
    priceWarnings.some((warning) => warning.product.name === "ArcticMove"),
    priceWarnings.map((warning) => warning.message).join(" | ")
  ));

  const concepts = selectEmailConceptPair(campaign, products);
  const diff = conceptDifferenceCount(concepts.a, concepts.b);
  checks.push(check(
    "concept selector forces A/B idea divergence",
    diff >= 3,
    `difference axes: ${diff}; A=${JSON.stringify(concepts.a)}; B=${JSON.stringify(concepts.b)}`
  ));
  checks.push(check(
    "concept selector assigns different lead techniques",
    !!concepts.a.techniquePlan?.lead &&
      !!concepts.b.techniquePlan?.lead &&
      concepts.a.techniquePlan.lead !== concepts.b.techniquePlan.lead,
    `A=${concepts.a.techniquePlan?.lead || "missing"}; B=${concepts.b.techniquePlan?.lead || "missing"}`
  ));

  const strongValidated = validateBrief(cloneBrief(strongBrief()), campaign, products);
  const weakValidated = validateBrief(cloneBrief(weakBrief()), campaign, products);
  checks.push(check(
    "technique coverage rewards playbook execution",
    (strongValidated._technique_score || 0) >= 80 &&
      (strongValidated._technique_score || 0) > (weakValidated._technique_score || 0) + 25,
    `strong=${strongValidated._technique_score}; weak=${weakValidated._technique_score}; strong notes=${strongValidated._technique_coverage?.notes.join(" | ") || "none"}`
  ));
  const promptTokens = estimateTokens(buildSystemPrompt(campaign, products, false, undefined, "eval", concepts.a));
  checks.push(check(
    "layered system prompt stays under regression budget",
    promptTokens <= 10_000,
    `system prompt ~= ${promptTokens} tokens`
  ));
  const glBrand = BRANDS.gents_lux;
  const glCampaign: Campaign = {
    ...campaign,
    brandId: "gents_lux",
    layout: glBrand.layout,
    segments: [glBrand.productSegments[0]?.code || "1"],
    theme: "June movement refresh",
    offerType: "sitewide_pct",
    offerValue: "70% OFF",
    offer: "70% OFF + Free shipping 💲35+",
  };
  const valueTipIds = Array.from({ length: 4 }, (_, i) =>
    selectTechniquePlan({ ...glCampaign, sendDate: `2026-06-${20 + i}`, theme: `${glCampaign.theme} ${i}` }, { nonce: `eval-${i}` }).valueTipId
  ).filter(Boolean);
  checks.push(check(
    "GentsLux value tips rotate across sends",
    new Set(valueTipIds).size >= 3,
    valueTipIds.join(", ")
  ));
  checks.push(check(
    "creative score distinguishes useful story from formulaic sales copy",
    (strongValidated._creative_score || 0) > (weakValidated._creative_score || 0) &&
      (weakValidated._creative_score || 0) < 70,
    `strong=${strongValidated._creative_score}; weak=${weakValidated._creative_score}`
  ));

  const twinIssues = briefContrastIssues(strongBrief(), cloneBrief(strongBrief()));
  checks.push(check(
    "A/B twin detector catches same-idea variants",
    twinIssues.some((issue) => /same hero product|openers share|body copy shares|opener mechanics/i.test(issue)),
    twinIssues.join(" | ")
  ));

  return { pass: checks.every((item) => item.pass), checks };
}

/** Score one raw email by wrapping its subject/body in a minimal brief and running the scorer. */
export function scoreRawEmail(email: RawEmail): CorpusEmailScore {
  const pseudo = {
    subject_lines: { seg_corpus: { subject: email.subject, preheader: "" } },
    banner: {},
    body: { base: email.bodyText || "" },
    products: [],
    quality_checks: {},
  } as unknown as GenBrief;
  const r = analyzeDeliverability(pseudo);
  return { name: email.name, subject: email.subject, score: r.score, grade: r.grade };
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/**
 * Calibrate the deliverability scorer against the team's real win/fail corpus. The key guard: the
 * scorer must not reject (grade F) emails the team shipped as winners, and winners should trend at
 * or above failures (tolerance for noise — both sets are crafted by the same disciplined team).
 */
export function calibrateCorpus(winEmails: RawEmail[], failEmails: RawEmail[]): CorpusResult {
  const winners = winEmails.map(scoreRawEmail);
  const fails = failEmails.map(scoreRawEmail);
  const winnersMean = avg(winners.map((w) => w.score));
  const failsMean = avg(fails.map((f) => f.score));
  const falsePositives = winners.filter((w) => w.grade === "F");
  const reasons: string[] = [];
  if (falsePositives.length) reasons.push(`${falsePositives.length} shipped winner(s) graded F by the scorer (false positives)`);
  if (winnersMean < failsMean - 3) reasons.push(`winners mean (${winnersMean}) is more than 3pts below fails mean (${failsMean})`);
  return {
    winners,
    fails,
    winnersMean,
    failsMean,
    separation: Math.round((winnersMean - failsMean) * 10) / 10,
    falsePositives,
    pass: reasons.length === 0,
    reasons,
  };
}
