// Performance intelligence — per-brand benchmarks, hero pools, page winners, and the
// subject/body/visual rules + avoid-lists distilled from the RMKT analysis. Injected into the
// generation prompt as decision support (never shown to recipients) and surfaced in the UI.

export const PROGRAM_INTELLIGENCE = {
  period: "Nov 2025 – May 2026",
  pageFunnel: {
    sample: "1,101 page rows (Nov 2025 – Apr 2026)",
    bestMonth: "Mar 2026: 10.84% purchase/access",
    latestMonth: "Apr 2026: 10.16% purchase/access",
    insight:
      "The page funnel improved after the click; focus on earning cleaner clicks and matching the product-page promise.",
  },
  templateSignal: {
    winShape: "A compact personal-note arc: one concrete reader moment, one product reason, exact offer, short CTA.",
    failShape: "Stacked hooks, feature-list openings, broad gratitude, or crowded product rows that blur the click reason.",
    visualRule: "One hero product in the banner, high contrast, no busy multi-model collage.",
  },
};

export interface BrandIntelligence {
  headline: string;
  benchmark: string;
  target: string;
  heroes: string[];
  pageWinners: string[];
  subjectRule: string;
  bodyRule: string;
  visualRule: string;
  avoid: string[];
}

// Keyed by our brand ids (lib/config/brands.ts).
export const BRAND_INTELLIGENCE: Record<string, BrandIntelligence> = {
  bra_goddess: {
    headline: "Large list with click-stage fatigue; post-click conversion is still strong.",
    benchmark: "May CTR 0.84%; Access/Delivered 0.382%; PO/Access 10.03%; Optout/Delivered 0.375%",
    target: "Rebuild the click reason without broadening the list.",
    heroes: ["Daisy Bra", "Posy Bra", "ZipLacy", "SonaShape", "Moona Bra"],
    pageWinners: ["Daisy Bra 11.51% PO/access", "Posy Bra 11.67%", "ZipLacy 11.55%", "SonaShape 11.36%"],
    subjectRule: "Emotion or price first, offer second; avoid generic gratitude and \"go to waste\".",
    bodyRule: "Named mature-woman micro-story → specific comfort/lift relief → exact price → CTA above first scroll.",
    visualRule: "Pastel pink or deep crimson; one smiling mature model; one hero product; no busy collage.",
    avoid: ["feature-bullet opener", "lower-converting hero without reason", "generic thank-you arc", "too much review text", "go to waste"],
  },
  gents_lux: {
    headline: "Breakout access trend, but high optout demands tighter relevance.",
    benchmark: "May CTR 1.88%; Access/Delivered 0.968%; PO/Access 8.85%; Optout/Delivered 0.521%",
    target: "Keep high-value segment discipline and premium product proof.",
    heroes: ["JettJeans", "FlexCamo", "StretchMotions", "IcyShorts", "TimelessFlex"],
    pageWinners: ["StretchMotions 11.99% PO/access", "IcyShorts 12.12%", "FlexCamo/JettJeans page-version dependent"],
    subjectRule: "Curiosity or scarcity with restraint; do not over-explain the product in the subject.",
    bodyRule: "Named male testimonial → practical movement/weather pain → premium utility proof → direct CTA.",
    visualRule: "Deep navy, strong contrast, product depth/shadow; one main product plus supporting detail shots.",
    avoid: ["premature seasonal pivot", "hyperbole like 10 years younger", "grammar errors", "too many products in banner", "generic thank-you arc"],
  },
  lux_fitting: {
    headline: "Volatile access; April worked when product/theme fit was clear.",
    benchmark: "May CTR 0.80%; Access/Delivered 0.386%; PO/Access 8.62%; Optout/Delivered 0.258%",
    target: "Use a sensory product promise and stop hook stacking.",
    heroes: ["StretchActive", "Icy Shorts", "SoftyGrace", "AiryGrace", "LinenGlam"],
    pageWinners: ["StretchActive top single-page result (Mar)", "Icy Shorts top single-page (Mar)", "SoftyGrace 11.47% aggregate"],
    subjectRule: "Sensory phrase + price anchor; one hook only.",
    bodyRule: "Single seasonal/body comfort problem → pant or short relief → price proof → CTA.",
    visualRule: "Happy mature full-body model; readable main text; clear product/USP separation; no color-strip clutter.",
    avoid: ["spring + birthday + countdown stacking", "7+ product rows", "thin hard-to-read banner type", "split CTA", "generic thank-you arc"],
  },
  santa_fare: {
    headline: "Seasonal brand; March collapse supports pause until November.",
    benchmark: "Mar CTR 0.65%; Access/Delivered 0.250%; PO/Access 5.54%; Optout/Delivered 0.633%",
    target: "Do not force off-season urgency; use a gift lifecycle angle if a send is unavoidable.",
    heroes: ["BygoneMark", "Pouchic", "TimelessMark", "Snowflake"],
    pageWinners: ["BygoneMark 14.07% PO/access", "Pouchic 12.39%", "TimelessMark top CBH margin"],
    subjectRule: "Gift narrative or unresolved loop; deadline only when true.",
    bodyRule: "Specific recipient story → personalized object → gifting moment → short CTA.",
    visualRule: "Heritage red, real usage or large product image, personalized proof, minimal text.",
    avoid: ["off-season campaign before November", "pink/off-brand accent", "long CTA", "generic discount-only hook"],
  },
};

export function getBrandIntelligence(brandId: string): BrandIntelligence | null {
  return BRAND_INTELLIGENCE[brandId] || null;
}

/** Condensed intelligence block for injecting into a generation prompt. */
export function intelligencePromptBlock(brandId: string): string {
  const intel = BRAND_INTELLIGENCE[brandId];
  if (!intel) return "";
  return `PERFORMANCE INTELLIGENCE (decision support only — never expose these metrics to customers):
Period: ${PROGRAM_INTELLIGENCE.period}. Winning arc shape (abstract, not a copy template): ${PROGRAM_INTELLIGENCE.templateSignal.winShape}
Fail shape to avoid: ${PROGRAM_INTELLIGENCE.templateSignal.failShape}
Brand read: ${intel.headline}
Benchmark: ${intel.benchmark}
Objective: ${intel.target}
Proven hero pool: ${intel.heroes.join(" | ")}
Page winners: ${intel.pageWinners.join(" | ")}
Subject rule: ${intel.subjectRule}
Body structural arc (use as a guide for narrative progression, not a verbatim script — vary the phrasing and entry point): ${intel.bodyRule}
Visual rule: ${intel.visualRule}
Avoid: ${intel.avoid.join(" | ")}`;
}
