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

import type { Campaign } from "./types";
import { evergreenOccasions, occasionsInWindow } from "./occasions";
import { pickTip } from "./valueTips";

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

export interface TechniquePlan {
  /** Lead technique id (from TECHNIQUES). Exactly one per option. */
  lead: string;
  /** 0-2 seasoning technique ids that support the lead. */
  seasoning: string[];
  /** Always-on technique ids resolved for this brand. */
  alwaysOn: string[];
  /** Occasion id when the lead is occasion-led. */
  occasion?: string;
  occasionName?: string;
  punSeeds?: string[];
  /** Optional value-payoff line selected for this send. */
  valueTipId?: string;
  valueTip?: string;
}

export interface TechniqueSelectionOptions {
  isOptionB?: boolean;
  nonce?: string;
  /** Optional production-route branch. When supplied, the selector prefers its natural lead. */
  branch?: string;
  /** Leads already used by a paired option. B should avoid these where possible. */
  avoidLeadIds?: string[];
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

const ROUTE_TO_LEAD: Record<string, string> = {
  AB: "honor_vip",
  CD: "curiosity_gap",
  EF: "pain_relief",
  GH: "occasion",
  IJ: "ugc_story",
  KL: "fact_data",
};

const OPENER_TO_LEAD: Record<string, string> = {
  story: "ugc_story",
  fact: "fact_data",
  question: "curiosity_gap",
  occasion: "occasion",
  re_engagement: "honor_vip",
  insider_reveal: "honor_vip",
  direct_problem: "pain_relief",
};

const ANGLE_TO_LEAD: Record<string, string> = {
  proof: "fact_data",
  mechanism: "fact_data",
  offer: "direct_offer",
  reactivation: "honor_vip",
  "occasion/gift": "occasion",
  "pain relief": "pain_relief",
};

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function brandIdFor(campaign: Campaign): BrandId {
  return campaign.brandId as BrandId;
}

function recentLeadPenalty(campaign: Campaign, leadId: string): number {
  return (campaign.recentSendHistory || []).reduce((score, row) => {
    const openerLead = OPENER_TO_LEAD[String(row.openerMechanic || "").toLowerCase()];
    const angleLead = ANGLE_TO_LEAD[String(row.angle || "").toLowerCase()];
    const frameworkLead = ANGLE_TO_LEAD[String(row.framework || "").toLowerCase()];
    return score
      + (openerLead === leadId ? 3 : 0)
      + (angleLead === leadId ? 2 : 0)
      + (frameworkLead === leadId ? 1 : 0);
  }, 0);
}

function seededSortScore(seed: number, id: string, offset = 0): number {
  return hashSeed(`${seed}:${id}:${offset}`) % 997;
}

function selectLeadTechnique(campaign: Campaign, options: TechniqueSelectionOptions): string {
  const brandId = brandIdFor(campaign);
  const leads = techniquesForBrand(brandId, "lead").map((t) => t.id);
  const preferred = options.branch ? ROUTE_TO_LEAD[options.branch] : undefined;
  const avoid = new Set(options.avoidLeadIds || []);
  const pool = leads.filter((id) => !avoid.has(id));
  const candidates = pool.length ? pool : leads;
  const seed = hashSeed([
    campaign.brandId,
    campaign.sendDate,
    campaign.theme,
    campaign.offerValue,
    campaign.offerShipping,
    campaign.segments.join("|"),
    options.nonce || "",
    options.isOptionB ? "B" : "A",
  ].join("::"));

  return [...candidates]
    .sort((a, b) => {
      const scoreA =
        (preferred && a !== preferred ? 9 : 0) +
        recentLeadPenalty(campaign, a) +
        seededSortScore(seed, a, options.isOptionB ? 31 : 0) / 1000;
      const scoreB =
        (preferred && b !== preferred ? 9 : 0) +
        recentLeadPenalty(campaign, b) +
        seededSortScore(seed, b, options.isOptionB ? 31 : 0) / 1000;
      return scoreA - scoreB;
    })[0] || preferred || "honor_vip";
}

function selectOccasion(campaign: Campaign, brandId: BrandId, seed: number) {
  if (!campaign.sendDate) return undefined;
  const d = new Date(campaign.sendDate);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const pool = [...occasionsInWindow(month, day, brandId), ...evergreenOccasions(brandId)];
  if (!pool.length) return undefined;
  return pool[seed % pool.length];
}

/**
 * Select the creative technique mix for one generated option. This is deliberately compact:
 * one lead, up to two seasoning moves, and always-on texture. The prompt can still be creative
 * inside those rails.
 */
export function selectTechniquePlan(
  campaign: Campaign,
  options: TechniqueSelectionOptions = {}
): TechniquePlan {
  const brandId = brandIdFor(campaign);
  const seed = hashSeed([
    campaign.brandId,
    campaign.sendDate,
    campaign.theme,
    campaign.offerValue,
    campaign.offerShipping,
    campaign.segments.join("|"),
    options.nonce || "",
    options.branch || "",
    options.isOptionB ? "B" : "A",
  ].join("::"));
  const lead = selectLeadTechnique(campaign, options);

  let occasion: string | undefined;
  let occasionName: string | undefined;
  let punSeeds: string[] | undefined;
  if (lead === "occasion") {
    const occ = selectOccasion(campaign, brandId, seed);
    if (occ) {
      occasion = occ.id;
      occasionName = occ.name;
      if (occ.pun_seeds.length) punSeeds = occ.pun_seeds;
    }
  }

  const brandSeasoning = techniquesForBrand(brandId, "seasoning");
  const seasoning: string[] = [];
  const addSeasoning = (id: string) => {
    if (seasoning.length < 2 && brandSeasoning.some((t) => t.id === id) && id !== lead && !seasoning.includes(id)) {
      seasoning.push(id);
    }
  };

  if (!["fomo_scarcity", "direct_offer"].includes(lead)) addSeasoning("fomo_scarcity");
  if (lead !== "curiosity_gap") addSeasoning("question_hook");
  if (punSeeds?.length) addSeasoning("pun_wordplay");
  if (seasoning.length < 2 && seed % 3 === 0) addSeasoning("numbered_list");
  if (seasoning.length < 2 && seed % 5 === 0) addSeasoning("trend_tiein");

  const alwaysOn = techniquesForBrand(brandId, "always_on").map((t) => t.id);
  const recentTipIds = (campaign.recentSendHistory || [])
    .flatMap((row) => [row.visualPattern, row.emotionalArc, row.openerMechanic])
    .filter((v): v is string => !!v && /^[-_a-z0-9]+$/i.test(v));
  const valueTip = pickTip(brandId, `${seed}:${options.nonce || ""}`, recentTipIds);

  return {
    lead,
    seasoning,
    alwaysOn,
    occasion,
    occasionName,
    punSeeds,
    valueTipId: valueTip?.id,
    valueTip: valueTip?.text,
  };
}

/** Compact prompt fragment for the selected technique plan. */
export function techniquePlanPrompt(plan: TechniquePlan): string {
  const leadTech = getTechnique(plan.lead);
  const seasoningTechs = plan.seasoning.map((id) => getTechnique(id)).filter(Boolean);
  const alwaysOnTechs = plan.alwaysOn.map((id) => getTechnique(id)).filter(Boolean);
  const lines: string[] = [];

  if (leadTech) {
    lines.push(`Lead technique (ONE hook only): ${leadTech.rule}`);
    const exemplars = leadTech.exemplars.slice(0, 2);
    if (exemplars.length) lines.push(`Exemplars: ${exemplars.map((e) => `"${e}"`).join(" | ")}`);
  }
  if (plan.occasionName) {
    lines.push(`Occasion: ${plan.occasionName}`);
    if (plan.punSeeds?.length) lines.push(`Pun seeds: ${plan.punSeeds.slice(0, 3).join("; ")}`);
  }
  if (seasoningTechs.length) {
    lines.push(`Seasoning (0-2; only if useful): ${seasoningTechs.map((t) => t?.rule).filter(Boolean).join(" | ")}`);
  }
  if (alwaysOnTechs.length) {
    lines.push(`Always-on texture: ${alwaysOnTechs.map((t) => t?.rule).filter(Boolean).join(" | ")}`);
  }
  if (plan.valueTip) {
    lines.push(`Value payoff seed: ${plan.valueTip}`);
  }
  return lines.join("\n");
}

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
