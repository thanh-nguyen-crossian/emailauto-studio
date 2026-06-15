// Performance feedback loop.
//
// Two jobs:
//   1. Turn the "Page performance *.csv" exports into a ranked product-winner list per brand
//      (purchase / access — the same PO/access metric the static BRAND_INTELLIGENCE uses), so the
//      proven-hero pool can be refreshed from real data instead of hand-maintained.
//   2. Turn a history of past send outcomes (the levers we chose + the CTR/optout we got) into an
//      adaptive prompt block that tells the model which angles, frameworks, opener mechanics, and
//      heroes are actually earning clicks for THIS brand right now — closing the loop between what
//      we generate and what performs.
//
// Pure + dependency-free so it runs server-side, in scripts, and in the eval harness.

// ---- send-outcome model ----

export interface SendMetrics {
  /** Click-through rate, percent (e.g. 0.84 for 0.84%). */
  ctrPct?: number;
  /** Access / Delivered, percent — the MPP-immune access metric (see optimization-roadmap T1-01). */
  accessPerDeliveredPct?: number;
  /** Purchase / Access, percent — post-click conversion. */
  poPerAccessPct?: number;
  /** Optout / Delivered, percent — list-fatigue signal. */
  optoutPerDeliveredPct?: number;
}

/** One past send and the creative levers it used, paired with what it earned. */
export interface SendOutcome {
  date: string; // ISO
  brandId?: string;
  segment?: string;
  angle?: string;
  framework?: string;
  openerMechanic?: string;
  emotionalArc?: string;
  subjectStyle?: string;
  hero?: string;
  productSlugs?: string[];
  metrics?: SendMetrics;
  /** Optional explicit win flag; when absent, win is inferred from CTR vs. the set median. */
  won?: boolean;
  note?: string;
}

export type Lever = "angle" | "framework" | "openerMechanic" | "emotionalArc" | "subjectStyle" | "hero";

export interface LeverStat {
  lever: Lever;
  value: string;
  /** Mean CTR across sends using this value. */
  meanCtr: number;
  samples: number;
}

export interface PerformanceSignal {
  brandId?: string;
  sends: number;
  meanCtr: number;
  /** Per-lever winners (above the brand mean, min 2 samples), best first. */
  winners: LeverStat[];
  /** Per-lever laggards (below the brand mean, min 2 samples), worst first. */
  laggards: LeverStat[];
  /** Heroes ranked by mean CTR (best first). */
  heroRanking: LeverStat[];
  /** Heroes that underperformed — candidates to rest. */
  restHeroes: string[];
  /** Whether optout is trending up over the supplied window. */
  optoutRising: boolean;
}

function mean(nums: number[]): number {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function leverValue(o: SendOutcome, lever: Lever): string | undefined {
  const raw = (o as unknown as Record<string, unknown>)[lever];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function statForLever(outcomes: SendOutcome[], lever: Lever): LeverStat[] {
  const groups = new Map<string, number[]>();
  for (const o of outcomes) {
    const v = leverValue(o, lever);
    const ctr = o.metrics?.ctrPct;
    if (!v || !Number.isFinite(ctr as number)) continue;
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v)!.push(ctr as number);
  }
  return [...groups.entries()]
    .map(([value, ctrs]) => ({ lever, value, meanCtr: round(mean(ctrs)), samples: ctrs.length }))
    .sort((a, b) => b.meanCtr - a.meanCtr);
}

/** Derive an adaptive performance signal from a window of past send outcomes. */
export function derivePerformanceSignal(history: SendOutcome[], brandId?: string, minSamples = 2): PerformanceSignal {
  const outcomes = (brandId ? history.filter((o) => !o.brandId || o.brandId === brandId) : history).filter(Boolean);
  const ctrs = outcomes.map((o) => o.metrics?.ctrPct).filter((n): n is number => Number.isFinite(n as number));
  const brandMean = round(mean(ctrs));

  const levers: Lever[] = ["angle", "framework", "openerMechanic", "emotionalArc", "subjectStyle"];
  const allStats = levers.flatMap((l) => statForLever(outcomes, l));
  const winners = allStats
    .filter((s) => s.samples >= minSamples && s.meanCtr > brandMean)
    .sort((a, b) => b.meanCtr - a.meanCtr);
  const laggards = allStats
    .filter((s) => s.samples >= minSamples && s.meanCtr < brandMean)
    .sort((a, b) => a.meanCtr - b.meanCtr);

  const heroRanking = statForLever(outcomes, "hero");
  const restHeroes = heroRanking.filter((h) => h.samples >= minSamples && h.meanCtr < brandMean).map((h) => h.value);

  // Optout trend: compare first vs. second half by date.
  const dated = outcomes
    .filter((o) => Number.isFinite(o.metrics?.optoutPerDeliveredPct as number))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  let optoutRising = false;
  if (dated.length >= 4) {
    const mid = Math.floor(dated.length / 2);
    const early = mean(dated.slice(0, mid).map((o) => o.metrics!.optoutPerDeliveredPct as number));
    const late = mean(dated.slice(mid).map((o) => o.metrics!.optoutPerDeliveredPct as number));
    optoutRising = late > early * 1.1;
  }

  return {
    brandId,
    sends: outcomes.length,
    meanCtr: brandMean,
    winners,
    laggards,
    heroRanking,
    restHeroes,
    optoutRising,
  };
}

const LEVER_LABEL: Record<Lever, string> = {
  angle: "angle",
  framework: "framework",
  openerMechanic: "opener mechanic",
  emotionalArc: "emotional arc",
  subjectStyle: "subject style",
  hero: "hero",
};

/**
 * Adaptive prompt block injected alongside the static performance intelligence. Tells the model
 * which levers are earning clicks right now so it can bias toward them — without overriding the
 * playbook (the prompt explicitly keeps it as decision support, lower priority than brand rules).
 */
export function performanceFeedbackPromptBlock(history: SendOutcome[] | undefined, brandId?: string): string {
  if (!history || history.length < 3) return "";
  const sig = derivePerformanceSignal(history, brandId);
  if (!sig.sends) return "";

  const lines: string[] = [
    `ADAPTIVE PERFORMANCE FEEDBACK (decision support only — derived from your last ${sig.sends} sends; brand mean CTR ${sig.meanCtr}%):`,
  ];
  if (sig.winners.length) {
    const top = sig.winners.slice(0, 5).map((w) => `${LEVER_LABEL[w.lever]} "${w.value}" (${w.meanCtr}% CTR, n=${w.samples})`);
    lines.push(`Lean toward what is converting unless the brief contradicts it: ${top.join("; ")}.`);
  }
  if (sig.laggards.length) {
    const bottom = sig.laggards.slice(0, 5).map((w) => `${LEVER_LABEL[w.lever]} "${w.value}" (${w.meanCtr}% CTR, n=${w.samples})`);
    lines.push(`Rotate away from recent underperformers: ${bottom.join("; ")}.`);
  }
  if (sig.heroRanking.length) {
    const heroes = sig.heroRanking.slice(0, 4).map((h) => `${h.value} (${h.meanCtr}%)`);
    lines.push(`Heroes earning clicks: ${heroes.join(" | ")}.`);
  }
  if (sig.restHeroes.length) {
    lines.push(`Consider resting fatigued heroes: ${sig.restHeroes.slice(0, 4).join(", ")}.`);
  }
  if (sig.optoutRising) {
    lines.push(`Optout is trending UP across this window — soften urgency, tighten relevance, and avoid hard-sell command stacks.`);
  }
  return lines.join("\n");
}

// ---- page-performance CSV → product winners ----

export interface PageRow {
  publisherEmail: string;
  pageUrl: string;
  pageVersion: string;
  ctaDomain: string;
  pbaseLine: string;
  pbaseCode: string;
  versionNote: string;
  access: number;
  view: number;
  addToCart: number;
  initCheckout: number;
  checkout: number;
  purchase: number;
  revenue: number;
}

export interface ProductWinner {
  product: string;
  /** Purchase / Access, percent. */
  poPerAccessPct: number;
  access: number;
  purchase: number;
  revenue: number;
  pages: number;
}

/** Minimal RFC-4180-ish CSV line splitter (handles quoted fields containing commas/quotes). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function num(s: string | undefined): number {
  const n = Number(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Parse a "Page performance *.csv" export into structured rows (skips sep= line, header, totals). */
export function parsePagePerformanceCsv(csv: string): PageRow[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  // Find the header row (starts with publisher_email, possibly after a `sep=,` directive).
  const headerIdx = lines.findIndex((l) => /publisher_email/i.test(l));
  if (headerIdx === -1) return [];
  const header = splitCsvLine(lines[headerIdx]).map((h) => h.replace(/^"|"$/g, "").trim());
  const col = (name: string) => header.findIndex((h) => h === name);
  const idx = {
    email: col("publisher_email"),
    url: col("page_url"),
    version: col("page_version"),
    cta: col("cta_url_domain"),
    line: col("pbase_line"),
    code: col("pbase_code"),
    note: col("version_note"),
    access: col("stats_access"),
    view: col("stats_view"),
    atc: col("stats_addtocart"),
    init: col("stats_initcheckout"),
    checkout: col("stats_checkout"),
    purchase: col("stats_purchase"),
    revenue: col("stats_revenue"),
  };
  const rows: PageRow[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (/^total\s*:/i.test(line)) continue;
    const f = splitCsvLine(line).map((c) => c.replace(/^"|"$/g, ""));
    if (!f[idx.url] && !f[idx.code]) continue;
    rows.push({
      publisherEmail: f[idx.email] || "",
      pageUrl: f[idx.url] || "",
      pageVersion: f[idx.version] || "",
      ctaDomain: f[idx.cta] || "",
      pbaseLine: f[idx.line] || "",
      pbaseCode: f[idx.code] || "",
      versionNote: f[idx.note] || "",
      access: num(f[idx.access]),
      view: num(f[idx.view]),
      addToCart: num(f[idx.atc]),
      initCheckout: num(f[idx.init]),
      checkout: num(f[idx.checkout]),
      purchase: num(f[idx.purchase]),
      revenue: num(f[idx.revenue]),
    });
  }
  return rows;
}

/**
 * Rank product winners for a brand by PO/access, aggregating across page versions. Filter by the
 * brand's domain (matched against cta_url_domain or the page URL host) and require a minimum access
 * volume so a 5-click page can't top the list on noise.
 */
export function derivePageWinners(rows: PageRow[], brandDomain: string, minAccess = 200): ProductWinner[] {
  const dom = brandDomain.replace(/^www\./, "").toLowerCase();
  const groups = new Map<string, { access: number; purchase: number; revenue: number; pages: number }>();
  for (const r of rows) {
    const host = (r.ctaDomain || r.pageUrl).toLowerCase();
    if (dom && !host.includes(dom)) continue;
    const name = (r.pbaseCode || r.pbaseLine || r.pageUrl).trim();
    if (!name) continue;
    const g = groups.get(name) || { access: 0, purchase: 0, revenue: 0, pages: 0 };
    g.access += r.access;
    g.purchase += r.purchase;
    g.revenue += r.revenue;
    g.pages += 1;
    groups.set(name, g);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.access >= minAccess)
    .map(([product, g]) => ({
      product,
      poPerAccessPct: g.access ? round((g.purchase / g.access) * 100) : 0,
      access: g.access,
      purchase: g.purchase,
      revenue: round(g.revenue, 0),
      pages: g.pages,
    }))
    .sort((a, b) => b.poPerAccessPct - a.poPerAccessPct);
}

/** Prompt block presenting fresh, data-derived product winners (for the proven-hero pool). */
export function pageWinnersPromptBlock(winners: ProductWinner[], topN = 6): string {
  if (!winners.length) return "";
  const top = winners.slice(0, topN).map((w) => `${w.product} (${w.poPerAccessPct}% purchase/access, ${w.access} access)`);
  return `DATA-DERIVED PAGE WINNERS (most recent export — favour these proven heroes when they fit the theme): ${top.join(" | ")}.`;
}
