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
import { validateBrief, type GenBrief } from "../briefgen";
import type { Campaign, Product } from "../config/types";
import { analyzeDeliverability, type DeliverabilityReport } from "./deliverability";

// ---- shared fixture campaign ----
export function goldenCampaign(): { campaign: Campaign; products: Product[] } {
  const brand = BRANDS.bra_goddess;
  const products = [brand.catalog[0], brand.catalog[1], brand.catalog[2], brand.catalog[3]]; // daisy, posy, sona, activa
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
        "My neighbor Dorothy mentioned the underwire digging in by noon — the exact thing I hear about most from women I talk to. So I wanted you to see the [Daisy Bra 3](slug:daisybra) before the weekend, while it's still at this price.\n\n" +
        "It snaps shut in front in about three seconds, then the ==wire-free lift== quietly does the rest — no reaching behind your back, no red marks at the end of a long day, no fidgeting under your clothes. Dorothy told me she now reaches for hers over everything else in the drawer, and honestly that's the review I trust most.\n\n" +
        "It's **💲12.99** through the next two days, and shipping is on us once you pass 💲35. Take a look while it's still open — I think you'll feel the difference the first time you put it on.\n\n— Sandra",
      seg_21:
        "My neighbor Dorothy mentioned the underwire digging in by noon — the exact thing I hear about most from women I talk to. So I wanted you to see the [Daisy Bra 3](slug:daisybra) before the weekend, while it's still at this price.\n\n" +
        "It snaps shut in front in about three seconds, then the ==wire-free lift== quietly does the rest — no reaching behind your back, no red marks at the end of a long day, no fidgeting under your clothes. Dorothy told me she now reaches for hers over everything else in the drawer, and honestly that's the review I trust most.\n\n" +
        "It's **💲12.99** through the next two days, and shipping is on us once you pass 💲35. Take a look while it's still open — I think you'll feel the difference the first time you put it on.\n\n— Sandra",
    },
    ps: "P.S. The front snap is the part everyone messages me about — try it.",
    products: [
      { slot: 1, name: "Daisy Bra 3", template_style: "headline_winner", main_text: "3-second snap", sub_text: "Wire-free lift, just 💲12.99", popup_badge: "Bestseller", usps: ["Front snap closure", "Wire-free lift"], review: `"Forgot it's there!" — Helen R.`, cta: "Shop Daisy", main_image: "Front-on model in Daisy Bra", sub_image: "Snap closure close-up", alt_text: "Daisy Bra 3 wire-free front-snap bra", image_notes: "Keep snap visible, rose palette" },
      { slot: 2, name: "Posy Bra", template_style: "headline_winner", main_text: "Smooths the back", sub_text: "💲19.99, free ship over 💲35", popup_badge: "Repeat buy", usps: ["Front-hook ease", "Smoothing panel"], review: `"My 2nd order!" — Sharon M.`, cta: "Shop Posy", main_image: "Model in Posy Bra side view", sub_image: "Back smoothing panel detail", alt_text: "Posy Bra smoothing front-hook bra", image_notes: "Show back panel" },
      { slot: 3, name: "SonaShape", template_style: "headline_winner", main_text: "Invisible fit", sub_text: "💲19.99, ships free past 💲35", popup_badge: "Seamless", usps: ["Seamless fit", "Gentle lift"], review: `"Underwires? Never again." — Claire T.`, cta: "Shop Sona", main_image: "Model in SonaShape under tee", sub_image: "Seamless edge close-up", alt_text: "SonaShape seamless wire-free bra", image_notes: "Show invisibility under clothing" },
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
