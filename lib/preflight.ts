import type { Brand, VariantCopy } from "./config/types";

// Pre-flight checks — encode the WIN/FAIL findings from docs/email-template-analysis.md
// as automatic checks shown in the studio before export.

export type CheckLevel = "pass" | "warn" | "fail";

export interface CheckResult {
  id: string;
  level: CheckLevel;
  label: string;
  detail: string;
}

// Banned phrases that recur across FAIL templates (analysis Part 3, Top 5 fail patterns).
const BANNED_PHRASES = [
  "don't let",
  "dont let",
  "go to waste",
  "be hurry",
  "10 years younger",
];

const NAME_TOKEN = "son.nln"; // recipient name merge token used across the dataset

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rough check: is the accent within the brand's [dark, light] range by per-channel bounds? */
export function accentInRange(brand: Brand, accent: string): boolean {
  const a = hexToRgb(accent);
  const lo = hexToRgb(brand.accentRange[0]);
  const hi = hexToRgb(brand.accentRange[1]);
  if (!a || !lo || !hi) return false;
  // Allow a small tolerance band around the documented endpoints.
  const tol = 28;
  return a.every((c, i) => {
    const min = Math.min(lo[i], hi[i]) - tol;
    const max = Math.max(lo[i], hi[i]) + tol;
    return c >= min && c <= max;
  });
}

export interface VariantContext {
  brand: Brand;
  copy: VariantCopy;
  accent: string;
  productCount: number;
  heroInPositionOne: boolean;
  heroImage: string;
}

/** Run all checks for one variant. */
export function runPreflight(ctx: VariantContext): CheckResult[] {
  const { brand, copy, accent, productCount, heroInPositionOne, heroImage } = ctx;
  const results: CheckResult[] = [];

  // Subject length ≤ 50 (analysis: 42–58 optimal; flag >50 as warn, >65 as fail).
  const subjLen = copy.subject.length;
  results.push({
    id: "subject-length",
    level: subjLen > 65 ? "fail" : subjLen > 50 ? "warn" : "pass",
    label: "Subject length",
    detail: `${subjLen} chars (target ≤ 50)`,
  });

  // Preview text 60–90 chars.
  const preLen = copy.preheader.length;
  results.push({
    id: "preview-length",
    level: preLen >= 60 && preLen <= 90 ? "pass" : "warn",
    label: "Preview text length",
    detail: `${preLen} chars (target 60–90)`,
  });

  // Name in subject OR preheader, not both.
  const inSubject = copy.subject.toLowerCase().includes(NAME_TOKEN);
  const inPre = copy.preheader.toLowerCase().includes(NAME_TOKEN);
  results.push({
    id: "name-placement",
    level: inSubject && inPre ? "warn" : inSubject || inPre ? "pass" : "warn",
    label: "Name placement",
    detail:
      inSubject && inPre
        ? "Name in BOTH subject and preheader — use one"
        : inSubject || inPre
        ? "Name used once ✓"
        : "Name not used in subject or preheader",
  });

  // Single hook / no bullet-list opener.
  const introOpensBullets = /^\s*([-*✅•]|\d+\.)/.test(copy.intro.trim());
  results.push({
    id: "story-opener",
    level: introOpensBullets ? "fail" : "pass",
    label: "Body opener",
    detail: introOpensBullets
      ? "Opens with a bullet list — use a named-person micro-story"
      : "Narrative opener ✓",
  });

  // Hero product locked in position 1.
  results.push({
    id: "hero-position",
    level: heroInPositionOne ? "pass" : "fail",
    label: "Hero product",
    detail: heroInPositionOne
      ? `${brand.heroSlug} in position 1 ✓`
      : `Hero (${brand.heroSlug}) is not first`,
  });

  // Product count: max 6, warn at 7+.
  results.push({
    id: "product-count",
    level: productCount > 6 ? "fail" : productCount === 0 ? "fail" : "pass",
    label: "Product count",
    detail: `${productCount} products (max 6)`,
  });

  // Accent in brand range.
  results.push({
    id: "accent-range",
    level: accentInRange(brand, accent) ? "pass" : "fail",
    label: "Accent color",
    detail: accentInRange(brand, accent)
      ? `${accent} within ${brand.accentRange[0]}–${brand.accentRange[1]} ✓`
      : `${accent} is OFF-BRAND (range ${brand.accentRange[0]}–${brand.accentRange[1]})`,
  });

  // Banned phrases.
  const haystack = `${copy.subject} ${copy.preheader} ${copy.intro} ${copy.middle} ${copy.closing ?? ""} ${copy.ps ?? ""}`.toLowerCase();
  const hits = BANNED_PHRASES.filter((p) => haystack.includes(p));
  results.push({
    id: "banned-phrases",
    level: hits.length ? "fail" : "pass",
    label: "Banned phrases",
    detail: hits.length ? `Found: ${hits.join(", ")}` : "None ✓",
  });

  // Hero image must be a real (e.g. SendGrid CDN) URL, not empty or a placeholder.
  const heroMissing =
    !heroImage || heroImage.includes("placehold.co") || heroImage.toUpperCase().includes("PLACEHOLDER");
  results.push({
    id: "hero-image",
    level: heroMissing ? "fail" : "pass",
    label: "Hero image",
    detail: heroMissing
      ? "No hero image — paste a SendGrid CDN URL in the Images panel"
      : "Set ✓",
  });

  return results;
}

export function worstLevel(results: CheckResult[]): CheckLevel {
  if (results.some((r) => r.level === "fail")) return "fail";
  if (results.some((r) => r.level === "warn")) return "warn";
  return "pass";
}
