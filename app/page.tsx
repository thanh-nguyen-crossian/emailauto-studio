"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { accessToken, type Profile } from "@/lib/profile";
import { BriefView, briefToMarkdown } from "./components/BriefView";
import { saveVersion, type SavedVersion, type VersionPayload } from "@/lib/history";
import { Auth } from "./components/Auth";
import { History } from "./components/History";
import { AdminPanel } from "./components/AdminPanel";
import { BRAND_LIST, BRANDS } from "@/lib/config/brands";
import { AI_PROVIDERS, DEFAULT_AI_MODELS, normalizeModelPair, type AIProviderOption } from "@/lib/config/aiModels";
import type { AIModelSelection, BodyLayout, Campaign, ImageOverrides, OfferType, Product, ProductCopyStyle, Urgency } from "@/lib/config/types";
import {
  buildSystemPrompt,
  buildUserPrompt,
  segJsonKey,
  type GenBrief,
} from "@/lib/briefgen";
import { getBrandIntelligence, intelligencePromptBlock, PROGRAM_INTELLIGENCE } from "@/lib/config/intelligence";
import { renderEmailHTML, type ProductLayout } from "@/lib/render/email";
import { Preview } from "./components/Preview";
import { PreflightPanel } from "./components/PreflightPanel";
import { ImageEditor } from "./components/ImageEditor";
import { HtmlFormatEditor } from "./components/HtmlFormatEditor";

type View = "build" | "review" | "output";
type OptKey = "a" | "b";
/** A product slot: a chosen catalog product + per-send URL override + the USPs selected for copy. */
type Slot = { slug: string; url: string; usps: string[]; scrapedUsps?: string[] };
const MAX_SLOTS = 8;

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
  const [recipientName, setRecipientName] = useState("son.nln");
  const [lastHero, setLastHero] = useState("");
  const [lastAngle, setLastAngle] = useState("");
  const [lastCtr, setLastCtr] = useState("");
  const [lastNote, setLastNote] = useState("");
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
  const [productCopyStyle, setProductCopyStyle] = useState<ProductCopyStyle>("headline_winner");

  // generated A/B options
  const [options, setOptions] = useState<{ a?: GenBrief; b?: GenBrief }>({});
  const [activeOption, setActiveOption] = useState<OptKey>("a");
  const [activeSegment, setActiveSegment] = useState<string>("");
  const [outputTab, setOutputTab] = useState<"preview" | "brief">("preview");
  // Manual HTML edits to the rendered email, keyed `${opt}:${segment}` (overrides the render).
  const [htmlOverrides, setHtmlOverrides] = useState<Record<string, string>>({});
  const [editingHtml, setEditingHtml] = useState(false);
  const [revisionFeedback, setRevisionFeedback] = useState("");

  const [apiError, setApiError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

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
  const campaign: Campaign = useMemo(
    () => ({
      brandId, sendDate, segments, layout, theme,
      offerType, offerValue, offerShipping, urgency, offer, bodyLayout, productCopyStyle, hookContract, recipientName,
      lastSend: { ctr: lastCtr, hero: lastHero, angle: lastAngle, note: lastNote },
      winningContent,
      customPerfContext: customPerfContext ?? undefined,
    }),
    [brandId, sendDate, segments, layout, theme, offerType, offerValue, offerShipping, urgency, offer, bodyLayout, productCopyStyle, hookContract, recipientName, lastCtr, lastHero, lastAngle, lastNote, winningContent, customPerfContext]
  );

  // Filled slots → Product list, applying the per-slot URL + selected-USP overrides. Hero first.
  const selectedProducts: Product[] = useMemo(() => {
    return slots
      .filter((s) => s.slug)
      .map((s): Product | null => {
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

  // ---- slot editing ----
  function updateSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function pickProduct(i: number, slug: string) {
    const cat = brand.catalog.find((p) => p.slug === slug);
    updateSlot(i, { slug, url: cat?.url || "", usps: [...(cat?.usps || [])], scrapedUsps: [] });
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
      const data = await res.json();
      if (!res.ok) return data.error || "Could not fetch the page";
      const usps: string[] = data.usps || [];
      if (!usps.length) return "No USPs found — add them manually below";
      setSlots((prev) =>
        prev.map((s, idx) => {
          if (idx !== i) return s;
          const merged = Array.from(new Set([...(s.scrapedUsps || []), ...usps]));
          const autoSel = usps.slice(0, 4).filter((u) => !s.usps.includes(u));
          return { ...s, scrapedUsps: merged, usps: [...s.usps, ...autoSel] };
        })
      );
      return `✓ Found ${usps.length} USPs — select below`;
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
  const systemPromptA = useMemo(() => buildSystemPrompt(campaign, selectedProducts, false), [campaign, selectedProducts]);
  const userPromptA = useMemo(() => buildUserPrompt(campaign, false), [campaign]);
  const perfContextDefault = useMemo(() => intelligencePromptBlock(brandId), [brandId]);
  const effectivePerfContext = customPerfContext ?? perfContextDefault;
  // Optional user edits to the prompts (null = use the generated default; what-you-see-is-what's-sent).
  const [systemOverride, setSystemOverride] = useState<string | null>(null);
  const [userOverride, setUserOverride] = useState<string | null>(null);
  const effectiveSystem = systemOverride ?? systemPromptA;
  const effectiveUser = userOverride ?? userPromptA;

  async function generate(feedback?: string) {
    setGenerating(true);
    setApiError(null);
    setSaveState("idle");
    setSyncResults({});
    setTplResults({});
    setHtmlOverrides({});
    setEditingHtml(false);
    try {
      const res = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          ...campaign,
          products: selectedProducts.map((p) => ({
            name: p.name, slug: p.slug, price: p.price, usps: p.usps, review: p.review, url: p.url,
          })),
          promptOverrides:
            systemOverride !== null || userOverride !== null
              ? { system: systemOverride ?? undefined, user: userOverride ?? undefined }
              : undefined,
          models: normalizeModelPair({ a: modelA, b: modelB }),
          feedback: feedback?.trim() || undefined,
          existingOptions: feedback?.trim() ? options : undefined,
        }),
      });
      // Read as text first: a serverless timeout/crash returns a plain-text error page, not JSON.
      const raw = await res.text();
      let data: { a?: GenBrief; b?: GenBrief; error?: string };
      try {
        data = JSON.parse(raw);
      } catch {
        if (res.status === 504 || /timeout|timed out|FUNCTION_INVOCATION/i.test(raw)) {
          setApiError("The server timed out while generating. This can happen with many segments — try 1–2 segments at a time, then retry.");
        } else {
          setApiError(`Server returned an unexpected response (HTTP ${res.status}). Please retry.`);
        }
        return;
      }
      if (!res.ok) {
        setApiError(data.error || "Generation failed");
        return;
      }
      setOptions({ a: data.a, b: data.b });
      setActiveOption(data.a ? "a" : "b");
      setActiveSegment(segments[0]);
      setOutputTab("preview");
      setView("output");
      if (feedback?.trim()) setRevisionFeedback("");
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
    }
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
    const lines = flags.map((f) => `- ${f.type.toUpperCase()}: ${f.msg}`).join("\n");
    setRevisionFeedback((prev) => [prev.trim(), "Fix these QA/playbook issues:", lines].filter(Boolean).join("\n\n"));
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
    return renderEmailHTML(brand, campaign, selectedProducts, b, seg, images, { includeLogo, productLayout, bodyLayout });
  }
  const activeHtmlKey = `${activeOption}:${activeSegment}`;
  const activeHtmlEdited = htmlOverrides[activeHtmlKey] != null;
  function subjectFor(opt: OptKey, seg: string): string {
    return options[opt]?.subject_lines?.[segJsonKey(seg)]?.subject || `${brand.name} ${seg}`;
  }
  function preheaderFor(opt: OptKey, seg: string): string {
    return options[opt]?.subject_lines?.[segJsonKey(seg)]?.preheader || "";
  }
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
    const { exportBriefsToExcel } = await import("@/lib/exportExcel");
    await exportBriefsToExcel(options, brand.name, dateToken(sendDate));
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
        segments, slots, includeLogo, productLayout, bodyLayout, productCopyStyle, images, options, htmlOverrides,
        models: normalizeModelPair({ a: modelA, b: modelB }),
        lastSend: { ctr: lastCtr, hero: lastHero, angle: lastAngle, note: lastNote },
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
    setRecipientName("son.nln");
    setLastHero(""); setLastAngle(""); setLastCtr(""); setLastNote("");
    setWinningContent("");
    setSegments(BRANDS[first].productSegments.slice(0, 2).map((s) => s.code));
    setSlots(initSlots(first));
    setImages({});
    setIncludeLogo(false);
    setProductLayout("stack");
    setBodyLayout("continuous");
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
    setModelA(DEFAULT_AI_MODELS.a);
    setModelB(DEFAULT_AI_MODELS.b);
    setHtmlOverrides({});
    setRevisionFeedback("");
    setVisited(new Set([0]));
    setOpenStep(0);
    setView("build");
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
    setWinningContent(d.winningContent || "");
    setCustomPerfContext(d.customPerfContext ?? null);
    const models = normalizeModelPair(d.models);
    setModelA(models.a);
    setModelB(models.b);
    setHookContract(d.hookContract || "");
    setRecipientName(d.recipientName);
    setSegments(d.segments || []);
    setSlots(d.slots && d.slots.length ? d.slots : initSlots(d.brandId));
    setIncludeLogo(d.includeLogo);
    setProductLayout(d.productLayout || "stack");
    setBodyLayout(d.bodyLayout || "continuous");
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
  const STEP_TITLES = ["Brand · Date · Theme", "Promo & Urgency", "Products", "Segments", "Last-Send Context", "Winning Reference"];

  const segLabel = (code: string) => brand.productSegments.find((s) => s.code === code)?.label || code;
  const heroProduct = selectedProducts[0] || brand.catalog.find((p) => p.slug === brand.heroSlug) || brand.catalog[0];

  function autoFillProductSet() {
    const desired = Math.min(maxProducts, brand.defaultProductCount || maxProducts, brand.catalog.length);
    const ordered = [
      ...brand.catalog.filter((p) => p.slug === brand.heroSlug),
      ...brand.catalog.filter((p) => p.slug !== brand.heroSlug),
    ].slice(0, desired);
    setSlots(
      ordered.map((p) => ({
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
      case 0: return `${brand.name} · ${dateToken(sendDate)} · ${theme || "no theme"}`;
      case 1: return `${offerParts.length ? offerParts.join(" + ") : "No promo"} · ${urgency}`;
      case 2: return `${selectedProducts.length} product${selectedProducts.length === 1 ? "" : "s"} (hero: ${brand.catalog.find((p) => p.slug === brand.heroSlug)?.name})`;
      case 3: return segments.length ? segments.map((s) => `${s} ${segLabel(s)}`).join(" · ") : "none selected";
      case 4: return lastHero || lastAngle || lastCtr ? `${lastHero || "?"} · ${lastAngle || "?"} · ${lastCtr || "?"}%` : "skipped";
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
        <Styles />
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">EmailAuto Studio</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            Brief → A/B copy + design brief · {BRAND_LIST.length} brands · segment-targeted
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={startNewBrief} className="btn-primary">✨ Start new brief</button>
          {authState === "in" ? (
            <>
              {profile?.is_admin && (
                <button onClick={() => setAdminOpen(true)} className="btn-ghost">🛠 Admin</button>
              )}
              <button onClick={() => setHistoryOpen(true)} className="btn-ghost">🕘 History</button>
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
      <nav className="flex gap-2 mb-6">
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
              className={`px-3 py-1.5 rounded-full text-sm border ${
                view === v ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
              }`}
            >
              {lbl}
            </button>
          );
        })}
      </nav>

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
                          className={`px-4 py-2 rounded-lg border text-sm ${brandId === b.id ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)]"}`}
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
                      <input type="date" value={sendDate} onChange={(e) => setSendDate(e.target.value)} className="input" />
                    </Field>
                    <Field label="Recipient name token">
                      <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="input" />
                    </Field>
                  </div>
                  <Field label="Campaign theme">
                    <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="e.g. Spring comfort sale · Thank-you · Back in stock" className="input" />
                  </Field>
                  <Field label="Hook Contract (optional — leave blank to let the model build one)">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={buildSuggestedHookContract} className="btn-ghost">Auto-build from brief</button>
                      <span className="text-xs text-[var(--muted)]">Uses current brand, segments, hero, offer, urgency, and avoid notes.</span>
                    </div>
                    <textarea value={hookContract} onChange={(e) => setHookContract(e.target.value)} rows={3} className="input" placeholder="segment insight + emotion + hero product + price/proof + urgency + avoid rule" />
                  </Field>
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
                          className={`px-3 py-1.5 rounded-lg border text-sm ${offerType === v ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] text-[var(--muted)]"}`}
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
                              className={`px-2.5 py-1 rounded-full border text-xs ${offerValue === v ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] text-[var(--muted)]"}`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                        <input value={offerValue} onChange={(e) => setOfferValue(e.target.value)} placeholder="e.g. 80% O.F.F or 💲12.99" className="input" />
                      </>
                    )}
                  </Field>
                  <Field label="Free-shipping component">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <button
                        onClick={() => setOfferShipping("")}
                        className={`px-3 py-1.5 rounded-lg border text-sm ${!offerShipping ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] text-[var(--muted)]"}`}
                      >
                        No free shipping
                      </button>
                      {SHIPPING_PRESETS.map((v) => (
                        <button
                          key={v}
                          onClick={() => setOfferShipping(v)}
                          className={`px-2.5 py-1 rounded-full border text-xs ${offerShipping === v ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] text-[var(--muted)]"}`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <input value={offerShipping} onChange={(e) => setOfferShipping(e.target.value)} placeholder="Custom shipping line, e.g. Free Shipping 💲35+" className="input" />
                    <div className="offer-preview">
                      Combined offer: <strong>{offer}</strong>
                    </div>
                  </Field>
                  <Field label="Urgency window">
                    <div className="flex flex-wrap gap-2">
                      {([["h24", "24 hrs"], ["h48", "48 hrs"], ["weekend", "Weekend"], ["none", "No urgency"]] as [Urgency, string][]).map(([v, lbl]) => (
                        <button key={v} onClick={() => setUrgency(v)}
                          className={`px-3 py-1.5 rounded-lg border text-sm ${urgency === v ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
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
                    Slot 1 is the <strong className="text-[var(--text)]">Hero</strong> (featured in banner + body). Add up to {MAX_SLOTS} slots. For each: pick the product, set a customer URL, and tick the USPs (or add your own) that should feed the copy + brief.
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
                        onPick={(slug) => pickProduct(si, slug)}
                        onUrl={(url) => updateSlot(si, { url })}
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
                        className={`text-left px-3 py-2 rounded-lg border text-sm ${segments.includes(s.code) ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
                        <span className="font-mono mr-2">{s.code}</span><strong className="text-[var(--text)]">{s.label}</strong>
                        <span className="text-[var(--muted)] ml-2 text-xs">{s.meta}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {i === 4 && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-[var(--muted)]">Optional — helps the model rotate away from the last send's angle/hero.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Last send CTR %"><input value={lastCtr} onChange={(e) => setLastCtr(e.target.value)} placeholder="0.84" className="input" /></Field>
                    <Field label="Last hero"><input value={lastHero} onChange={(e) => setLastHero(e.target.value)} placeholder="Daisy Bra" className="input" /></Field>
                    <Field label="Last angle"><input value={lastAngle} onChange={(e) => setLastAngle(e.target.value)} placeholder="Proof" className="input" /></Field>
                  </div>
                  <Field label="Note (e.g. 3rd reviews arc — avoid)"><input value={lastNote} onChange={(e) => setLastNote(e.target.value)} className="input" /></Field>
                </div>
              )}

              {i === 5 && (
                <Field label="Winning reference email (optional — mirror its structure/pacing, fresh copy)">
                  <textarea value={winningContent} onChange={(e) => setWinningContent(e.target.value)} rows={5} className="input" placeholder="Paste a high-performing email here…" />
                </Field>
              )}

              <div className="flex items-center gap-2 mt-4">
                <button onClick={() => goNext(i)} className="btn-primary">
                  {i === STEP_TITLES.length - 1 ? "Review & generate →" : "Next →"}
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

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
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
            </div>
          </div>

          <p className="text-sm text-[var(--muted)]">
            One combined prompt produces <strong className="text-[var(--text)]">per-segment copy + the design brief</strong>. We run it twice for two contrasting options. A and B share the same user prompt below; <strong className="text-[var(--text)]">B&apos;s divergence is enforced in its system prompt</strong> — once A returns, B is told <em>&ldquo;A used angle X / framework Y — pick different ones&rdquo;</em> (with an auto-retry if it overlaps). These are the exact prompts the server sends.
          </p>
          {apiError && <Banner level="fail">{apiError}</Banner>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ModelSelector label="Option A model" value={modelA} onChange={setModelA} providers={AI_PROVIDERS} />
            <ModelSelector label="Option B model" value={modelB} onChange={setModelB} providers={AI_PROVIDERS} />
          </div>

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
            subtitle={`${brand.name} · ${brand.persona} — B also gets a contrast clause after A returns`}
            value={effectiveSystem}
            edited={systemOverride !== null}
            onChange={(v) => setSystemOverride(v)}
            onReset={() => setSystemOverride(null)}
          />
          <PromptBlock
            title="User prompt (shared by A & B)"
            subtitle="lead creative direction, then all copy sections"
            value={effectiveUser}
            edited={userOverride !== null}
            onChange={(v) => setUserOverride(v)}
            onReset={() => setUserOverride(null)}
          />

          <div className="flex items-center gap-2">
            <button onClick={() => setView("build")} className="btn-ghost">← Back to brief</button>
            <button onClick={() => generate()} disabled={generating || !canGenerate} className="btn-primary">
              {generating ? "Generating A + B…" : "✨ Generate A + B"}
            </button>
            {!canGenerate && <span className="text-xs text-[var(--warn)]">Pick at least one segment and 1–{maxProducts} products.</span>}
          </div>
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
                      className={`text-left px-4 py-2 rounded-lg border ${active ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)]"}`}>
                      <div className="text-sm font-semibold">Option {opt.toUpperCase()} <span className="ml-1 text-xs" style={{ color: scoreColor(b._score) }}>{b._score ?? "—"}/100</span></div>
                      <div className="text-xs text-[var(--muted)]">{cd.angle || "?"} · {cd.framework || "?"}</div>
                      {b._model && <div className="text-[10px] mono text-[var(--muted)]">{b._provider || "AI"} · {b._model}</div>}
                    </button>
                  );
                })}
                <div className="flex-1" />
                <button onClick={() => generate()} disabled={generating} className="btn-ghost">{generating ? "Regenerating…" : "↻ Regenerate A + B"}</button>
              </div>

              {activeBrief && <FormatCoverage brief={activeBrief} />}

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
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
              <VariantTabs variants={segments} active={activeSegment} onSelect={setActiveSegment} labelFor={(s) => `${s} · ${segLabel(s)}`} />

              {/* output sub-tabs */}
              <div className="flex gap-2">
                {(["preview", "brief"] as const).map((t) => (
                  <button key={t} onClick={() => setOutputTab(t)}
                    className={`px-3 py-1 rounded text-sm border ${outputTab === t ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
                    {t === "preview" ? "📧 Preview" : "🎨 Design brief"}
                  </button>
                ))}
              </div>

              {activeBrief && outputTab === "preview" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <div className="mb-2 text-sm">
                      <span className="text-[var(--muted)]">Subject: </span>
                      <strong>{subjectFor(activeOption, activeSegment)}</strong>
                      <span className="text-[var(--muted)] ml-2">({subjectFor(activeOption, activeSegment).length} chars)</span>
                      {preheaderFor(activeOption, activeSegment) && (
                        <div className="text-xs text-[var(--muted)] mt-1">Preheader: {preheaderFor(activeOption, activeSegment)}</div>
                      )}
                    </div>
                    <SubjectOptionsPanel brief={activeBrief} segment={activeSegment} onUse={useSubjectOption} />
                    <LayoutPicker count={selectedProducts.length} value={productLayout} onChange={(v) => { setProductLayout(v); setHtmlOverrides({}); }} />
                    <BodyLayoutPicker value={bodyLayout} onChange={(v) => { setBodyLayout(v); setHtmlOverrides({}); }} />
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => setEditingHtml((v) => !v)}
                        className={`px-3 py-1 rounded text-sm border ${editingHtml ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}
                      >
                        {editingHtml ? "✓ Done editing" : "✎ Edit HTML"}
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
                        value={htmlFor(activeOption, activeSegment)}
                        accent={brand.accent}
                        onChange={(value) => setHtmlOverrides((o) => ({ ...o, [activeHtmlKey]: value }))}
                      />
                    )}
                    <Preview html={htmlFor(activeOption, activeSegment)} />
                  </div>
                  <div className="flex flex-col gap-4">
                    <ImageEditor brand={brand} products={selectedProducts} images={images} onChange={setImages} includeLogo={includeLogo} onToggleLogo={setIncludeLogo} />
                    <PreflightPanel flags={activeBrief._flags} score={activeBrief._score} />
                  </div>
                </div>
              )}

              {activeBrief && outputTab === "brief" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <button onClick={exportExcel} className="btn-primary">📊 Export to Excel (.xls · A + B)</button>
                    <span className="text-xs text-[var(--muted)]">One sheet per option, matching the email-brief format.</span>
                  </div>
                  <BriefView brief={activeBrief} onDownload={downloadBrief} onChange={updateActiveBrief} />
                </div>
              )}

              {/* export */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-sm font-semibold">Export</h3>
                  <button onClick={downloadAll} className="btn-primary">⬇️ Download all (.zip)</button>
                  {authState === "in" && (
                    <button onClick={saveCurrent} disabled={saveState === "saving"} className="btn-ghost">
                      {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✅ Saved to history" : "💾 Save version"}
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
                      return (
                        <div key={key} className="flex flex-col gap-2 p-3 rounded-lg border border-[var(--border)]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm"><strong>{opt.toUpperCase()}</strong> · <span className="font-mono">{seg}</span> <span className="text-[var(--muted)]">{segLabel(seg)}</span></span>
                            <div className="flex gap-2">
                              <button onClick={() => navigator.clipboard.writeText(html)} className="btn-ghost">Copy</button>
                              <button onClick={() => download(`${templateName(opt, seg)}.html`, html)} className="btn-ghost">.html</button>
                              <button disabled={syncingKey === key} onClick={() => syncDesign(opt, seg)} className="btn-ghost">{syncingKey === key ? "…" : "↗ Design"}</button>
                              <button disabled={tplKey === key} onClick={() => syncTemplate(opt, seg)} className="btn-ghost">{tplKey === key ? "Cleaning…" : "↗ Template"}</button>
                            </div>
                          </div>
                          {sync?.id && <div className="text-xs text-[var(--ok)]">✅ Design {sync.id} — <a href={sync.editorUrl} target="_blank" rel="noreferrer" className="underline">open</a></div>}
                          {sync?.error && <div className="text-xs text-[var(--bad)]">❌ {sync.error}</div>}
                          {tpl?.templateId && (
                            <div className="text-xs text-[var(--ok)] flex flex-wrap items-center gap-2">
                              <span>✅ Template</span>
                              <code className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5">{tpl.templateId}</code>
                              <button onClick={() => navigator.clipboard.writeText(tpl.templateId!)} className="underline text-[var(--muted)]">copy id</button>
                              <a href={tpl.editorUrl} target="_blank" rel="noreferrer" className="underline">open</a>
                            </div>
                          )}
                          {tpl?.error && <div className="text-xs text-[var(--bad)]">❌ {tpl.error}</div>}
                          {tpl?.blocking?.map((b, i) => <div key={`b${i}`} className="text-xs text-[var(--bad)]">⛔ {b}</div>)}
                          {tpl?.warnings?.map((w, i) => <div key={`w${i}`} className="text-xs text-[var(--warn)]">⚠️ {w}</div>)}
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

      <Styles />
    </main>
  );
}

function scoreColor(s?: number): string {
  const v = typeof s === "number" ? s : 100;
  return v >= 85 ? "var(--ok)" : v >= 60 ? "var(--warn)" : "var(--bad)";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Summary({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-2">
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
    <div className="mb-6 grid grid-cols-2 md:grid-cols-5 gap-2">
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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 min-w-0">
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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold">Win-template rhythm</h3>
        <span className="text-xs text-[var(--muted)]">WinEmailTemps reference set</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded border border-[var(--border)] bg-[var(--surface-2)] p-2">
            <div className="text-[10px] uppercase text-[var(--muted)]">{label}</div>
            <div className="text-sm font-semibold mt-0.5">{value}</div>
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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
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

function StepCard({
  n, title, done, open, summary, onOpen, children,
}: {
  n: number; title: string; done: boolean; open: boolean; summary: string; onOpen: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border ${open ? "border-[var(--accent)]" : "border-[var(--border)]"} bg-[var(--surface)] overflow-hidden`}>
      <button onClick={onOpen} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${open ? "bg-[var(--accent)] text-white" : done ? "bg-[var(--ok)] text-white" : "bg-[var(--surface-2)] text-[var(--muted)] border border-[var(--border)]"}`}>
          {done && !open ? "✓" : n}
        </span>
        <span className="flex-1">
          <span className="text-sm font-semibold">{title}</span>
          {!open && <span className="block text-xs text-[var(--muted)] mt-0.5 truncate">{summary}</span>}
        </span>
        <span className="text-xs text-[var(--muted)]">{open ? "▲" : done ? "Edit" : "▼"}</span>
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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Performance intelligence</h3>
        <span className="text-xs text-[var(--muted)]">{PROGRAM_INTELLIGENCE.period}</span>
      </div>
      <p className="text-xs text-[var(--muted)] mb-2">{intel.headline}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-2">
          <div className="text-[10px] uppercase text-[var(--muted)]">Benchmark</div>
          <div className="mt-0.5">{intel.benchmark.split(";")[0]}</div>
        </div>
        <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-2">
          <div className="text-[10px] uppercase text-[var(--muted)]">Hero</div>
          <div className="mt-0.5" style={{ color: heroAligned ? "var(--ok)" : "var(--warn)" }}>
            {hero || "none"} — {heroAligned ? "in proven pool ✓" : "needs a strong reason"}
          </div>
        </div>
        <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-2">
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
    <div className="rounded-lg p-3 text-sm" style={{ border: `1px solid ${color}`, color, background: "var(--surface)" }}>
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
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
        <div className="flex-1">
          <div className="text-sm font-semibold">
            {title}
            {edited && <span className="ml-2 text-xs text-[var(--accent-2)]">· edited</span>}
          </div>
          <div className="text-xs text-[var(--muted)]">{subtitle}</div>
        </div>
        <span className="text-xs text-[var(--muted)]">{value.length} chars</span>
        <button onClick={() => navigator.clipboard.writeText(value)} className="btn-ghost">Copy</button>
        <button onClick={onReset} disabled={!edited} className="btn-ghost">Reset</button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="w-full bg-transparent text-[var(--text)] mono text-xs leading-relaxed p-4 outline-none resize-y"
        style={{ height: 220 }}
      />
    </div>
  );
}

function VariantTabs({
  variants, active, onSelect, labelFor,
}: {
  variants: string[]; active: string; onSelect: (v: string) => void; labelFor?: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {variants.map((v) => (
        <button key={v} onClick={() => onSelect(v)}
          className={`px-2.5 py-1 rounded text-xs border ${active === v ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
          {labelFor ? labelFor(v) : v}
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
  if (!line || !options.length) return null;
  return (
    <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold">Subject options</h3>
        <span className="text-xs text-[var(--muted)]">{options.length} styles</span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {options.map((o, i) => {
          const active = o.subject === line.subject && o.preheader === line.preheader;
          return (
            <div key={`${o.subject}-${i}`} className={`rounded border p-2 ${active ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)]"}`}>
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
  const model = provider.models.find((m) => m.id === value.model) || provider.models[0];
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-xs font-semibold text-[var(--muted)] mb-2">{label}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
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
          value={model.id}
          onChange={(e) => onChange({ provider: provider.id, model: e.target.value })}
          className="input"
        >
          {provider.models.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>
      {model.note && <div className="text-[11px] text-[var(--muted)] mt-1">{model.note}</div>}
    </div>
  );
}

function ProductStylePicker({ value, onChange }: { value: ProductCopyStyle; onChange: (v: ProductCopyStyle) => void }) {
  const opts: { id: ProductCopyStyle; label: string; note: string }[] = [
    { id: "headline_winner", label: "Headline-led winner", note: "Short headline, tiny USPs" },
    { id: "benefit_pair", label: "Benefit pair", note: "Two pain-to-relief cues" },
    { id: "proof_badge", label: "Proof badge", note: "Review/trust leads" },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`text-left rounded-lg border px-3 py-2 ${value === o.id ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] text-[var(--muted)]"}`}
        >
          <div className="text-sm font-semibold">{o.label}</div>
          <div className="text-xs mt-0.5">{o.note}</div>
        </button>
      ))}
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
    <div className="mb-3">
      <div className="text-xs text-[var(--muted)] mb-1">Product layout</div>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => {
          const active = value === o.id;
          return (
            <button key={o.id} onClick={() => onChange(o.id)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-xs ${active ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
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

function BodyLayoutPicker({ value, onChange }: { value: BodyLayout; onChange: (v: BodyLayout) => void }) {
  const opts: { id: BodyLayout; label: string; rows: string[] }[] = [
    { id: "continuous", label: "Continuous body", rows: ["Body", "P.S.", "Products"] },
    { id: "interspersed", label: "Opener + products", rows: ["Opener", "Products", "Bridge/P.S."] },
  ];
  return (
    <div className="mb-3">
      <div className="text-xs text-[var(--muted)] mb-1">Body placement</div>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              className={`px-3 py-2 rounded-lg border text-xs text-left min-w-40 ${active ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)] text-[var(--muted)]"}`}
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
    </div>
  );
}

function ProductSlotCard({
  index, slot, catalog, onPick, onUrl, onScrape, onToggleUsp, onAddCustomUsp, onSetCustomUsp, onRemove,
}: {
  index: number;
  slot: Slot;
  catalog: Product[];
  onPick: (slug: string) => void;
  onUrl: (url: string) => void;
  onScrape: (url: string) => Promise<string>;
  onToggleUsp: (usp: string) => void;
  onAddCustomUsp: () => void;
  onSetCustomUsp: (uspIndex: number, value: string) => void;
  onRemove: () => void;
}) {
  const [showUrl, setShowUrl] = useState(!!slot.url);
  const [scrapeStatus, setScrapeStatus] = useState("");
  const cat = catalog.find((p) => p.slug === slot.slug);
  // Pool = catalog USPs + any scraped from the customer URL (deduped).
  const pool = Array.from(new Set([...(cat?.usps || []), ...(slot.scrapedUsps || [])]));
  // Custom USPs are selected entries not in the pool (rendered as editable inputs).
  const customUsps = slot.usps.map((u, j) => ({ u, j })).filter(({ u }) => !pool.includes(u));

  async function runScrape(url: string) {
    if (!url || !/^https?:\/\//i.test(url)) return;
    setScrapeStatus("Fetching product page…");
    setScrapeStatus(await onScrape(url));
  }

  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-2 ${index === 0 ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{index === 0 ? "★ Hero" : `Support ${index + 1}`}</span>
        {index > 0 && <button onClick={onRemove} className="text-xs text-[var(--muted)] hover:text-[var(--bad)]">remove</button>}
      </div>
      <select value={slot.slug} onChange={(e) => onPick(e.target.value)} className="input">
        <option value="">— select product —</option>
        {catalog.map((p) => (
          <option key={p.slug} value={p.slug}>{p.name} · 💲{p.price}</option>
        ))}
      </select>

      {slot.slug && (
        <>
          {showUrl ? (
            <div className="flex flex-col gap-1">
              <input
                value={slot.url}
                onChange={(e) => onUrl(e.target.value)}
                onBlur={(e) => runScrape(e.target.value)}
                placeholder="https://… (blur to auto-extract USPs)"
                className="input mono text-xs"
              />
              {scrapeStatus && <span className="text-[11px] text-[var(--muted)]">{scrapeStatus}</span>}
            </div>
          ) : (
            <button onClick={() => setShowUrl(true)} className="text-xs text-[var(--accent)] text-left">+ Customer URL</button>
          )}

          <div className="flex flex-col gap-1">
            {pool.map((usp) => (
              <label key={usp} className="flex items-start gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={slot.usps.includes(usp)} onChange={() => onToggleUsp(usp)} className="mt-0.5" />
                <span>{usp}</span>
              </label>
            ))}
            {customUsps.map(({ u, j }) => (
              <input key={`c${j}`} value={u} onChange={(e) => onSetCustomUsp(j, e.target.value)} placeholder="Custom USP" className="input text-xs" />
            ))}
            <button onClick={onAddCustomUsp} className="text-xs text-[var(--accent)] text-left">+ Add custom USP</button>
          </div>
          {cat?.review && <div className="text-[11px] italic text-[var(--muted)]">{cat.review}</div>}
        </>
      )}
    </div>
  );
}

function Styles() {
  return (
    <style>{`
      .input { width:100%; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:9px 11px; color:var(--text); font-size:14px; }
      .input:focus { outline:none; border-color:var(--accent); }
      .btn-primary { background:var(--accent); color:#fff; border:none; border-radius:8px; padding:10px 16px; font-size:14px; font-weight:600; cursor:pointer; }
      .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
      .btn-ghost { background:var(--surface-2); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:6px 12px; font-size:13px; cursor:pointer; }
      .btn-ghost:disabled { opacity:.4; cursor:not-allowed; }
      .offer-preview { margin-top:8px; padding:7px 11px; background:#edf6f1; border:1px solid #b9d8cc; border-radius:6px; font-size:12px; color:#315c51; }
      .offer-preview strong { font-weight:700; }
    `}</style>
  );
}
