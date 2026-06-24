/**
 * Playbook rules encoded as typed config.
 *
 * Source of truth: docs/email-campaign-playbook.html — Part 1, 22 Execution Rules.
 * Also informed by validation logic in lib/briefgen.ts.
 *
 * Usage:
 *   rulesForBrand("gents_lux")  → all ALL-scoped rules + GL-specific
 *   promptRuleBlock("bra_goddess", "prompt")  → newline-joined DO lines for prompt injection
 */

type BrandId = "bra_goddess" | "gents_lux" | "lux_fitting" | "santa_fare";

export interface PlaybookRule {
  id: string;       // "R1", "R2", …, "R22"
  name: string;     // short human label, e.g. "Hook contract"
  scope: "ALL" | BrandId[];  // which brands it applies to
  win: string;      // terse ≤25-word DO instruction (prompt-ready)
  fail: string;     // terse ≤20-word DON'T (prompt-ready)
  enforce?: "prompt" | "validate" | "both";
}

export const PLAYBOOK_RULES: PlaybookRule[] = [
  // ── A. Message Promise ───────────────────────────────────────────────
  {
    id: "R1",
    name: "Hook contract",
    scope: "ALL",
    win: "Lock one promise first: segment insight + emotion + hero product + price/proof + urgency + avoid rule. Generate subject lines last.",
    fail: "Deal-first copy, 'don't let X go to waste', or subject that the banner/body/grid does not fulfill.",
    enforce: "both",
  },
  {
    id: "R2",
    name: "Subject formula",
    scope: "ALL",
    win: "Brand formula + compact length: BG emotion+offer (45-55); GL curiosity+scarcity (48-58); LF sensory+price (44-56); SF suspended loop+urgency (42-56). Name in subject OR preheader, not both.",
    fail: "Over-stacked subjects with product+stat+discount+name; vague gratitude; off-theme puns; more than 2 emojis.",
    enforce: "both",
  },
  {
    id: "R3",
    name: "Preheader formula",
    scope: "ALL",
    win: "Add a new beat the subject did not reveal: deadline, price, proof, or scale. BG time pressure; GL offer reveal; LF tension escalation; SF reluctant deadline.",
    fail: "Repeating the subject, greeting the reader, generic gratitude, or grammar errors like 'Be hurry!'",
    enforce: "both",
  },
  {
    id: "R4",
    name: "Body opener + proof",
    scope: "ALL",
    win: "Rotate opener: direct problem, sensory snapshot, tip, quote, fact/question, occasion clock, or brief story. Artificial review/claim texture stays unlabeled, qualitative, and metric-free.",
    fail: "Always opening with story, bullet/checkmark opener, recycled feature bullets, fake verified review details, or unsupported factual proof.",
    enforce: "both",
  },
  {
    id: "R5",
    name: "Pain to relief",
    scope: "ALL",
    win: "Name a concrete pain, then the mechanism that relieves it: poor fit→support, stiff fabric→stretch, generic gift→personalization.",
    fail: "Feature dump without pain context; hyperbole like '10 years younger in 5 minutes'; unsupplied health outcomes.",
    enforce: "prompt",
  },
  // ── B. Offer, Product & Design ────────────────────────────────────────
  {
    id: "R6",
    name: "Hero lock",
    scope: "ALL",
    win: "Lead with proven hero: BG Daisy Bra/Daisy Bra 3+Posy; GL JettJeans/FlexCamo+IcyShorts; LF StretchActive first; SF Pouchic+TimelessMark.",
    fail: "Lower-converting items in position 1: BG Moona/UpLacy; GL SteelStitch/EaseMotions; LF StretchActive below fold; SF non-gifting in lead.",
    enforce: "validate",
  },
  {
    id: "R7",
    name: "Product count",
    scope: "ALL",
    win: "Use 4-6 products, even count, 2-up 282px cells, 27-35 total table rows. SF defaults to 4; other brands up to 6 max.",
    fail: "7+ products, 38+ rows, orphan final product cell, or catalog grid with no decision aid.",
    enforce: "validate",
  },
  {
    id: "R8",
    name: "Price/shipping/code",
    scope: ["bra_goddess", "gents_lux", "lux_fitting"],
    win: "Show specific price in subject/body/product blocks; mention free-shipping threshold. BG D-code beats S-code; GL F-code default; LF S-code beats G-code.",
    fail: "Vague percent-only discount, price hidden until click, omitted shipping threshold, or wrong promo code priority.",
    enforce: "both",
  },
  {
    id: "R9",
    name: "Offer repetition cap",
    scope: "ALL",
    win: "One hook, one angle per email. Avoid stacking season+birthday+discount+countdown in a single send.",
    fail: "Multiple unrelated urgency triggers (birthday + sale + countdown) or the same offer mechanic repeated in subject, banner, and body.",
    enforce: "validate",
  },
  {
    id: "R10",
    name: "CTA system",
    scope: "ALL",
    win: "One primary action, 2-4 words, action verb + object. Add one natural product-name hyperlink by paragraph 2; grid CTAs are secondary.",
    fail: "Full-sentence CTA, product name used as button text with no verb, image-only CTA, no inline body link, or multiple competing actions.",
    enforce: "both",
  },
  // ── C. Campaign & List Execution ─────────────────────────────────────
  {
    id: "R11",
    name: "Persona sign-off",
    scope: "ALL",
    win: "Sign body copy from the brand persona (BG: Sandra; GL: Jordan; LF: Adele; SF: Mary). Persona voice should feel personal, not promotional.",
    fail: "Missing persona sign-off, wrong persona for the brand, or persona used to pressure-sell instead of reassure.",
    enforce: "validate",
  },
  {
    id: "R12",
    name: "Emoji budget",
    scope: "ALL",
    win: "BG/GL: 0-1 leading emoji only; none in preheaders. SF/occasion: one emoji for gifting/seasonal sends, plain by default. LF: no emojis.",
    fail: "Double-stacked emojis, emojis in preheader, or more than 2 emojis total in any send.",
    enforce: "both",
  },
  {
    id: "R13",
    name: "No spam words",
    scope: "ALL",
    win: "Avoid deliverability killers. Write '$' as '💲', 'off' as 'o.f.f', 'SAVING' or spaced 'O.F.F' by brand.",
    fail: "Using: 'free!', 'winner', 'congratulations', 'click here', 'limited time offer', 'act now', or 'urgent'.",
    enforce: "validate",
  },
  {
    id: "R14",
    name: "No AI slop phrases",
    scope: "ALL",
    win: "Write in plain, specific, brand-voice language. Every sentence earns its place with a concrete benefit or proof detail.",
    fail: "Using: 'seamlessly', 'leverage', 'transformative', 'game-changer', 'elevate your', 'dive into', 'delve into', 'cutting-edge', or 'unlock the power'.",
    enforce: "validate",
  },
  {
    id: "R15",
    name: "No body/age shaming",
    scope: "ALL",
    win: "Frame fit and comfort as positive gains. Use brand-safe avoid terms only when they are part of the relief narrative.",
    fail: "Using: 'for older women', 'hide your', 'fix your body', 'anti aging', 'look younger', or 'flaws'.",
    enforce: "validate",
  },
  {
    id: "R16",
    name: "Trigger calendar priority",
    scope: "ALL",
    win: "Priority: Birthday > Back in Stock > Early Access > seasonal hook with product fit > generic blast. Keep 14+ days between same trigger to same audience.",
    fail: "Repeating a trigger within 2 weeks; Year End/Year in Review framing; SF spring/Easter without a gifting reason.",
    enforce: "prompt",
  },
  {
    id: "R17",
    name: "Segment matching",
    scope: "ALL",
    win: "Tailor copy to segment lifecycle: loyal buyers get recognition/early access; at-risk gets proof + friction removal; lapsed gets one low-risk return reason.",
    fail: "Identical copy to every segment, old segment IDs, loyalty buyers treated like cold leads, or lapsed pushed with hard-sell.",
    enforce: "prompt",
  },
  {
    id: "R18",
    name: "A/B structural contrast",
    scope: "ALL",
    win: "A and B must differ in ALL of: angle, framework, opener mechanic, body opening sentence, banner headline family, and product-grid pattern.",
    fail: "Synonym swaps or tone changes only; same paragraph structure, same route, same framework with different wording.",
    enforce: "validate",
  },
  // ── D. Funnel QA & Test Priority ─────────────────────────────────────
  {
    id: "R19",
    name: "No hard-sell commands",
    scope: "ALL",
    win: "Use soft urgency framed as practical guidance. Let the offer create urgency; the copy confirms and contextualizes it.",
    fail: "Using: 'act now', 'buy now', 'hurry', 'don't miss out', 'last chance', 'claim now', 'grab now', 'rush', or 'selling out'.",
    enforce: "validate",
  },
  {
    id: "R20",
    name: "No unsupplied proof",
    scope: "ALL",
    win: "Use supplied facts for verified proof; artificial review/claim texture may be qualitative only, or mark factual ideas as needs-verification notes.",
    fail: "Inventing verified labels, ratings, counts, ages, dates, medical outcomes, stock, shipping facts, or fake verified review details.",
    enforce: "validate",
  },
  {
    id: "R21",
    name: "Concision band",
    scope: "ALL",
    win: "Body: 120-150 words per segment. Subject: 42-58 chars target, hard cap 60. Preheader: 60-90 chars. P.S.: 10-15 words.",
    fail: "Body over 150 words, body under 100 words, subject over 60 chars, or preheader that cuts off mid-word on mobile.",
    enforce: "validate",
  },
  {
    id: "R22",
    name: "Value payoff",
    scope: "ALL",
    win: "Close with an educational or personal-recommendation beat that adds value beyond the offer — a tip, occasion frame, or use-case insight.",
    fail: "Pure offer restatement at close, generic gratitude, or a P.S. that just repeats the CTA with no new information.",
    enforce: "prompt",
  },
];

/** Return rules applicable to a given brand, in rule-ID order. */
export function rulesForBrand(brandId: string): PlaybookRule[] {
  return PLAYBOOK_RULES.filter(
    (r) => r.scope === "ALL" || (r.scope as string[]).includes(brandId)
  );
}

/** Return the terse win lines for rules matching a given enforce scope. */
export function promptRuleBlock(brandId: string, enforce: "prompt" | "both"): string {
  return rulesForBrand(brandId)
    .filter((r) => r.enforce === enforce || r.enforce === "both")
    .map((r) => `${r.id} ${r.name}: ${r.win}`)
    .join("\n");
}
