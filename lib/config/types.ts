// Domain types for the RMKT email template generator.
// Source of truth for brand/tier/product logic — copy prompts must derive from these,
// never duplicate the logic (see CLAUDE.md "Never duplicate brand/tier/product logic").

export type LayoutType = "narrative" | "simple";

export interface ProductSegment {
  /** Segment code, e.g. "21" (BraGoddess) or "1-A" (SantaFare lifecycle tier). */
  code: string;
  /** Segment name shown in the wizard, matching email-brief-generator (e.g. "Bralettes/Comfort"). */
  label: string;
  /** Short descriptor shown under the name + used in the prompt (e.g. "Low AOV · High freq"). */
  meta: string;
  /** Optional richer copy-strategy note (supplements name — meta in the prompt). */
  guidance?: string;
}

export interface Product {
  slug: string; // lowercase, no spaces — used in UTM and product links
  name: string;
  /** Default display price, e.g. "12.99" (no currency symbol — rendered with the spam-safe 💲). */
  price: string;
  /** True for a recommended hero product (UI pre-selects the first into slot 1). */
  hero?: boolean;
  /** Selling points used to ground the copy + brief. */
  usps?: string[];
  /** Short customer review quote. */
  review?: string;
  /** Canonical product URL. */
  url?: string;
  /** Optional category hint; products are a flat campaign-level selection, not segment-filtered. */
  segment?: string;
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

export type OfferType = "sitewide_pct" | "fixed_price" | "free_ship" | "none";
export type Urgency = "h24" | "h48" | "weekend" | "none";
export type AIProvider = "claude" | "gemini" | "openai";
export type BodyLayout = "continuous" | "interspersed" | "custom";
export type ProductCopyStyle = "headline_winner" | "benefit_pair" | "proof_badge" | "urgency_badge" | "price_prominent";
export type EmailModuleKey =
  | "hero"
  | "body_1"
  | "products_1_2"
  | "body_2"
  | "products_3_4"
  | "body_3"
  | "products_5_6";

export const DEFAULT_MODULE_LAYOUT: EmailModuleKey[] = [
  "hero", "body_1", "products_1_2", "products_3_4", "products_5_6", "body_2", "body_3",
];

export const RECIPIENT_NAME_TOKEN = "{{first_name}}" as const;

export interface AIModelSelection {
  provider: AIProvider;
  model: string;
}

export interface AIModelPair {
  a: AIModelSelection;
  b: AIModelSelection;
}

/** Last-send context to rotate angles / avoid repetition. */
export interface LastSend {
  ctr?: string;
  hero?: string;
  angle?: string;
  note?: string;
}

/** A campaign. The variant axis is the selected segments (per brand; SantaFare = lifecycle tiers). */
export interface Campaign {
  brandId: string;
  sendDate: string; // ISO date string
  segments: string[]; // selected segment codes from the brand's productSegments
  layout: LayoutType; // defaults to brand.layout, overridable
  /** The campaign theme, e.g. "Spring comfort sale". */
  theme: string;
  /** Structured promo. */
  offerType: OfferType;
  offerValue: string; // e.g. "70% OFF" or "$12.99" or "Free Shipping $35+"
  /** Optional shipping bonus that can stack with discount/price offers. */
  offerShipping?: string;
  urgency: Urgency;
  /** Synthesized promo line (derived from offerType/value/urgency) for prompt convenience. */
  offer: string;
  /** Body placement in the rendered email: one continuous body or one opener before product blocks. */
  bodyLayout?: BodyLayout;
  /** Product block copy pattern, based on winning template behavior. */
  productCopyStyle?: ProductCopyStyle;
  /** Optional custom module flow for drag/drop email layout. */
  moduleLayout?: EmailModuleKey[];
  /**
   * The Hook Contract — the single source of truth for all copy:
   * segment insight + emotion + hero product + price/proof + urgency + avoid rule.
   * If blank, the model constructs one from the offer before writing.
   */
  hookContract: string;
  /** Recipient name merge token shown in copy; always {{first_name}}. */
  recipientName: string;
  /** Optional last-send context. */
  lastSend?: LastSend;
  /** Optional winning-email reference to mirror structure/pacing. */
  winningContent?: string;
  /** Optional edited performance guidance injected into the system prompt. */
  customPerfContext?: string;
  /** Slugs of products featured in the last 3 sends for this brand; model tries to avoid repeating them. */
  recentProductSlugs?: string[];
}

/**
 * Per-campaign image URLs (paste from SendGrid's image library or any email-safe CDN).
 * Shared across all segments — logo/hero/product images don't change per segment.
 */
export interface ImageOverrides {
  logo?: string;
  hero?: string;
  /** Product image URL keyed by product slug. */
  products?: Record<string, string>;
}
