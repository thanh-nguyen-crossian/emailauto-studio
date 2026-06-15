// Deliverability + inbox-placement scorer.
//
// This is a DIFFERENT lens from lib/briefgen.ts → validateBrief. validateBrief enforces the
// creative *playbook* (angle/framework/segment differentiation/brand voice). This module answers a
// narrower, mechanical question the playbook validator was never built for: "if we send this, will
// it land in the inbox, render accessibly, and read as a trustworthy human note rather than a
// promo blast?" — spam-trigger density, SHOUTING, punctuation/emoji noise, raw `$`, fake Re/Fwd,
// merge-tag hygiene, subject framing, and (for the rendered HTML) the text-to-image ratio and alt
// coverage that mailbox providers actually weigh.
//
// Pure + dependency-free (type-only import) so it runs in the browser (Preflight), on the server
// (API), and inside the eval harness without pulling in the model SDK.

import type { GenBrief } from "../briefgen";

export type DeliverabilitySeverity = "block" | "risk" | "polish";
export type DeliverabilityCategory =
  | "spam_trigger"
  | "shouting"
  | "punctuation"
  | "emoji"
  | "currency"
  | "subject_framing"
  | "merge_tag"
  | "link_balance"
  | "image_text_ratio"
  | "accessibility"
  | "structure";

export interface DeliverabilityFinding {
  category: DeliverabilityCategory;
  severity: DeliverabilitySeverity;
  message: string;
  /** Where it was found, e.g. "subject (seg 21)", "body", "rendered HTML". */
  surface: string;
  /** The offending fragment, when short enough to show. */
  evidence?: string;
}

export interface DeliverabilityReport {
  /** 0–100; 100 = clean inbox-placement profile. */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  findings: DeliverabilityFinding[];
  counts: { block: number; risk: number; polish: number };
  stats: {
    spamHits: number;
    maxShoutRatio: number;
    maxExclamationRun: number;
    emojiTotal: number;
    rawDollarSigns: number;
  };
}

// ---- trigger banks ----
// Classic Spamhaus/SpamAssassin-style trigger phrases. Word-boundary matched, case-insensitive.
// Kept broader than briefgen's SPAM_WORDS (which is a tiny playbook subset) on purpose.
const SPAM_PHRASES: { phrase: RegExp; label: string; severity: DeliverabilitySeverity }[] = [
  { phrase: /\b100%\s*free\b/i, label: "100% free", severity: "block" },
  { phrase: /\brisk[- ]?free\b/i, label: "risk-free", severity: "risk" },
  { phrase: /\bact now\b/i, label: "act now", severity: "risk" },
  { phrase: /\bbuy now\b/i, label: "buy now", severity: "risk" },
  { phrase: /\border now\b/i, label: "order now", severity: "risk" },
  { phrase: /\bclick here\b/i, label: "click here", severity: "risk" },
  { phrase: /\blimited time\b/i, label: "limited time", severity: "polish" },
  { phrase: /\bcongratulations\b/i, label: "congratulations", severity: "risk" },
  { phrase: /\byou('| a)?re? a winner\b/i, label: "winner", severity: "block" },
  { phrase: /\bcash\b/i, label: "cash", severity: "polish" },
  { phrase: /\bguarantee(d|e)?\b/i, label: "guarantee", severity: "risk" },
  { phrase: /\bno (?:cost|obligation|catch)\b/i, label: "no cost/obligation", severity: "risk" },
  { phrase: /\bonce in a lifetime\b/i, label: "once in a lifetime", severity: "risk" },
  { phrase: /\bwhile supplies last\b/i, label: "while supplies last", severity: "polish" },
  { phrase: /\bdon'?t miss(?: out)?\b/i, label: "don't miss out", severity: "polish" },
  { phrase: /\burgent\b/i, label: "urgent", severity: "risk" },
  { phrase: /\bfinal notice\b/i, label: "final notice", severity: "block" },
  { phrase: /\bcredit card\b/i, label: "credit card", severity: "risk" },
  { phrase: /\bbillion\b/i, label: "billion", severity: "polish" },
  { phrase: /\bmiracle\b/i, label: "miracle", severity: "risk" },
  { phrase: /\bamazing\b/i, label: "amazing", severity: "polish" },
  { phrase: /\bincredible\b/i, label: "incredible", severity: "polish" },
  { phrase: /\bcheap(?:est)?\b/i, label: "cheap", severity: "polish" },
  { phrase: /\blowest price\b/i, label: "lowest price", severity: "polish" },
  { phrase: /\bextra cash\b/i, label: "extra cash", severity: "risk" },
  { phrase: /\bwinning\b/i, label: "winning", severity: "polish" },
];

const SEVERITY_WEIGHT: Record<DeliverabilitySeverity, number> = { block: 18, risk: 7, polish: 2 };
const POLISH_CAP = 14; // polish noise alone can't sink a clean email

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;

function countMatches(re: RegExp, s: string): number {
  const m = s.match(re);
  return m ? m.length : 0;
}

function letters(s: string): string {
  return s.replace(/[^A-Za-z]/g, "");
}

/** Ratio of UPPERCASE letters among long-enough words (ignores acronyms ≤3 chars like CTA, USA). */
function shoutRatio(s: string): number {
  const words = s.split(/\s+/).filter((w) => letters(w).length >= 4);
  if (!words.length) return 0;
  const shouted = words.filter((w) => {
    const l = letters(w);
    return l.length >= 4 && l === l.toUpperCase();
  }).length;
  return shouted / words.length;
}

function longestExclamationRun(s: string): number {
  const runs = s.match(/[!?]{1,}/g) || [];
  return runs.reduce((max, r) => Math.max(max, r.length), 0);
}

function gradeFor(score: number): DeliverabilityReport["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  return "F";
}

interface Surface {
  name: string;
  text: string;
  /** Subjects/preheaders get framing checks the body doesn't. */
  kind: "subject" | "preheader" | "body" | "banner" | "product" | "ps";
}

function collectSurfaces(brief: GenBrief): Surface[] {
  const out: Surface[] = [];
  const sl = brief.subject_lines || {};
  Object.entries(sl).forEach(([seg, v]) => {
    if (v?.subject) out.push({ name: `subject (${seg})`, text: v.subject, kind: "subject" });
    if (v?.preheader) out.push({ name: `preheader (${seg})`, text: v.preheader, kind: "preheader" });
    (v?.options || []).forEach((o, i) => {
      if (o.subject) out.push({ name: `subject opt ${i + 1} (${seg})`, text: o.subject, kind: "subject" });
      if (o.preheader) out.push({ name: `preheader opt ${i + 1} (${seg})`, text: o.preheader, kind: "preheader" });
    });
  });
  const b = brief.banner || ({} as GenBrief["banner"]);
  [b.main_text_1, b.main_text_2, b.main_text_3, b.main_text, b.sub_text_1, b.sub_text_2, b.sub_text_3, b.sub_text, b.cta, b.trust_booster, b.emergency]
    .filter(Boolean)
    .forEach((t, i) => out.push({ name: `banner line ${i + 1}`, text: String(t), kind: "banner" }));
  Object.entries(brief.body || {}).forEach(([seg, text]) => {
    if (text) out.push({ name: seg === "base" ? "body (base)" : `body (${seg})`, text: String(text), kind: "body" });
  });
  (brief.products || []).forEach((p, i) => {
    [p.main_text, p.sub_text, p.popup_badge, p.cta, ...(p.usps || [])]
      .filter(Boolean)
      .forEach((t) => out.push({ name: `product ${i + 1}`, text: String(t), kind: "product" }));
  });
  if (brief.ps) out.push({ name: "P.S.", text: brief.ps, kind: "ps" });
  return out;
}

/** Analyze a generated brief's copy surfaces for deliverability/inbox-placement risk. */
export function analyzeDeliverability(brief: GenBrief): DeliverabilityReport {
  const findings: DeliverabilityFinding[] = [];
  const surfaces = collectSurfaces(brief);

  let spamHits = 0;
  let maxShoutRatio = 0;
  let maxExclamationRun = 0;
  let emojiTotal = 0;
  let rawDollarSigns = 0;

  for (const sfc of surfaces) {
    const t = sfc.text;

    // Spam-trigger phrases.
    for (const { phrase, label, severity } of SPAM_PHRASES) {
      if (phrase.test(t)) {
        spamHits++;
        findings.push({ category: "spam_trigger", severity, surface: sfc.name, message: `Spam-trigger phrase "${label}"`, evidence: label });
      }
    }

    // SHOUTING.
    const sr = shoutRatio(t);
    maxShoutRatio = Math.max(maxShoutRatio, sr);
    if (sr >= 0.5 && letters(t).length > 6) {
      findings.push({ category: "shouting", severity: "risk", surface: sfc.name, message: `Mostly ALL-CAPS (${Math.round(sr * 100)}% of words)`, evidence: t.slice(0, 60) });
    }

    // Punctuation noise.
    const exRun = longestExclamationRun(t);
    maxExclamationRun = Math.max(maxExclamationRun, exRun);
    if (exRun >= 3) {
      findings.push({ category: "punctuation", severity: "risk", surface: sfc.name, message: `Repeated punctuation run (${exRun}×)`, evidence: t.slice(0, 60) });
    } else if (exRun === 2) {
      findings.push({ category: "punctuation", severity: "polish", surface: sfc.name, message: "Doubled !! / ?? reads spammy", evidence: t.slice(0, 60) });
    }

    // Emoji density (subjects are most penalised by filters). The 💲 glyph is the project's
    // mandated spam-safe currency symbol, not decorative emoji — exclude it from the count.
    const emoji = countMatches(EMOJI_RE, t.replace(/\u{1F4B2}/gu, ""));
    emojiTotal += emoji;
    if ((sfc.kind === "subject" || sfc.kind === "preheader") && emoji >= 2) {
      findings.push({ category: "emoji", severity: "risk", surface: sfc.name, message: `${emoji} emoji in a subject/preheader — keep to ≤1`, evidence: t.slice(0, 60) });
    }

    // Raw `$` instead of the spam-safe 💲 (project convention).
    const dollars = countMatches(/\$/g, t);
    rawDollarSigns += dollars;
    if (dollars > 0) {
      findings.push({ category: "currency", severity: "risk", surface: sfc.name, message: 'Raw "$" in promo copy — use 💲 (project spam-safe convention)', evidence: t.slice(0, 60) });
    }

    // Subject framing.
    if (sfc.kind === "subject") {
      if (/^\s*(re|fwd?)\s*:/i.test(t)) {
        findings.push({ category: "subject_framing", severity: "block", surface: sfc.name, message: 'Fake "Re:/Fwd:" framing damages trust + deliverability', evidence: t.slice(0, 40) });
      }
      if (t.length > 70) {
        findings.push({ category: "subject_framing", severity: "polish", surface: sfc.name, message: `Subject ${t.length} chars — likely truncated in inbox`, evidence: t.slice(0, 40) });
      }
    }
  }

  // Merge-tag hygiene across the actual copy surfaces (NOT JSON.stringify — JSON's own nested
  // object closings produce structural "}}" that would falsely read as unbalanced merge tags).
  const mergeScan = surfaces.map((s) => s.text).join("  ");
  const open = countMatches(/\{\{/g, mergeScan);
  const close = countMatches(/\}\}/g, mergeScan);
  if (open !== close) {
    findings.push({ category: "merge_tag", severity: "block", surface: "whole brief", message: `Unbalanced merge-tag braces ({{ ×${open} vs }} ×${close})` });
  }
  // {{first_name}} leaking into the body (belongs in subject/preheader only).
  Object.entries(brief.body || {}).forEach(([seg, text]) => {
    if (/{{\s*first_name\s*}}/i.test(String(text))) {
      findings.push({ category: "merge_tag", severity: "risk", surface: seg === "base" ? "body (base)" : `body (${seg})`, message: "{{first_name}} in body — merge tags belong in subject/preheader" });
    }
  });

  // Score.
  let penalty = 0;
  let polish = 0;
  const counts = { block: 0, risk: 0, polish: 0 };
  for (const f of findings) {
    counts[f.severity]++;
    if (f.severity === "polish") polish += SEVERITY_WEIGHT.polish;
    else penalty += SEVERITY_WEIGHT[f.severity];
  }
  penalty += Math.min(polish, POLISH_CAP);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    grade: gradeFor(score),
    findings,
    counts,
    stats: { spamHits, maxShoutRatio, maxExclamationRun, emojiTotal, rawDollarSigns },
  };
}

export interface HtmlDeliverabilityReport {
  score: number;
  grade: DeliverabilityReport["grade"];
  findings: DeliverabilityFinding[];
  stats: {
    visibleTextChars: number;
    imageCount: number;
    linkCount: number;
    imagesMissingAlt: number;
    bytes: number;
    textToImageOk: boolean;
  };
}

/**
 * Analyze rendered email HTML for the structural signals mailbox providers weigh: image-only
 * emails (no crawlable text) trip filters and break for image-blocking clients; missing alt text
 * is both an accessibility and a deliverability problem; oversized HTML gets clipped by Gmail.
 */
export function analyzeRenderedHtml(html: string): HtmlDeliverabilityReport {
  const findings: DeliverabilityFinding[] = [];
  const bytes =
    typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(html).length
      : typeof Buffer !== "undefined"
        ? Buffer.byteLength(html, "utf8")
        : html.length;

  // Strip the hidden preheader + style/script before measuring "visible" text.
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<table[^>]*data-type="preheader"[\s\S]*?<\/table>/gi, " ");
  const visibleText = stripped.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  const visibleTextChars = visibleText.length;

  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const imageCount = imgTags.length;
  const imagesMissingAlt = imgTags.filter((tag) => !/\balt\s*=\s*"[^"]+"/i.test(tag)).length;
  const linkCount = (html.match(/<a\b[^>]*href=/gi) || []).length;

  // Image-blocking clients show alt text + body copy only; an image-only email is a blank box.
  // Heuristic: at least ~40 chars of crawlable copy per image (plus a floor).
  const textToImageOk = imageCount === 0 || visibleTextChars >= Math.max(140, imageCount * 40);

  if (!textToImageOk) {
    findings.push({
      category: "image_text_ratio",
      severity: "risk",
      surface: "rendered HTML",
      message: `Only ${visibleTextChars} chars of crawlable text for ${imageCount} images — image-blocking inboxes will see a near-empty email. Add caption/body copy or enable the product-copy fallback.`,
    });
  }
  if (imagesMissingAlt > 0) {
    findings.push({
      category: "accessibility",
      severity: "risk",
      surface: "rendered HTML",
      message: `${imagesMissingAlt} of ${imageCount} images have no alt text (screen-reader + image-blocked fallback).`,
    });
  }
  if (linkCount === 0) {
    findings.push({ category: "link_balance", severity: "block", surface: "rendered HTML", message: "No links found — there is no path to click." });
  } else if (linkCount > 40) {
    findings.push({ category: "link_balance", severity: "polish", surface: "rendered HTML", message: `${linkCount} links — high link count can raise spam scores.` });
  }
  // Gmail clips messages over ~102KB.
  if (bytes > 102_000) {
    findings.push({ category: "structure", severity: "risk", surface: "rendered HTML", message: `HTML is ${Math.round(bytes / 1024)}KB — Gmail clips over ~102KB (hides the footer/unsubscribe).` });
  }

  let penalty = 0;
  let polish = 0;
  for (const f of findings) {
    if (f.severity === "polish") polish += SEVERITY_WEIGHT.polish;
    else penalty += SEVERITY_WEIGHT[f.severity];
  }
  penalty += Math.min(polish, POLISH_CAP);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    grade: gradeFor(score),
    findings,
    stats: { visibleTextChars, imageCount, linkCount, imagesMissingAlt, bytes, textToImageOk },
  };
}

/** Combine copy + (optional) rendered-HTML analysis into one report (min of the two scores). */
export function analyzeBriefDeliverability(brief: GenBrief, renderedHtml?: string): DeliverabilityReport {
  const copy = analyzeDeliverability(brief);
  if (!renderedHtml) return copy;
  const html = analyzeRenderedHtml(renderedHtml);
  const findings = [...copy.findings, ...html.findings];
  const counts = { block: 0, risk: 0, polish: 0 };
  findings.forEach((f) => counts[f.severity]++);
  return {
    score: Math.min(copy.score, html.score),
    grade: gradeFor(Math.min(copy.score, html.score)),
    findings,
    counts,
    stats: copy.stats,
  };
}
