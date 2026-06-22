/**
 * lib/present/sanitizeCopy.ts
 *
 * Deterministic post-processor that enforces ESP-safe promo symbols on any
 * copy string coming out of the AI pipeline.  Runs in `generateOptions` so
 * every downstream consumer (preview, SendGrid push, Excel export) gets clean
 * copy without relying on the prompt instruction alone.
 */

import type { GenBrief } from "@/lib/briefgen";
import { BRANDS } from "@/lib/config/brands";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split `text` on `{{…}}` merge tags and return the segments as an array of
 * `{ text, isMergeTag }` objects.  This lets us apply replacements only to
 * non-tag segments, so merge tags are never touched.
 */
function splitOnMergeTags(text: string): Array<{ text: string; isMergeTag: boolean }> {
  const parts: Array<{ text: string; isMergeTag: boolean }> = [];
  // Match {{ … }} — non-greedy so adjacent tags don't collapse.
  const re = /\{\{.*?\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isMergeTag: false });
    }
    parts.push({ text: match[0], isMergeTag: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isMergeTag: false });
  }
  return parts;
}

const URL_RE = /https?:\/\/[^\s)\]}>"']+/gi;

function withUrlsProtected(segment: string, transform: (s: string) => string): string {
  const urls: string[] = [];
  const protectedText = segment.replace(URL_RE, (url) => {
    const token = `__URL_TOKEN_${urls.length}__`;
    urls.push(url);
    return token;
  });
  const transformed = transform(protectedText);
  return transformed.replace(/__URL_TOKEN_(\d+)__/g, (_match, rawIndex) => urls[Number(rawIndex)] || "");
}

// ---------------------------------------------------------------------------
// Rule (a): `$` → `💲` before digits
// ---------------------------------------------------------------------------

const DOLLAR_RE = /\$(?=\d)/g;

function applyDollarRule(text: string): string {
  const segments = splitOnMergeTags(text);
  return segments
    .map(({ text: seg, isMergeTag }) => {
      if (isMergeTag) return seg;
      return withUrlsProtected(seg, (s) => s.replace(DOLLAR_RE, "💲"));
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Rule (b): "off" / "O.F.F" → brand off-symbol
// ---------------------------------------------------------------------------

// Three narrow patterns that avoid corrupting ordinary prose:
// (a) Uppercase "OFF" — always a discount shout ("70% OFF", "UP TO 80% OFF")
const OFF_SHOUT_RE = /\bOFF\b/g;
// (b) Already-formatted dot variants — normalize to brand's exact form
const OFF_DOT_RE = /\bO\.F\.F\b|\bo\.f\.f\b/gi;
// (c) Lowercase/mixed "off" immediately after "%" — discount context only ("70% off")
const OFF_PCT_RE = /(?<=%\s*)off\b/gi;

function applyOffRule(text: string, offSymbol: string): string {
  const segments = splitOnMergeTags(text);
  return segments
    .map(({ text: seg, isMergeTag }) => {
      if (isMergeTag) return seg;
      let s = seg.replace(OFF_SHOUT_RE, offSymbol);
      s = s.replace(OFF_DOT_RE, offSymbol);
      s = s.replace(OFF_PCT_RE, offSymbol);
      return s;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Rule (c): SPAM_WORD approved substitutions (subject/preheader/body only)
// ---------------------------------------------------------------------------

// These substitutions are safe on all copy fields except image spec fields
// (image_notes, alt_text, image_guidance, main_image, sub_image).
const SPAM_SUBS: Array<[RegExp, string]> = [
  [/\bfree!/gi, "free"],
  [/\burgent\b/gi, ""],
  [/\bact now\b/gi, ""],
  [/\bclick here\b/gi, ""],
];

function applySpamRule(text: string): string {
  let result = text;
  for (const [re, replacement] of SPAM_SUBS) {
    result = result.replace(re, replacement);
  }
  // Collapse any double-spaces left by empty replacements.
  result = result.replace(/  +/g, " ").trim();
  return result;
}

// ---------------------------------------------------------------------------
// Main export: sanitize a single string
// ---------------------------------------------------------------------------

/**
 * Apply all three sanitization rules to a single copy string.
 *
 * Rules are applied in order: dollar → off-symbol → spam words.
 * The function is idempotent: running it twice yields the same result.
 */
export function sanitizeCopy(text: string, brandId: string): string {
  if (typeof text !== "string" || !text) return text;

  const brand = BRANDS[brandId as keyof typeof BRANDS];
  const offSymbol = brand?.offSymbol ?? "o.f.f";

  let result = applyDollarRule(text);
  result = applyOffRule(result, offSymbol);
  result = applySpamRule(result);
  return result;
}

// ---------------------------------------------------------------------------
// Bulk walker: applySanitizeCopy(brief, brandId)
// ---------------------------------------------------------------------------

/** Apply `sanitizeCopy` to a string if it is defined and non-empty. */
function sc(value: string | undefined, brandId: string): string | undefined {
  if (typeof value !== "string" || !value) return value;
  return sanitizeCopy(value, brandId);
}

/** Sanitize every element of a string array in-place. */
function scArray(arr: string[] | undefined, brandId: string): void {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] === "string") {
      arr[i] = sanitizeCopy(arr[i], brandId);
    }
  }
}

/**
 * Mutate `brief` in-place, applying `sanitizeCopy` to every copy field that
 * reaches the ESP (subject lines, preheaders, banner text, body, products, ps,
 * theme).
 *
 * Fields explicitly excluded (design / image-spec fields):
 *   image_notes, alt_text, image_guidance, main_image, sub_image
 * Fields excluded (validation metadata):
 *   quality_checks, _flags, _advisory, _score
 */
export function applySanitizeCopy(brief: GenBrief, brandId: string): void {
  // ---- subject_lines -------------------------------------------------------
  if (brief.subject_lines) {
    for (const seg of Object.values(brief.subject_lines)) {
      seg.subject = sc(seg.subject, brandId) ?? seg.subject;
      seg.preheader = sc(seg.preheader, brandId) ?? seg.preheader;
      if (Array.isArray(seg.options)) {
        for (const opt of seg.options) {
          opt.subject = sc(opt.subject, brandId) ?? opt.subject;
          opt.preheader = sc(opt.preheader, brandId) ?? opt.preheader;
        }
      }
    }
  }

  // ---- banner --------------------------------------------------------------
  if (brief.banner) {
    const b = brief.banner;
    b.main_text = sc(b.main_text, brandId) ?? b.main_text;
    b.sub_text = sc(b.sub_text, brandId) ?? b.sub_text;
    if (b.main_text_1 !== undefined) b.main_text_1 = sc(b.main_text_1, brandId);
    if (b.main_text_2 !== undefined) b.main_text_2 = sc(b.main_text_2, brandId);
    if (b.main_text_3 !== undefined) b.main_text_3 = sc(b.main_text_3, brandId);
    if (b.sub_text_1 !== undefined) b.sub_text_1 = sc(b.sub_text_1, brandId);
    if (b.sub_text_2 !== undefined) b.sub_text_2 = sc(b.sub_text_2, brandId);
    if (b.sub_text_3 !== undefined) b.sub_text_3 = sc(b.sub_text_3, brandId);
    b.cta = sc(b.cta, brandId) ?? b.cta;
    b.review_quote = sc(b.review_quote, brandId) ?? b.review_quote;
    if (b.trust_booster !== undefined) b.trust_booster = sc(b.trust_booster, brandId);
    if (b.emergency !== undefined) b.emergency = sc(b.emergency, brandId);
    scArray(b.review_texts, brandId);
    // banner.options (GenBannerOption[])
    if (Array.isArray(b.options)) {
      for (const opt of b.options) {
        opt.main_text_1 = sc(opt.main_text_1, brandId) ?? opt.main_text_1;
        opt.main_text_2 = sc(opt.main_text_2, brandId) ?? opt.main_text_2;
        opt.main_text_3 = sc(opt.main_text_3, brandId) ?? opt.main_text_3;
        opt.sub_text_1 = sc(opt.sub_text_1, brandId) ?? opt.sub_text_1;
        opt.sub_text_2 = sc(opt.sub_text_2, brandId) ?? opt.sub_text_2;
        opt.sub_text_3 = sc(opt.sub_text_3, brandId) ?? opt.sub_text_3;
        opt.cta = sc(opt.cta, brandId) ?? opt.cta;
        opt.trust_booster = sc(opt.trust_booster, brandId) ?? opt.trust_booster;
        opt.emergency = sc(opt.emergency, brandId) ?? opt.emergency;
        scArray(opt.review_texts, brandId);
        // image_guidance, main_image, sub_image excluded (design spec fields)
      }
    }
  }

  // ---- body ----------------------------------------------------------------
  if (brief.body && typeof brief.body === "object") {
    for (const key of Object.keys(brief.body)) {
      if (typeof brief.body[key] === "string") {
        brief.body[key] = sanitizeCopy(brief.body[key], brandId);
      }
    }
  }

  // ---- body_options --------------------------------------------------------
  if (brief.body_options && typeof brief.body_options === "object") {
    for (const opts of Object.values(brief.body_options)) {
      if (Array.isArray(opts)) {
        for (const opt of opts) {
          opt.body = sc(opt.body, brandId) ?? opt.body;
          opt.ps = sc(opt.ps, brandId) ?? opt.ps;
        }
      }
    }
  }

  // ---- ps ------------------------------------------------------------------
  if (typeof brief.ps === "string") {
    brief.ps = sanitizeCopy(brief.ps, brandId);
  }

  // ---- products ------------------------------------------------------------
  if (Array.isArray(brief.products)) {
    for (const p of brief.products) {
      p.main_text = sc(p.main_text, brandId) ?? p.main_text;
      p.sub_text = sc(p.sub_text, brandId) ?? p.sub_text;
      p.popup_badge = sc(p.popup_badge, brandId) ?? p.popup_badge;
      p.review = sc(p.review, brandId) ?? p.review;
      p.cta = sc(p.cta, brandId) ?? p.cta;
      scArray(p.usps, brandId);
      // image_notes, alt_text, main_image, sub_image excluded
    }
  }

  // ---- theme ---------------------------------------------------------------
  if (typeof brief.theme === "string") {
    brief.theme = sanitizeCopy(brief.theme, brandId);
  }
}
