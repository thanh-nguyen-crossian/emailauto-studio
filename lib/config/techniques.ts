/**
 * Technique taxonomy for EmailAuto Studio.
 *
 * 19 creative techniques across three layers:
 *   - always_on  (7) — texture present on every send
 *   - lead       (8) — exactly 1 per send, rotated; A and B must differ
 *   - seasoning  (4) — 0–2 per send, only when they serve the lead
 *
 * Used by:
 *   - lib/briefgen.ts  — inject selected technique + exemplar into system prompt
 *   - lib/concept.ts   — pick a lead technique per send
 *   - validateBrief    — check coverage
 */

export type TechLayer = "always_on" | "lead" | "seasoning";

export type BrandId =
  | "bra_goddess"
  | "gents_lux"
  | "lux_fitting"
  | "santa_fare";

export interface Technique {
  /** snake_case identifier, e.g. "ugc_story" */
  id: string;
  layer: TechLayer;
  /** ≤20-word terse directive, prompt-ready */
  rule: string;
  /** 2–3 verbatim-style lines, brand-tagged in brackets */
  exemplars: string[];
  /** If omitted, applies to all brands */
  brands?: BrandId[];
}

// ---------------------------------------------------------------------------
// ALWAYS-ON layer — texture on every send, never compete for the hook
// ---------------------------------------------------------------------------

const always_on: Technique[] = [
  {
    id: "personalization",
    layer: "always_on",
    rule: "Use {{first_name}} in greeting; segment copy names the reader's situation directly.",
    exemplars: [
      "[GentsLux] 'Hello, Dapper {{first_name}}! Thanks for your recent check-in.'",
      "[BraGoddess] 'Hi {{first_name}}! Did you know that 85% of women wear the wrong bra size?'",
      "[LuxFitting] '{{first_name}}, happy September! September brings birthdays, cozy fall days.'",
    ],
  },
  {
    id: "persona_warmth",
    layer: "always_on",
    rule: "Persona signs off every email by name; tone is friend-to-friend, never brand-to-customer.",
    exemplars: [
      "[GentsLux] 'Grab your savings before it's static, Jordan'",
      "[BraGoddess] 'Warm regards, Sandra — P.S. You deserve the best. Don't settle for less, {{first_name}}!'",
      "[SantaFare] 'Mary — thinking of you and hoping this brighten your day a little.'",
    ],
  },
  {
    id: "one_question",
    layer: "always_on",
    rule: "Embed exactly one genuine question to invite the reader in; never rhetorical stacks.",
    exemplars: [
      "[GentsLux] 'You know that feeling when your favorite comfortable pants finally give out?'",
      "[BraGoddess] 'Did you know that the average bra lasts 180 wears? Your collection requires a refresh.'",
      "[SantaFare] 'You know how sometimes the perfect gift just falls into your lap?'",
    ],
  },
  {
    id: "emoji_budget",
    layer: "always_on",
    rule: "0–1 emoji in body per brand policy; never in P.S.; emoji amplifies tone, not decoration.",
    exemplars: [
      "[GentsLux] '🔥 Discover these products below!' — single emoji, body opener only",
      "[LuxFitting] '🍂 Hello {{first_name}}, as the leaves change…' — seasonal, one use",
      "[BraGoddess] 'Friends don't let friends miss out on this!' — zero emoji; restraint is correct here",
    ],
  },
  {
    id: "power_verbs",
    layer: "always_on",
    rule: "Every CTA uses a verb+object pair: 'Grab your pair', 'Try it on', 'See for yourself'.",
    exemplars: [
      "[GentsLux] CTA: 'Try on!' — product card call-to-action",
      "[GentsLux] 'Grab your savings before it's static'",
      "[LuxFitting] 'Upgrade your closet' / 'Find your fit today'",
    ],
  },
  {
    id: "concision",
    layer: "always_on",
    rule: "Body 80–130 words (GentsLux) / 120–150 words (BraGoddess, LuxFitting) / 100–130 words (SantaFare).",
    exemplars: [
      "[GentsLux] 4-sentence body: occasion hook → product tie-in → social proof → CTA. ~100 words.",
      "[BraGoddess] 5-sentence body: greeting → fact → story → offer → sign-off. ~130 words.",
      "[SantaFare] 4-sentence body: scene-setting → named story → offer → urgency. ~115 words.",
    ],
  },
  {
    id: "value_payoff",
    layer: "always_on",
    rule: "Close with a useful micro-tip, fact, or styling note — GentsLux signature (#Tip); optional for others.",
    brands: ["gents_lux", "bra_goddess", "lux_fitting", "santa_fare"],
    exemplars: [
      "[GentsLux] '#QuickTip: For a quick sharp collar, try a hair straightener.'",
      "[GentsLux] '#Tip: Did you know most men update their wardrobe every 7 years? Let's make this year stand out.'",
      "[BraGoddess] '#Tip: Wear your bra on the loosest hook — as it stretches, move to the tighter ones.'",
    ],
  },
];

// ---------------------------------------------------------------------------
// LEAD layer — pick exactly 1 per send, rotate; A and B must differ
// ---------------------------------------------------------------------------

const lead: Technique[] = [
  {
    id: "occasion",
    layer: "lead",
    rule: "Open on a real calendar occasion; tie the product to it in ≤2 lines.",
    exemplars: [
      "[GentsLux] 'This National Radio Day, we're dialing in huge savings… Let our attire echo your everyday moments.'",
      "[LuxFitting] 'Celebrate International Moment of Laughter Day on April 14th with our latest collection.'",
      "[BraGoddess] 'Happy International Day of Friendship {{first_name}}! A comfy bra is like a supportive friend, lifting you up.'",
    ],
  },
  {
    id: "ugc_story",
    layer: "lead",
    rule: "Open with a named person's micro-story — friend, customer, or persona's family member.",
    exemplars: [
      "[GentsLux] 'That happened to my dad last month. He kept wearing worn-out trousers because he couldn't find anything that felt right.'",
      "[BraGoddess] 'Let us introduce you to Tracy. She battled discomfort until she experienced the magic of AmberLift — no more back pain.'",
      "[SantaFare] 'Margaret called me last week, practically bubbling with joy about the personalized pouch she got for her sister Barbara.'",
    ],
  },
  {
    id: "curiosity_gap",
    layer: "lead",
    rule: "Pose a curiosity gap the email body resolves; never state the answer in the subject line.",
    exemplars: [
      "[GentsLux] 'Did you know this sweetest way to say “I care”?' — subject teases; body delivers the gift idea.",
      "[BraGoddess] 'You're in for an exclusive mystery gift! Is that shipping on us? Monster-sized savings?' — subject: 'Happy Fri-yay'",
      "[SantaFare] 'Picture this: I'm on my porch, watching autumn unfold. It got me thinking about you…'",
    ],
  },
  {
    id: "fact_data",
    layer: "lead",
    rule: "Lead with a specific, surprising fact or number tied to the product or occasion.",
    exemplars: [
      "[GentsLux] 'Did you know that a man spends around 438,000 hours wearing clothing throughout his lifetime?'",
      "[BraGoddess] 'Did you know that 85% of women wear the wrong bra size? That could mean discomfort, lack of support, and more.'",
      "[BraGoddess] 'Did you know that bra sizes can change six times during a woman's life? Weight changes, pregnancy, and aging all play a role.'",
    ],
  },
  {
    id: "pain_relief",
    layer: "lead",
    rule: "Name a concrete pain the reader feels right now; show the product as the relief mechanism.",
    exemplars: [
      "[GentsLux] 'He kept wearing worn-out trousers because he couldn't find anything that felt right. (Sound familiar?) That's why we created our comfort-focused collection.'",
      "[BraGoddess] 'She once battled discomfort and constant adjustments — until she experienced the sheer magic of AmberLift.'",
      "[LuxFitting] 'Remember the joy of finding that ideal accessory? I felt the same way about our pants — they're like a personalized gift for your body.'",
    ],
  },
  {
    id: "honor_vip",
    layer: "lead",
    rule: "Frame the reader as special/chosen; offer is a private reward, not a broadcast.",
    exemplars: [
      "[GentsLux] 'We're truly grateful to have a solid customer like you. It seriously made our day to read how you're rocking our styles.'",
      "[BraGoddess] 'You deserve the best. Don't settle for less, {{first_name}}!'",
      "[SantaFare] 'I've set aside your size in everything — just for the next 24 hours. I didn't want you to miss out like my dad did.'",
    ],
  },
  {
    id: "fomo_scarcity",
    layer: "lead",
    rule: "Imply limited availability quietly — 'almost gone', 'last 24h', 'reserved for you'.",
    exemplars: [
      "[GentsLux] 'Last year's early access event sold out in 18 hours. This deal disappears at midnight.'",
      "[GentsLux] '#Tip: Grab it before it is gone 🎁'",
      "[BraGoddess] 'Friends don't let friends miss out on this! Enjoy up to 50% savings and 0-shipping-charge this Sunday.'",
    ],
  },
  {
    id: "direct_offer",
    layer: "lead",
    rule: "Lead with the price or offer itself as the news — only when the offer is genuinely exceptional.",
    exemplars: [
      "[GentsLux] 'For the next 24 hours only, everything in this collection is marked down to just $19.99!'",
      "[LuxFitting] 'I've found two clothing items that'll do just that — and they're just $14.99 each!'",
      "[SantaFare] 'Get up to 90% OFF Christmas Gifts and Decors at Factory Direct Pricing!'",
    ],
  },
];

// ---------------------------------------------------------------------------
// SEASONING layer — 0–2 per send, only when they serve the lead
// ---------------------------------------------------------------------------

const seasoning: Technique[] = [
  {
    id: "pun_wordplay",
    layer: "seasoning",
    brands: ["lux_fitting", "santa_fare"],
    rule: "Commit to one wordplay pattern tied to the occasion or product; brand must support puns.",
    exemplars: [
      "[LuxFitting] 'Hurry, {{first_name}}... tea-riffic 0-shipping and 20% savings await…'",
      "[LuxFitting] '3 Fresh Brew-tiful Fashion Delivered — 0-Shipping + Added 20% savings!'",
      "[SantaFare] '{{first_name}}, do you know these scary good deals?' / 'Grab monster-sized savings to-day.'",
    ],
  },
  {
    id: "numbered_list",
    layer: "seasoning",
    rule: "Use a specific number ('4 Sunday picks', '3 must-haves') to concretize variety.",
    exemplars: [
      "[GentsLux] '{{first_name}}, unveiling GentsLux: your 4 fresh styles await…'",
      "[BraGoddess] 'A-B-2-4-6 — 6 stunning dress+bra combos for graduation day.'",
      "[LuxFitting] '3 Spook-tacular markdowns + 50% savings'",
    ],
  },
  {
    id: "question_hook",
    layer: "seasoning",
    rule: "Open or close a paragraph with a direct question to the reader's lived experience.",
    exemplars: [
      "[GentsLux] 'You know that feeling when your favorite comfortable pants finally give out? (Sound familiar?)'",
      "[BraGoddess] 'Did you know that colors have a profound effect on our moods? Imagine slipping into one of these colorful bras.'",
      "[SantaFare] 'Did you know that 78% of seniors report feeling lonely during the holidays? That's why I'm reaching out.'",
    ],
  },
  {
    id: "trend_tiein",
    layer: "seasoning",
    rule: "Anchor the product to a trend, season, or cultural moment the reader recognizes.",
    exemplars: [
      "[GentsLux] 'As autumn approaches, let's bid summer a fond farewell and welcome the cozy vibes ahead. 🍂'",
      "[LuxFitting] 'Happy Earth Day {{first_name}}! Stylish and long-lasting, these pieces reduce our environmental impact while staying fashion forward.'",
      "[BraGoddess] 'Can you believe we're already knee-deep in 2024? Time flies — and your wardrobe deserves a refresh.'",
    ],
  },
];

// ---------------------------------------------------------------------------
// Combined export
// ---------------------------------------------------------------------------

export const TECHNIQUES: Technique[] = [
  ...always_on,
  ...lead,
  ...seasoning,
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** All techniques for a given layer. */
export function techniquesByLayer(layer: TechLayer): Technique[] {
  return TECHNIQUES.filter((t) => t.layer === layer);
}

/** Techniques available for a brand (brand-specific + all-brand). Optionally filter by layer. */
export function techniquesForBrand(
  brandId: BrandId,
  layer?: TechLayer
): Technique[] {
  return TECHNIQUES.filter(
    (t) =>
      (!t.brands || t.brands.includes(brandId)) &&
      (!layer || t.layer === layer)
  );
}

/** Find a technique by ID. Returns undefined if not found. */
export function getTechnique(id: string): Technique | undefined {
  return TECHNIQUES.find((t) => t.id === id);
}
