// Domain types for the RMKT email template generator.
// Source of truth for brand/tier/product logic — copy prompts must derive from these,
// never duplicate the logic (see CLAUDE.md "Never duplicate brand/tier/product logic").

export type TierCode = "A" | "B" | "C" | "D" | "F";

export type LayoutType = "narrative" | "simple";

export interface ProductSegment {
  /** Product type code, e.g. "21". Used in the variant key `${tier}${productType}`. */
  code: string;
  label: string;
  /** Playbook Prompt-4 segment guidance: how to adapt copy for this buyer segment. */
  guidance: string;
}

export interface Product {
  slug: string; // lowercase, no spaces — used in UTM and product links
  name: string;
  /** Product type code this product belongs to (matches a ProductSegment.code). */
  segment: string;
  /** Default display price, e.g. "12.99" (no currency symbol — rendered with the spam-safe 💲). */
  price: string;
  /** True for the brand's locked position-1 hero product. */
  hero?: boolean;
}

export interface Brand {
  id: string; // e.g. "bra_goddess"
  name: string; // e.g. "BraGoddess"
  domain: string; // e.g. "bragoddess.com"
  layout: LayoutType;
  /** Default on-brand accent (used for ==accent== markdown, CTA buttons, links). */
  accent: string;
  /** Inclusive on-brand accent range [darkest, lightest] — pre-flight flags anything outside. */
  accentRange: [string, string];
  /** Hero product slug locked into position 1 (analysis: strongest single-brand signal). */
  heroSlug: string;
  /** Banner / hero image URL. Must not contain "PLACEHOLDER" to pass pre-flight. */
  heroImage: string;
  /** Logo image URL shown above the hero banner. */
  logoImage: string;
  /** Persona the body copy is written first-person as (Sandra/Jordan/Adele/Mary). */
  persona: string;
  /** Short voice brief injected into the copy system prompt. */
  voice: string;
  /** Brand subject-line formula (playbook Prompt 5). */
  subjectFormula: string;
  /** Max subject length for this brand (playbook: 42–58 by brand). */
  subjectMax: number;
  /** Brand urgency type (playbook win rules). */
  urgencyType: string;
  /** Brand preheader formula (playbook Prompt 5). */
  preheaderFormula: string;
  /** Spam-safe discount symbol convention, e.g. "o.f.f" / "SAVING". */
  offSymbol: string;
  /** Free-shipping threshold mentioned in body copy (win pattern). */
  freeShipThreshold: string;
  /** Valid product type codes for this brand (switchBrand resets selection to these). */
  productSegments: ProductSegment[];
  /** Default product count (4 for SantaFare's focused layout, else 6). Hard max 6. */
  defaultProductCount: number;
  /** Product catalog for this brand. */
  catalog: Product[];
}

export interface TierPsychology {
  code: TierCode;
  label: string;
  mindset: string;
  pricingFraming: string;
  tone: string;
  urgency: string;
  psHint: string;
}

/** A single email variant: a tier × productType pair, keyed `${tier}${productType}`. */
export interface Campaign {
  brandId: string;
  sendDate: string; // ISO date string
  tiers: TierCode[];
  productTypes: string[]; // subset of the brand's productSegments codes
  layout: LayoutType; // defaults to brand.layout, overridable
  /** The campaign theme / offer brief, e.g. "Spring sale, up to 80% off, ends midnight". */
  offer: string;
  /**
   * The Hook Contract — the single source of truth for all copy (playbook core concept):
   * segment insight + emotion + hero product + price/proof + urgency + avoid rule.
   * If blank, the model constructs one from the offer before writing.
   */
  hookContract: string;
  /** Recipient name merge token shown in copy (defaults to the dataset token). */
  recipientName: string;
}

/** Copy fields for one variant, returned by the model keyed on `${tier}${productType}`. */
export interface VariantCopy {
  subject: string;
  preheader: string;
  intro: string; // named-person micro-story body opener (markdown)
  middle: string; // supporting paragraph (markdown)
  closing?: string; // narrative layout only — closing + sign-off (markdown)
  ps?: string; // narrative layout only — P.S. line (markdown)
  ctaText: string; // 2–4 word action CTA
  accent?: string; // optional per-variant accent override (defaults to brand.accent)
}

export type VariantCopyMap = Record<string, VariantCopy>;

/**
 * Per-campaign image URLs (paste from SendGrid's image library or any email-safe CDN).
 * Shared across all variants — logo/hero/product images don't change per tier.
 */
export interface ImageOverrides {
  logo?: string;
  hero?: string;
  /** Product image URL keyed by product slug. */
  products?: Record<string, string>;
}
