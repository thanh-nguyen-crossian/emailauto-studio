import { DEFAULT_AI_MODELS } from "@/lib/config/aiModels";
import { BRAND_LIST, BRANDS, requiredProducts } from "@/lib/config/brands";
import {
  DEFAULT_MODULE_LAYOUT,
  RECIPIENT_NAME_TOKEN,
  type AIModelSelection,
  type BodyLayout,
  type Campaign,
  type CampaignOps,
  type CampaignStrategy,
  type EmailModuleKey,
  type ImageOverrides,
  type OfferType,
  type ProductCopyStyle,
  type Urgency,
} from "@/lib/config/types";
import type { GenBrief } from "@/lib/briefgen";
import type { ProductLayout } from "@/lib/render/email";

export type View = "build" | "review" | "output";
export type OptKey = "a" | "b";

/** A product slot: a chosen catalog product + per-send URL override + the USPs selected for copy. */
export type Slot = {
  slug: string;
  url: string;
  usps: string[];
  scrapedUsps?: string[];
  scrapedFeatures?: string[];
  isCustom?: boolean;
  customName?: string;
  customPrice?: string;
  customReview?: string;
  scrapedImage?: string;
};

export const DRAFT_KEY = "emailstudio:draft:v1";
export const MAX_SLOTS = 8;
export const CUSTOM_PRODUCT_VALUE = "__other_product__";

export interface Draft {
  v: 1;
  savedAt: number;
  campaign: Campaign;
  slots: Slot[];
  images: ImageOverrides;
  includeLogo: boolean;
  productLayout: ProductLayout;
  modelA: AIModelSelection;
  modelB: AIModelSelection;
  options: { a?: GenBrief; b?: GenBrief };
  htmlOverrides: Record<string, string>;
  activeOption: OptKey;
  activeSegment: string;
  view: View;
}

export const OFFER_PRESETS: Record<OfferType, string[]> = {
  sitewide_pct: ["50% O.F.F", "60% O.F.F", "70% O.F.F", "75% O.F.F", "80% O.F.F"],
  fixed_price: ["💲9.99", "💲12.99", "💲14.99", "💲19.99", "💲24.99"],
  free_ship: ["Free Shipping 💲35+", "Free Shipping 💲45+", "Free Shipping 💲55+"],
  none: [],
};

export const SHIPPING_PRESETS = ["Free Shipping 💲35+", "Free Shipping 💲45+", "Free Shipping 💲50+", "Free Shipping 💲55+"];

export const DEFAULT_OPS: CampaignOps = {
  provider: "sendgrid",
  senderName: "",
  senderEmail: "",
  replyTo: "",
  audienceSource: "",
  segmentRule: "",
  consentBasis: "prior_purchase_or_opt_in",
  doubleOptIn: false,
  suppressionNotes: "",
  scheduleWindow: "",
  trackOpens: true,
  trackClicks: true,
  utmPlan: "utm_source=sendgrid&utm_medium=email&utm_campaign={{campaign_name}}",
  publicArchive: false,
  complianceNotes: "",
};

export const OPS_PROVIDER_OPTIONS = [
  ["sendgrid", "SendGrid"],
  ["smtp", "SMTP"],
  ["ses", "AWS SES"],
  ["mailgun", "Mailgun"],
  ["postmark", "Postmark"],
  ["local", "Inbox/local"],
  ["other", "Other"],
] as const;

export const CONSENT_OPTIONS = [
  ["prior_purchase_or_opt_in", "Purchase/opt-in"],
  ["double_opt_in", "Double opt-in"],
  ["manual_import", "Manual import"],
  ["winback_existing_customer", "Winback customers"],
  ["unknown", "Unknown"],
] as const;

export interface StudioCampaignState {
  brandId: string;
  sendDate: string;
  theme: string;
  offerType: OfferType;
  offerValue: string;
  offerShipping: string;
  urgency: Urgency;
  hookContract: string;
  recipientName: string;
  lastHero: string;
  lastAngle: string;
  lastCtr: string;
  lastNote: string;
  lastOpenerMechanic: string;
  lastEmotionalArc: string;
  strategy: CampaignStrategy;
  ops: CampaignOps;
  winningContent: string;
  customPerfContext: string | null;
  modelA: AIModelSelection;
  modelB: AIModelSelection;
  segments: string[];
  slots: Slot[];
  images: ImageOverrides;
  includeLogo: boolean;
  productLayout: ProductLayout;
  bodyLayout: BodyLayout;
  bodyFocus: "hero" | "grid";
  moduleLayout: EmailModuleKey[];
  productCopyStyle: ProductCopyStyle;
}

export interface StudioUiState {
  view: View;
  openStep: number;
  visited: number[];
  activeOption: OptKey;
  compareMode: boolean;
  activeSegment: string;
  outputTab: "preview" | "brief";
  editingHtml: boolean;
  revisionFeedback: string;
  advancedPromptsOpen: boolean;
}

export interface StudioGenerationState {
  options: { a?: GenBrief; b?: GenBrief };
  htmlOverrides: Record<string, string>;
  systemOverride: string | null;
  userOverride: string | null;
  apiError: string | null;
  genWarning: string | null;
  generating: boolean;
  elapsedSec: number;
  progress: GenerationProgressState | null;
}

export interface GenerationProgressState {
  stage: string;
  message: string;
  done: number;
  total: number;
  partialA: boolean;
  partialB: boolean;
  events: string[];
}

export interface StudioState {
  campaign: StudioCampaignState;
  ui: StudioUiState;
  generation: StudioGenerationState;
}

function slotFromCatalogProduct(product: { slug: string; url?: string; usps?: string[] }): Slot {
  return { slug: product.slug, url: product.url || "", usps: [...(product.usps || [])] };
}

/** Build the initial slots for a brand: locked required products first, otherwise slot 0 = hero. */
export function initSlots(brandId: string): Slot[] {
  const b = BRANDS[brandId];
  const required = requiredProducts(brandId);
  if (required.length) return required.map(slotFromCatalogProduct);
  const hero = b.catalog.find((p) => p.slug === b.heroSlug);
  return hero ? [slotFromCatalogProduct(hero)] : [{ slug: b.heroSlug, url: "", usps: [] }];
}

export function createInitialStudioState(): StudioState {
  const first = BRAND_LIST[0].id;
  return {
    campaign: {
      brandId: first,
      sendDate: new Date().toISOString().slice(0, 10),
      theme: "Spring comfort sale",
      offerType: "sitewide_pct",
      offerValue: "70% O.F.F",
      offerShipping: "Free Shipping 💲35+",
      urgency: "h24",
      hookContract: "",
      recipientName: RECIPIENT_NAME_TOKEN,
      lastHero: "",
      lastAngle: "",
      lastCtr: "",
      lastNote: "",
      lastOpenerMechanic: "",
      lastEmotionalArc: "",
      strategy: {},
      ops: DEFAULT_OPS,
      winningContent: "",
      customPerfContext: null,
      modelA: DEFAULT_AI_MODELS.a,
      modelB: DEFAULT_AI_MODELS.b,
      segments: BRANDS[first].productSegments.slice(0, 2).map((s) => s.code),
      slots: initSlots(first),
      images: {},
      includeLogo: false,
      productLayout: "stack",
      bodyLayout: "continuous",
      bodyFocus: "hero",
      moduleLayout: DEFAULT_MODULE_LAYOUT,
      productCopyStyle: "headline_winner",
    },
    ui: {
      view: "build",
      openStep: 0,
      visited: [0],
      activeOption: "a",
      compareMode: false,
      activeSegment: "",
      outputTab: "preview",
      editingHtml: false,
      revisionFeedback: "",
      advancedPromptsOpen: false,
    },
    generation: {
      options: {},
      htmlOverrides: {},
      systemOverride: null,
      userOverride: null,
      apiError: null,
      genWarning: null,
      generating: false,
      elapsedSec: 0,
      progress: null,
    },
  };
}

// Format an ISO date (2026-05-31) as the team's naming token: Sun31May26.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dateToken(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${DAYS[dow]}${d}${MONS[mo - 1]}${String(y).slice(2)}`;
}

function slugifyProductSeed(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function customSlotSlug(slot: Slot, index: number): string {
  const urlPath = (() => {
    try {
      const u = new URL(slot.url);
      return `${u.hostname}-${u.pathname}`;
    } catch {
      return slot.url;
    }
  })();
  return `custom-${slugifyProductSeed(slot.customName || urlPath || `product-${index + 1}`) || `product-${index + 1}`}`;
}
