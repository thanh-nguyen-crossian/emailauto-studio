"use client";

import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import dynamic from "next/dynamic";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { accessToken, type Profile } from "@/lib/profile";
import { briefToMarkdown } from "../components/BriefView";
import { listVersions, saveVersion, type SavedVersion, type VersionPayload } from "@/lib/history";
import { Auth } from "../components/Auth";
import {
  BRAND_LIST,
  BRANDS,
  bodyHomepageLinkPolicy,
  requiredProductSlugs,
  requiredProducts as requiredCatalogProducts,
} from "@/lib/config/brands";
import { AI_PROVIDERS, normalizeModelPair } from "@/lib/config/aiModels";
import {
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
  type RecentSendMemory,
  type Urgency,
} from "@/lib/config/types";
import {
  flagTier,
  segJsonKey,
  selectVarietyProfile,
  type GenBrief,
} from "@/lib/briefgen";
import { intelligencePromptBlock } from "@/lib/config/intelligence";
import { renderEmailHTML, type ProductLayout } from "@/lib/render/email";
import { analyzeBriefDeliverability } from "@/lib/quality/deliverability";
import { scoreFreshnessAgainstHistory } from "@/lib/quality/freshness";
import { analyzeProductPriceOutliers } from "@/lib/quality/productData";
import { listSendHistory, recordSendHistory, type SendHistoryRow } from "@/lib/sendHistory";
import {
  CONSENT_OPTIONS,
  CUSTOM_PRODUCT_VALUE,
  DRAFT_KEY,
  DEFAULT_OPS,
  MAX_SLOTS,
  OFFER_PRESETS,
  OPS_PROVIDER_OPTIONS,
  SHIPPING_PRESETS,
  customSlotSlug,
  dateToken,
  initSlots,
  type Draft,
  type GenerationProgressState,
  type OptKey,
  type Slot,
  type StudioCampaignState,
  type StudioGenerationState,
  type StudioUiState,
  type View,
} from "./studioShared";
import { useStudioReducer } from "./useStudioReducer";
import { BuildView } from "./views/BuildView";
import { OutputView } from "./views/OutputView";
import { ReviewView } from "./views/ReviewView";
import {
  ABContrastPanel,
  Banner,
  BodyLayoutPicker,
  CopyButton,
  Field,
  FormatCoverage,
  FreshnessPanel,
  GenerationBudgetPanel,
  GenerationProgress,
  LayoutPicker,
  ModelSelector,
  OpsReadinessPanel,
  OutputOptionCards,
  OutputSegmentNavigator,
  PerfPanel,
  PlaybookChecklist,
  ProductSlotCard,
  ProductStylePicker,
  PromptBlock,
  RecentSendMemoryPanel,
  SegmentQualityWarning,
  StepCard,
  SubjectOptionsPanel,
  Summary,
  WinTemplateRhythm,
  WorkflowSnapshot,
  preheaderLenColor,
  relativeTime,
  scoreColor,
  subjectLenColor,
} from "./StudioPanels";

const BriefView = dynamic(() => import("../components/BriefView").then((mod) => mod.BriefView), {
  loading: () => <div className="section-panel text-sm text-[var(--muted)]">Loading brief editor…</div>,
});
const History = dynamic(() => import("../components/History").then((mod) => mod.History));
const AdminPanel = dynamic(() => import("../components/AdminPanel").then((mod) => mod.AdminPanel));
const Preview = dynamic(() => import("../components/Preview").then((mod) => mod.Preview), {
  loading: () => <div className="preview-shell text-sm text-[var(--muted)]">Loading preview…</div>,
});
const PreflightPanel = dynamic(() => import("../components/PreflightPanel").then((mod) => mod.PreflightPanel));
const ImageEditor = dynamic(() => import("../components/ImageEditor").then((mod) => mod.ImageEditor));
const HtmlFormatEditor = dynamic(() => import("../components/HtmlFormatEditor").then((mod) => mod.HtmlFormatEditor));

function compactPreviewText(value: string, max = 180): string {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function compactProductRows(products: Product[], brandId?: string): string {
  const required = brandId ? new Set(requiredProductSlugs(brandId)) : new Set<string>();
  return products
    .map((product, index) => {
      const usps = (product.usps || []).filter(Boolean).slice(0, 3).map((usp) => compactPreviewText(usp, 42)).join("; ") || "none";
      return `${index + 1}${index === 0 ? " HERO" : ""}${required.has(product.slug) ? " REQUIRED" : ""}. ${product.name} slug:${product.slug} 💲${product.price || "TBD"} | ${usps}`;
    })
    .join("\n");
}

function bodyHomepagePolicyCopy(policy: ReturnType<typeof bodyHomepageLinkPolicy>): string {
  if (policy === "forbidden") return "Body homepage links are disabled for this brand.";
  if (policy === "required") return "Body copy must include one natural homepage link.";
  return "Homepage links are optional in body copy.";
}

function compactSegmentRows(campaign: Campaign): string {
  const brand = BRANDS[campaign.brandId];
  return campaign.segments
    .map((id) => {
      const segment = brand.productSegments.find((item) => item.code === id);
      const label = segment?.label || id;
      const guidance = compactPreviewText(segment?.guidance || segment?.meta || "", 120);
      return `${id}: ${label}${guidance ? ` | ${guidance}` : ""}`;
    })
    .join("\n");
}

function compactSystemPromptPreview(campaign: Campaign, varietyProfile?: BodyVarietyProfile): string {
  const brand = BRANDS[campaign.brandId];
  return [
    `Layered generation steering for ${brand.name}. Persona: ${brand.persona}. Voice: ${compactPreviewText(brand.voice, 260)}`,
    "Server injects compact playbook, brand rules, provider JSON schema, and A/B contrast rules at generation time.",
    "One send = one promise: hero product + proof/price + reader situation shared across subject, preheader, banner, body, products, CTA, and P.S.",
    "Keep proof safe: supplied facts only for labels/ratings/counts/dates/medical/stock/shipping/prices/guarantees; qualitative artificial review texture may be unlabeled.",
    "Vary A/B structurally: opener, framework, banner layout, product-grid layout, proof path, CTA style, and subject devices.",
    varietyProfile ? `Creative variety seed: ${varietyProfile.openerMechanicLabel}; ${varietyProfile.creativeLens}; ${varietyProfile.proofRole}; ${varietyProfile.visualDirection}.` : "",
  ].filter(Boolean).join("\n");
}

function compactUserPromptPreview(campaign: Campaign, products: Product[]): string {
  const required = requiredCatalogProducts(campaign.brandId);
  return [
    `Brand: ${BRANDS[campaign.brandId].name}`,
    `Send date: ${campaign.sendDate}`,
    `Theme: ${campaign.theme || "(not set)"}`,
    `Promo: ${campaign.offer}`,
    `Hook input: ${campaign.hookContract?.trim() || "Build from segment, hero product, offer, urgency, proof, and avoid rules."}`,
    `Body layout: ${campaign.bodyLayout || "continuous"}; focus: ${campaign.bodyFocus || "hero"}; product copy: ${campaign.productCopyStyle || "headline_winner"}`,
    required.length ? `Required every email: ${required.map((product) => `${product.name} (${product.slug})`).join(", ")}` : "",
    `Body homepage policy: ${bodyHomepagePolicyCopy(bodyHomepageLinkPolicy(campaign.brandId))}`,
    `Products:\n${compactProductRows(products, campaign.brandId)}`,
    `Segments:\n${compactSegmentRows(campaign)}`,
  ].filter(Boolean).join("\n");
}

export function StudioApp() {
  const [studioState, dispatchStudio] = useStudioReducer();
  const { campaign: campaignState, ui: uiState, generation: generationState } = studioState;
  const {
    brandId,
    sendDate,
    theme,
    offerType,
    offerValue,
    offerShipping,
    urgency,
    hookContract,
    recipientName,
    lastHero,
    lastAngle,
    lastCtr,
    lastNote,
    lastOpenerMechanic,
    lastEmotionalArc,
    strategy,
    ops,
    winningContent,
    customPerfContext,
    modelA,
    modelB,
    segments,
    slots,
    images,
    includeLogo,
    productLayout,
    bodyLayout,
    bodyFocus,
    moduleLayout,
    productCopyStyle,
  } = campaignState;
  const {
    view,
    openStep,
    activeOption,
    compareMode,
    activeSegment,
    outputTab,
    editingHtml,
    revisionFeedback,
    advancedPromptsOpen,
  } = uiState;
  const {
    options,
    htmlOverrides,
    systemOverride,
    userOverride,
    apiError,
    genWarning,
    generating,
    elapsedSec,
    progress,
  } = generationState;
  const visited = useMemo(() => new Set(uiState.visited), [uiState.visited]);

  function resolveState<T>(next: SetStateAction<T>, prev: T): T {
    return typeof next === "function" ? (next as (value: T) => T)(prev) : next;
  }
  function setCampaignField<K extends keyof StudioCampaignState>(key: K, next: SetStateAction<StudioCampaignState[K]>) {
    dispatchStudio({ type: "campaign.patch", patch: { [key]: resolveState(next, campaignState[key]) } });
  }
  function setUiField<K extends keyof StudioUiState>(key: K, next: SetStateAction<StudioUiState[K]>) {
    dispatchStudio({ type: "ui.patch", patch: { [key]: resolveState(next, uiState[key]) } });
  }
  function setGenerationField<K extends keyof StudioGenerationState>(key: K, next: SetStateAction<StudioGenerationState[K]>) {
    dispatchStudio({ type: "generation.patch", patch: { [key]: resolveState(next, generationState[key]) } });
  }

  const setView = (value: SetStateAction<View>) => setUiField("view", value);
  const setOpenStep = (value: SetStateAction<number>) => setUiField("openStep", value);
  const setVisited = (value: SetStateAction<Set<number>>) => {
    const next = resolveState(value, visited);
    setUiField("visited", Array.from(next));
  };
  const setBrandId = (value: SetStateAction<string>) => setCampaignField("brandId", value);
  const setSendDate = (value: SetStateAction<string>) => setCampaignField("sendDate", value);
  const setTheme = (value: SetStateAction<string>) => setCampaignField("theme", value);
  const setOfferType = (value: SetStateAction<OfferType>) => setCampaignField("offerType", value);
  const setOfferValue = (value: SetStateAction<string>) => setCampaignField("offerValue", value);
  const setOfferShipping = (value: SetStateAction<string>) => setCampaignField("offerShipping", value);
  const setUrgency = (value: SetStateAction<Urgency>) => setCampaignField("urgency", value);
  const setHookContract = (value: SetStateAction<string>) => setCampaignField("hookContract", value);
  const setRecipientName = (value: SetStateAction<string>) => setCampaignField("recipientName", value);
  const setLastHero = (value: SetStateAction<string>) => setCampaignField("lastHero", value);
  const setLastAngle = (value: SetStateAction<string>) => setCampaignField("lastAngle", value);
  const setLastCtr = (value: SetStateAction<string>) => setCampaignField("lastCtr", value);
  const setLastNote = (value: SetStateAction<string>) => setCampaignField("lastNote", value);
  const setLastOpenerMechanic = (value: SetStateAction<string>) => setCampaignField("lastOpenerMechanic", value);
  const setLastEmotionalArc = (value: SetStateAction<string>) => setCampaignField("lastEmotionalArc", value);
  const setStrategy = (value: SetStateAction<CampaignStrategy>) => setCampaignField("strategy", value);
  const setOps = (value: SetStateAction<CampaignOps>) => setCampaignField("ops", value);
  const setWinningContent = (value: SetStateAction<string>) => setCampaignField("winningContent", value);
  const setCustomPerfContext = (value: SetStateAction<string | null>) => setCampaignField("customPerfContext", value);
  const setModelA = (value: SetStateAction<AIModelSelection>) => setCampaignField("modelA", value);
  const setModelB = (value: SetStateAction<AIModelSelection>) => setCampaignField("modelB", value);
  const setSegments = (value: SetStateAction<string[]>) => setCampaignField("segments", value);
  const setSlots = (value: SetStateAction<Slot[]>) => setCampaignField("slots", value);
  const setImages = (value: SetStateAction<ImageOverrides>) => setCampaignField("images", value);
  const setIncludeLogo = (value: SetStateAction<boolean>) => setCampaignField("includeLogo", value);
  const setProductLayout = (value: SetStateAction<ProductLayout>) => setCampaignField("productLayout", value);
  const setBodyLayout = (value: SetStateAction<BodyLayout>) => setCampaignField("bodyLayout", value);
  const setModuleLayout = (value: SetStateAction<EmailModuleKey[]>) => setCampaignField("moduleLayout", value);
  const setProductCopyStyle = (value: SetStateAction<ProductCopyStyle>) => setCampaignField("productCopyStyle", value);
  const setBodyFocus = (value: SetStateAction<"hero" | "grid">) => setCampaignField("bodyFocus", value);
  const setOptions = (value: SetStateAction<{ a?: GenBrief; b?: GenBrief }>) => setGenerationField("options", value);
  const setActiveOption = (value: SetStateAction<OptKey>) => setUiField("activeOption", value);
  const setCompareMode = (value: SetStateAction<boolean>) => setUiField("compareMode", value);
  const setActiveSegment = (value: SetStateAction<string>) => setUiField("activeSegment", value);
  const setOutputTab = (value: SetStateAction<"preview" | "brief">) => setUiField("outputTab", value);
  const setHtmlOverrides = (value: SetStateAction<Record<string, string>>) => setGenerationField("htmlOverrides", value);
  const setEditingHtml = (value: SetStateAction<boolean>) => setUiField("editingHtml", value);
  const setRevisionFeedback = (value: SetStateAction<string>) => setUiField("revisionFeedback", value);
  const setApiError = (value: SetStateAction<string | null>) => setGenerationField("apiError", value);
  const setGenWarning = (value: SetStateAction<string | null>) => setGenerationField("genWarning", value);
  const setGenerating = (value: SetStateAction<boolean>) => setGenerationField("generating", value);
  const setElapsedSec = (value: SetStateAction<number>) => setGenerationField("elapsedSec", value);
  const setProgress = (value: SetStateAction<GenerationProgressState | null>) => setGenerationField("progress", value);
  const setSystemOverride = (value: SetStateAction<string | null>) => setGenerationField("systemOverride", value);
  const setUserOverride = (value: SetStateAction<string | null>) => setGenerationField("userOverride", value);
  const setAdvancedPromptsOpen = (value: SetStateAction<boolean>) => setUiField("advancedPromptsOpen", value);

  const [toneExtracting, setToneExtracting] = useState(false);
  const [toneError, setToneError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pendingRestore, setPendingRestore] = useState<Draft | null>(null);
  const hydratedRef = useRef(false);

  // sync state keyed by `${opt}:${segment}`
  const [syncResults, setSyncResults] = useState<Record<string, { id?: string; editorUrl?: string; error?: string; warnings?: string[]; blocking?: string[]; cleanedBytes?: number }>>({});
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
  const [recentSendHistory, setRecentSendHistory] = useState<SendHistoryRow[]>([]);
  const [sendHistoryState, setSendHistoryState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sendHistoryError, setSendHistoryError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!supabaseConfigured() || !userId) { setRecentSendHistory([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listSendHistory(brandId, 18);
        if (!cancelled) setRecentSendHistory(rows);
      } catch {
        if (!cancelled) setRecentSendHistory([]);
      }
    })();
    return () => { cancelled = true; };
  }, [brandId, userId, sendHistoryState]);

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
  const requiredSlugsForBrand = useMemo(() => requiredProductSlugs(brandId), [brandId]);
  const requiredSlugSet = useMemo(() => new Set(requiredSlugsForBrand), [requiredSlugsForBrand]);
  const requiredProductsForBrand = useMemo(() => requiredCatalogProducts(brandId), [brandId]);
  const bodyHomePolicy = useMemo(() => bodyHomepageLinkPolicy(brandId), [brandId]);

  const offerParts = [offerValue, offerShipping].map((p) => p.trim()).filter(Boolean);
  const offer = offerParts.length ? offerParts.join(" + ") : "No promo this send";
  const strategyActive = Object.values(strategy).some((v) => String(v || "").trim());
  const campaign: Campaign = useMemo(
    () => ({
      brandId, sendDate, segments, layout, theme,
      offerType, offerValue, offerShipping, urgency, offer, bodyLayout, bodyFocus, moduleLayout, productCopyStyle, hookContract, recipientName: RECIPIENT_NAME_TOKEN,
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
      recentSendHistory: recentSendHistory
        .filter((row) => !segments.length || segments.includes(row.segment))
        .slice(0, 8),
    }),
    [brandId, sendDate, segments, layout, theme, offerType, offerValue, offerShipping, urgency, offer, bodyLayout, bodyFocus, moduleLayout, productCopyStyle, hookContract, lastCtr, lastHero, lastAngle, lastNote, lastOpenerMechanic, lastEmotionalArc, strategyActive, strategy, ops, winningContent, customPerfContext, recentProductSlugs, recentSendHistory]
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
  const missingRequiredProductsForSelection = useMemo(() => {
    const selected = new Set(selectedProducts.map((product) => product.slug));
    return requiredProductsForBrand.filter((product) => !selected.has(product.slug));
  }, [requiredProductsForBrand, selectedProducts]);
  const productPriceWarnings = useMemo(() => analyzeProductPriceOutliers(selectedProducts), [selectedProducts]);

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
    if (requiredSlugSet.has(slots[i]?.slug || "")) return;
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
    if (i > 0 && !requiredSlugSet.has(slots[i]?.slug || "")) {
      setSlots((prev) => prev.filter((_, idx) => idx !== i));
    }
  }

  const maxProducts = 6;
  const canGenerate =
    segments.length > 0 &&
    selectedProducts.length >= 1 &&
    selectedProducts.length <= maxProducts &&
    missingRequiredProductsForSelection.length === 0;

  // ---- compact prompt steering previews (Review step) ----
  // The server builds compact layered prompts at generation time. These fields are optional
  // steering overrides, so keep the default preview short and editable.
  const campaignForPrompt = useMemo(() => ({ ...campaign, bodyVariety: varietyProfile }), [campaign, varietyProfile]);
  const systemPromptA = useMemo(() => compactSystemPromptPreview(campaignForPrompt, varietyProfile), [campaignForPrompt, varietyProfile]);
  const userPromptA = useMemo(() => compactUserPromptPreview(campaignForPrompt, selectedProducts), [campaignForPrompt, selectedProducts]);
  const perfContextDefault = useMemo(() => intelligencePromptBlock(brandId), [brandId]);
  const effectivePerfContext = customPerfContext ?? perfContextDefault;
  const effectiveSystem = systemOverride ?? systemPromptA;
  const effectiveUser = userOverride ?? userPromptA;
  const systemPromptEdited = systemOverride !== null && systemOverride !== systemPromptA;
  const userPromptEdited = userOverride !== null && userOverride !== userPromptA;
  const promptOverridesActive = systemPromptEdited || userPromptEdited;
  const autoSegmentBatching = !promptOverridesActive || segments.length > 1;

  function stopGenTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  function cancelGenerate() {
    abortRef.current?.abort();
  }

  type GenerateStreamPayload =
    | { type?: "stage"; stage?: string; message?: string }
    | { type?: "progress"; stage?: string; done?: number; total?: number; message?: string }
    | { type?: "partial"; option?: OptKey; brief?: GenBrief; warning?: string }
    | { type?: "warning"; message?: string }
    | { type?: "done"; a?: GenBrief; b?: GenBrief; warning?: string }
    | { type?: "error"; message?: string }
    | { type?: "heartbeat" };

  function pushProgress(message: string, patch: Partial<GenerationProgressState> = {}) {
    setProgress((prev) => {
      const nextEvents = [message, ...(prev?.events || [])].filter(Boolean).slice(0, 8);
      return {
        stage: patch.stage || prev?.stage || "queued",
        message,
        done: patch.done ?? prev?.done ?? 0,
        total: patch.total ?? prev?.total ?? 0,
        partialA: patch.partialA ?? prev?.partialA ?? false,
        partialB: patch.partialB ?? prev?.partialB ?? false,
        events: nextEvents,
      };
    });
  }

  async function readGenerationStream(res: Response): Promise<{ a?: GenBrief; b?: GenBrief; warning?: string; error?: string }> {
    if (!res.body) return { error: "Streaming response had no readable body." };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const result: { a?: GenBrief; b?: GenBrief; warning?: string; error?: string } = {};

    const handlePayload = (payload: GenerateStreamPayload) => {
      if (payload.type === "stage") {
        pushProgress(payload.message || payload.stage || "Working…", { stage: payload.stage || "stage" });
      } else if (payload.type === "progress") {
        pushProgress(payload.message || `${payload.done || 0}/${payload.total || 0}`, {
          stage: payload.stage || "progress",
          done: payload.done || 0,
          total: payload.total || 0,
        });
      } else if (payload.type === "partial" && payload.option && payload.brief) {
        result[payload.option] = payload.brief;
        setOptions((prev) => ({ ...prev, [payload.option as OptKey]: payload.brief }));
        setActiveOption(payload.option);
        setActiveSegment(segments[0]);
        setOutputTab("preview");
        setView("output");
        if (payload.warning) result.warning = [result.warning, payload.warning].filter(Boolean).join(" · ");
        pushProgress(`Option ${payload.option.toUpperCase()} ready`, {
          stage: "partial",
          partialA: payload.option === "a" ? true : undefined,
          partialB: payload.option === "b" ? true : undefined,
        });
      } else if (payload.type === "warning") {
        result.warning = [result.warning, payload.message].filter(Boolean).join(" · ");
        pushProgress(payload.message || "Generation warning", { stage: "warning" });
      } else if (payload.type === "done") {
        result.a = payload.a || result.a;
        result.b = payload.b || result.b;
        result.warning = payload.warning || result.warning;
        pushProgress("Generation complete", {
          stage: "done",
          done: 1,
          total: 1,
          partialA: Boolean(payload.a || result.a),
          partialB: Boolean(payload.b || result.b),
        });
      } else if (payload.type === "error") {
        result.error = payload.message || "Generation failed";
        pushProgress(result.error, { stage: "error" });
      }
    };

    const drain = (chunk: string) => {
      buffer += chunk;
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLines = frame
          .split(/\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());
        if (dataLines.length) {
          try {
            handlePayload(JSON.parse(dataLines.join("\n")) as GenerateStreamPayload);
          } catch {
            /* ignore malformed heartbeat/proxy frames */
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      drain(decoder.decode(value, { stream: true }));
    }
    drain(decoder.decode());
    return result;
  }

  async function generate(feedback?: string) {
    // Do NOT clear edited HTML / sync results here — only on a SUCCESSFUL result. A failed regen
    // must leave the prior options + manual edits intact (the user gains nothing from losing both).
    setGenerating(true);
    setApiError(null);
    setGenWarning(null);
    setProgress({ stage: "queued", message: "Preparing generation request…", done: 0, total: 0, partialA: false, partialB: false, events: [] });
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
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(await authHeader()) },
        signal: controller.signal,
        body: JSON.stringify({
          ...campaign,
          stream: true,
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
      let data: { a?: GenBrief; b?: GenBrief; error?: string; warning?: string };
      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("text/event-stream")) {
        data = await readGenerationStream(res);
      } else {
        // JSON/plain-text fallback for auth errors, local tools, or streaming disabled.
        const raw = await res.text();
        try {
          data = JSON.parse(raw);
        } catch {
          if (res.status === 504 || /timeout|timed out|FUNCTION_INVOCATION/i.test(raw)) {
            setApiError("The server timed out while generating. Try a faster model pair (Claude Haiku, Gemini Flash/Lite, GPT mini/nano), fewer products, or reset very large prompt edits.");
          } else {
            setApiError(`Server returned an unexpected response (HTTP ${res.status}). Please retry.`);
          }
          return;
        }
        if (!res.ok) {
          setApiError(data.error || "Generation failed");
          return;
        }
      }
      if (data.error) {
        setApiError(data.error);
        if (!data.a && !data.b) return;
      }
      // Success — now it is safe to drop the previous generation's edits/sync state.
      setSyncResults({});
      setTplResults({});
      setHtmlOverrides({});
      setEditingHtml(false);
      setSendHistoryState("idle");
      setSendHistoryError(null);
      setOptions((prev) => ({ a: data.a || prev.a, b: data.b || prev.b }));
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
      if (e instanceof DOMException && e.name === "AbortError") {
        pushProgress("Generation cancelled", { stage: "cancelled" });
        return;
      }
      setApiError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
      stopGenTimer();
      abortRef.current = null;
    }
  }

  // Stop in-flight streaming generation and timers if the user navigates away mid-run.
  useEffect(() => () => {
    abortRef.current?.abort();
    stopGenTimer();
  }, []);

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
    dispatchStudio({ type: "restoreDraft", draft: d });
    setRecentProductSlugs(d.campaign.recentProductSlugs || []);
    setSaveState("idle");
    setSaveError(null);
    setSyncResults({});
    setTplResults({});
    setSendHistoryState("idle");
    setSendHistoryError(null);
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
  const activeFreshness = useMemo(
    () => scoreFreshnessAgainstHistory(
      activeBrief,
      recentSendHistory.filter((row) => !segments.length || segments.includes(row.segment))
    ),
    [activeBrief, recentSendHistory, segments]
  );

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

  async function postSyncWithQualityGate(url: string, payload: { name: string; subject: string; html: string }) {
    const headers = { "Content-Type": "application/json", ...(await authHeader()) };
    let res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    let data = await res.json();
    const blockers = Array.isArray(data.blocking) ? data.blocking as string[] : [];
    if (res.status === 422 && blockers.length) {
      const confirmed = window.confirm(
        `Pre-send quality gate found blocking issues:\n\n${blockers.map((b, i) => `${i + 1}. ${b}`).join("\n")}\n\nOverride and sync anyway?`
      );
      if (confirmed) {
        res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ ...payload, overrideQualityGate: true }) });
        data = await res.json();
      }
    }
    return { res, data };
  }

  async function syncDesign(opt: OptKey, seg: string) {
    const key = `${opt}:${seg}`;
    const html = htmlFor(opt, seg);
    if (!html) return;
    setSyncingKey(key);
    try {
      const { res, data } = await postSyncWithQualityGate("/api/sync-sendgrid", { name: templateName(opt, seg), subject: subjectFor(opt, seg), html });
      setSyncResults((r) => ({
        ...r,
        [key]: res.ok
          ? { id: data.id, editorUrl: data.editorUrl, warnings: data.warnings, blocking: data.blocking, cleanedBytes: data.cleanedBytes }
          : { error: data.error, warnings: data.warnings, blocking: data.blocking },
      }));
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
      const { res, data } = await postSyncWithQualityGate("/api/sync-template", { name: templateName(opt, seg), subject: subjectFor(opt, seg), html });
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
        segments, slots, includeLogo, productLayout, bodyLayout, bodyFocus, moduleLayout, productCopyStyle, images, options, htmlOverrides,
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

  async function recordCurrentSendHistory() {
    if (!activeBrief) return;
    setSendHistoryState("saving");
    setSendHistoryError(null);
    try {
      const cd = activeBrief.creative_direction || {};
      const rows: RecentSendMemory[] = segments.map((seg) => ({
        brandId,
        segment: seg,
        sendDate,
        optionKey: activeOption,
        angle: cd.angle,
        framework: cd.framework,
        openerMechanic: activeBrief.quality_checks?.opener_mechanic || activeBrief.body_variety?.openerMechanic,
        emotionalArc: activeBrief.body_variety?.emotionalArc,
        visualPattern: [cd.branch, cd.brief_route, activeBrief.banner?.main_image, activeBrief.banner?.sub_image]
          .filter(Boolean)
          .join(" · "),
        heroSlug: selectedProducts[0]?.slug || activeBrief.products?.[0]?.name,
      }));
      await recordSendHistory(rows);
      setSendHistoryState("saved");
      if (supabaseConfigured() && userId) setRecentSendHistory(await listSendHistory(brandId, 18));
    } catch (e) {
      setSendHistoryState("error");
      setSendHistoryError(e instanceof Error ? e.message : "Could not record send history");
    }
  }

  // Wipe everything back to a fresh first-load state (optionally confirming if work would be lost).
  function startNewBrief() {
    if ((options.a || options.b) && !window.confirm("Start a new brief? This clears the current campaign and generated options.")) return;
    dispatchStudio({ type: "reset" });
    setSaveState("idle");
    setSaveError(null);
    setSendHistoryState("idle");
    setSendHistoryError(null);
    setSyncResults({});
    setTplResults({});
    setToneError(null);
    setToneExtracting(false);
    clearDraft();
  }

  function openVersion(v: SavedVersion) {
    dispatchStudio({ type: "openVersion", payload: v.data });
    setSyncResults({});
    setTplResults({});
    setSaveState("idle");
    setHistoryOpen(false);
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
      if (!canGenerate) {
        setApiError("Pick at least one segment and 1-6 products before Review.");
        setOpenStep(segments.length === 0 ? 3 : 2);
        return;
      }
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
    const required = requiredCatalogProducts(brandId);
    const requiredSet = new Set(required.map((p) => p.slug));
    const desired = Math.min(
      maxProducts,
      Math.max(required.length, brand.defaultProductCount || maxProducts),
      brand.catalog.length
    );
    const hero = required.length ? [] : brand.catalog.filter((p) => p.slug === brand.heroSlug);
    const support = brand.catalog.filter((p) => !requiredSet.has(p.slug) && p.slug !== brand.heroSlug);
    // Prefer support products not used in the last 3 sends; fall back to all if not enough fresh ones.
    const freshSupport = support.filter((p) => !recentProductSlugs.includes(p.slug));
    const fixed = required.length ? required : hero;
    const pool = [
      ...fixed,
      ...(freshSupport.length >= desired - fixed.length ? freshSupport : support),
    ].slice(0, desired);
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
      case 2: return `${selectedProducts.length} product${selectedProducts.length === 1 ? "" : "s"}${requiredProductsForBrand.length ? ` · ${requiredProductsForBrand.length} required` : ""} (hero: ${brand.catalog.find((p) => p.slug === brand.heroSlug)?.name})`;
      case 3: return segments.length ? segments.map((s) => `${s} ${segLabel(s)}`).join(" · ") : "none selected";
      case 4: return `${opsSummary}${lastHero || lastAngle || lastCtr ? ` · last: ${lastHero || "?"}/${lastAngle || "?"}/${lastCtr || "?"}%` : ""}`;
      case 5: return winningContent.trim() ? `${winningContent.trim().length} chars pasted` : "skipped";
      default: return "";
    }
  };
  const stepStatus = (i: number): "ok" | "warn" | "bad" => {
    switch (i) {
      case 0: return theme.trim() ? "ok" : "warn";
      case 1: return offerParts.length || urgency !== "none" ? "ok" : "warn";
      case 2:
        if (selectedProducts.length < 1 || selectedProducts.length > maxProducts) return "bad";
        if (missingRequiredProductsForSelection.length) return "bad";
        return selectedProducts.length >= 4 || brandId === "santa_fare" ? "ok" : "warn";
      case 3: return segments.length ? "ok" : "bad";
      case 4:
        if (ops.consentBasis === "unknown") return "bad";
        return ops.senderEmail && ops.audienceSource && ops.segmentRule ? "ok" : "warn";
      case 5: return winningContent.trim() ? "ok" : "warn";
      default: return "warn";
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
          const enabled = v === "build" || (v === "review" && canGenerate) || (v === "output" && (options.a || options.b));
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
        <BuildView>
          {STEP_TITLES.map((title, i) => (
            <StepCard
              key={i}
              n={i + 1}
              title={title}
              done={visited.has(i) && openStep !== i && stepStatus(i) === "ok"}
              status={stepStatus(i)}
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
                  {requiredProductsForBrand.length > 0 && (
                    <div className="section-panel text-sm">
                      <strong className="text-[var(--text)]">Required in every {brand.name} email:</strong>{" "}
                      {requiredProductsForBrand.map((product) => product.name).join(", ")}. These slots are locked so A/B generation, export, and SendGrid stay aligned.{" "}
                      <span className="text-[var(--muted)]">{bodyHomepagePolicyCopy(bodyHomePolicy)}</span>
                    </div>
                  )}
                  <Field label="Product block template">
                    <ProductStylePicker value={productCopyStyle} onChange={setProductCopyStyle} />
                  </Field>
                  <Field label="Body copy focus">
                    <div className="flex gap-2">
                      {(["hero", "grid"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setBodyFocus(mode)}
                          className={`choice-pill ${bodyFocus === mode ? "choice-pill-active" : ""}`}
                        >
                          {mode === "hero" ? "Hero story" : "Full grid"}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-1">
                      {bodyFocus === "hero"
                        ? "Body prose tells the hero product story; support products share one collective line."
                        : "Body prose covers each featured product individually."}
                    </p>
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
                        required={requiredSlugSet.has(slot.slug)}
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
                  {productPriceWarnings.length > 0 && (
                    <Banner level="warn">
                      {productPriceWarnings.map((warning) => warning.message).join(" · ")}
                    </Banner>
                  )}
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
                  <SegmentQualityWarning
                    selectedCount={segments.length}
                    totalCount={brand.productSegments.length}
                    audienceSource={ops.audienceSource || ""}
                    segmentRule={ops.segmentRule || ""}
                    theme={theme}
                    sendDate={sendDate}
                  />
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
                    <RecentSendMemoryPanel history={recentSendHistory.filter((row) => !segments.length || segments.includes(row.segment)).slice(0, 6)} />
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
        </BuildView>
      )}

      {/* ============ REVIEW (step 7: pre-flight + prompts before sending) ============ */}
      {view === "review" && (
        <ReviewView>
          <div className="section-panel flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold">Ready to generate</h2>
              <p className="text-sm text-[var(--muted)] mt-1">
                2 options × {segments.length} segment{segments.length === 1 ? "" : "s"} × {selectedProducts.length} product{selectedProducts.length === 1 ? "" : "s"} · {autoSegmentBatching ? "layered stream" : "single fallback"} · {offer}
              </p>
            </div>
            <button onClick={() => generate()} disabled={generating || !canGenerate} className="btn-primary">
              {generating ? "Generating…" : "Generate A + B"}
            </button>
          </div>
          {generating && <GenerationProgress elapsedSec={elapsedSec} progress={progress} onCancel={cancelGenerate} />}

          <p className="text-sm text-[var(--muted)]">
            One generation run produces <strong className="text-[var(--text)]">per-segment copy + the design brief</strong>. The server now creates compact A/B foundations first, then writes each segment’s subject/body in smaller patch calls before merging.
          </p>
          {autoSegmentBatching && (
            <Banner level="warn">
              Layered generation is on: shared strategy/banner/products are generated first, then each segment is written separately and merged into one A/B brief.
            </Banner>
          )}
          {segments.length === 1 && promptOverridesActive && (
            <Banner level="warn">
              One-segment runs with edited system/user prompts use the legacy full-brief fallback. Multi-segment edited prompts now stay layered.
            </Banner>
          )}
          {apiError && <Banner level="fail">{apiError}</Banner>}

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ModelSelector label="Option A model" value={modelA} onChange={setModelA} providers={AI_PROVIDERS} />
            <ModelSelector label="Option B model" value={modelB} onChange={setModelB} providers={AI_PROVIDERS} />
          </div>
          <Banner level="warn">
            Timeout tip: Opus, Pro, and full frontier GPT models can still be slower on many segments. For fastest drafts, use Claude Haiku, Gemini Flash/Lite, or GPT mini/nano, then regenerate with a stronger model for final polish.
          </Banner>

          <details className="section-panel" open={productPriceWarnings.length > 0}>
            <summary className="cursor-pointer text-sm font-semibold">
              Pre-flight <span className={canGenerate && !productPriceWarnings.length ? "badge-ok ml-2" : "badge-warn ml-2"}>{canGenerate && !productPriceWarnings.length ? "Ready" : "Review"}</span>
            </summary>
            <div className="mt-4 flex flex-col gap-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <Summary k="Brand" v={brand.name} />
                <Summary k="Send" v={dateToken(sendDate)} />
                <Summary k="Theme" v={theme || "—"} />
                <Summary k="Promo" v={offer} />
                <Summary k="Urgency" v={urgency} />
                <Summary k="Segments" v={segments.map((s) => s).join(", ") || "—"} />
                <Summary k="Products" v={`${selectedProducts.length} (${selectedProducts.map((p) => p.name).join(", ")})`} />
                <Summary k="Body layout" v={bodyLayout} />
                <Summary k="Body focus" v={bodyFocus} />
                <Summary k="Product copy" v={productCopyStyle.replace(/_/g, " ")} />
                <Summary k="Strategy" v={strategyActive ? [strategy.campaignGoal, strategy.keyMessage, strategy.toneKeywords].filter(Boolean).join(" · ") || "enriched" : "none"} />
                <Summary k="Ops" v={opsSummary} />
              </div>
              {productPriceWarnings.length > 0 && (
                <Banner level="warn">
                  Product price check: {productPriceWarnings.map((warning) => warning.message).join(" · ")}
                </Banner>
              )}
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
            </div>
          </details>

          <PromptBlock
            title="Performance context"
            subtitle="Injected into the system prompt; edit to steer this campaign's intelligence"
            value={effectivePerfContext}
            edited={customPerfContext !== null}
            onChange={(v) => setCustomPerfContext(v)}
            onReset={() => setCustomPerfContext(null)}
          />

          <div className="prompt-block">
            <div className="prompt-header">
              <button type="button" onClick={() => setAdvancedPromptsOpen((v) => !v)} className="prompt-toggle" aria-expanded={advancedPromptsOpen}>
                <div className="text-sm font-semibold">
                  Compact prompt steering
                  {promptOverridesActive && <span className="ml-2 text-xs text-[var(--accent-2)]">· edited</span>}
                </div>
                <div className="text-xs text-[var(--muted)]">Short steering overrides; the server injects compact playbook/schema layers automatically.</div>
              </button>
              <span className="text-xs text-[var(--muted)]">{advancedPromptsOpen ? "Hide" : "Show"}</span>
            </div>
            {advancedPromptsOpen && (
              <div className="p-3 flex flex-col gap-3">
                <PromptBlock
                  title="System steering"
                  subtitle={`${brand.name} · ${brand.persona} — keep this compact; A/B contrast is added server-side`}
                  value={effectiveSystem}
                  edited={systemPromptEdited}
                  onChange={(v) => setSystemOverride(v)}
                  onReset={() => setSystemOverride(null)}
                />
                <PromptBlock
                  title="Campaign steering"
                  subtitle="Campaign facts and desired emphasis; detailed schemas stay server-side"
                  value={effectiveUser}
                  edited={userPromptEdited}
                  onChange={(v) => setUserOverride(v)}
                  onReset={() => setUserOverride(null)}
                />
              </div>
            )}
          </div>

          <div className="review-action-bar">
            <div className="text-xs text-[var(--muted)] min-w-0">
              {canGenerate ? `${segments.length} segment(s), ${selectedProducts.length} product(s), ${autoSegmentBatching ? "streamed layered run" : "single fallback"}` : `Pick at least one segment and 1–${maxProducts} products.`}
            </div>
            <div className="flex items-center gap-2">
            <button onClick={() => setView("build")} className="btn-ghost">Back to brief</button>
            <button onClick={() => generate()} disabled={generating || !canGenerate} className="btn-primary">
              {generating ? "Generating A + B…" : "Generate A + B"}
            </button>
            </div>
          </div>
        </ReviewView>
      )}

      {/* ============ OUTPUT (A/B per-segment preview + brief + export) ============ */}
      {view === "output" && (
        <OutputView>
          {!options.a && !options.b ? (
            <Banner level="warn">Nothing generated yet — go to Review & generate.</Banner>
          ) : (
            <>
              <div className="section-panel output-top-panel">
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Step 3 · A/B output</div>
                  <h2 className="text-xl font-bold mt-1">Review, compare, and ship</h2>
                  <p className="text-sm text-[var(--muted)] mt-1">
                    Pick an option, scan the current segment, then jump into preview, brief editing, or export.
                  </p>
                </div>
                <div className="output-top-actions">
                  <button onClick={() => setView("build")} className="btn-ghost">Back to brief</button>
                  <button onClick={() => generate()} disabled={generating} className="btn-primary">{generating ? "Regenerating…" : "Regenerate A + B"}</button>
                </div>
              </div>

              <OutputOptionCards options={options} activeOption={activeOption} onSelect={setActiveOption} />

              <div className="output-action-dock">
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Current output</div>
                  <div className="text-sm font-semibold truncate">
                    Option {activeOption.toUpperCase()} · {activeSegment || "no segment"} · {activeBrief?._score ?? "—"}/100
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!compareMode && (
                    <div className="output-view-toggle" role="group" aria-label="Output view">
                      {(["preview", "brief"] as const).map((t) => (
                        <button key={t} onClick={() => setOutputTab(t)}
                          className={`choice-pill ${outputTab === t ? "choice-pill-active" : ""}`}>
                          {t === "preview" ? "Preview" : "Design brief"}
                        </button>
                      ))}
                    </div>
                  )}
                  {options.a && options.b && (
                    <button onClick={() => setCompareMode((v) => !v)} className={`choice-pill ${compareMode ? "choice-pill-active" : ""}`} title="View A and B side by side for the current segment">
                      {compareMode ? "Exit compare" : "Compare A · B"}
                    </button>
                  )}
                  <button onClick={downloadAll} className="btn-primary">Download zip</button>
                  <button onClick={exportExcel} className="btn-ghost">Excel brief</button>
                  {authState === "in" && (
                    <>
                      <button onClick={saveCurrent} disabled={saveState === "saving"} className="btn-ghost">
                        {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
                      </button>
                      <button onClick={recordCurrentSendHistory} disabled={sendHistoryState === "saving" || !activeBrief} className="btn-ghost">
                        {sendHistoryState === "saving" ? "Recording…" : sendHistoryState === "saved" ? "Recorded" : "Record memory"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {genWarning && <Banner level="warn">{genWarning}</Banner>}
              {incompleteOutputLabels.length > 0 && (
                <Banner level="fail">
                  Incomplete generated coverage: {incompleteOutputLabels.slice(0, 8).join(", ")}
                  {incompleteOutputLabels.length > 8 ? `, +${incompleteOutputLabels.length - 8} more` : ""}. Export and SendGrid sync will ask for confirmation or stay blocked on affected segments.
                </Banner>
              )}
              {generating && <GenerationProgress elapsedSec={elapsedSec} progress={progress} onCancel={cancelGenerate} />}

              <OutputSegmentNavigator
                segments={segments}
                active={activeSegment}
                onSelect={setActiveSegment}
                labelFor={(s) => `${s} · ${segLabel(s)}`}
                incompleteForOption={(opt, seg) => !options[opt] || segmentIncomplete(opt, seg)}
              />

              {options.a && options.b && (
                <ABContrastPanel
                  a={options.a}
                  b={options.b}
                  segment={activeSegment}
                  subjectA={subjectFor("a", activeSegment)}
                  preheaderA={preheaderFor("a", activeSegment)}
                  subjectB={subjectFor("b", activeSegment)}
                  preheaderB={preheaderFor("b", activeSegment)}
                  activeOption={activeOption}
                  onSelectOption={setActiveOption}
                />
              )}

              <details className="section-panel output-feedback-panel">
                <summary className="output-summary-toggle">
                  <span>
                    <span className="text-sm font-semibold">Regenerate from feedback</span>
                    <span className="block text-xs text-[var(--muted)]">Use this when the current A/B routes are close, too salesy, or missing a campaign requirement.</span>
                  </span>
                  <span className="text-xs font-semibold text-[var(--accent)]">Open</span>
                </summary>
                <div className="mt-3">
                  <div className="flex justify-end mb-2">
                    <button onClick={useQaFlagsAsFeedback} disabled={!activeBrief?._flags?.length} className="btn-ghost">Use QA flags</button>
                  </div>
                  <textarea
                    value={revisionFeedback}
                    onChange={(e) => setRevisionFeedback(e.target.value)}
                    rows={3}
                    className="input"
                    placeholder="Example: Make Option B less discount-first, tighten the banner bullets, keep Daisy as hero, and add the shipping threshold in paragraph 1."
                  />
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button onClick={regenerateFromFeedback} disabled={generating || !revisionFeedback.trim()} className="btn-primary">
                      {generating ? "Regenerating…" : "Apply feedback · regenerate A + B"}
                    </button>
                    <button onClick={() => setRevisionFeedback("")} disabled={!revisionFeedback.trim()} className="btn-ghost">Clear</button>
                  </div>
                </div>
              </details>

              {activeBrief && (
                <details className="section-panel output-quality-drawer">
                  <summary className="output-summary-toggle">
                    <span>
                      <span className="text-sm font-semibold">Quality and freshness checks</span>
                      <span className="block text-xs text-[var(--muted)]">Formatting coverage, freshness memory, and any deeper QA stay here until needed.</span>
                    </span>
                    <span className="text-xs font-semibold text-[var(--accent)]">Open</span>
                  </summary>
                  <div className="output-quality-grid mt-3">
                    <FormatCoverage brief={activeBrief} />
                    <FreshnessPanel result={activeFreshness} historyCount={recentSendHistory.length} />
                  </div>
                </details>
              )}

              {/* side-by-side A | B compare (read-only) for the active segment */}
              {compareMode && options.a && options.b && (
                <div className="compare-preview-grid">
                  {(["a", "b"] as OptKey[]).map((opt) => {
                    const br = options[opt]!;
                    const cd = br.creative_direction || {};
                    const subj = subjectFor(opt, activeSegment);
                    const pre = preheaderFor(opt, activeSegment);
                    return (
                      <div key={opt} className="compare-preview-card">
                        <div className="compare-preview-head">
                          <div className="min-w-0">
                            <span className="text-sm font-semibold">
                              Option {opt.toUpperCase()}
                              <span className="ml-1 text-xs" style={{ color: scoreColor(br._score) }}>{br._score ?? "—"}/100</span>
                            </span>
                            <div className="text-xs text-[var(--muted)] truncate">{cd.angle || "?"} · {cd.framework || "?"}</div>
                          </div>
                          <button type="button" onClick={() => { setActiveOption(opt); setCompareMode(false); }} className="btn-ghost">Edit this</button>
                        </div>
                        <div className="active-copy-strip">
                          <div>
                            <span className="copy-strip-label">Subject</span>
                            <strong>{subj}</strong>
                            <span className="copy-strip-count" style={{ color: subjectLenColor(subj.length) }}>{subj.length}c</span>
                          </div>
                          {pre && (
                            <div>
                              <span className="copy-strip-label">Preheader</span>
                              <span>{pre}</span>
                              <span className="copy-strip-count" style={{ color: preheaderLenColor(pre.length) }}>{pre.length}c</span>
                            </div>
                          )}
                        </div>
                        <Preview html={htmlFor(opt, activeSegment)} />
                      </div>
                    );
                  })}
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
                    <div className="active-copy-strip mb-3">
                      <div>
                        <span className="copy-strip-label">Subject</span>
                        <strong>{subjectFor(activeOption, activeSegment)}</strong>
                        <span className="copy-strip-count" style={{ color: subjectLenColor(subjectFor(activeOption, activeSegment).length) }} title="Playbook target 42–58 (hard cap 60)">
                          {subjectFor(activeOption, activeSegment).length}c
                        </span>
                      </div>
                      {preheaderFor(activeOption, activeSegment) && (
                        <div>
                          <span className="copy-strip-label">Preheader</span>
                          <span>{preheaderFor(activeOption, activeSegment)}</span>
                          <span className="copy-strip-count" style={{ color: preheaderLenColor(preheaderFor(activeOption, activeSegment).length) }} title="Playbook target 60–90">
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
                      advisory={activeBrief._advisory}
                      score={activeBrief._score}
                      techniqueScore={activeBrief._technique_score}
                      techniqueCoverage={activeBrief._technique_coverage}
                      variety={activeBrief.body_variety || varietyProfile}
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
              <details className="section-panel output-export-details">
                <summary className="output-summary-toggle">
                  <span>
                    <span className="text-sm font-semibold">Export and SendGrid handoff</span>
                    <span className="block text-xs text-[var(--muted)]">Per-segment HTML, design sync, template creation, saved versions, and send memory.</span>
                  </span>
                  <span className="text-xs font-semibold text-[var(--accent)]">Open</span>
                </summary>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <button onClick={downloadAll} className="btn-primary">Download all (.zip)</button>
                  <button onClick={exportExcel} className="btn-ghost">Excel brief</button>
                  {authState === "in" && (
                    <>
                      <button onClick={saveCurrent} disabled={saveState === "saving"} className="btn-ghost">
                        {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved to history" : "Save version"}
                      </button>
                      <button onClick={recordCurrentSendHistory} disabled={sendHistoryState === "saving" || !activeBrief} className="btn-ghost">
                        {sendHistoryState === "saving" ? "Recording…" : sendHistoryState === "saved" ? "Recorded send" : "Record send memory"}
                      </button>
                    </>
                  )}
                  {saveState === "error" && <span className="text-xs text-[var(--bad)]">{saveError}</span>}
                  {sendHistoryState === "error" && <span className="text-xs text-[var(--bad)]">{sendHistoryError}</span>}
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
                          {sync?.blocking?.map((b, i) => <div key={`sb${i}`} className="text-xs text-[var(--bad)]">Design blocking: {b}</div>)}
                          {sync?.warnings?.map((w, i) => <div key={`sw${i}`} className="text-xs text-[var(--warn)]">Design warning: {w}</div>)}
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
              </details>
            </>
          )}
        </OutputView>
      )}

    </main>
  );
}
