"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { accessToken, type Profile } from "@/lib/profile";
import { BriefView, briefToMarkdown } from "./components/BriefView";
import { listVersions, saveVersion, type SavedVersion, type VersionPayload } from "@/lib/history";
import { Auth } from "./components/Auth";
import { History } from "./components/History";
import { AdminPanel } from "./components/AdminPanel";
import { BRAND_LIST, BRANDS } from "@/lib/config/brands";
import { AI_PROVIDERS, DEFAULT_AI_MODELS, normalizeModelPair, type AIProviderOption } from "@/lib/config/aiModels";
import {
  DEFAULT_MODULE_LAYOUT,
  RECIPIENT_NAME_TOKEN,
  type AIModelSelection,
  type BodyLayout,
  type BodyVarietyProfile,
  type Campaign,
  type CampaignOps,
  type CampaignStrategy,
  type EmailModuleKey,
  type ImageOverrides,
  type OfferType,
  type Product,
  type ProductCopyStyle,
  type Urgency,
} from "@/lib/config/types";
import {
  buildSystemPrompt,
  buildUserPrompt,
  flagTier,
  flagTierCounts,
  segJsonKey,
  selectVarietyProfile,
  type GenBrief,
} from "@/lib/briefgen";
import { getBrandIntelligence, intelligencePromptBlock, PROGRAM_INTELLIGENCE } from "@/lib/config/intelligence";
import { renderEmailHTML, type ProductLayout } from "@/lib/render/email";
import { analyzeBriefDeliverability } from "@/lib/quality/deliverability";
import { Preview } from "./components/Preview";
import { PreflightPanel } from "./components/PreflightPanel";
import { ImageEditor } from "./components/ImageEditor";
import { HtmlFormatEditor } from "./components/HtmlFormatEditor";

type View = "build" | "review" | "output";
type OptKey = "a" | "b";
/** A product slot: a chosen catalog product + per-send URL override + the USPs selected for copy. */
type Slot = {
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

const DRAFT_KEY = "emailstudio:draft:v1";
interface Draft {
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
const MAX_SLOTS = 8;
const CUSTOM_PRODUCT_VALUE = "__other_product__";

/** Build the initial slots for a brand: slot 0 = hero (URL + all USPs preselected). */
function initSlots(brandId: string): Slot[] {
  const b = BRANDS[brandId];
  const hero = b.catalog.find((p) => p.slug === b.heroSlug);
  return [{ slug: b.heroSlug, url: hero?.url || "", usps: [...(hero?.usps || [])] }];
}

const OFFER_PRESETS: Record<OfferType, string[]> = {
  sitewide_pct: ["50% O.F.F", "60% O.F.F", "70% O.F.F", "75% O.F.F", "80% O.F.F"],
  fixed_price: ["💲9.99", "💲12.99", "💲14.99", "💲19.99", "💲24.99"],
  free_ship: ["Free Shipping 💲35+", "Free Shipping 💲45+", "Free Shipping 💲55+"],
  none: [],
};
const SHIPPING_PRESETS = ["Free Shipping 💲35+", "Free Shipping 💲45+", "Free Shipping 💲50+", "Free Shipping 💲55+"];
const DEFAULT_OPS: CampaignOps = {
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
const OPS_PROVIDER_OPTIONS = [
  ["sendgrid", "SendGrid"],
  ["smtp", "SMTP"],
  ["ses", "AWS SES"],
  ["mailgun", "Mailgun"],
  ["postmark", "Postmark"],
  ["local", "Inbox/local"],
  ["other", "Other"],
] as const;
const CONSENT_OPTIONS = [
  ["prior_purchase_or_opt_in", "Purchase/opt-in"],
  ["double_opt_in", "Double opt-in"],
  ["manual_import", "Manual import"],
  ["winback_existing_customer", "Winback customers"],
  ["unknown", "Unknown"],
] as const;

// Format an ISO date (2026-05-31) as the team's naming token: Sun31May26.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateToken(iso: string): string {
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

function customSlotSlug(slot: Slot, index: number): string {
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

export default function Studio() {
  const [view, setView] = useState<View>("build");
  const [openStep, setOpenStep] = useState<number>(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));

  const [brandId, setBrandId] = useState(BRAND_LIST[0].id);
  const [sendDate, setSendDate] = useState(new Date().toISOString().slice(0, 10));
  const [theme, setTheme] = useState("Spring comfort sale");
  const [offerType, setOfferType] = useState<OfferType>("sitewide_pct");
  const [offerValue, setOfferValue] = useState("70% O.F.F");
  const [offerShipping, setOfferShipping] = useState("Free Shipping 💲35+");
  const [urgency, setUrgency] = useState<Urgency>("h24");
  const [hookContract, setHookContract] = useState("");
  const [recipientName, setRecipientName] = useState(RECIPIENT_NAME_TOKEN);
  const [lastHero, setLastHero] = useState("");
  const [lastAngle, setLastAngle] = useState("");
  const [lastCtr, setLastCtr] = useState("");
  const [lastNote, setLastNote] = useState("");
  const [lastOpenerMechanic, setLastOpenerMechanic] = useState("");
  const [lastEmotionalArc, setLastEmotionalArc] = useState("");
  const [strategy, setStrategy] = useState<CampaignStrategy>({});
  const [ops, setOps] = useState<CampaignOps>(DEFAULT_OPS);
  const [toneExtracting, setToneExtracting] = useState(false);
  const [toneError, setToneError] = useState<string | null>(null);
  const [winningContent, setWinningContent] = useState("");
  const [customPerfContext, setCustomPerfContext] = useState<string | null>(null);
  const [modelA, setModelA] = useState<AIModelSelection>(DEFAULT_AI_MODELS.a);
  const [modelB, setModelB] = useState<AIModelSelection>(DEFAULT_AI_MODELS.b);
  const [segments, setSegments] = useState<string[]>(
    BRANDS[BRAND_LIST[0].id].productSegments.slice(0, 2).map((s) => s.code)
  );
  const [slots, setSlots] = useState<Slot[]>(() => initSlots(BRAND_LIST[0].id));
  const [images, setImages] = useState<ImageOverrides>({});
  const [includeLogo, setIncludeLogo] = useState(false);
  const [productLayout, setProductLayout] = useState<ProductLayout>("stack");
  const [bodyLayout, setBodyLayout] = useState<BodyLayout>("continuous");
  const [moduleLayout, setModuleLayout] = useState<EmailModuleKey[]>(DEFAULT_MODULE_LAYOUT);
  const [productCopyStyle, setProductCopyStyle] = useState<ProductCopyStyle>("headline_winner");

  // generated A/B options
  const [options, setOptions] = useState<{ a?: GenBrief; b?: GenBrief }>({});
  const [activeOption, setActiveOption] = useState<OptKey>("a");
  const [compareMode, setCompareMode] = useState(false);
  const [activeSegment, setActiveSegment] = useState<string>("");
  const [outputTab, setOutputTab] = useState<"preview" | "brief">("preview");
  // Manual HTML edits to the rendered email, keyed `${opt}:${segment}` (overrides the render).
  const [htmlOverrides, setHtmlOverrides] = useState<Record<string, string>>({});
  const [editingHtml, setEditingHtml] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState("");

  const [apiError, setApiError] = useState<string | null>(null);
  const [genWarning, setGenWarning] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pendingRestore, setPendingRestore] = useState<Draft | null>(null);
  const hydratedRef = useRef(false);

  // sync state keyed by `${opt}:${segment}`
  const [syncResults, setSyncResults] = useState<Record<string, { id?: string; editorUrl?: string; error?: string }>>({});
  const [syncingKey, setSyncingKey] = useState<string | null>(null);
  const [tplResults, setTplResults] = useState<
    Record<string, { templateId?: string; editorUrl?: string; error?: string; warnings?: string[]; blocking?: string[]; cleanedBytes?: number }>
  >({});
  const [tplKey, setTplKey] = useState<string | null>(null);

  // Auth + history (Supabase). authState 'nosupabase' lets local dev run without keys.
  type AuthState = "loading" | "in" | "out" | "nosupabase";
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recentProductSlugs, setRecentProductSlugs] = useState<string[]>([]);

  async function refreshAuth() {
    if (!supabaseConfigured()) {
      setAuthState("nosupabase");
      return;
    }
    const { data } = await supabase().auth.getUser();
    if (data.user) {
      setUserEmail(data.user.email ?? null);
      setUserId(data.user.id);
      setAuthState("in");
    } else {
      setUserId(null);
      setProfile(null);
      setAuthState("out");
    }
  }

  useEffect(() => {
    refreshAuth();
    if (!supabaseConfigured()) return;
    // Keep this callback SYNCHRONOUS — awaiting any supabase auth/db call here deadlocks the SDK.
    const { data: sub } = supabase().auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUserEmail(u?.email ?? null);
      setUserId(u?.id ?? null);
      setAuthState(u ? "in" : "out");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase().from("profiles").select("status,is_admin").eq("id", userId).single();
        if (!cancelled) setProfile((data as Profile) ?? { status: "pending", is_admin: false });
      } catch {
        if (!cancelled) setProfile({ status: "pending", is_admin: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Load the slugs from the last 3 saved versions for this brand so we can warn + avoid repeats.
  useEffect(() => {
    if (!supabaseConfigured() || !userId) { setRecentProductSlugs([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const versions = await listVersions();
        const recent = versions
          .filter((v) => v.brand_id === brandId)
          .slice(0, 3)
          .flatMap((v) => (v.data.slots || []).map((s: { slug: string }) => s.slug).filter(Boolean));
        if (!cancelled) setRecentProductSlugs(Array.from(new Set(recent)));
      } catch {
        if (!cancelled) setRecentProductSlugs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [brandId, userId]);

  async function signOut() {
    await supabase().auth.signOut();
    setAuthState("out");
  }

  async function authHeader(): Promise<Record<string, string>> {
    if (!supabaseConfigured()) return {};
    try {
      const t = await accessToken();
      return t ? { Authorization: `Bearer ${t}` } : {};
    } catch {
      return {};
    }
  }

  const brand = BRANDS[brandId];
  const layout = brand.layout;

  const offerParts = [offerValue, offerShipping].map((p) => p.trim()).filter(Boolean);
  const offer = offerParts.length ? offerParts.join(" + ") : "No promo this send";
  const strategyActive = Object.values(strategy).some((v) => String(v || "").trim());
  const campaign: Campaign = useMemo(
    () => ({
      brandId, sendDate, segments, layout, theme,
      offerType, offerValue, offerShipping, urgency, offer, bodyLayout, moduleLayout, productCopyStyle, hookContract, recipientName: RECIPIENT_NAME_TOKEN,
      lastSend: {
        ctr: lastCtr,
        hero: lastHero,
        angle: lastAngle,
        note: lastNote,
        openerMechanic: lastOpenerMechanic || undefined,
        emotionalArc: lastEmotionalArc || undefined,
      },
      strategy: strategyActive ? strategy : undefined,
      ops,
      winningContent,
      customPerfContext: customPerfContext ?? undefined,
      recentProductSlugs: recentProductSlugs.length ? recentProductSlugs : undefined,
    }),
    [brandId, sendDate, segments, layout, theme, offerType, offerValue, offerShipping, urgency, offer, bodyLayout, moduleLayout, productCopyStyle, hookContract, lastCtr, lastHero, lastAngle, lastNote, lastOpenerMechanic, lastEmotionalArc, strategyActive, strategy, ops, winningContent, customPerfContext, recentProductSlugs]
  );

  const varietyProfile: BodyVarietyProfile = useMemo(
    () => selectVarietyProfile(campaign),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      campaign.brandId,
      campaign.sendDate,
      campaign.theme,
      campaign.offerValue,
      campaign.offerShipping,
      campaign.segments.join("|"),
      campaign.lastSend?.openerMechanic,
      campaign.lastSend?.emotionalArc,
    ]
  );

  // Filled slots → Product list, applying the per-slot URL + selected-USP overrides. Hero first.
  const selectedProducts: Product[] = useMemo(() => {
    return slots
      .filter((s) => s.slug || s.isCustom)
      .map((s, i): Product | null => {
        if (s.isCustom) {
          const name = (s.customName || "").trim();
          const url = (s.url || "").trim();
          if (!name && !url) return null;
          const usps = s.usps.length ? s.usps : [...(s.scrapedUsps || []), ...(s.scrapedFeatures || [])].slice(0, 6);
          return {
            slug: s.slug || customSlotSlug(s, i),
            name: name || `Custom product ${i + 1}`,
            price: (s.customPrice || "").trim() || "TBD",
            url,
            review: (s.customReview || "").trim(),
            usps,
            segment: "custom",
            hero: i === 0,
          };
        }
        const cat = brand.catalog.find((p) => p.slug === s.slug);
        if (!cat) return null;
        return { ...cat, url: s.url || cat.url, usps: s.usps.length ? s.usps : cat.usps };
      })
      .filter((p): p is Product => p !== null);
  }, [brand, slots]);

  function switchBrand(id: string) {
    setBrandId(id);
    setSegments(BRANDS[id].productSegments.slice(0, 2).map((s) => s.code));
    setSlots(initSlots(id));
    setImages({});
    setOptions({});
    setRevisionFeedback("");
  }

  function toggle<T>(list: T[], value: T, setter: (v: T[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }
  function updateStrategy(patch: Partial<CampaignStrategy>) {
    setStrategy((prev) => ({ ...prev, ...patch }));
  }
  function updateOps(patch: Partial<CampaignOps>) {
    setOps((prev) => ({ ...prev, ...patch }));
  }
  async function extractToneFromUrl() {
    const url = strategy.toneSourceUrl?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      setToneError("Enter a public http(s) page first.");
      return;
    }
    setToneExtracting(true);
    setToneError(null);
    try {
      const res = await fetch("/api/extract-tone", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToneError(data.error || "Could not analyze the page");
        return;
      }
      const toneKeywords = Array.isArray(data.toneKeywords) ? data.toneKeywords.join(", ") : "";
      const highlights = Array.isArray(data.highlights) ? data.highlights.slice(0, 3).join(" | ") : "";
      setStrategy((prev) => ({
        ...prev,
        toneKeywords,
        keyMessage: prev.keyMessage || highlights,
      }));
    } catch {
      setToneError("Could not analyze the page");
    } finally {
      setToneExtracting(false);
    }
  }

  // ---- slot editing ----
  function updateSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function updateSlotUrl(i: number, url: string) {
    setSlots((prev) => prev.map((s, idx) => (
      idx === i && url !== s.url
        ? { ...s, url, scrapedUsps: [], scrapedFeatures: [], scrapedImage: "" }
        : idx === i
          ? { ...s, url }
          : s
    )));
  }
  function pickProduct(i: number, slug: string) {
    if (slug === CUSTOM_PRODUCT_VALUE) {
      updateSlot(i, {
        slug: `custom-product-${i + 1}`,
        url: "",
        usps: [],
        scrapedUsps: [],
        scrapedFeatures: [],
        isCustom: true,
        customName: "",
        customPrice: "",
        customReview: "",
        scrapedImage: "",
      });
      return;
    }
    const cat = brand.catalog.find((p) => p.slug === slug);
    // Reset scrapedUsps so ProductSlotCard's useEffect fires the scrape automatically.
    updateSlot(i, {
      slug,
      url: cat?.url || "",
      usps: [...(cat?.usps || [])],
      scrapedUsps: [],
      scrapedFeatures: [],
      isCustom: false,
      customName: "",
      customPrice: "",
      customReview: "",
      scrapedImage: "",
    });
  }
  // Fetch the slot's URL server-side, extract USPs, merge into the pool and auto-select the top few.
  async function scrapeSlot(i: number, url: string): Promise<string> {
    if (!url || !/^https?:\/\//i.test(url)) return "";
    try {
      const res = await fetch("/api/scrape-usps", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ url }),
      });
      const raw = await res.text();
      let data: {
        usps?: string[];
        product?: Partial<{ name: string; price: string; review: string; image: string; highlights: string[] }>;
        error?: string;
      } = {};
      try {
        data = JSON.parse(raw);
      } catch {
        return res.ok ? "Could not read product details" : `Scout failed (HTTP ${res.status})`;
      }
      if (!res.ok) return data.error || "Could not fetch the page";
      const usps: string[] = data.usps || [];
      const product = data.product && typeof data.product === "object" ? data.product : {};
      const features = Array.isArray(product.highlights) ? product.highlights.filter(Boolean) : [];
      if (!usps.length && !features.length && !product.name && !product.price) return "No product details found — add them manually below";
      let imageSlug = "";
      let imageUrl = "";
      setSlots((prev) =>
        prev.map((s, idx) => {
          if (idx !== i) return s;
          const nextCustomName = s.isCustom && product.name && !s.customName?.trim() ? product.name : s.customName;
          const nextCustomPrice = s.isCustom && product.price && !s.customPrice?.trim() ? product.price : s.customPrice;
          const nextCustomReview = s.isCustom && product.review && !s.customReview?.trim() ? product.review : s.customReview;
          const nextSlot = {
            ...s,
            url,
            customName: nextCustomName,
            customPrice: nextCustomPrice,
            customReview: nextCustomReview,
            scrapedImage: product.image || s.scrapedImage,
            scrapedUsps: Array.from(new Set([...(s.scrapedUsps || []), ...usps])),
            scrapedFeatures: Array.from(new Set([...(s.scrapedFeatures || []), ...features])),
          };
          if (s.isCustom) nextSlot.slug = customSlotSlug(nextSlot, idx);
          const pool = [...usps, ...features].filter(Boolean);
          const autoSel = pool.slice(0, 4).filter((u) => !nextSlot.usps.includes(u));
          if (product.image && nextSlot.slug) {
            imageSlug = nextSlot.slug;
            imageUrl = product.image;
          }
          return { ...nextSlot, usps: [...nextSlot.usps, ...autoSel] };
        })
      );
      if (imageSlug && imageUrl) {
        setImages((prev) => ({
          ...prev,
          products: {
            ...(prev.products || {}),
            [imageSlug]: prev.products?.[imageSlug] || imageUrl,
          },
        }));
      }
      const found = [
        usps.length ? `${usps.length} USPs` : "",
        features.length ? `${features.length} page clues` : "",
        product.name ? "name" : "",
        product.price ? "price" : "",
        product.image ? "image" : "",
      ].filter(Boolean).join(", ");
      return `✓ Found ${found || "product details"} — review below`;
    } catch {
      return "Could not fetch the page";
    }
  }
  function toggleSlotUsp(i: number, usp: string) {
    setSlots((prev) =>
      prev.map((s, idx) =>
        idx === i ? { ...s, usps: s.usps.includes(usp) ? s.usps.filter((u) => u !== usp) : [...s.usps, usp] } : s
      )
    );
  }
  function addCustomUsp(i: number) {
    updateSlot(i, { usps: [...slots[i].usps, ""] });
  }
  function setCustomUsp(i: number, uspIndex: number, value: string) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, usps: s.usps.map((u, j) => (j === uspIndex ? value : u)) } : s)));
  }
  function addSlot() {
    if (slots.length < MAX_SLOTS) setSlots((prev) => [...prev, { slug: "", url: "", usps: [] }]);
  }
  function removeSlot(i: number) {
    if (i > 0) setSlots((prev) => prev.filter((_, idx) => idx !== i));
  }

  const maxProducts = 6;
  const canGenerate =
    segments.length > 0 && selectedProducts.length >= 1 && selectedProducts.length <= maxProducts;

  // ---- prompt previews (for the Review step; what the server rebuilds and sends) ----
  // Preview a stable variety profile so reviewers can see the Creative Variety / Segment Body /
  // Tone layers. The server adds a fresh per-option nonce at generation time for real A/B diversity.
  const campaignForPrompt = useMemo(() => ({ ...campaign, bodyVariety: varietyProfile }), [campaign, varietyProfile]);
  const systemPromptA = useMemo(() => buildSystemPrompt(campaignForPrompt, selectedProducts, false), [campaignForPrompt, selectedProducts]);
  const userPromptA = useMemo(() => buildUserPrompt(campaignForPrompt, false), [campaignForPrompt]);
  const perfContextDefault = useMemo(() => intelligencePromptBlock(brandId), [brandId]);
  const effectivePerfContext = customPerfContext ?? perfContextDefault;
  // Optional user edits to the prompts (null = use the generated default; what-you-see-is-what's-sent).
  const [systemOverride, setSystemOverride] = useState<string | null>(null);
  const [userOverride, setUserOverride] = useState<string | null>(null);
  const effectiveSystem = systemOverride ?? systemPromptA;
  const effectiveUser = userOverride ?? userPromptA;
  const systemPromptEdited = systemOverride !== null && systemOverride !== systemPromptA;
  const userPromptEdited = userOverride !== null && userOverride !== userPromptA;
  const promptOverridesActive = systemPromptEdited || userPromptEdited;
  const autoSegmentBatching = segments.length > 2 && !promptOverridesActive;

  function stopGenTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  function cancelGenerate() {
    abortRef.current?.abort();
  }

  async function generate(feedback?: string) {
    // Do NOT clear edited HTML / sync results here — only on a SUCCESSFUL result. A failed regen
    // must leave the prior options + manual edits intact (the user gains nothing from losing both).
    setGenerating(true);
    setApiError(null);
    setGenWarning(null);
    setSaveState("idle");
    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = Date.now();
    setElapsedSec(0);
    stopGenTimer();
    timerRef.current = setInterval(() => setElapsedSec(Math.round((Date.now() - startedAt) / 1000)), 1000);
    try {
      const res = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        signal: controller.signal,
        body: JSON.stringify({
          ...campaign,
          products: selectedProducts.map((p) => ({
            name: p.name, slug: p.slug, price: p.price, usps: p.usps, review: p.review, url: p.url,
          })),
          promptOverrides:
            promptOverridesActive
              ? { system: systemPromptEdited ? systemOverride ?? undefined : undefined, user: userPromptEdited ? userOverride ?? undefined : undefined }
              : undefined,
          models: normalizeModelPair({ a: modelA, b: modelB }),
          feedback: feedback?.trim() || undefined,
          existingOptions: feedback?.trim() ? options : undefined,
        }),
      });
      // Read as text first: a serverless timeout/crash returns a plain-text error page, not JSON.
      const raw = await res.text();
      let data: { a?: GenBrief; b?: GenBrief; error?: string; warning?: string };
      try {
        data = JSON.parse(raw);
      } catch {
        if (res.status === 504 || /timeout|timed out|FUNCTION_INVOCATION/i.test(raw)) {
          setApiError("The server timed out while generating. Use automatic batching by resetting edited system/user prompts, or try a faster model pair (Claude Haiku, Gemini Flash/Lite, GPT mini/nano) and fewer products.");
        } else {
          setApiError(`Server returned an unexpected response (HTTP ${res.status}). Please retry.`);
        }
        return;
      }
      if (!res.ok) {
        setApiError(data.error || "Generation failed");
        return;
      }
      // Success — now it is safe to drop the previous generation's edits/sync state.
      setSyncResults({});
      setTplResults({});
      setHtmlOverrides({});
      setEditingHtml(false);
      setOptions({ a: data.a, b: data.b });
      setGenWarning(data.warning || null);
      const usedVariety = data.a?.body_variety || data.b?.body_variety;
      if (usedVariety) {
        setLastOpenerMechanic(usedVariety.openerMechanic);
        setLastEmotionalArc(usedVariety.emotionalArc);
      }
      setActiveOption(data.a ? "a" : "b");
      setActiveSegment(segments[0]);
      setOutputTab("preview");
      setView("output");
      if (feedback?.trim()) setRevisionFeedback("");
    } catch (e) {
      // A user-initiated cancel is not an error — leave existing output (if any) untouched.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setApiError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
      stopGenTimer();
      abortRef.current = null;
    }
  }

  // Clear any running generation timer if the component unmounts mid-flight.
  useEffect(() => () => stopGenTimer(), []);

  // ---- draft persistence (so a refresh / crash / accidental nav never loses a multi-minute run) ----
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setPendingRestore(null);
  }
  // On first mount, offer to restore a previous draft that contained generated output.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        if (d && d.v === 1 && (d.options?.a || d.options?.b)) setPendingRestore(d);
      }
    } catch {}
    hydratedRef.current = true;
  }, []);
  // Debounced autosave of the working state.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const id = setTimeout(() => {
      try {
        const draft: Draft = {
          v: 1, savedAt: Date.now(), campaign, slots, images, includeLogo, productLayout,
          modelA, modelB, options, htmlOverrides, activeOption, activeSegment, view,
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* quota / serialization — drafts are best-effort */
      }
    }, 600);
    return () => clearTimeout(id);
  }, [campaign, slots, images, includeLogo, productLayout, modelA, modelB, options, htmlOverrides, activeOption, activeSegment, view]);
  // Warn before leaving while generating or with unsaved generated output.
  useEffect(() => {
    const hasUnsaved = generating || ((!!options.a || !!options.b) && saveState !== "saved");
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [generating, options.a, options.b, saveState]);

  function restoreDraft(d: Draft) {
    const c = d.campaign;
    setBrandId(c.brandId);
    setSendDate(c.sendDate);
    setTheme(c.theme);
    setOfferType(c.offerType);
    setOfferValue(c.offerValue);
    setOfferShipping(c.offerShipping || "");
    setUrgency(c.urgency);
    setHookContract(c.hookContract || "");
    setSegments(c.segments);
    setLastHero(c.lastSend?.hero || "");
    setLastAngle(c.lastSend?.angle || "");
    setLastCtr(c.lastSend?.ctr || "");
    setLastNote(c.lastSend?.note || "");
    setLastOpenerMechanic(c.lastSend?.openerMechanic || "");
    setLastEmotionalArc(c.lastSend?.emotionalArc || "");
    setStrategy(c.strategy || {});
    setOps(c.ops || DEFAULT_OPS);
    setWinningContent(c.winningContent || "");
    setCustomPerfContext(c.customPerfContext ?? null);
    setBodyLayout(c.bodyLayout || "continuous");
    setModuleLayout(c.moduleLayout || DEFAULT_MODULE_LAYOUT);
    setProductCopyStyle(c.productCopyStyle || "headline_winner");
    setRecentProductSlugs(c.recentProductSlugs || []);
    setSlots(d.slots);
    setImages(d.images);
    setIncludeLogo(d.includeLogo);
    setProductLayout(d.productLayout);
    setModelA(d.modelA);
    setModelB(d.modelB);
    setOptions(d.options);
    setHtmlOverrides(d.htmlOverrides);
    setActiveOption(d.activeOption);
    setActiveSegment(d.activeSegment);
    setView(d.view);
    setVisited(new Set([0, 1, 2]));
    setPendingRestore(null);
  }

  function regenerateFromFeedback() {
    const feedback = revisionFeedback.trim();
    if (!feedback) {
      setApiError("Add feedback first, then regenerate.");
      return;
    }
    void generate(feedback);
  }

  function useQaFlagsAsFeedback() {
    const flags = activeBrief?._flags || [];
    if (!flags.length) return;
    const priority = (f: NonNullable<GenBrief["_flags"]>[number]) =>
      f.type === "error" ? 0 : flagTier(f.msg) === "serious" ? 1 : flagTier(f.msg) === "structural" ? 2 : 3;
    const ordered = [...flags].sort((a, b) => priority(a) - priority(b)).slice(0, 12);
    const lines = ordered.map((f) => `- ${f.type === "error" ? "ERROR" : flagTier(f.msg).toUpperCase()}: ${f.msg}`).join("\n");
    const suffix = flags.length > ordered.length ? `\n- Also preserve existing polish checks where possible (${flags.length - ordered.length} lower-priority notes omitted).` : "";
    setRevisionFeedback((prev) => [prev.trim(), "Fix these QA/playbook issues first:", lines + suffix].filter(Boolean).join("\n\n"));
  }

  const activeBrief = options[activeOption];

  function updateActiveBrief(next: GenBrief) {
    setOptions((prev) => ({ ...prev, [activeOption]: next }));
    setHtmlOverrides({});
  }

  function htmlFor(opt: OptKey, seg: string): string {
    const key = `${opt}:${seg}`;
    if (htmlOverrides[key] != null) return htmlOverrides[key]; // user-edited HTML wins
    const b = options[opt];
    if (!b) return "";
    return renderEmailHTML(brand, campaign, selectedProducts, b, seg, images, { includeLogo, productLayout, bodyLayout, moduleLayout });
  }
  const activeHtmlKey = `${activeOption}:${activeSegment}`;
  const activeHtmlEdited = htmlOverrides[activeHtmlKey] != null;
  function subjectFor(opt: OptKey, seg: string): string {
    return options[opt]?.subject_lines?.[segJsonKey(seg)]?.subject || `${brand.name} ${seg}`;
  }
  function preheaderFor(opt: OptKey, seg: string): string {
    return options[opt]?.subject_lines?.[segJsonKey(seg)]?.preheader || "";
  }
  // A segment is "incomplete" when the model never produced a real subject or body for it — the
  // preview/export would otherwise silently ship a "BrandName 21" placeholder subject.
  function segmentIncomplete(opt: OptKey, seg: string): boolean {
    const b = options[opt];
    if (!b) return false;
    const key = segJsonKey(seg);
    return !b.subject_lines?.[key]?.subject?.trim() || !b.body?.[key]?.trim();
  }
  const incompleteOutputLabels = useMemo(() => {
    const labels: string[] = [];
    (["a", "b"] as OptKey[]).forEach((opt) => {
      if (!options[opt]) return;
      segments.forEach((seg) => {
        if (segmentIncomplete(opt, seg)) labels.push(`${opt.toUpperCase()} ${seg}`);
      });
    });
    return labels;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, segments]);
  function useSubjectOption(subject: string, preheader: string, style?: string, modelHint?: string, sharedThread?: string) {
    if (!activeBrief || !activeSegment) return;
    const key = segJsonKey(activeSegment);
    const current = activeBrief.subject_lines?.[key] || { subject: "", preheader: "" };
    updateActiveBrief({
      ...activeBrief,
      subject_lines: {
        ...(activeBrief.subject_lines || {}),
        [key]: {
          ...current,
          subject,
          preheader,
          style: style || current.style,
          model_hint: modelHint || current.model_hint,
          shared_thread: sharedThread || current.shared_thread,
        },
      },
    });
  }
  const templateName = (opt: OptKey, seg: string) =>
    `${brand.name}_${dateToken(sendDate)}_${seg}_${opt.toUpperCase()}`;

  function download(filename: string, content: string, type = "text/html") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadBrief() {
    if (!activeBrief) return;
    download(
      `${brand.name}_${dateToken(sendDate)}_${activeOption.toUpperCase()}_brief.md`,
      briefToMarkdown(activeBrief, `${brand.name} · ${dateToken(sendDate)} · Option ${activeOption.toUpperCase()}`),
      "text/markdown"
    );
  }

  async function exportExcel() {
    if (!options.a && !options.b) return;
    if (incompleteOutputLabels.length && !window.confirm(`Export with incomplete segment copy? Missing: ${incompleteOutputLabels.slice(0, 8).join(", ")}${incompleteOutputLabels.length > 8 ? "…" : ""}`)) return;
    const { exportBriefsToExcel } = await import("@/lib/exportExcel");
    await exportBriefsToExcel(options, brand.name, dateToken(sendDate), ops);
  }

  async function syncDesign(opt: OptKey, seg: string) {
    const key = `${opt}:${seg}`;
    const html = htmlFor(opt, seg);
    if (!html) return;
    setSyncingKey(key);
    try {
      const res = await fetch("/api/sync-sendgrid", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ name: templateName(opt, seg), subject: subjectFor(opt, seg), html }),
      });
      const data = await res.json();
      setSyncResults((r) => ({ ...r, [key]: res.ok ? { id: data.id, editorUrl: data.editorUrl } : { error: data.error } }));
    } catch (e) {
      setSyncResults((r) => ({ ...r, [key]: { error: e instanceof Error ? e.message : "Network error" } }));
    } finally {
      setSyncingKey(null);
    }
  }

  async function syncTemplate(opt: OptKey, seg: string) {
    const key = `${opt}:${seg}`;
    const html = htmlFor(opt, seg);
    if (!html) return;
    setTplKey(key);
    try {
      const res = await fetch("/api/sync-template", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ name: templateName(opt, seg), subject: subjectFor(opt, seg), html }),
      });
      const data = await res.json();
      setTplResults((r) => ({
        ...r,
        [key]: res.ok
          ? { templateId: data.templateId, editorUrl: data.editorUrl, warnings: data.warnings, blocking: data.blocking, cleanedBytes: data.cleanedBytes }
          : { error: data.error, warnings: data.warnings, blocking: data.blocking },
      }));
    } catch (e) {
      setTplResults((r) => ({ ...r, [key]: { error: e instanceof Error ? e.message : "Network error" } }));
    } finally {
      setTplKey(null);
    }
  }

  async function saveCurrent() {
    setSaveState("saving");
    setSaveError(null);
    try {
      const payload: VersionPayload = {
        brandId, sendDate, theme, offerType, offerValue, offerShipping, urgency, offer, hookContract, recipientName,
        segments, slots, includeLogo, productLayout, bodyLayout, moduleLayout, productCopyStyle, images, options, htmlOverrides,
        models: normalizeModelPair({ a: modelA, b: modelB }),
        lastSend: { ctr: lastCtr, hero: lastHero, angle: lastAngle, note: lastNote, openerMechanic: lastOpenerMechanic || undefined, emotionalArc: lastEmotionalArc || undefined },
        strategy: strategyActive ? strategy : undefined,
        ops,
        winningContent,
        customPerfContext: customPerfContext ?? undefined,
      };
      await saveVersion(`${brand.name}_${dateToken(sendDate)}`, payload);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
  }

  // Wipe everything back to a fresh first-load state (optionally confirming if work would be lost).
  function startNewBrief() {
    if ((options.a || options.b) && !window.confirm("Start a new brief? This clears the current campaign and generated options.")) return;
    const first = BRAND_LIST[0].id;
    setBrandId(first);
    setSendDate(new Date().toISOString().slice(0, 10));
    setTheme("Spring comfort sale");
    setOfferType("sitewide_pct");
    setOfferValue("70% O.F.F");
    setOfferShipping("Free Shipping 💲35+");
    setUrgency("h24");
    setHookContract("");
    setRecipientName(RECIPIENT_NAME_TOKEN);
    setLastHero(""); setLastAngle(""); setLastCtr(""); setLastNote("");
    setWinningContent("");
    setSegments(BRANDS[first].productSegments.slice(0, 2).map((s) => s.code));
    setSlots(initSlots(first));
    setImages({});
    setIncludeLogo(false);
    setProductLayout("stack");
    setBodyLayout("continuous");
    setModuleLayout(DEFAULT_MODULE_LAYOUT);
    setProductCopyStyle("headline_winner");
    setOptions({});
    setActiveOption("a");
    setActiveSegment("");
    setOutputTab("preview");
    setApiError(null);
    setSaveState("idle");
    setSaveError(null);
    setSyncResults({});
    setTplResults({});
    setSystemOverride(null);
    setUserOverride(null);
    setCustomPerfContext(null);
    setStrategy({});
    setOps(DEFAULT_OPS);
    setToneError(null);
    setToneExtracting(false);
    setModelA(DEFAULT_AI_MODELS.a);
    setModelB(DEFAULT_AI_MODELS.b);
    setHtmlOverrides({});
    setRevisionFeedback("");
    setVisited(new Set([0]));
    setOpenStep(0);
    setView("build");
    clearDraft();
  }

  function openVersion(v: SavedVersion) {
    const d = v.data;
    setBrandId(d.brandId);
    setSendDate(d.sendDate);
    setTheme(d.theme || "");
    setOfferType(d.offerType === "free_ship" ? "none" : d.offerType || "none");
    setOfferValue(d.offerType === "free_ship" ? "" : d.offerValue || "");
    setOfferShipping(d.offerShipping || (d.offerType === "free_ship" ? d.offerValue || "" : ""));
    setUrgency(d.urgency || "none");
    setLastCtr(d.lastSend?.ctr || "");
    setLastHero(d.lastSend?.hero || "");
    setLastAngle(d.lastSend?.angle || "");
    setLastNote(d.lastSend?.note || "");
    setLastOpenerMechanic(d.lastSend?.openerMechanic || "");
    setLastEmotionalArc(d.lastSend?.emotionalArc || "");
    setStrategy(d.strategy || {});
    setOps(d.ops || DEFAULT_OPS);
    setWinningContent(d.winningContent || "");
    setCustomPerfContext(d.customPerfContext ?? null);
    const models = normalizeModelPair(d.models);
    setModelA(models.a);
    setModelB(models.b);
    setHookContract(d.hookContract || "");
    setRecipientName(RECIPIENT_NAME_TOKEN);
    setSegments(d.segments || []);
    setSlots(d.slots && d.slots.length ? d.slots : initSlots(d.brandId));
    setIncludeLogo(d.includeLogo);
    setProductLayout(d.productLayout || "stack");
    setBodyLayout(d.bodyLayout || "continuous");
    setModuleLayout(d.moduleLayout || DEFAULT_MODULE_LAYOUT);
    setProductCopyStyle(d.productCopyStyle || "headline_winner");
    setImages(d.images || {});
    setOptions(d.options || {});
    setActiveOption(d.options?.a ? "a" : "b");
    setActiveSegment((d.segments || [])[0] || "");
    setHtmlOverrides(d.htmlOverrides || {});
    setEditingHtml(false);
    setRevisionFeedback("");
    setSyncResults({});
    setTplResults({});
    setSaveState("idle");
    setHistoryOpen(false);
    setOutputTab("preview");
    setView(d.options?.a || d.options?.b ? "output" : "build");
  }

  async function downloadAll() {
    if (incompleteOutputLabels.length && !window.confirm(`Download with incomplete segment copy? Missing: ${incompleteOutputLabels.slice(0, 8).join(", ")}${incompleteOutputLabels.length > 8 ? "…" : ""}`)) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    (["a", "b"] as OptKey[]).forEach((opt) => {
      if (!options[opt]) return;
      segments.forEach((seg) => {
        const html = htmlFor(opt, seg);
        if (html) zip.file(`${templateName(opt, seg)}.html`, html);
      });
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brand.name}_${dateToken(sendDate)}_AB.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- accordion step machinery ----
  function markVisited(i: number) {
    setVisited((s) => new Set(s).add(i));
  }
  function goNext(i: number) {
    markVisited(i);
    if (i < STEP_TITLES.length - 1) {
      markVisited(i + 1);
      setOpenStep(i + 1);
    } else {
      setOpenStep(-1);
      setView("review");
    }
  }
  const STEP_TITLES = ["Brand · Date · Theme", "Promo & Urgency", "Products", "Segments", "Ops & Last-Send Context", "Winning Reference"];

  const segLabel = (code: string) => brand.productSegments.find((s) => s.code === code)?.label || code;
  const heroProduct = selectedProducts[0] || brand.catalog.find((p) => p.slug === brand.heroSlug) || brand.catalog[0];
  const opsProviderLabel = OPS_PROVIDER_OPTIONS.find(([value]) => value === ops.provider)?.[1] || "SendGrid";
  const opsSummary = [
    opsProviderLabel,
    ops.senderEmail ? "sender set" : "sender missing",
    ops.audienceSource ? "audience set" : "audience missing",
    ops.trackClicks === false ? "clicks off" : "clicks on",
  ].join(" · ");

  function autoFillProductSet() {
    const desired = Math.min(maxProducts, brand.defaultProductCount || maxProducts, brand.catalog.length);
    const hero = brand.catalog.filter((p) => p.slug === brand.heroSlug);
    const support = brand.catalog.filter((p) => p.slug !== brand.heroSlug);
    // Prefer support products not used in the last 3 sends; fall back to all if not enough fresh ones.
    const freshSupport = support.filter((p) => !recentProductSlugs.includes(p.slug));
    const pool = [...hero, ...(freshSupport.length >= desired - hero.length ? freshSupport : support)].slice(0, desired);
    setSlots(
      pool.map((p) => ({
        slug: p.slug,
        url: p.url || "",
        usps: [...(p.usps || [])],
      }))
    );
  }

  function buildSuggestedHookContract() {
    const audience = segments.length ? segments.map((s) => `${s} ${segLabel(s)}`).join(", ") : "selected segments";
    const avoid = [lastHero && `hero ${lastHero}`, lastAngle && `angle ${lastAngle}`, lastNote].filter(Boolean).join("; ") || "hook stacking and generic gratitude";
    setHookContract(
      `Audience: ${audience}. Emotion/curiosity: ${brand.urgencyType}. Hero product: ${heroProduct?.name || "selected hero"}. Proof/price: ${offer}; use supplied review/product facts only. Urgency: ${urgency}. Avoid: ${avoid}.`
    );
  }

  const stepSummary = (i: number): string => {
    switch (i) {
      case 0: return `${brand.name} · ${dateToken(sendDate)} · ${theme || "no theme"}${strategyActive ? " · strategy enriched" : ""}`;
      case 1: return `${offerParts.length ? offerParts.join(" + ") : "No promo"} · ${urgency}`;
      case 2: return `${selectedProducts.length} product${selectedProducts.length === 1 ? "" : "s"} (hero: ${brand.catalog.find((p) => p.slug === brand.heroSlug)?.name})`;
      case 3: return segments.length ? segments.map((s) => `${s} ${segLabel(s)}`).join(" · ") : "none selected";
      case 4: return `${opsSummary}${lastHero || lastAngle || lastCtr ? ` · last: ${lastHero || "?"}/${lastAngle || "?"}/${lastCtr || "?"}%` : ""}`;
      case 5: return winningContent.trim() ? `${winningContent.trim().length} chars pasted` : "skipped";
      default: return "";
    }
  };

  // ---- auth gate ----
  if (authState === "loading") {
    return <main className="min-h-screen flex items-center justify-center text-[var(--muted)]">Loading…</main>;
  }
  if (authState === "out") {
    return <Auth onAuthed={refreshAuth} />;
  }
  if (authState === "in" && !profile) {
    return <main className="min-h-screen flex items-center justify-center text-[var(--muted)]">Loading…</main>;
  }
  if (authState === "in" && profile && profile.status !== "active") {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-sm text-center flex flex-col gap-3">
          <h1 className="text-xl font-bold">EmailAuto Studio</h1>
          {profile.status === "pending" ? (
            <p className="text-sm text-[var(--muted)]">
              Your account <strong className="text-[var(--text)]">{userEmail}</strong> is awaiting
              admin approval. You'll get access once an admin approves it.
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Your account has been deactivated. Contact an admin to restore access.
            </p>
          )}
          <button onClick={signOut} className="btn-ghost mx-auto">Sign out</button>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen max-w-[1280px] mx-auto px-4 sm:px-6 py-5 sm:py-7">
      <a href="#workflow-nav" className="skip-link">Skip to workflow</a>
      <header className="app-header mb-5 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">EmailAuto Studio</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Brief → A/B copy + design brief · {BRAND_LIST.length} brands · segment-targeted
          </p>
        </div>
        <div className="header-actions shrink-0">
          <button onClick={startNewBrief} className="btn-primary">New brief</button>
          {authState === "in" ? (
            <>
              {profile?.is_admin && (
                <button onClick={() => setAdminOpen(true)} className="btn-ghost">Admin</button>
              )}
              <button onClick={() => setHistoryOpen(true)} className="btn-ghost">History</button>
              <span className="text-xs text-[var(--muted)]">{userEmail}</span>
              <button onClick={signOut} className="btn-ghost">Sign out</button>
            </>
          ) : (
            <span className="text-xs text-[var(--accent-2)]">Supabase not connected — History/Save disabled</span>
          )}
        </div>
      </header>

      {authState === "in" && (
        <History open={historyOpen} onClose={() => setHistoryOpen(false)} onOpenVersion={openVersion} />
      )}
      {authState === "in" && profile?.is_admin && (
        <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
      )}

      {/* top view nav */}
      <nav id="workflow-nav" className="top-nav mb-5" aria-label="Workflow">
        {([
          ["build", "1 · Build brief"],
          ["review", "2 · Review & generate"],
          ["output", "3 · A/B output"],
        ] as [View, string][]).map(([v, lbl]) => {
          const enabled = v === "build" || (v === "review") || (v === "output" && (options.a || options.b));
          return (
            <button
              key={v}
              onClick={() => enabled && setView(v)}
              disabled={!enabled}
              className={`nav-step ${view === v ? "nav-step-active" : ""}`}
            >
              {lbl}
            </button>
          );
        })}
      </nav>

      {pendingRestore && (
        <div className="section-panel mb-5 flex flex-wrap items-center gap-3" role="status">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Restore unsaved work?</div>
            <div className="text-xs text-[var(--muted)]">
              A previous session left generated A/B output for {BRANDS[pendingRestore.campaign.brandId]?.name || "a brand"} ({pendingRestore.campaign.segments.length} segment{pendingRestore.campaign.segments.length !== 1 ? "s" : ""}, saved {relativeTime(pendingRestore.savedAt)}).
            </div>
          </div>
          <button onClick={() => restoreDraft(pendingRestore)} className="btn-primary shrink-0">Restore</button>
          <button onClick={clearDraft} className="btn-ghost shrink-0">Discard</button>
        </div>
      )}

      <WorkflowSnapshot
        brandName={brand.name}
        send={dateToken(sendDate)}
        offer={offer}
        products={selectedProducts.length}
        segments={segments.length}
        score={activeBrief?._score}
      />

      {/* ============ BUILD (6-step accordion wizard) ============ */}
      {view === "build" && (
        <section className="flex flex-col gap-3">
          {STEP_TITLES.map((title, i) => (
            <StepCard
              key={i}
              n={i + 1}
              title={title}
              done={visited.has(i) && openStep !== i}
              open={openStep === i}
              summary={stepSummary(i)}
              onOpen={() => setOpenStep(openStep === i ? -1 : i)}
            >
              {i === 0 && (
                <div className="flex flex-col gap-5">
                  <Field label="Brand">
                    <div className="flex flex-wrap gap-2">
                      {BRAND_LIST.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => switchBrand(b.id)}
                          className={`choice-card ${brandId === b.id ? "choice-card-active" : ""}`}
                        >
                          <span className="inline-block w-3 h-3 rounded-full mr-2 align-middle" style={{ background: b.accent }} />
                          {b.name}
                          <span className="text-[var(--muted)] text-xs ml-2">{b.layout}</span>
                        </button>
                      ))}
                    </div>
                  </Field>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field label="Send date">
                      <input type="date" value={sendDate} aria-label="Send date" onChange={(e) => setSendDate(e.target.value)} className="input" />
                    </Field>
                    <Field label="Recipient name token">
                      <input value={recipientName} aria-label="Recipient name token" readOnly className="input" />
                    </Field>
                  </div>
                  <Field label="Campaign theme">
                    <input value={theme} aria-label="Campaign theme" onChange={(e) => setTheme(e.target.value)} placeholder="e.g. Spring comfort sale · Thank-you · Back in stock" className="input" />
                  </Field>
                  <Field label="Hook Contract (optional — leave blank to let the model build one)">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={buildSuggestedHookContract} className="btn-ghost">Auto-build from brief</button>
                      <span className="text-xs text-[var(--muted)]">Uses current brand, segments, hero, offer, urgency, and avoid notes.</span>
                    </div>
                    <textarea value={hookContract} aria-label="Hook Contract" onChange={(e) => setHookContract(e.target.value)} rows={3} className="input" placeholder="segment insight + emotion + hero product + price/proof + urgency + avoid rule" />
                  </Field>
                  <div className="border-t border-[var(--border)] pt-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">Strategy enrichment</h3>
                        <p className="text-xs text-[var(--muted)] mt-0.5">Goal, narrative, pain, solution, and tone cues.</p>
                      </div>
                      {strategyActive && (
                        <button type="button" onClick={() => { setStrategy({}); setToneError(null); }} className="btn-ghost">Clear strategy</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Campaign goal">
                        <input value={strategy.campaignGoal || ""} aria-label="Campaign goal" onChange={(e) => updateStrategy({ campaignGoal: e.target.value })} placeholder="e.g. Win back low-click buyers" className="input" />
                      </Field>
                      <Field label="Key message">
                        <input value={strategy.keyMessage || ""} aria-label="Key message" onChange={(e) => updateStrategy({ keyMessage: e.target.value })} placeholder="e.g. Comfort proof before the discount" className="input" />
                      </Field>
                    </div>
                    <Field label="Storyline progression">
                      <textarea value={strategy.storyline || ""} aria-label="Storyline progression" onChange={(e) => updateStrategy({ storyline: e.target.value })} rows={2} className="input" placeholder="How this send should fit into the larger customer story" />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Pain points">
                        <textarea value={strategy.painPoints || ""} aria-label="Pain points" onChange={(e) => updateStrategy({ painPoints: e.target.value })} rows={2} className="input" placeholder="Fit doubt, price hesitation, timing, gifting uncertainty" />
                      </Field>
                      <Field label="Solutions">
                        <textarea value={strategy.solutions || ""} aria-label="Solutions" onChange={(e) => updateStrategy({ solutions: e.target.value })} rows={2} className="input" placeholder="USP, review, price, shipping, return, product mechanism" />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                      <Field label="Tone source URL">
                        <input value={strategy.toneSourceUrl || ""} aria-label="Tone source URL" onChange={(e) => updateStrategy({ toneSourceUrl: e.target.value })} placeholder={brand.domain ? `https://${brand.domain}` : "https://..."} className="input" />
                      </Field>
                      <Field label="Tone cues">
                        <input value={strategy.toneKeywords || ""} aria-label="Tone cues" onChange={(e) => updateStrategy({ toneKeywords: e.target.value })} placeholder="warm, practical, premium" className="input" />
                      </Field>
                      <button type="button" onClick={extractToneFromUrl} disabled={toneExtracting} className="btn-ghost">
                        {toneExtracting ? "Extracting…" : "Extract cues"}
                      </button>
                    </div>
                    {toneError && <div className="text-xs text-[var(--bad)]">{toneError}</div>}
                  </div>
                </div>
              )}

              {i === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Field label="Discount / price component">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {([["sitewide_pct", "Sitewide % O.F.F"], ["fixed_price", "Fixed price"], ["none", "No discount"]] as [OfferType, string][]).map(([v, lbl]) => (
                        <button
                          key={v}
                          onClick={() => {
                            setOfferType(v);
                            if (v === "none") setOfferValue("");
                            else if (!offerValue) setOfferValue((OFFER_PRESETS[v] || [])[0] || "");
                          }}
                          className={`choice-card ${offerType === v ? "choice-card-active" : ""}`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                    {offerType !== "none" && (
                      <>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {(OFFER_PRESETS[offerType] || []).map((v) => (
                            <button
                              key={v}
                              onClick={() => setOfferValue(v)}
                              className={`choice-pill ${offerValue === v ? "choice-pill-active" : ""}`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                        <input value={offerValue} aria-label="Discount or price component" onChange={(e) => setOfferValue(e.target.value)} placeholder="e.g. 80% O.F.F or 💲12.99" className="input" />
                      </>
                    )}
                  </Field>
                  <Field label="Free-shipping component">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <button
                        onClick={() => setOfferShipping("")}
                        className={`choice-card ${!offerShipping ? "choice-card-active" : ""}`}
                      >
                        No free shipping
                      </button>
                      {SHIPPING_PRESETS.map((v) => (
                        <button
                          key={v}
                          onClick={() => setOfferShipping(v)}
                          className={`choice-pill ${offerShipping === v ? "choice-pill-active" : ""}`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <input value={offerShipping} aria-label="Free-shipping component" onChange={(e) => setOfferShipping(e.target.value)} placeholder="Custom shipping line, e.g. Free Shipping 💲35+" className="input" />
                    <div className="offer-preview">
                      Combined offer: <strong>{offer}</strong>
                    </div>
                  </Field>
                  <Field label="Urgency window">
                    <div className="flex flex-wrap gap-2">
                      {([["h24", "24 hrs"], ["h48", "48 hrs"], ["weekend", "Weekend"], ["none", "No urgency"]] as [Urgency, string][]).map(([v, lbl]) => (
                        <button key={v} onClick={() => setUrgency(v)}
                          className={`choice-card ${urgency === v ? "choice-card-active" : ""}`}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              )}

              {i === 2 && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-[var(--muted)]">
                    Slot 1 is the <strong className="text-[var(--text)]">Hero</strong> (featured in banner + body). Add up to {MAX_SLOTS} slots. Pick a catalog product or choose <strong className="text-[var(--text)]">Other product</strong> to paste a new page, then tick the USPs that should feed the copy + brief.
                  </p>
                  <Field label="Product block template">
                    <ProductStylePicker value={productCopyStyle} onChange={setProductCopyStyle} />
                  </Field>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {slots.map((slot, si) => (
                      <ProductSlotCard
                        key={si}
                        index={si}
                        slot={slot}
                        catalog={brand.catalog}
                        usedSlugs={slots.map((s) => s.slug).filter(Boolean)}
                        recentSlugs={recentProductSlugs}
                        onPick={(slug) => pickProduct(si, slug)}
                        onUrl={(url) => updateSlotUrl(si, url)}
                        onCustomChange={(patch) => updateSlot(si, patch)}
                        onScrape={(url) => scrapeSlot(si, url)}
                        onToggleUsp={(usp) => toggleSlotUsp(si, usp)}
                        onAddCustomUsp={() => addCustomUsp(si)}
                        onSetCustomUsp={(j, v) => setCustomUsp(si, j, v)}
                        onRemove={() => removeSlot(si)}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={addSlot} disabled={slots.length >= MAX_SLOTS} className="btn-ghost">+ Add product slot</button>
                    <button onClick={autoFillProductSet} className="btn-ghost">Auto-fill recommended set</button>
                    <span className="text-sm">
                      Filled: <strong>{selectedProducts.length}</strong>
                      {selectedProducts.length > maxProducts && <span className="text-[var(--bad)]"> — 7+ hurts conversion</span>}
                    </span>
                  </div>
                </div>
              )}

              {i === 3 && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-[var(--muted)]">
                    {brandId === "santa_fare" ? "Lifecycle tiers" : "Category segments"} — one email variant per selected segment, copy tuned to each.
                  </p>
                  <div className="flex flex-col gap-2">
                    {brand.productSegments.map((s) => (
                      <button key={s.code} onClick={() => toggle(segments, s.code, setSegments)}
                        className={`choice-card ${segments.includes(s.code) ? "choice-card-active" : ""}`}>
                        <span className="font-mono mr-2">{s.code}</span><strong className="text-[var(--text)]">{s.label}</strong>
                        <span className="text-[var(--muted)] ml-2 text-xs">{s.meta}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {i === 4 && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Send operations</h3>
                      <p className="text-sm text-[var(--muted)] mt-1">Keila-style launch context: provider, list source, consent, tracking, and handoff notes.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Field label="Provider">
                        <select value={ops.provider || "sendgrid"} aria-label="Email provider" onChange={(e) => updateOps({ provider: e.target.value as CampaignOps["provider"] })} className="input">
                          {OPS_PROVIDER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </Field>
                      <Field label="Sender name"><input value={ops.senderName || ""} aria-label="Sender name" onChange={(e) => updateOps({ senderName: e.target.value })} placeholder="Sandra at BraGoddess" className="input" /></Field>
                      <Field label="Verified sender email"><input value={ops.senderEmail || ""} aria-label="Verified sender email" onChange={(e) => updateOps({ senderEmail: e.target.value })} placeholder="hello@example.com" className="input" /></Field>
                      <Field label="Reply-to"><input value={ops.replyTo || ""} aria-label="Reply-to email" onChange={(e) => updateOps({ replyTo: e.target.value })} placeholder="support@example.com" className="input" /></Field>
                      <Field label="Audience source"><input value={ops.audienceSource || ""} aria-label="Audience source" onChange={(e) => updateOps({ audienceSource: e.target.value })} placeholder="Klaviyo engaged 120d, imported buyers" className="input" /></Field>
                      <Field label="Segment rule"><input value={ops.segmentRule || ""} aria-label="Segment rule" onChange={(e) => updateOps({ segmentRule: e.target.value })} placeholder="Send segment code to matching product interest" className="input" /></Field>
                      <Field label="Consent basis">
                        <select value={ops.consentBasis || "prior_purchase_or_opt_in"} aria-label="Consent basis" onChange={(e) => updateOps({ consentBasis: e.target.value as CampaignOps["consentBasis"] })} className="input">
                          {CONSENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </Field>
                      <Field label="Send window"><input value={ops.scheduleWindow || ""} aria-label="Send window" onChange={(e) => updateOps({ scheduleWindow: e.target.value })} placeholder="Tue 10am local / after QA" className="input" /></Field>
                      <div className="flex flex-col gap-2 pt-6">
                        <label className="ops-check"><input type="checkbox" checked={!!ops.doubleOptIn} onChange={(e) => updateOps({ doubleOptIn: e.target.checked })} /> Double opt-in</label>
                        <label className="ops-check"><input type="checkbox" checked={ops.trackOpens !== false} onChange={(e) => updateOps({ trackOpens: e.target.checked })} /> Track opens</label>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="ops-check"><input type="checkbox" checked={ops.trackClicks !== false} onChange={(e) => updateOps({ trackClicks: e.target.checked })} /> Track clicks</label>
                      <label className="ops-check"><input type="checkbox" checked={!!ops.publicArchive} onChange={(e) => updateOps({ publicArchive: e.target.checked })} /> Public archive link</label>
                      <button type="button" onClick={() => setOps(DEFAULT_OPS)} className="btn-ghost">Reset ops</button>
                    </div>
                    <Field label="UTM plan"><input value={ops.utmPlan || ""} aria-label="UTM plan" onChange={(e) => updateOps({ utmPlan: e.target.value })} placeholder="utm_source=sendgrid&utm_medium=email&utm_campaign={{campaign_name}}" className="input" /></Field>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Suppression hygiene"><textarea value={ops.suppressionNotes || ""} aria-label="Suppression hygiene" onChange={(e) => updateOps({ suppressionNotes: e.target.value })} rows={2} className="input" placeholder="Exclude recent purchasers, unsubscribed, complaints, hard bounces" /></Field>
                      <Field label="Compliance notes"><textarea value={ops.complianceNotes || ""} aria-label="Compliance notes" onChange={(e) => updateOps({ complianceNotes: e.target.value })} rows={2} className="input" placeholder="Footer/unsubscribe handled by renderer; region-specific note if needed" /></Field>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4">
                    <p className="text-sm text-[var(--muted)]">Optional - helps the model rotate away from the last send's angle/hero.</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Field label="Last send CTR %"><input value={lastCtr} aria-label="Last send CTR percent" onChange={(e) => setLastCtr(e.target.value)} placeholder="0.84" className="input" /></Field>
                      <Field label="Last hero"><input value={lastHero} aria-label="Last hero product" onChange={(e) => setLastHero(e.target.value)} placeholder="Daisy Bra" className="input" /></Field>
                      <Field label="Last angle"><input value={lastAngle} aria-label="Last send angle" onChange={(e) => setLastAngle(e.target.value)} placeholder="Proof" className="input" /></Field>
                    </div>
                    <Field label="Note (e.g. 3rd reviews arc - avoid)"><input value={lastNote} aria-label="Last-send note" onChange={(e) => setLastNote(e.target.value)} className="input" /></Field>
                  </div>
                </div>
              )}

              {i === 5 && (
                <Field label="Winning reference email (optional — mirror its structure/pacing, fresh copy)">
                  <textarea value={winningContent} aria-label="Winning reference email" onChange={(e) => setWinningContent(e.target.value)} rows={5} className="input" placeholder="Paste a high-performing email here…" />
                </Field>
              )}

              <div className="flex items-center gap-2 mt-4">
                <button onClick={() => goNext(i)} className="btn-primary">
                  {i === STEP_TITLES.length - 1 ? "Review & generate" : "Next"}
                </button>
                {(i === 4 || i === 5) && (
                  <button onClick={() => goNext(i)} className="btn-ghost">Skip</button>
                )}
              </div>
            </StepCard>
          ))}
        </section>
      )}

      {/* ============ REVIEW (step 7: pre-flight + prompts before sending) ============ */}
      {view === "review" && (
        <section className="flex flex-col gap-4">
          <PerfPanel brandId={brandId} hero={selectedProducts[0]?.name} productCount={selectedProducts.length} />
          <WinTemplateRhythm />
          <PlaybookChecklist
            brandId={brandId}
            hookContract={hookContract}
            offer={offer}
            productCount={selectedProducts.length}
            segments={segments.length}
            hasLastSend={Boolean(lastHero || lastAngle || lastNote)}
          />
          <OpsReadinessPanel ops={ops} segments={segments.length} />

          <div className="section-panel">
            <h3 className="text-sm font-semibold mb-2">Pre-flight summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <Summary k="Brand" v={brand.name} />
              <Summary k="Send" v={dateToken(sendDate)} />
              <Summary k="Theme" v={theme || "—"} />
              <Summary k="Promo" v={offer} />
              <Summary k="Urgency" v={urgency} />
              <Summary k="Segments" v={segments.map((s) => s).join(", ") || "—"} />
              <Summary k="Products" v={`${selectedProducts.length} (${selectedProducts.map((p) => p.name).join(", ")})`} />
              <Summary k="Body layout" v={bodyLayout} />
              <Summary k="Product copy" v={productCopyStyle.replace(/_/g, " ")} />
              <Summary k="Strategy" v={strategyActive ? [strategy.campaignGoal, strategy.keyMessage, strategy.toneKeywords].filter(Boolean).join(" · ") || "enriched" : "none"} />
              <Summary k="Ops" v={opsSummary} />
            </div>
          </div>

          <p className="text-sm text-[var(--muted)]">
            One generation run produces <strong className="text-[var(--text)]">per-segment copy + the design brief</strong>. The server requests A and B in parallel, batches large segment sets when using default prompts, and retries B if route/body/banner/product-copy contrast collapses.
          </p>
          {autoSegmentBatching && (
            <Banner level="warn">
              Automatic segment batching is on for this run: shared strategy is generated first, then segment copy is split into smaller batches and merged into one A/B brief.
            </Banner>
          )}
          {segments.length > 2 && promptOverridesActive && (
            <Banner level="warn">
              Custom system/user prompt edits disable automatic segment batching. Reset those prompt edits before generating if this many segments keeps timing out.
            </Banner>
          )}
          {apiError && <Banner level="fail">{apiError}</Banner>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ModelSelector label="Option A model" value={modelA} onChange={setModelA} providers={AI_PROVIDERS} />
            <ModelSelector label="Option B model" value={modelB} onChange={setModelB} providers={AI_PROVIDERS} />
          </div>
          <Banner level="warn">
            Timeout tip: Opus, Pro, and full frontier GPT models can be slow on multi-segment briefs. For fastest runs, use Claude Haiku, Gemini Flash/Lite, or GPT mini/nano, then regenerate with a stronger model only for final polish.
          </Banner>
          <GenerationBudgetPanel
            systemPrompt={effectiveSystem}
            userPrompt={effectiveUser}
            segments={segments.length}
            products={selectedProducts.length}
            autoBatching={autoSegmentBatching}
            promptOverridesActive={promptOverridesActive}
            modelA={modelA}
            modelB={modelB}
          />

          <PromptBlock
            title="Performance context"
            subtitle="Injected into the system prompt; edit to steer this campaign's intelligence"
            value={effectivePerfContext}
            edited={customPerfContext !== null}
            onChange={(v) => setCustomPerfContext(v)}
            onReset={() => setCustomPerfContext(null)}
          />

          <PromptBlock
            title="System prompt (shared, cached)"
            subtitle={`${brand.name} · ${brand.persona} — B also gets a parallel contrast clause`}
            value={effectiveSystem}
            edited={systemPromptEdited}
            onChange={(v) => setSystemOverride(v)}
            onReset={() => setSystemOverride(null)}
          />
          <PromptBlock
            title="User prompt (shared by A & B)"
            subtitle="lead creative direction, then all copy sections"
            value={effectiveUser}
            edited={userPromptEdited}
            onChange={(v) => setUserOverride(v)}
            onReset={() => setUserOverride(null)}
          />

          <div className="flex items-center gap-2">
            <button onClick={() => setView("build")} className="btn-ghost">Back to brief</button>
            <button onClick={() => generate()} disabled={generating || !canGenerate} className="btn-primary">
              {generating ? "Generating A + B…" : "Generate A + B"}
            </button>
            {!canGenerate && <span className="text-xs text-[var(--warn)]">Pick at least one segment and 1–{maxProducts} products.</span>}
          </div>
          {generating && <GenerationProgress elapsedSec={elapsedSec} onCancel={cancelGenerate} />}
        </section>
      )}

      {/* ============ OUTPUT (A/B per-segment preview + brief + export) ============ */}
      {view === "output" && (
        <section className="flex flex-col gap-4">
          {!options.a && !options.b ? (
            <Banner level="warn">Nothing generated yet — go to Review & generate.</Banner>
          ) : (
            <>
              {/* Option A/B selector */}
              <div className="flex flex-wrap items-center gap-3">
                {(["a", "b"] as OptKey[]).map((opt) => {
                  const b = options[opt];
                  if (!b) return null;
                  const cd = b.creative_direction || {};
                  const active = activeOption === opt;
                  return (
                    <button key={opt} onClick={() => setActiveOption(opt)}
                      className={`choice-card ${active ? "choice-card-active" : ""}`}>
                      <div className="text-sm font-semibold">Option {opt.toUpperCase()} <span className="ml-1 text-xs" style={{ color: scoreColor(b._score) }}>{b._score ?? "—"}/100</span></div>
                      <div className="text-xs text-[var(--muted)]">{cd.angle || "?"} · {cd.framework || "?"}</div>
                      {b._model && <div className="text-[10px] mono text-[var(--muted)]">{b._provider || "AI"} · {b._model}</div>}
                      {b._prompt_version && <div className="text-[10px] mono text-[var(--muted)] truncate" title={b._prompt_version}>{b._prompt_version}</div>}
                    </button>
                  );
                })}
                <div className="flex-1" />
                {options.a && options.b && (
                  <button onClick={() => setCompareMode((v) => !v)} className={`choice-pill ${compareMode ? "choice-pill-active" : ""}`} title="View A and B side by side for the current segment">
                    {compareMode ? "Exit compare" : "Compare A · B"}
                  </button>
                )}
                <button onClick={() => generate()} disabled={generating} className="btn-ghost">{generating ? "Regenerating…" : "Regenerate A + B"}</button>
              </div>

              {genWarning && <Banner level="warn">{genWarning}</Banner>}
              {incompleteOutputLabels.length > 0 && (
                <Banner level="fail">
                  Incomplete generated coverage: {incompleteOutputLabels.slice(0, 8).join(", ")}
                  {incompleteOutputLabels.length > 8 ? `, +${incompleteOutputLabels.length - 8} more` : ""}. Export and SendGrid sync will ask for confirmation or stay blocked on affected segments.
                </Banner>
              )}
              {generating && <GenerationProgress elapsedSec={elapsedSec} onCancel={cancelGenerate} />}

              {activeBrief && <FormatCoverage brief={activeBrief} />}
              {options.a && options.b && <ABContrastPanel a={options.a} b={options.b} />}

              <div className="section-panel">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-sm font-semibold">Regenerate from feedback</h3>
                    <p className="text-xs text-[var(--muted)]">Uses the current A/B output as context, then regenerates complete playbook-checked options.</p>
                  </div>
                  <button onClick={useQaFlagsAsFeedback} disabled={!activeBrief?._flags?.length} className="btn-ghost">Use QA flags</button>
                </div>
                <textarea
                  value={revisionFeedback}
                  onChange={(e) => setRevisionFeedback(e.target.value)}
                  rows={3}
                  className="input"
                  placeholder="Example: Make Option B less discount-first, tighten the banner bullets, keep Daisy as hero, and add the shipping threshold in paragraph 1."
                />
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={regenerateFromFeedback} disabled={generating || !revisionFeedback.trim()} className="btn-primary">
                    {generating ? "Regenerating…" : "Apply feedback · regenerate A + B"}
                  </button>
                  <button onClick={() => setRevisionFeedback("")} disabled={!revisionFeedback.trim()} className="btn-ghost">Clear</button>
                </div>
              </div>

              {/* segment tabs */}
              <VariantTabs variants={segments} active={activeSegment} onSelect={setActiveSegment} labelFor={(s) => `${s} · ${segLabel(s)}`} incompleteFor={(s) => segmentIncomplete(activeOption, s)} />

              {/* side-by-side A | B compare (read-only) for the active segment */}
              {compareMode && options.a && options.b && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {(["a", "b"] as OptKey[]).map((opt) => {
                    const br = options[opt]!;
                    const cd = br.creative_direction || {};
                    const subj = subjectFor(opt, activeSegment);
                    const pre = preheaderFor(opt, activeSegment);
                    return (
                      <div key={opt} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">
                            Option {opt.toUpperCase()}
                            <span className="ml-1 text-xs" style={{ color: scoreColor(br._score) }}>{br._score ?? "—"}/100</span>
                          </span>
                          <span className="text-xs text-[var(--muted)] truncate">{cd.angle || "?"} · {cd.framework || "?"}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-[var(--muted)]">Subject: </span><strong>{subj}</strong>
                          <span className="ml-1 font-semibold" style={{ color: subjectLenColor(subj.length) }}>{subj.length}c</span>
                          {pre && <div className="text-[var(--muted)] mt-0.5 truncate">{pre}</div>}
                        </div>
                        <Preview html={htmlFor(opt, activeSegment)} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* output sub-tabs */}
              {!compareMode && (
                <div className="flex gap-2">
                  {(["preview", "brief"] as const).map((t) => (
                    <button key={t} onClick={() => setOutputTab(t)}
                      className={`choice-pill ${outputTab === t ? "choice-pill-active" : ""}`}>
                      {t === "preview" ? "Preview" : "Design brief"}
                    </button>
                  ))}
                </div>
              )}

              {!compareMode && activeBrief && segmentIncomplete(activeOption, activeSegment) && (
                <Banner level="fail">
                  No generated copy for segment {activeSegment} in Option {activeOption.toUpperCase()} — the preview shows a placeholder subject. Regenerate or edit before exporting or pushing to SendGrid.
                </Banner>
              )}

              {!compareMode && activeBrief && outputTab === "preview" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <div className="mb-2 text-sm">
                      <span className="text-[var(--muted)]">Subject: </span>
                      <strong>{subjectFor(activeOption, activeSegment)}</strong>
                      <span className="ml-2 font-semibold" style={{ color: subjectLenColor(subjectFor(activeOption, activeSegment).length) }} title="Playbook target 42–58 (hard cap 60)">
                        {subjectFor(activeOption, activeSegment).length}c
                      </span>
                      {preheaderFor(activeOption, activeSegment) && (
                        <div className="text-xs text-[var(--muted)] mt-1">
                          Preheader: {preheaderFor(activeOption, activeSegment)}
                          <span className="ml-2 font-semibold" style={{ color: preheaderLenColor(preheaderFor(activeOption, activeSegment).length) }} title="Playbook target 60–90">
                            {preheaderFor(activeOption, activeSegment).length}c
                          </span>
                        </div>
                      )}
                    </div>
                    <SubjectOptionsPanel brief={activeBrief} segment={activeSegment} onUse={useSubjectOption} />
                    <LayoutPicker count={selectedProducts.length} value={productLayout} onChange={(v) => { setProductLayout(v); setHtmlOverrides({}); }} />
                    <BodyLayoutPicker
                      value={bodyLayout}
                      moduleLayout={moduleLayout}
                      onChange={(v) => { setBodyLayout(v); setHtmlOverrides({}); }}
                      onModuleLayoutChange={(next) => { setModuleLayout(next); setBodyLayout("custom"); setHtmlOverrides({}); }}
                    />
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => setEditingHtml((v) => !v)}
                        className={`choice-pill ${editingHtml ? "choice-pill-active" : ""}`}
                      >
                        {editingHtml ? "Done editing" : "Edit HTML"}
                      </button>
                      {activeHtmlEdited && (
                        <>
                          <span className="text-xs text-[var(--accent-2)]">· edited</span>
                          <button
                            onClick={() => setHtmlOverrides((o) => { const n = { ...o }; delete n[activeHtmlKey]; return n; })}
                            className="btn-ghost"
                          >
                            Reset to generated
                          </button>
                        </>
                      )}
                    </div>
                    {editingHtml && (
                      <HtmlFormatEditor
                        key={activeHtmlKey}
                        value={htmlFor(activeOption, activeSegment)}
                        accent={brand.accent}
                        onChange={(value) => setHtmlOverrides((o) => ({ ...o, [activeHtmlKey]: value }))}
                      />
                    )}
                    <Preview html={htmlFor(activeOption, activeSegment)} />
                  </div>
                  <div className="flex flex-col gap-4 lg:sticky lg:top-4 self-start">
                    <ImageEditor brand={brand} products={selectedProducts} images={images} onChange={setImages} includeLogo={includeLogo} onToggleLogo={setIncludeLogo} />
                    <PreflightPanel
                      flags={activeBrief._flags}
                      score={activeBrief._score}
                      variety={varietyProfile}
                      deliverability={analyzeBriefDeliverability(activeBrief, htmlFor(activeOption, activeSegment))}
                    />
                  </div>
                </div>
              )}

              {!compareMode && activeBrief && outputTab === "brief" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <button onClick={exportExcel} className="btn-primary">Export to Excel (.xls · A + B)</button>
                    <span className="text-xs text-[var(--muted)]">One sheet per option, matching the email-brief format.</span>
                  </div>
                  <BriefView key={activeOption} brief={activeBrief} onDownload={downloadBrief} onChange={updateActiveBrief} />
                </div>
              )}

              {/* export */}
              <div className="section-panel flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-sm font-semibold">Export</h3>
                  <button onClick={downloadAll} className="btn-primary">Download all (.zip)</button>
                  {authState === "in" && (
                    <button onClick={saveCurrent} disabled={saveState === "saving"} className="btn-ghost">
                      {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved to history" : "Save version"}
                    </button>
                  )}
                  {saveState === "error" && <span className="text-xs text-[var(--bad)]">{saveError}</span>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(["a", "b"] as OptKey[]).flatMap((opt) =>
                    options[opt] ? segments.map((seg) => {
                      const key = `${opt}:${seg}`;
                      const sync = syncResults[key];
                      const tpl = tplResults[key];
                      const html = htmlFor(opt, seg);
                      const incomplete = segmentIncomplete(opt, seg);
                      return (
                        <div key={key} className="flex flex-col gap-2 p-3 rounded-lg border border-[var(--border)]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm"><strong>{opt.toUpperCase()}</strong> · <span className="font-mono">{seg}</span> <span className="text-[var(--muted)]">{segLabel(seg)}</span></span>
                            <div className="flex gap-2">
                              <CopyButton text={html} />
                              <button onClick={() => download(`${templateName(opt, seg)}.html`, html)} className="btn-ghost">.html</button>
                              <button disabled={syncingKey === key || incomplete} onClick={() => syncDesign(opt, seg)} className="btn-ghost" title={incomplete ? "Complete this segment before pushing to SendGrid Design" : undefined}>{syncingKey === key ? "…" : "Design"}</button>
                              <button disabled={tplKey === key || incomplete} onClick={() => syncTemplate(opt, seg)} className="btn-ghost" title={incomplete ? "Complete this segment before creating a SendGrid template" : undefined}>{tplKey === key ? "Cleaning…" : "Template"}</button>
                            </div>
                          </div>
                          {incomplete && <div className="text-xs text-[var(--bad)]">Blocked for SendGrid: missing generated subject/body for this segment.</div>}
                          {sync?.id && <div className="text-xs text-[var(--ok)]">Design {sync.id} — <a href={sync.editorUrl} target="_blank" rel="noreferrer" className="underline">open</a></div>}
                          {sync?.error && <div className="text-xs text-[var(--bad)]">Error: {sync.error}</div>}
                          {tpl?.templateId && (
                            <div className="text-xs text-[var(--ok)] flex flex-wrap items-center gap-2">
                              <span>Template</span>
                              <code className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5">{tpl.templateId}</code>
                              <CopyButton text={tpl.templateId!} label="copy id" className="underline text-[var(--muted)]" />
                              <a href={tpl.editorUrl} target="_blank" rel="noreferrer" className="underline">open</a>
                            </div>
                          )}
                          {tpl?.error && <div className="text-xs text-[var(--bad)]">Error: {tpl.error}</div>}
                          {tpl?.blocking?.map((b, i) => <div key={`b${i}`} className="text-xs text-[var(--bad)]">Blocking: {b}</div>)}
                          {tpl?.warnings?.map((w, i) => <div key={`w${i}`} className="text-xs text-[var(--warn)]">Warning: {w}</div>)}
                        </div>
                      );
                    }) : []
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      )}

    </main>
  );
}

function CopyButton({ text, label = "Copy", className = "btn-ghost" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("ok");
        } catch {
          setState("err");
        }
        setTimeout(() => setState("idle"), 1500);
      }}
    >
      {state === "ok" ? "Copied ✓" : state === "err" ? "Copy failed" : label}
    </button>
  );
}

// Subject 42-58 (hard cap 60) and preheader 60-90 are the playbook bands; colour the char counts.
function subjectLenColor(len: number): string {
  if (len >= 42 && len <= 58) return "var(--ok)";
  if (len <= 60 && len >= 36) return "var(--warn)";
  return "var(--bad)";
}
function preheaderLenColor(len: number): string {
  if (len === 0) return "var(--muted)";
  if (len >= 60 && len <= 90) return "var(--ok)";
  if (len >= 50 && len <= 100) return "var(--warn)";
  return "var(--bad)";
}

function relativeTime(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} day(s) ago`;
}

function GenerationProgress({ elapsedSec, onCancel }: { elapsedSec: number; onCancel: () => void }) {
  const mins = Math.floor(elapsedSec / 60);
  const label = mins > 0 ? `${mins}m ${String(elapsedSec % 60).padStart(2, "0")}s` : `${elapsedSec}s`;
  const stage =
    elapsedSec < 20
      ? "Requesting both options in parallel…"
      : elapsedSec < 60
      ? "Writing per-segment copy + design brief, then validating…"
      : "Large segment sets generate in batches — Opus/Pro/frontier briefs can take 1–3 minutes.";
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="section-panel flex items-center gap-3">
      <span
        aria-hidden
        className="animate-spin shrink-0"
        style={{ display: "inline-block", width: 16, height: 16, borderRadius: 9999, border: "2px solid var(--border)", borderTopColor: "var(--text)" }}
      />
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium">Generating A + B — {label} elapsed</span>
        <span className="text-xs text-[var(--muted)]">{stage}</span>
      </div>
      <div className="flex-1" />
      <button onClick={onCancel} className="btn-ghost shrink-0">Cancel</button>
    </div>
  );
}

function GenerationBudgetPanel({
  systemPrompt,
  userPrompt,
  segments,
  products,
  autoBatching,
  promptOverridesActive,
  modelA,
  modelB,
}: {
  systemPrompt: string;
  userPrompt: string;
  segments: number;
  products: number;
  autoBatching: boolean;
  promptOverridesActive: boolean;
  modelA: AIModelSelection;
  modelB: AIModelSelection;
}) {
  const inputTokens = estimateTokens(systemPrompt.length + userPrompt.length);
  const outputPerOption = 1800 + segments * 850 + products * 220;
  const batchCount = autoBatching ? Math.max(1, Math.ceil(segments / 2)) : 1;
  const baseCalls = batchCount * 2;
  const totalOutputBudget = outputPerOption * 2;
  const highRisk =
    promptOverridesActive && segments > 2 ||
    inputTokens > 9000 ||
    totalOutputBudget > 14000 ||
    [modelA, modelB].some((m) => modelOpsProfile(m).tier === "premium");
  return (
    <div className="section-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold">Generation budget</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">Estimate before spend: prompt size, expected output, batching, and model speed profile.</p>
        </div>
        <span className="status-pill" style={{ color: highRisk ? "var(--warn)" : "var(--ok)" }}>
          {highRisk ? "Watch cost/time" : "Healthy run"}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Summary k="Input estimate" v={`${inputTokens.toLocaleString()} tokens`} />
        <Summary k="Output estimate" v={`~${Math.round(totalOutputBudget / 1000)}k tokens`} />
        <Summary k="Base calls" v={`${baseCalls} call${baseCalls === 1 ? "" : "s"}`} />
        <Summary k="Batching" v={autoBatching ? `${batchCount} segment batches` : promptOverridesActive && segments > 2 ? "Off: prompt edited" : "Single batch"} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
        <ModelBudgetCard label="Option A" selection={modelA} />
        <ModelBudgetCard label="Option B" selection={modelB} />
      </div>
      {promptOverridesActive && segments > 2 && (
        <div className="text-xs mt-2" style={{ color: "var(--warn)" }}>
          Custom prompt edits disable automatic segment batching. Reset system/user prompt edits for more reliable large-segment runs.
        </div>
      )}
    </div>
  );
}

function estimateTokens(chars: number): number {
  return Math.max(1, Math.ceil(chars / 4));
}

function modelOpsProfile(selection: AIModelSelection): { tier: "fast" | "balanced" | "premium"; label: string } {
  const id = selection.model.toLowerCase();
  if (/opus|pro/.test(id) && !/mini|nano|flash-lite|lite/.test(id)) return { tier: "premium", label: "Premium quality, slower/costlier" };
  if (/haiku|flash|lite|mini|nano/.test(id)) return { tier: "fast", label: "Fast/economical" };
  return { tier: "balanced", label: "Balanced quality/speed" };
}

function ModelBudgetCard({ label, selection }: { label: string; selection: AIModelSelection }) {
  const profile = modelOpsProfile(selection);
  const color = profile.tier === "premium" ? "var(--warn)" : profile.tier === "fast" ? "var(--ok)" : "var(--accent)";
  return (
    <div className="summary-tile">
      <div className="text-[10px] uppercase text-[var(--muted)]">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{selection.provider}</div>
      <div className="text-[11px] mono text-[var(--muted)] mt-0.5 truncate" title={selection.model}>{selection.model}</div>
      <div className="text-xs font-semibold mt-1" style={{ color }}>{profile.label}</div>
    </div>
  );
}

function scoreColor(s?: number): string {
  const v = typeof s === "number" ? s : 100;
  return v >= 80 ? "var(--ok)" : v >= 55 ? "var(--warn)" : "var(--bad)";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={id}>
      <span id={id} className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function Summary({ k, v }: { k: string; v: string }) {
  return (
    <div className="summary-tile">
      <div className="text-[10px] uppercase text-[var(--muted)]">{k}</div>
      <div className="mt-0.5 truncate" title={v}>{v}</div>
    </div>
  );
}

function WorkflowSnapshot({
  brandName,
  send,
  offer,
  products,
  segments,
  score,
}: {
  brandName: string;
  send: string;
  offer: string;
  products: number;
  segments: number;
  score?: number;
}) {
  return (
    <div className="mb-5 grid grid-cols-2 md:grid-cols-5 gap-2">
      <SnapshotChip label="Brand" value={`${brandName} · ${send}`} />
      <SnapshotChip label="Offer stack" value={offer} />
      <SnapshotChip label="Products" value={`${products} selected`} tone={products > 6 ? "bad" : products ? "ok" : "warn"} />
      <SnapshotChip label="Segments" value={`${segments} variant${segments === 1 ? "" : "s"}`} tone={segments ? "ok" : "warn"} />
      <SnapshotChip label="Launch score" value={typeof score === "number" ? `${score}/100` : "Not generated"} tone={typeof score === "number" ? (score >= 85 ? "ok" : score >= 60 ? "warn" : "bad") : undefined} />
    </div>
  );
}

function SnapshotChip({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const color = tone ? `var(--${tone})` : "var(--muted)";
  return (
    <div className="snapshot-chip">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold truncate" title={value} style={{ color }}>{value}</div>
    </div>
  );
}

function WinTemplateRhythm() {
  const items = [
    ["Body rhythm", "3-5 short beats"],
    ["Visual cadence", "5-8 linked images"],
    ["Grid shape", "6-10 columns"],
    ["Emphasis", "2-4 accent cues"],
  ];
  return (
    <div className="section-panel">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold">Win-template rhythm</h3>
        <span className="text-xs text-[var(--muted)]">WinEmailTemps reference set</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="summary-tile">
            <div className="text-[10px] uppercase text-[var(--muted)]">{label}</div>
            <div className="text-sm font-semibold mt-0.5">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaybookChecklist({
  brandId,
  hookContract,
  offer,
  productCount,
  segments,
  hasLastSend,
}: {
  brandId: string;
  hookContract: string;
  offer: string;
  productCount: number;
  segments: number;
  hasLastSend: boolean;
}) {
  const focusedGrid =
    brandId === "santa_fare"
      ? productCount > 0 && productCount <= 4
      : productCount >= 4 && productCount <= 6 && productCount % 2 === 0;
  const items = [
    {
      label: "Hook contract",
      value: hookContract.trim() ? "Locked by brief" : "Model will construct it",
      tone: hookContract.trim() ? "ok" : "warn",
    },
    {
      label: "One promise",
      value: segments ? `${segments} segment thread${segments === 1 ? "" : "s"}` : "No segment selected",
      tone: segments ? "ok" : "bad",
    },
    {
      label: "Price proof",
      value: /^No promo/i.test(offer) ? "No promo; use product facts" : "Offer must show in body + grid",
      tone: /^No promo/i.test(offer) ? "warn" : "ok",
    },
    {
      label: "Grid shape",
      value: focusedGrid ? "Playbook range" : brandId === "santa_fare" ? "Aim for 4 products" : "Aim for 4-6 even",
      tone: focusedGrid ? "ok" : "warn",
    },
    {
      label: "Rotation",
      value: hasLastSend ? "Avoid rule supplied" : "Add last-send avoid if known",
      tone: hasLastSend ? "ok" : "warn",
    },
    {
      label: "Subject order",
      value: "Generated last from finished copy",
      tone: "ok",
    },
  ] as const;

  return (
    <div className="section-panel">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold">Playbook operator checklist</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">From email-campaign-playbook.html: lock one hook, prove it, then generate subjects last.</p>
        </div>
        <span className="text-xs text-[var(--muted)]">Pre-generation QA</span>
      </div>
      <div className="playbook-grid">
        {items.map((item) => (
          <div key={item.label} className={`playbook-card playbook-card-${item.tone}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase text-[var(--muted)]">{item.label}</div>
              <span className="playbook-status">{item.tone}</span>
            </div>
            <div className="text-sm font-semibold mt-1">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpsReadinessPanel({ ops, segments }: { ops: CampaignOps; segments: number }) {
  const provider = OPS_PROVIDER_OPTIONS.find(([value]) => value === ops.provider)?.[1] || "SendGrid";
  const consentLabel = CONSENT_OPTIONS.find(([value]) => value === ops.consentBasis)?.[1] || "Purchase/opt-in";
  const items = [
    {
      label: "Provider",
      value: provider,
      tone: "ok",
    },
    {
      label: "Sender",
      value: ops.senderEmail?.trim() ? ops.senderEmail : "Add verified sender",
      tone: ops.senderEmail?.trim() ? "ok" : "warn",
    },
    {
      label: "Audience",
      value: ops.audienceSource?.trim() ? `${segments} segment${segments === 1 ? "" : "s"} from source` : "List/source missing",
      tone: ops.audienceSource?.trim() && segments > 0 ? "ok" : "bad",
    },
    {
      label: "Segment rule",
      value: ops.segmentRule?.trim() ? "Routing rule documented" : "Map segments to list/filter",
      tone: ops.segmentRule?.trim() ? "ok" : "warn",
    },
    {
      label: "Consent",
      value: `${consentLabel}${ops.doubleOptIn ? " + double opt-in" : ""}`,
      tone: ops.consentBasis === "unknown" ? "bad" : "ok",
    },
    {
      label: "Suppression",
      value: ops.suppressionNotes?.trim() ? "Exclusions documented" : "Add bounces/unsubs/recent buyers",
      tone: ops.suppressionNotes?.trim() ? "ok" : "warn",
    },
    {
      label: "Tracking",
      value: ops.trackClicks === false ? "Click tracking off" : ops.utmPlan?.trim() ? "Clicks + UTM ready" : "UTM needed",
      tone: ops.trackClicks === false ? "warn" : ops.utmPlan?.trim() ? "ok" : "bad",
    },
    {
      label: "Schedule",
      value: ops.scheduleWindow?.trim() || "No send window",
      tone: ops.scheduleWindow?.trim() ? "ok" : "warn",
    },
  ] as const;
  const okCount = items.filter((item) => item.tone === "ok").length;
  const hasBlocking = items.some((item) => item.tone === "bad");

  return (
    <div className="section-panel">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold">Campaign ops readiness</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">Production checks inspired by Keila: sender, audience, consent, tracking, and scheduling.</p>
        </div>
        <span className={`text-xs font-semibold ${hasBlocking ? "text-[var(--bad)]" : "text-[var(--ok)]"}`}>{okCount}/{items.length} ready</span>
      </div>
      <div className="playbook-grid">
        {items.map((item) => (
          <div key={item.label} className={`playbook-card playbook-card-${item.tone}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase text-[var(--muted)]">{item.label}</div>
              <span className="playbook-status">{item.tone}</span>
            </div>
            <div className="text-sm font-semibold mt-1">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormatCoverage({ brief }: { brief: GenBrief }) {
  const scan = JSON.stringify({ banner: brief.banner, body: brief.body, products: brief.products });
  const accent = scan.match(/==[^=]+==/g)?.length || 0;
  const bold = scan.match(/\*\*[^*]+\*\*/g)?.length || 0;
  const links = scan.match(/\[[^\]]+\]\((?:slug:[a-z0-9_-]+|home)\)/gi)?.length || 0;
  const chips = [
    { label: "Accent color", value: `${accent}`, ok: accent >= 1 && accent <= 6 },
    { label: "Bold beats", value: `${bold}`, ok: bold >= 1 },
    { label: "Hyperlinks", value: `${links}`, ok: links >= 1 },
  ];
  return (
    <div className="section-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold mr-1">Formatting coverage</span>
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="text-xs rounded-full border px-2.5 py-1"
            style={{
              borderColor: chip.ok ? "var(--ok)" : "var(--warn)",
              color: chip.ok ? "var(--ok)" : "var(--warn)",
              background: "var(--surface-2)",
            }}
          >
            {chip.label}: {chip.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function ABContrastPanel({ a, b }: { a: GenBrief; b: GenBrief }) {
  const aCd = a.creative_direction || {};
  const bCd = b.creative_direction || {};
  const aCounts = flagTierCounts(a._flags);
  const bCounts = flagTierCounts(b._flags);
  const sameRoute = routeText(aCd) && routeText(aCd) === routeText(bCd);
  const sameAngle = aCd.angle && aCd.angle === bCd.angle;
  const sameFramework = aCd.framework && aCd.framework === bCd.framework;
  const risk = sameRoute || sameAngle || sameFramework;
  return (
    <div className="section-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold">A/B contrast snapshot</h3>
          <p className="text-xs text-[var(--muted)]">Checks whether the test is a real challenger, not a synonym swap.</p>
        </div>
        <span className="status-pill" style={{ color: risk ? "var(--warn)" : "var(--ok)" }}>
          {risk ? "Review contrast" : "Distinct routes"}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <ContrastCard
          label="Option A"
          route={routeText(aCd) || "No route"}
          angle={aCd.angle || "No angle"}
          framework={aCd.framework || "No framework"}
          model={[a._provider, a._model].filter(Boolean).join(" · ") || "AI"}
          score={a._score}
          issues={`${aCounts.errors} err · ${aCounts.serious} serious · ${aCounts.structural} structural`}
        />
        <ContrastCard
          label="Option B"
          route={routeText(bCd) || "No route"}
          angle={bCd.angle || "No angle"}
          framework={bCd.framework || "No framework"}
          model={[b._provider, b._model].filter(Boolean).join(" · ") || "AI"}
          score={b._score}
          issues={`${bCounts.errors} err · ${bCounts.serious} serious · ${bCounts.structural} structural`}
        />
      </div>
      {risk && (
        <div className="text-xs mt-2" style={{ color: "var(--warn)" }}>
          Same-field risk: {[sameRoute && "route", sameAngle && "angle", sameFramework && "framework"].filter(Boolean).join(", ")}. Add this to feedback if the options feel too close.
        </div>
      )}
    </div>
  );
}

function routeText(cd: GenBrief["creative_direction"] | Record<string, unknown>): string {
  return [cd.branch, cd.brief_route].filter(Boolean).join(" · ");
}

function ContrastCard({
  label,
  route,
  angle,
  framework,
  model,
  score,
  issues,
}: {
  label: string;
  route: string;
  angle: string;
  framework: string;
  model: string;
  score?: number;
  issues: string;
}) {
  return (
    <div className="summary-tile">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-xs font-bold" style={{ color: scoreColor(score) }}>{typeof score === "number" ? `${score}/100` : "—"}</div>
      </div>
      <div className="text-sm font-semibold mt-1 truncate" title={route}>{route}</div>
      <div className="text-xs text-[var(--muted)] mt-1">{angle} · {framework}</div>
      <div className="text-[11px] mono text-[var(--muted)] mt-1 truncate" title={model}>{model}</div>
      <div className="text-[11px] text-[var(--muted)] mt-1">{issues}</div>
    </div>
  );
}

function StepCard({
  n, title, done, open, summary, onOpen, children,
}: {
  n: number; title: string; done: boolean; open: boolean; summary: string; onOpen: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`step-card ${open ? "step-card-open" : ""}`}>
      <button onClick={onOpen} className="step-button" aria-expanded={open}>
        <span className={`step-index ${open ? "step-index-open" : done ? "step-index-done" : "step-index-idle"}`}>
          {done && !open ? "✓" : n}
        </span>
        <span className="flex-1">
          <span className="text-sm font-semibold">{title}</span>
          {!open && <span className="block text-xs text-[var(--muted)] mt-0.5 truncate">{summary}</span>}
        </span>
        <span className="step-action">{open ? "Collapse" : done ? "Edit" : "Open"}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-[var(--border)]">{children}</div>}
    </div>
  );
}

function PerfPanel({ brandId, hero, productCount }: { brandId: string; hero?: string; productCount: number }) {
  const intel = getBrandIntelligence(brandId);
  if (!intel) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const heroAligned = !!hero && intel.heroes.some((h) => norm(h) === norm(hero));
  const countNote =
    productCount > 6
      ? { c: "var(--bad)", t: `${productCount} products — 7+ correlates with overcrowded fail templates` }
      : productCount === 0
      ? { c: "var(--warn)", t: "No products selected yet" }
      : { c: "var(--ok)", t: `${productCount} products — healthy range` };
  return (
    <div className="section-panel">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Performance intelligence</h3>
        <span className="text-xs text-[var(--muted)]">{PROGRAM_INTELLIGENCE.period}</span>
      </div>
      <p className="text-xs text-[var(--muted)] mb-2">{intel.headline}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="summary-tile bg-[var(--surface)]">
          <div className="text-[10px] uppercase text-[var(--muted)]">Benchmark</div>
          <div className="mt-0.5">{intel.benchmark.split(";")[0]}</div>
        </div>
        <div className="summary-tile bg-[var(--surface)]">
          <div className="text-[10px] uppercase text-[var(--muted)]">Hero</div>
          <div className="mt-0.5" style={{ color: heroAligned ? "var(--ok)" : "var(--warn)" }}>
            {hero || "none"} — {heroAligned ? "in proven pool ✓" : "needs a strong reason"}
          </div>
        </div>
        <div className="summary-tile bg-[var(--surface)]">
          <div className="text-[10px] uppercase text-[var(--muted)]">Product count</div>
          <div className="mt-0.5" style={{ color: countNote.c }}>{countNote.t}</div>
        </div>
      </div>
      <div className="text-xs text-[var(--muted)] mt-2">
        <strong className="text-[var(--text)]">Avoid:</strong> {intel.avoid.slice(0, 4).join(" · ")}
      </div>
    </div>
  );
}

function Banner({ level, children }: { level: "warn" | "fail"; children: React.ReactNode }) {
  const color = level === "fail" ? "var(--bad)" : "var(--warn)";
  return (
    <div className="section-panel text-sm" style={{ borderColor: color, color }}>
      {children}
    </div>
  );
}

function PromptBlock({
  title, subtitle, value, edited, onChange, onReset,
}: {
  title: string;
  subtitle: string;
  value: string;
  edited: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(title === "Performance context");
  return (
    <div className="prompt-block">
      <div className="prompt-header">
        <button type="button" onClick={() => setOpen((v) => !v)} className="prompt-toggle" aria-expanded={open}>
          <div className="text-sm font-semibold">
            {title}
            {edited && <span className="ml-2 text-xs text-[var(--accent-2)]">· edited</span>}
          </div>
          <div className="text-xs text-[var(--muted)]">{subtitle}</div>
        </button>
        <span className="text-xs text-[var(--muted)]">{value.length} chars</span>
        <CopyButton text={value} />
        <button onClick={onReset} disabled={!edited} className="btn-ghost">Reset</button>
      </div>
      {open && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="prompt-body mono text-xs leading-relaxed p-4 outline-none resize-y"
          style={{ height: 220 }}
        />
      )}
    </div>
  );
}

function VariantTabs({
  variants, active, onSelect, labelFor, incompleteFor,
}: {
  variants: string[]; active: string; onSelect: (v: string) => void; labelFor?: (v: string) => string; incompleteFor?: (v: string) => boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {variants.map((v) => (
        <button key={v} onClick={() => onSelect(v)}
          title={incompleteFor?.(v) ? "This segment is missing generated copy" : undefined}
          className={`choice-pill ${active === v ? "choice-pill-active" : ""}`}>
          {labelFor ? labelFor(v) : v}
          {incompleteFor?.(v) && <span aria-hidden style={{ color: "var(--bad)" }}> ⚠</span>}
        </button>
      ))}
    </div>
  );
}

function SubjectOptionsPanel({
  brief,
  segment,
  onUse,
}: {
  brief: GenBrief;
  segment: string;
  onUse: (subject: string, preheader: string, style?: string, modelHint?: string, sharedThread?: string) => void;
}) {
  const line = brief.subject_lines?.[segJsonKey(segment)];
  const options = line?.options || [];
  const [open, setOpen] = useState(false);
  if (!line || !options.length) return null;
  return (
    <div className="subject-drawer">
      <button type="button" onClick={() => setOpen((v) => !v)} className="subject-drawer-head" aria-expanded={open}>
        <span>
          <span className="text-sm font-semibold">Subject options</span>
          <span className="text-xs text-[var(--muted)] ml-2">{options.length} styles</span>
        </span>
        <span className="text-xs text-[var(--muted)]">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-2 p-3">
          {options.map((o, i) => {
            const active = o.subject === line.subject && o.preheader === line.preheader;
            return (
              <div key={`${o.subject}-${i}`} className={`option-card ${active ? "option-card-active" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      {o.model_hint || "AI"} · {o.style || `Option ${i + 1}`}
                    </div>
                    <div className="text-sm font-semibold">{o.subject}</div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">{o.preheader}</div>
                    {o.shared_thread && <div className="text-[11px] text-[var(--accent-2)] mt-1">Thread: {o.shared_thread}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onUse(o.subject, o.preheader, o.style, o.model_hint, o.shared_thread)}
                    disabled={active}
                    className="btn-ghost shrink-0"
                  >
                    {active ? "Using" : "Use"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModelSelector({
  label,
  value,
  onChange,
  providers,
}: {
  label: string;
  value: AIModelSelection;
  onChange: (v: AIModelSelection) => void;
  providers: AIProviderOption[];
}) {
  const provider = providers.find((p) => p.id === value.provider) || providers[0];
  const selectedModelId = value.provider === provider.id && value.model ? value.model : provider.models[0].id;
  const listedModel = provider.models.find((m) => m.id === selectedModelId);
  const model = listedModel || { id: selectedModelId, label: `Current: ${selectedModelId}`, note: "Saved/newer model ID" };
  const modelOptions = listedModel ? provider.models : [model, ...provider.models];
  return (
    <div className="section-panel p-3">
      <div className="text-xs font-semibold text-[var(--muted)] mb-2">{label}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          aria-label={`${label} provider`}
          value={provider.id}
          onChange={(e) => {
            const next = providers.find((p) => p.id === e.target.value) || providers[0];
            onChange({ provider: next.id, model: next.models[0].id });
          }}
          className="input"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select
          aria-label={`${label} model`}
          value={model.id}
          onChange={(e) => onChange({ provider: provider.id, model: e.target.value })}
          className="input"
        >
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>
      <div className="text-[11px] text-[var(--muted)] mt-1">
        {model.note ? `${model.note} · ` : ""}<code>{model.id}</code>
      </div>
    </div>
  );
}

function MiniProductBlock({ lines }: { lines: { text: string; style: "headline" | "badge" | "usp" | "review" | "price" | "sub" }[] }) {
  const colorMap: Record<string, string> = {
    headline: "font-bold text-[11px] uppercase tracking-wide",
    badge: "text-[9px] font-bold px-1 rounded",
    usp: "text-[9px] text-[var(--muted)] flex items-center gap-0.5",
    review: "text-[9px] italic text-[var(--muted)]",
    price: "text-[11px] font-bold",
    sub: "text-[9px] text-[var(--muted)]",
  };
  const styleMap: Partial<Record<string, React.CSSProperties>> = {
    badge: { background: "#fef9c3", color: "#78350f", border: "1px solid #fde047" },
    review: { borderLeft: "2px solid var(--border)", paddingLeft: 4 },
  };
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-2 w-full flex flex-col gap-0.5 text-left">
      <div className="h-8 rounded mb-1" style={{ background: "var(--border)" }} />
      {lines.map((l, i) => (
        <span key={i} className={colorMap[l.style]} style={styleMap[l.style]}>
          {l.style === "usp" && <span style={{ color: "var(--ok)", fontSize: 9, fontWeight: 800 }}>+</span>}
          {l.text}
        </span>
      ))}
    </div>
  );
}

function ProductStylePicker({ value, onChange }: { value: ProductCopyStyle; onChange: (v: ProductCopyStyle) => void }) {
  const opts: { id: ProductCopyStyle; label: string; when: string; lines: Parameters<typeof MiniProductBlock>[0]["lines"] }[] = [
    {
      id: "headline_winner",
      label: "Headline winner",
      when: "Default — works for any send",
      lines: [
        { text: "BEST SUPPORT EVER", style: "headline" },
        { text: "Wire-free all day", style: "usp" },
        { text: "Snap-on in 3 sec", style: "usp" },
        { text: "From 💲12.99", style: "sub" },
      ],
    },
    {
      id: "benefit_pair",
      label: "Benefit pair",
      when: "Pain-point heavy campaigns",
      lines: [
        { text: "NO WIRE PAIN", style: "headline" },
        { text: "Digs in → instant relief", style: "usp" },
        { text: "Slides on → all-day fit", style: "usp" },
        { text: "Comfort you can feel", style: "sub" },
      ],
    },
    {
      id: "proof_badge",
      label: "Proof badge",
      when: "When reviews are strong",
      lines: [
        { text: "★4.9 · 2,300+ Reviews", style: "badge" },
        { text: '"Forgot it\'s there!" — Helen', style: "review" },
        { text: "Wire-free comfort", style: "usp" },
        { text: "Front snap closure", style: "usp" },
      ],
    },
    {
      id: "urgency_badge",
      label: "Urgency / scarcity",
      when: "Low-stock or flash-sale sends",
      lines: [
        { text: "SELLING OUT", style: "badge" },
        { text: "CLAIM YOURS", style: "headline" },
        { text: "Only a few left at 💲12.99", style: "sub" },
        { text: "Ships in 24 hrs", style: "usp" },
      ],
    },
    {
      id: "price_prominent",
      label: "Price prominent",
      when: "Steep discounts / price-led",
      lines: [
        { text: "💲12.99 — Today Only", style: "price" },
        { text: "SAVE 35%", style: "badge" },
        { text: "Wire-free lift & support", style: "sub" },
        { text: "All-day comfort", style: "usp" },
      ],
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`choice-card flex flex-col gap-1.5 items-stretch text-left p-2 ${value === o.id ? "choice-card-active" : ""}`}
          >
            <MiniProductBlock lines={o.lines} />
            <div className="text-xs font-semibold leading-tight">{o.label}</div>
            <div className="text-[10px] text-[var(--muted)] leading-tight">{o.when}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function LayoutPicker({ count, value, onChange }: { count: number; value: ProductLayout; onChange: (v: ProductLayout) => void }) {
  // Offer arrangements that make sense for the number of products in the email.
  const opts: { id: ProductLayout; label: string; rows: number[] }[] = [
    { id: "stack", label: `Stacked · 1×${count}`, rows: Array.from({ length: Math.min(count, 4) }, () => 1) },
  ];
  if (count >= 2) opts.push({ id: "two", label: `2 per row · ${Math.ceil(count / 2)} rows`, rows: Array.from({ length: Math.min(Math.ceil(count / 2), 3) }, () => 2) });
  if (count >= 3) opts.push({ id: "three", label: `3 per row · ${Math.ceil(count / 3)} rows`, rows: Array.from({ length: Math.min(Math.ceil(count / 3), 2) }, () => 3) });
  if (count >= 3) opts.push({ id: "hero_grid", label: "Hero + 2 per row", rows: [1, 2, 2] });

  return (
    <div className="mb-3 soft-panel">
      <div className="text-xs text-[var(--muted)] mb-1">Product layout</div>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => {
          const active = value === o.id;
          return (
            <button key={o.id} onClick={() => onChange(o.id)}
              className={`choice-card flex flex-col items-center gap-1 ${active ? "choice-card-active" : ""}`}>
              <span className="flex flex-col gap-0.5 w-9">
                {o.rows.map((perRow, ri) => (
                  <span key={ri} className="flex gap-0.5">
                    {Array.from({ length: perRow }, (_, ci) => (
                      <span key={ci} className="flex-1 h-2 rounded-sm" style={{ background: active ? "var(--accent)" : "var(--border)" }} />
                    ))}
                  </span>
                ))}
              </span>
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BodyLayoutPicker({
  value,
  moduleLayout,
  onChange,
  onModuleLayoutChange,
}: {
  value: BodyLayout;
  moduleLayout: EmailModuleKey[];
  onChange: (v: BodyLayout) => void;
  onModuleLayoutChange: (v: EmailModuleKey[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const opts: { id: BodyLayout; label: string; rows: string[] }[] = [
    { id: "continuous", label: "Continuous body", rows: ["Body", "P.S.", "Products"] },
    { id: "interspersed", label: "Opener + products", rows: ["Opener", "Products", "Bridge/P.S."] },
    { id: "custom", label: "Custom flow", rows: ["Drag", "Modules", "Below"] },
  ];
  const presets: { label: string; value: EmailModuleKey[] }[] = [
    { label: "2 + 2 story", value: ["hero", "body_1", "products_1_2", "body_2", "products_3_4", "body_3", "products_5_6"] },
    { label: "Proof sandwich", value: ["hero", "body_1", "products_1_2", "products_3_4", "body_2", "products_5_6", "body_3"] },
    { label: "Hero first grid", value: ["hero", "products_1_2", "body_1", "products_3_4", "body_2", "products_5_6", "body_3"] },
  ];
  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...moduleLayout];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onModuleLayoutChange(next);
  };
  return (
    <div className="mb-3 soft-panel">
      <div className="text-xs text-[var(--muted)] mb-1">Body placement</div>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              className={`choice-card min-w-40 ${active ? "choice-card-active" : ""}`}
            >
              <span className="font-semibold block mb-1">{o.label}</span>
              <span className="flex flex-col gap-0.5">
                {o.rows.map((r) => (
                  <span key={r} className="block rounded-sm px-2 py-0.5" style={{ background: active ? "rgba(35,102,90,.12)" : "var(--surface-2)" }}>{r}</span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => onModuleLayoutChange(p.value)} className="btn-ghost">
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
        <div className="flex flex-wrap gap-1.5">
          {moduleLayout.map((key, index) => (
            <button
              key={`${key}-${index}`}
              type="button"
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex != null) move(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`rounded border px-2.5 py-1 text-xs cursor-grab ${value === "custom" ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] text-[var(--muted)]"}`}
              title="Drag to reorder"
            >
              {moduleLabel(key)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function moduleLabel(key: EmailModuleKey): string {
  return {
    hero: "Banner",
    body_1: "Text 1",
    products_1_2: "Products 1-2",
    body_2: "Text 2",
    products_3_4: "Products 3-4",
    body_3: "Text 3",
    products_5_6: "Products 5-6",
  }[key];
}

function ProductSlotCard({
  index, slot, catalog, usedSlugs, recentSlugs, onPick, onUrl, onCustomChange, onScrape, onToggleUsp, onAddCustomUsp, onSetCustomUsp, onRemove,
}: {
  index: number;
  slot: Slot;
  catalog: Product[];
  /** All slugs currently picked across all slots — used to disable duplicate options. */
  usedSlugs: string[];
  /** Slugs used in the last 3 sends — shown with a "recent" badge. */
  recentSlugs: string[];
  onPick: (slug: string) => void;
  onUrl: (url: string) => void;
  onCustomChange: (patch: Partial<Slot>) => void;
  onScrape: (url: string) => Promise<string>;
  onToggleUsp: (usp: string) => void;
  onAddCustomUsp: () => void;
  onSetCustomUsp: (uspIndex: number, value: string) => void;
  onRemove: () => void;
}) {
  const [showUrl, setShowUrl] = useState(!!slot.url);
  const [scrapeStatus, setScrapeStatus] = useState("");
  const scrapeRequestRef = useRef(0);
  const autoScrapedUrlRef = useRef("");
  const cat = catalog.find((p) => p.slug === slot.slug);
  const isCustom = !!slot.isCustom;
  const selectValue = isCustom ? CUSTOM_PRODUCT_VALUE : slot.slug;
  const displayName = isCustom ? slot.customName || "custom product" : cat?.name || "Product";
  // Pool = catalog USPs + any scraped from the customer URL (deduped).
  const pool = Array.from(new Set([...(cat?.usps || []), ...(slot.scrapedUsps || []), ...(slot.scrapedFeatures || [])]));
  // Custom USPs are selected entries not in the pool (rendered as editable inputs).
  const customUsps = slot.usps.map((u, j) => ({ u, j })).filter(({ u }) => !pool.includes(u));
  const isRecent = !isCustom && slot.slug ? recentSlugs.includes(slot.slug) : false;

  async function runScrape(url: string) {
    if (!url || !/^https?:\/\//i.test(url)) return;
    const requestId = ++scrapeRequestRef.current;
    setScrapeStatus("Fetching product page…");
    const status = await onScrape(url);
    if (scrapeRequestRef.current === requestId) setScrapeStatus(status);
  }

  useEffect(() => {
    if (isCustom || slot.url) setShowUrl(true);
  }, [isCustom, slot.url]);

  // Auto-scrape when the parent sets a URL (e.g. on product pick) and we have no scraped USPs yet.
  useEffect(() => {
    const shouldAutoScrape =
      !isCustom &&
      !!cat?.url &&
      slot.url === cat.url &&
      autoScrapedUrlRef.current !== slot.url &&
      (!slot.scrapedUsps || slot.scrapedUsps.length === 0);
    if (shouldAutoScrape) {
      autoScrapedUrlRef.current = slot.url;
      runScrape(slot.url);
    }
    // Only react to URL or scrapedUsps changes, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.url, slot.slug, cat?.url, isCustom, slot.scrapedUsps?.length]);

  return (
    <div className={`product-slot-card ${index === 0 ? "product-slot-hero" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{index === 0 ? "Hero product" : `Support ${index + 1}`}</span>
        <div className="flex items-center gap-2">
          {isRecent && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--warn-soft, #fef3c7)", color: "var(--warn-text, #92400e)" }}>
              recent
            </span>
          )}
          {index > 0 && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove support product ${index + 1}`}
              className="text-xs text-[var(--muted)] hover:text-[var(--bad)]"
            >
              remove
            </button>
          )}
        </div>
      </div>
      <select value={selectValue} aria-label={`${index === 0 ? "Hero" : `Support ${index + 1}`} product`} onChange={(e) => onPick(e.target.value)} className="input">
        <option value="">— select product —</option>
        {catalog.map((p) => {
          const alreadyUsed = usedSlugs.includes(p.slug) && p.slug !== slot.slug;
          const recentLabel = recentSlugs.includes(p.slug) ? " · recent" : "";
          return (
            <option key={p.slug} value={p.slug} disabled={alreadyUsed}>
              {alreadyUsed ? `✗ ${p.name}` : `${p.name}${recentLabel}`} · 💲{p.price}
            </option>
          );
        })}
        <option value={CUSTOM_PRODUCT_VALUE}>Other product… paste URL</option>
      </select>

      {(slot.slug || isCustom) && (
        <>
          {isCustom && (
            <div className="custom-product-fields">
              <label className="field">
                <span>Product name</span>
                <input
                  value={slot.customName || ""}
                  aria-label="Custom product name"
                  onChange={(e) => onCustomChange({ customName: e.target.value })}
                  placeholder="Auto-detected after scouting"
                  className="input text-xs"
                />
              </label>
              <label className="field">
                <span>Price</span>
                <input
                  value={slot.customPrice || ""}
                  aria-label="Custom product price"
                  onChange={(e) => onCustomChange({ customPrice: e.target.value })}
                  placeholder="e.g. 19.99"
                  className="input text-xs"
                />
              </label>
              <label className="field custom-product-proof">
                <span>Review or proof</span>
                <input
                  value={slot.customReview || ""}
                  aria-label="Custom product review"
                  onChange={(e) => onCustomChange({ customReview: e.target.value })}
                  placeholder="Optional source-backed quote or proof"
                  className="input text-xs"
                />
              </label>
            </div>
          )}
          {showUrl ? (
            <div className="flex flex-col gap-1">
              <input
                value={slot.url}
                aria-label={`${displayName} customer URL`}
                onChange={(e) => onUrl(e.target.value)}
                onBlur={(e) => runScrape(e.target.value)}
                placeholder={isCustom ? "Paste product page URL, then blur or scout" : "https://… (blur to auto-extract USPs)"}
                className="input mono text-xs"
              />
              {isCustom && (
                <button type="button" onClick={() => runScrape(slot.url)} disabled={!/^https?:\/\//i.test(slot.url)} className="btn-subtle text-left self-start">
                  Scout page for details
                </button>
              )}
              {scrapeStatus && (
                <span className="text-[11px]" style={{ color: scrapeStatus.startsWith("✓") ? "var(--ok)" : "var(--muted)" }}>
                  {scrapeStatus}
                </span>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => setShowUrl(true)} className="btn-subtle text-left self-start">Override customer URL</button>
          )}

          <fieldset className="usp-grid">
            <legend className="sr-only">USPs for {displayName}</legend>
            {pool.map((usp) => (
              <label key={usp} className={`usp-pill ${slot.usps.includes(usp) ? "usp-pill-selected" : ""}`}>
                <input type="checkbox" checked={slot.usps.includes(usp)} onChange={() => onToggleUsp(usp)} className="sr-only" />
                <span className="usp-dot" aria-hidden />
                <span>{usp}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1">
            {customUsps.map(({ u, j }) => (
              <input key={`c${j}`} value={u} aria-label={`Custom USP ${j + 1}`} onChange={(e) => onSetCustomUsp(j, e.target.value)} placeholder="Custom USP" className="input text-xs" />
            ))}
            <button type="button" onClick={onAddCustomUsp} className="btn-subtle text-left self-start">+ Add custom USP</button>
          </div>
          {(cat?.review || slot.customReview) && <div className="text-[11px] italic text-[var(--muted)]">{slot.customReview || cat?.review}</div>}
          {isCustom && slot.scrapedImage && <div className="text-[11px] text-[var(--muted)] truncate">Image detected: {slot.scrapedImage}</div>}
        </>
      )}
    </div>
  );
}

