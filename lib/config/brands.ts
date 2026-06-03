import type { Brand } from "./types";

// BRANDS — per-brand identity from the EmailAuto Campaign Playbook (docs/email-campaign-playbook.html,
// v1.3) + docs/email-template-analysis.md. Personas, corrected segment IDs, subject/urgency/preheader
// formulas, and hero products all encode confirmed WIN patterns from 46 .eml templates.
//
// Hero images use a per-brand placeholder path; the studio lets the marketer override per campaign.

export const BRANDS: Record<string, Brand> = {
  bra_goddess: {
    id: "bra_goddess",
    name: "BraGoddess",
    domain: "bragoddess.com",
    layout: "narrative",
    accent: "#c12a4e",
    accentRange: ["#a02338", "#d63268"],
    heroSlug: "daisy-bra",
    heroImage: "https://bragoddess.com/email/hero.jpg",
    logoImage: "https://bragoddess.com/email/logo.png",
    persona: "Sandra",
    voice:
      "Warm, first-person from Sandra. Opens with a named-person micro-story (a neighbor, friend, or sister) tied to a specific comfort/confidence moment, names a real pain (shoulder marks, poor fit, back ache), then bridges to the product as the natural relief. Social proof woven into narrative, never a standalone statistic. Never opens with a feature/checkmark bullet list.",
    subjectFormula: "Emotion-first + offer second. e.g. \"[Emotional state], {{first_name}}, [price/% + product hint]\".",
    subjectMax: 55,
    urgencyType: "Soft social + time — \"someone just grabbed theirs\", \"tonight only\", \"before midnight\". Never hard sales pressure.",
    preheaderFormula: "Add time pressure or supplied social proof not in the subject, e.g. \"'Til Midnight ⚡\".",
    offSymbol: "o.f.f",
    freeShipThreshold: "35",
    defaultProductCount: 6,
    productSegments: [
      {
        code: "21",
        label: "Bralettes / Comfort",
        guidance:
          "Daily comfort seekers — loyal, high-frequency buyers. Acknowledge the ritual of a bra that makes life easier; speak to first-look access and the update they deserve.",
      },
      {
        code: "22",
        label: "Contour / Push-Up",
        guidance:
          "Structure/shape-focused buyers — they want lift, support, confidence. Name the exact shape goal; bridge to styles that elevate what they already love.",
      },
      {
        code: "45",
        label: "Shapers & Panties",
        guidance:
          "Infrequent add-on buyers — they complete the set. Cross-sell: \"your wardrobe is almost complete\"; suggest a specific pairing.",
      },
      {
        code: "8",
        label: "Sleepwear & Tights",
        guidance:
          "Comfort-first lifestyle buyers — prioritize softness. Bridge from sleepwear comfort language to everyday bra comfort.",
      },
      {
        code: "3",
        label: "Strapless / Special Occasion",
        guidance:
          "Special-occasion buyers — bought for a moment or outfit. Acknowledge the occasion; bridge to the next event; urgency is event-driven, not generic time pressure.",
      },
    ],
    catalog: [
      { slug: "daisy-bra", name: "Daisy Bra", segment: "21", price: "12.99", hero: true },
      { slug: "posy", name: "Posy", segment: "21", price: "13.99" },
      { slug: "ziplacy", name: "ZipLacy", segment: "21", price: "14.99" },
      { slug: "bustella", name: "Bustella", segment: "22", price: "14.98" },
      { slug: "zenalift", name: "ZenaLift", segment: "22", price: "16.99" },
      { slug: "uplacy", name: "UpLacy", segment: "45", price: "9.99" },
      { slug: "silk-brief", name: "Silk Brief", segment: "45", price: "8.99" },
      { slug: "cloud-tight", name: "Cloud Tight", segment: "8", price: "11.99" },
      { slug: "dream-strapless", name: "Dream Strapless", segment: "3", price: "17.99" },
    ],
  },

  gents_lux: {
    id: "gents_lux",
    name: "GentsLux",
    domain: "gentslux.com",
    layout: "simple",
    accent: "#013a63",
    accentRange: ["#002850", "#1d3d56"],
    heroSlug: "jettjeans",
    heroImage: "https://gentslux.com/email/hero.jpg",
    logoImage: "https://gentslux.com/email/logo.png",
    persona: "Jordan",
    voice:
      "Premium, masculine, restrained, first-person from Jordan — direct and confident, no over-effusive sign-off. Curiosity-gap opener that withholds the offer; uses a named male testimonial tied to a physical pain point (stiff knees, restricted movement). Impeccable grammar — a single error destroys the premium positioning.",
    subjectFormula: "Curiosity + scarcity; name mid-subject. e.g. \"{{first_name}}, [incomplete thought about discovery]...\". Offer implied, revealed in preheader.",
    subjectMax: 58,
    urgencyType: "Fear of loss + scarcity — \"limited stock\", \"ends tonight\", \"this price won't repeat\". Confident, not desperate.",
    preheaderFormula: "Reveal the offer scale + urgency the subject withheld, e.g. \"24 hours. The lowest prices in GentsLux history.\".",
    offSymbol: "o.f.f",
    freeShipThreshold: "50",
    defaultProductCount: 6,
    productSegments: [
      {
        code: "71",
        label: "Men's Tops",
        guidance:
          "Frequent tops buyers — they return regularly. Acknowledge style consistency; make the case the bottoms complete what they already own. Wardrobe completion, not isolated purchase.",
      },
      {
        code: "72",
        label: "Men's Bottoms",
        guidance:
          "Premium pants buyers — high value, high churn risk. Speak to fit specificity, durability data, and exactly how these differ from what they have.",
      },
      {
        code: "73",
        label: "Men's Others",
        guidance:
          "Lapsed or peripheral buyers — bought something small/non-core. Step them up to the flagship; lead with one compelling reason and remove risk via guarantee + easy returns.",
      },
    ],
    catalog: [
      { slug: "jettjeans", name: "JettJeans", segment: "72", price: "29.99", hero: true },
      { slug: "flexcamo", name: "FlexCamo", segment: "72", price: "27.99", hero: true },
      { slug: "icy-shorts", name: "Icy Shorts", segment: "72", price: "19.99" },
      { slug: "steelstitch", name: "SteelStitch", segment: "72", price: "32.99" },
      { slug: "easemotions", name: "EaseMotions", segment: "72", price: "24.99" },
      { slug: "northpeak-tee", name: "NorthPeak Tee", segment: "71", price: "16.99" },
      { slug: "ridge-henley", name: "Ridge Henley", segment: "71", price: "21.99" },
      { slug: "leather-belt", name: "Leather Belt", segment: "73", price: "14.99" },
    ],
  },

  lux_fitting: {
    id: "lux_fitting",
    name: "LuxFitting",
    domain: "luxfitting.com",
    layout: "simple",
    accent: "#f2305f",
    accentRange: ["#e7324a", "#fe397b"],
    heroSlug: "stretchactive",
    heroImage: "https://luxfitting.com/email/hero.jpg",
    logoImage: "https://luxfitting.com/email/logo.png",
    persona: "Adele",
    voice:
      "Energetic, feminine, sensory, first-person from Adele — friendly conversation. Subject uses a sensory comparison anchored to a specific price (\"comfier than a nightgown\", \"feel THIS good for 💲14.98\"). ONE hook per email — never stack spring + birthday + comfort. Health-adjacent benefits stay non-medical.",
    subjectFormula: "Price-anchored + sensory. Best formula: \"[sensory comparison] for 💲[price]?\".",
    subjectMax: 56,
    urgencyType: "Gratitude + deadline — \"as a thank-you, but only until midnight tonight\". Warm, not pushy.",
    preheaderFormula: "Escalate the tension, e.g. \"Thanks but this ends midnight!\".",
    offSymbol: "O.F.F",
    freeShipThreshold: "35",
    defaultProductCount: 6,
    productSegments: [
      {
        code: "61",
        label: "Women's Tops",
        guidance:
          "Frequent tops buyers — know what they like. Acknowledge style loyalty; cross-sell bottoms/dresses that complete the outfit. Effortless-outfit angle.",
      },
      {
        code: "62",
        label: "Women's Bottoms",
        guidance:
          "High-value bottoms buyers — spend more, return often, high competitor risk. Speak to fit precision, fabric quality, what makes these different.",
      },
      {
        code: "63",
        label: "Women's Dresses",
        guidance:
          "Occasion-driven dress buyers — shop for moments, not routinely. Create occasion urgency; make it feel like it arrived at the right time.",
      },
      {
        code: "64",
        label: "Women's Others",
        guidance:
          "Infrequent peripheral buyers — bought something non-core. Bridge from what they bought to the main collection; remove risk; make the step up easy.",
      },
    ],
    catalog: [
      { slug: "stretchactive", name: "StretchActive", segment: "62", price: "14.98", hero: true },
      { slug: "icy-legging", name: "Icy Legging", segment: "62", price: "19.99" },
      { slug: "flowpant", name: "FlowPant", segment: "62", price: "17.99" },
      { slug: "airknit-tee", name: "AirKnit Tee", segment: "61", price: "12.99" },
      { slug: "lumi-top", name: "Lumi Top", segment: "61", price: "13.99" },
      { slug: "soiree-dress", name: "Soirée Dress", segment: "63", price: "29.99" },
      { slug: "moverband", name: "MoverBand", segment: "64", price: "7.99" },
    ],
  },

  santa_fare: {
    id: "santa_fare",
    name: "SantaFare",
    domain: "santafare.com",
    layout: "simple",
    accent: "#a80818",
    accentRange: ["#890106", "#c00f28"],
    heroSlug: "pouchic",
    heroImage: "https://santafare.com/email/hero.jpg",
    logoImage: "https://santafare.com/email/logo.png",
    persona: "Mary",
    voice:
      "Heritage, premium, warm, first-person from Mary — personalized gifts/accessories. Subject creates a suspended loop with mild anxiety around an earned-but-unclaimed reward, or a reluctant deadline (\"I can't extend this past midnight\"). Body uses a named gifting micro-story (\"My sister Michelle got this leather Pouchic\"). Lean 4-product layouts.",
    subjectFormula: "Suspended loop + name. Best formula: \"[Unresolved situation]... {{first_name}}'s [earned thing] = [status/risk]\".",
    subjectMax: 54,
    urgencyType: "Reluctant deadline only — \"we'd love to keep this open, but we have to take it back at midnight\". Never countdown-clock energy.",
    preheaderFormula: "Reluctant deadline or suspended revelation, e.g. \"Tonight only\" / \"We're taking this back at midnight\".",
    offSymbol: "SAVING",
    freeShipThreshold: "45",
    defaultProductCount: 4,
    // SantaFare is a single product segment differentiated by recency/lifecycle (tiers).
    productSegments: [
      {
        code: "1",
        label: "Personalized Gifts",
        guidance:
          "Single gifting segment, differentiated by recency tier (the campaign tiers). Active: next occasion is coming sooner than they think. Drifting: \"it's almost time again\". Lapsed: lead risk-free (free returns, guarantee). VIP: exclusive first-look + elevation.",
      },
    ],
    catalog: [
      { slug: "pouchic", name: "Pouchic", segment: "1", price: "8.99", hero: true },
      { slug: "timelessmark", name: "TimelessMark", segment: "1", price: "19.99", hero: true },
      { slug: "bygonemark", name: "BygoneMark", segment: "1", price: "24.99" },
      { slug: "heritage-tote", name: "Heritage Tote", segment: "1", price: "29.99" },
      { slug: "leather-tag", name: "Leather Tag", segment: "1", price: "4.99" },
      { slug: "scarf-wrap", name: "Scarf Wrap", segment: "1", price: "12.99" },
    ],
  },
};

export const BRAND_LIST: Brand[] = Object.values(BRANDS);

export function getBrand(brandId: string): Brand {
  const brand = BRANDS[brandId];
  if (!brand) throw new Error(`Unknown brand: ${brandId}`);
  return brand;
}

/** Products in a brand's catalog matching the selected product type codes. */
export function productsForTypes(brandId: string, productTypes: string[]): Brand["catalog"] {
  const brand = getBrand(brandId);
  return brand.catalog.filter((p) => productTypes.includes(p.segment));
}

/** Slugify on input: lowercase, strip anything outside [a-z0-9_-]. */
export function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}
