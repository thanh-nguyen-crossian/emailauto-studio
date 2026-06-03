"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { accessToken, type Profile } from "@/lib/profile";
import { saveVersion, type SavedVersion, type VersionPayload } from "@/lib/history";
import { Auth } from "./components/Auth";
import { History } from "./components/History";
import { AdminPanel } from "./components/AdminPanel";
import { BRAND_LIST, BRANDS, productsForTypes } from "@/lib/config/brands";
import { TIER_PSYCHOLOGY } from "@/lib/config/tiers";
import type { Campaign, Product, TierCode, VariantCopyMap } from "@/lib/config/types";
import { getAllVariants } from "@/lib/variants";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompts";
import { renderEmailHTML } from "@/lib/render/email";
import { runPreflight, worstLevel } from "@/lib/preflight";
import type { ImageOverrides } from "@/lib/config/types";
import { Preview } from "./components/Preview";
import { PreflightPanel } from "./components/PreflightPanel";
import { ImageEditor } from "./components/ImageEditor";

type Stage = "brief" | "products" | "prompts" | "copy" | "preview" | "export";
const STAGES: { id: Stage; label: string }[] = [
  { id: "brief", label: "1 · Brief" },
  { id: "products", label: "2 · Products" },
  { id: "prompts", label: "3 · Prompts" },
  { id: "copy", label: "4 · Copy" },
  { id: "preview", label: "5 · Preview" },
  { id: "export", label: "6 · Export" },
];

const ALL_TIERS: TierCode[] = ["A", "B", "C", "D", "F"];

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
  const [stage, setStage] = useState<Stage>("brief");
  const [brandId, setBrandId] = useState(BRAND_LIST[0].id);
  const [sendDate, setSendDate] = useState(new Date().toISOString().slice(0, 10));
  const [offer, setOffer] = useState("Spring sale — up to 80% O.F.F, ends midnight");
  const [hookContract, setHookContract] = useState("");
  const [recipientName, setRecipientName] = useState("son.nln");
  const [tiers, setTiers] = useState<TierCode[]>(["A", "F"]);
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [images, setImages] = useState<ImageOverrides>({});
  const [includeLogo, setIncludeLogo] = useState(false);
  const [syncResults, setSyncResults] = useState<
    Record<string, { id?: string; editorUrl?: string; error?: string }>
  >({});
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
    // Keep this callback SYNCHRONOUS — awaiting any supabase auth/db call here deadlocks the SDK
    // (it holds a lock during the callback). Profile is fetched in the effect below instead.
    const { data: sub } = supabase().auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUserEmail(u?.email ?? null);
      setUserId(u?.id ?? null);
      setAuthState(u ? "in" : "out");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the profile (status + admin flag) outside the auth callback to avoid the SDK lock.
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

  // Bearer header for the authenticated paid routes (generate/sync). Empty in local no-Supabase mode.
  async function authHeader(): Promise<Record<string, string>> {
    if (!supabaseConfigured()) return {};
    try {
      const t = await accessToken();
      return t ? { Authorization: `Bearer ${t}` } : {};
    } catch {
      return {};
    }
  }

  // Prompt overrides reviewed/edited on the prompts step (undefined = use generated default).
  const [systemOverride, setSystemOverride] = useState<string | null>(null);
  const [userOverrides, setUserOverrides] = useState<Record<string, string>>({});

  const [copy, setCopy] = useState<VariantCopyMap>({});
  const [genErrors, setGenErrors] = useState<{ tier: string; error: string }[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [activeVariant, setActiveVariant] = useState<string>("");

  const brand = BRANDS[brandId];
  const layout = brand.layout;

  const campaign: Campaign = useMemo(
    () => ({ brandId, sendDate, tiers, productTypes, layout, offer, hookContract, recipientName }),
    [brandId, sendDate, tiers, productTypes, layout, offer, hookContract, recipientName]
  );

  const variants = useMemo(() => getAllVariants(campaign), [campaign]);

  const selectedProducts: Product[] = useMemo(() => {
    const all = brand.catalog.filter((p) => selectedSlugs.includes(p.slug));
    // Hero always present + first.
    const hero = brand.catalog.find((p) => p.slug === brand.heroSlug)!;
    const withHero = all.some((p) => p.slug === hero.slug) ? all : [hero, ...all];
    return withHero.sort((a, b) => (a.slug === brand.heroSlug ? -1 : b.slug === brand.heroSlug ? 1 : 0));
  }, [brand, selectedSlugs]);

  function switchBrand(id: string) {
    setBrandId(id);
    setProductTypes([]);
    setSelectedSlugs([BRANDS[id].heroSlug]);
    setImages({});
    setCopy({});
    setGenErrors([]);
    setSystemOverride(null);
    setUserOverrides({});
  }

  function toggle<T>(list: T[], value: T, setter: (v: T[]) => void) {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  const availableProducts = productsForTypes(brandId, productTypes);

  // Prompts that will be sent: the edited override if present, else the generated default.
  const defaultSystemPrompt = useMemo(() => buildSystemPrompt(brandId), [brandId]);
  const effectiveSystemPrompt = systemOverride ?? defaultSystemPrompt;
  const effectiveUserPrompt = (tier: TierCode) =>
    userOverrides[tier] ?? buildUserPrompt(campaign, tier);

  async function generate() {
    setGenerating(true);
    setApiError(null);
    setGenErrors([]);
    setSaveState("idle");
    try {
      const byTier: Record<string, string> = {};
      for (const t of tiers) byTier[t] = effectiveUserPrompt(t);
      const res = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ ...campaign, prompts: { system: effectiveSystemPrompt, byTier } }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.error || "Generation failed");
        return;
      }
      setCopy(data.copy || {});
      setGenErrors(data.errors || []);
      const firstKey = getAllVariants(campaign)[0]?.key;
      if (firstKey) setActiveVariant(firstKey);
      setStage("copy");
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
    }
  }

  function htmlForVariant(key: string): string {
    const c = copy[key];
    if (!c) return "";
    return renderEmailHTML(brand, campaign, selectedProducts, c, images, { includeLogo });
  }

  // Team naming convention, e.g. BraGoddess_Sun31May26_21 (segment code only).
  const templateName = (segment: string) => `${brand.name}_${dateToken(sendDate)}_${segment}`;

  function download(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function syncVariant(key: string, segment: string) {
    const html = htmlForVariant(key);
    if (!html) return;
    setSyncingKey(key);
    try {
      const res = await fetch("/api/sync-sendgrid", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          name: templateName(segment),
          subject: copy[key]?.subject || key,
          html,
        }),
      });
      const data = await res.json();
      setSyncResults((r) => ({
        ...r,
        [key]: res.ok ? { id: data.id, editorUrl: data.editorUrl } : { error: data.error },
      }));
    } catch (e) {
      setSyncResults((r) => ({ ...r, [key]: { error: e instanceof Error ? e.message : "Network error" } }));
    } finally {
      setSyncingKey(null);
    }
  }

  async function syncTemplate(key: string, segment: string) {
    const html = htmlForVariant(key);
    if (!html) return;
    setTplKey(key);
    try {
      const res = await fetch("/api/sync-template", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ name: templateName(segment), subject: copy[key]?.subject || key, html }),
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
        brandId, sendDate, offer, hookContract, recipientName,
        tiers, productTypes, selectedSlugs, includeLogo, images, copy,
      };
      await saveVersion(`${brand.name}_${dateToken(sendDate)}`, payload);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
  }

  function openVersion(v: SavedVersion) {
    const d = v.data;
    setBrandId(d.brandId);
    setSendDate(d.sendDate);
    setOffer(d.offer);
    setHookContract(d.hookContract);
    setRecipientName(d.recipientName);
    setTiers(d.tiers);
    setProductTypes(d.productTypes);
    setSelectedSlugs(d.selectedSlugs);
    setIncludeLogo(d.includeLogo);
    setImages(d.images || {});
    setCopy(d.copy || {});
    const firstKey = Object.keys(d.copy || {})[0];
    if (firstKey) setActiveVariant(firstKey);
    setSyncResults({});
    setTplResults({});
    setSaveState("idle");
    setHistoryOpen(false);
    setStage("preview");
  }

  async function downloadAll() {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const v of variants) {
      const html = htmlForVariant(v.key);
      if (html) zip.file(`${templateName(v.productType)}_${v.tier}.html`, html);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brand.name}_${dateToken(sendDate)}_variants.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canProducts = tiers.length > 0 && productTypes.length > 0;
  const canCopy = canProducts && selectedProducts.length > 0 && selectedProducts.length <= 6;

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
          <style>{`.btn-ghost{background:var(--surface-2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;}`}</style>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">EmailAuto Studio</h1>
          <p className="text-[var(--muted)] text-sm mt-1">
            RMKT email template generator · {BRAND_LIST.length} brands · win-pattern enforced
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
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
            <span className="text-xs text-[#f5c451]">Supabase not connected — History/Save disabled</span>
          )}
        </div>
      </header>

      {authState === "in" && (
        <History open={historyOpen} onClose={() => setHistoryOpen(false)} onOpenVersion={openVersion} />
      )}
      {authState === "in" && profile?.is_admin && (
        <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
      )}

      {/* Stage nav */}
      <nav className="flex flex-wrap gap-2 mb-6">
        {STAGES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStage(s.id)}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              stage === s.id
                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* ---- BRIEF ---- */}
      {stage === "brief" && (
        <section className="flex flex-col gap-6">
          <Field label="Brand">
            <div className="flex flex-wrap gap-2">
              {BRAND_LIST.map((b) => (
                <button
                  key={b.id}
                  onClick={() => switchBrand(b.id)}
                  className={`px-4 py-2 rounded-lg border text-sm ${
                    brandId === b.id
                      ? "border-[var(--accent)] bg-[var(--surface-2)]"
                      : "border-[var(--border)]"
                  }`}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full mr-2 align-middle"
                    style={{ background: b.accent }}
                  />
                  {b.name}
                  <span className="text-[var(--muted)] text-xs ml-2">{b.layout}</span>
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Send date">
              <input
                type="date"
                value={sendDate}
                onChange={(e) => setSendDate(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Recipient name token">
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="input"
              />
            </Field>
          </div>

          <Field label="Offer / theme (the single hook)">
            <textarea
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              rows={2}
              className="input"
            />
          </Field>

          <Field label="Hook Contract (optional — the source of truth for all copy)">
            <textarea
              value={hookContract}
              onChange={(e) => setHookContract(e.target.value)}
              rows={2}
              placeholder="segment insight + emotion + hero product + price/proof + urgency + avoid rule — e.g. At-risk Daisy buyers want relief from shoulder marks + Daisy Bra at 💲12.99 + verified comfort review + midnight deadline + avoid gratitude opener"
              className="input"
            />
            <span className="text-xs text-[var(--muted)]">
              Leave blank to have {brand.persona} build one from the offer first.
            </span>
          </Field>

          <Field label="Target tiers">
            <div className="flex flex-wrap gap-2">
              {ALL_TIERS.map((t) => (
                <button
                  key={t}
                  onClick={() => toggle(tiers, t, setTiers)}
                  title={TIER_PSYCHOLOGY[t].label}
                  className={`px-3 py-2 rounded-lg border text-sm ${
                    tiers.includes(t)
                      ? "border-[var(--accent)] bg-[var(--surface-2)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  <strong>{t}</strong> · {TIER_PSYCHOLOGY[t].label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Product types">
            <div className="flex flex-wrap gap-2">
              {brand.productSegments.map((s) => (
                <button
                  key={s.code}
                  onClick={() => toggle(productTypes, s.code, setProductTypes)}
                  className={`px-3 py-2 rounded-lg border text-sm ${
                    productTypes.includes(s.code)
                      ? "border-[var(--accent)] bg-[var(--surface-2)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {s.code} · {s.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="text-sm text-[var(--muted)]">
            Variant matrix: {tiers.length} tiers × {productTypes.length} product types ={" "}
            <strong className="text-[var(--text)]">{variants.length}</strong> variants
          </div>

          <NextButton disabled={!canProducts} onClick={() => setStage("products")}>
            Next: Products →
          </NextButton>
        </section>
      )}

      {/* ---- PRODUCTS ---- */}
      {stage === "products" && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-[var(--muted)]">
            Hero product <strong className="text-[var(--text)]">{brand.heroSlug}</strong> is locked
            into position 1. Pick up to 6 total (analysis: 7+ products hurts conversion).
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {availableProducts.map((p) => {
              const isHero = p.slug === brand.heroSlug;
              const checked = isHero || selectedSlugs.includes(p.slug);
              return (
                <button
                  key={p.slug}
                  disabled={isHero}
                  onClick={() => toggle(selectedSlugs, p.slug, setSelectedSlugs)}
                  className={`text-left p-3 rounded-lg border ${
                    checked ? "border-[var(--accent)] bg-[var(--surface-2)]" : "border-[var(--border)]"
                  } ${isHero ? "opacity-90 cursor-default" : ""}`}
                >
                  <div className="font-medium text-sm">
                    {p.name} {isHero && <span className="text-xs text-[var(--accent)]">★ hero</span>}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    💲{p.price} · type {p.segment} · {p.slug}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="text-sm">
            Selected: <strong>{selectedProducts.length}</strong> / 6
            {selectedProducts.length > 6 && (
              <span className="text-[#ff6b6b]"> — too many, max 6</span>
            )}
          </div>
          <NextButton disabled={!canCopy} onClick={() => setStage("prompts")}>
            Next: Prompts →
          </NextButton>
        </section>
      )}

      {/* ---- PROMPTS ---- */}
      {stage === "prompts" && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-[var(--muted)]">
            These are the exact prompts sent to Claude — one call per tier ({tiers.join(", ")}). The
            brand system prompt is shared (and prompt-cached); each tier gets its own user prompt.
            Edit any of them below — <strong className="text-[var(--text)]">what you see is what gets sent</strong>.
          </p>
          {apiError && <Banner level="fail">{apiError}</Banner>}

          <PromptBlock
            title="System prompt"
            subtitle={`${brand.name} · ${brand.persona} · shared across all tiers (cached)`}
            value={effectiveSystemPrompt}
            edited={systemOverride !== null}
            onChange={(v) => setSystemOverride(v)}
            onReset={() => setSystemOverride(null)}
          />

          {tiers.map((t) => (
            <PromptBlock
              key={t}
              title={`User prompt · tier ${t}`}
              subtitle={`${TIER_PSYCHOLOGY[t].label} → ${productTypes.map((c) => `${t}${c}`).join(", ")}`}
              value={effectiveUserPrompt(t)}
              edited={userOverrides[t] !== undefined}
              onChange={(v) => setUserOverrides({ ...userOverrides, [t]: v })}
              onReset={() => {
                const next = { ...userOverrides };
                delete next[t];
                setUserOverrides(next);
              }}
            />
          ))}

          <button onClick={generate} disabled={generating} className="btn-primary w-fit">
            {generating ? "Generating…" : `✨ Send to Claude · generate ${variants.length} variants`}
          </button>
        </section>
      )}

      {/* ---- COPY ---- */}
      {stage === "copy" && (
        <section className="flex flex-col gap-4">
          {apiError && <Banner level="fail">{apiError}</Banner>}
          {genErrors.map((e) => (
            <Banner key={e.tier} level="warn">
              Tier {e.tier}: {e.error}
            </Banner>
          ))}

          {Object.keys(copy).length === 0 ? (
            <Banner level="warn">No copy yet — go to step 3 (Prompts) and generate.</Banner>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setStage("prompts")} className="btn-ghost">
                  ← Prompts
                </button>
                <button onClick={generate} disabled={generating} className="btn-ghost">
                  {generating ? "Regenerating…" : "↻ Regenerate"}
                </button>
              </div>
              <VariantTabs
                variants={variants.map((v) => v.key)}
                active={activeVariant}
                onSelect={setActiveVariant}
              />
              {copy[activeVariant] && (
                <CopyEditor
                  value={copy[activeVariant]}
                  layout={layout}
                  onChange={(c) => setCopy({ ...copy, [activeVariant]: c })}
                />
              )}
              <NextButton onClick={() => setStage("preview")}>Next: Preview →</NextButton>
            </div>
          )}
        </section>
      )}

      {/* ---- PREVIEW ---- */}
      {stage === "preview" && (
        <section className="flex flex-col gap-4">
          {Object.keys(copy).length === 0 ? (
            <Banner level="warn">No copy yet — go to step 3 and generate.</Banner>
          ) : (
            <>
              <VariantTabs
                variants={variants.map((v) => v.key)}
                active={activeVariant}
                onSelect={setActiveVariant}
              />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  {copy[activeVariant] ? (
                    <Preview html={htmlForVariant(activeVariant)} />
                  ) : (
                    <Banner level="warn">No copy for {activeVariant}.</Banner>
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  <ImageEditor
                    brand={brand}
                    products={selectedProducts}
                    images={images}
                    onChange={setImages}
                    includeLogo={includeLogo}
                    onToggleLogo={setIncludeLogo}
                  />
                  {copy[activeVariant] && (
                    <PreflightPanel
                      results={runPreflight({
                        brand,
                        copy: copy[activeVariant],
                        accent: copy[activeVariant].accent || brand.accent,
                        productCount: selectedProducts.length,
                        heroInPositionOne: selectedProducts[0]?.slug === brand.heroSlug,
                        heroImage: images.hero || "",
                      })}
                    />
                  )}
                </div>
              </div>
              <NextButton onClick={() => setStage("export")}>Next: Export →</NextButton>
            </>
          )}
        </section>
      )}

      {/* ---- EXPORT ---- */}
      {stage === "export" && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-[var(--muted)]">
            Export the HTML, or <strong className="text-[var(--text)]">Sync to SendGrid</strong> to
            create it as a Design in your Design Library (no audience, nothing sent — a human builds
            the Single Send there).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={downloadAll} className="btn-primary w-fit">
              ⬇️ Download all {variants.length} as .zip
            </button>
            {authState === "in" && (
              <button
                onClick={saveCurrent}
                disabled={saveState === "saving" || Object.keys(copy).length === 0}
                className="btn-ghost"
              >
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "saved"
                  ? "✅ Saved to history"
                  : "💾 Save version"}
              </button>
            )}
            {saveState === "error" && <span className="text-xs text-[#ff6b6b]">{saveError}</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {variants.map((v) => {
              const has = !!copy[v.key];
              const html = has ? htmlForVariant(v.key) : "";
              const pf = has
                ? worstLevel(
                    runPreflight({
                      brand,
                      copy: copy[v.key],
                      accent: copy[v.key].accent || brand.accent,
                      productCount: selectedProducts.length,
                      heroInPositionOne: selectedProducts[0]?.slug === brand.heroSlug,
                      heroImage: images.hero || "",
                    })
                  )
                : "fail";
              const sync = syncResults[v.key];
              const tpl = tplResults[v.key];
              return (
                <div
                  key={v.key}
                  className="flex flex-col gap-2 p-3 rounded-lg border border-[var(--border)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-sm">{v.key}</span>
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        tier {v.tier} · type {v.productType}
                      </span>
                      <span className="ml-2">{pf === "pass" ? "✅" : pf === "warn" ? "⚠️" : "❌"}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={!has}
                        onClick={() => navigator.clipboard.writeText(html)}
                        className="btn-ghost"
                      >
                        Copy
                      </button>
                      <button
                        disabled={!has}
                        onClick={() => download(`${templateName(v.productType)}.html`, html)}
                        className="btn-ghost"
                      >
                        .html
                      </button>
                      <button
                        disabled={!has || syncingKey === v.key}
                        onClick={() => syncVariant(v.key, v.productType)}
                        className="btn-ghost"
                      >
                        {syncingKey === v.key ? "…" : "↗ Design"}
                      </button>
                      <button
                        disabled={!has || tplKey === v.key}
                        onClick={() => syncTemplate(v.key, v.productType)}
                        className="btn-ghost"
                      >
                        {tplKey === v.key ? "Cleaning…" : "↗ Dynamic Template"}
                      </button>
                    </div>
                  </div>
                  {sync?.id && (
                    <div className="text-xs text-[#3ecf8e]">
                      ✅ Design created (id {sync.id}) —{" "}
                      <a href={sync.editorUrl} target="_blank" rel="noreferrer" className="underline">
                        open in SendGrid
                      </a>
                    </div>
                  )}
                  {sync?.error && <div className="text-xs text-[#ff6b6b]">❌ {sync.error}</div>}
                  {tpl?.templateId && (
                    <div className="text-xs text-[#3ecf8e] flex flex-wrap items-center gap-2">
                      <span>✅ Dynamic Template created</span>
                      <code className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text)]">
                        {tpl.templateId}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(tpl.templateId!)}
                        className="underline text-[var(--muted)] hover:text-[var(--text)]"
                      >
                        copy id
                      </button>
                      {typeof tpl.cleanedBytes === "number" && (
                        <span className="text-[var(--muted)]">· cleaned to {(tpl.cleanedBytes / 1024).toFixed(1)} KB</span>
                      )}
                      <a href={tpl.editorUrl} target="_blank" rel="noreferrer" className="underline">
                        open in SendGrid
                      </a>
                    </div>
                  )}
                  {tpl?.error && <div className="text-xs text-[#ff6b6b]">❌ {tpl.error}</div>}
                  {tpl?.blocking?.map((b, i) => (
                    <div key={`b${i}`} className="text-xs text-[#ff6b6b]">⛔ {b}</div>
                  ))}
                  {tpl?.warnings?.map((w, i) => (
                    <div key={`w${i}`} className="text-xs text-[#f5c451]">⚠️ {w}</div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <style>{`
        .input { width:100%; background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:9px 11px; color:var(--text); font-size:14px; }
        .btn-primary { background:var(--accent); color:#fff; border:none; border-radius:8px; padding:10px 16px; font-size:14px; font-weight:600; cursor:pointer; }
        .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
        .btn-ghost { background:var(--surface-2); color:var(--text); border:1px solid var(--border); border-radius:6px; padding:6px 12px; font-size:13px; cursor:pointer; }
        .btn-ghost:disabled { opacity:.4; cursor:not-allowed; }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function NextButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-primary w-fit mt-2">
      {children}
    </button>
  );
}

function Banner({ level, children }: { level: "warn" | "fail"; children: React.ReactNode }) {
  const color = level === "fail" ? "#ff6b6b" : "#f5c451";
  return (
    <div
      className="rounded-lg p-3 text-sm"
      style={{ border: `1px solid ${color}`, color, background: "rgba(255,255,255,0.02)" }}
    >
      {children}
    </div>
  );
}

function PromptBlock({
  title,
  subtitle,
  value,
  edited,
  onChange,
  onReset,
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
            {edited && <span className="ml-2 text-xs text-[#f5c451]">· edited</span>}
          </div>
          <div className="text-xs text-[var(--muted)]">{subtitle}</div>
        </div>
        <span className="text-xs text-[var(--muted)]">{value.length} chars</span>
        <button onClick={() => navigator.clipboard.writeText(value)} className="btn-ghost">
          Copy
        </button>
        <button onClick={onReset} disabled={!edited} className="btn-ghost">
          Reset
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="w-full bg-transparent text-[var(--text)] font-mono text-xs leading-relaxed p-4 outline-none resize-y"
        style={{ height: 240 }}
      />
    </div>
  );
}

function VariantTabs({
  variants,
  active,
  onSelect,
}: {
  variants: string[];
  active: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {variants.map((v) => (
        <button
          key={v}
          onClick={() => onSelect(v)}
          className={`px-2.5 py-1 rounded font-mono text-xs border ${
            active === v
              ? "bg-[var(--accent)] text-white border-[var(--accent)]"
              : "border-[var(--border)] text-[var(--muted)]"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function CopyEditor({
  value,
  layout,
  onChange,
}: {
  value: import("@/lib/config/types").VariantCopy;
  layout: string;
  onChange: (c: import("@/lib/config/types").VariantCopy) => void;
}) {
  const set = (k: string, v: string) => onChange({ ...value, [k]: v });
  const row = (k: string, label: string, area = false) => (
    <Field label={label}>
      {area ? (
        <textarea
          className="input"
          rows={3}
          value={(value as unknown as Record<string, string>)[k] || ""}
          onChange={(e) => set(k, e.target.value)}
        />
      ) : (
        <input
          className="input"
          value={(value as unknown as Record<string, string>)[k] || ""}
          onChange={(e) => set(k, e.target.value)}
        />
      )}
    </Field>
  );
  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {row("subject", `Subject (${value.subject.length} chars)`)}
      {row("preheader", `Preheader (${value.preheader.length} chars)`)}
      {row("intro", "Intro (micro-story opener)", true)}
      {row("middle", "Middle", true)}
      {layout === "narrative" && row("closing", "Closing + sign-off", true)}
      {layout === "narrative" && row("ps", "P.S.")}
      {row("ctaText", "CTA text")}
      {row("accent", "Accent color")}
    </div>
  );
}
