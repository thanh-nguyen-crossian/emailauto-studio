/**
 * lib/present/cleanBrief.ts
 *
 * Strips internal generation scaffolding from a GenBrief before it is shown
 * to designers or exported to Excel / markdown.  The function is pure — it
 * deep-clones the input and never mutates it.
 */

import type { GenBrief } from "@/lib/briefgen";

// ---- scaffolding token patterns ----------------------------------------

/**
 * Patterns that identify lines (or substrings) that are internal generation
 * artefacts and must never appear in a deliverable.
 */
const SCAFFOLDING_PATTERNS: RegExp[] = [
  /\[ZONE\s+\d/i,
  /\bseg_[a-z0-9_]+\b/i,
  /\b(?:SERIOUS|STRUCTURAL|COSMETIC)?\s*QA\s+flags?\b/i,
  /\b(?:headline_winner|benefit_pair|proof_badge|urgency_badge|price_prominent|persona_pick|story_review|bundle_nudge|new_arrival)\b/i,
  /ESP\s+renderer/i,
  /\brenderer\b/i,
  /generated\s+(?:separately|later)/i,
  /injected\s+here/i,
  /patch\s+call/i,
  /shared\s+foundation/i,
  /segment\s+patch/i,
  /internal\s+generation/i,
  /LAYOUT\s+&\s+PLACEMENT\s+PLAN/i,
];

/** Returns true if the string contains any scaffolding token. */
function hasScaffolding(s: string): boolean {
  return SCAFFOLDING_PATTERNS.some((re) => re.test(s));
}

/**
 * Remove scaffolding tokens from a single string value.
 * Any matched substring (including an optional surrounding `[…]` bracket
 * block) is replaced with "" and the result is trimmed.
 */
function cleanString(s: string): string {
  let result = s;
  for (const pattern of SCAFFOLDING_PATTERNS) {
    // Remove full bracket blocks that contain the token: [TOKEN …]
    result = result.replace(
      new RegExp(
        `\\[[^\\]]*${pattern.source}[^\\]]*\\]`,
        "gi"
      ),
      ""
    );
    // Remove remaining bare token occurrences
    result = result.replace(new RegExp(pattern.source, "gi"), "");
  }
  return result.trim();
}

function cleanOptionLabel(s: string): string {
  return cleanString(s)
    .replace(/\b(?:Claude|Gemini|ChatGPT|OpenAI|Anthropic)\b/gi, "")
    .replace(/\b(?:strategic|curiosity|direct-response|direct response)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Split `body.base` into lines and drop any line that contains a scaffolding
 * token.  Re-joins with newlines; returns "" if nothing survives.
 */
function cleanBodyBase(value: string): string {
  const cleaned = value
    .split("\n")
    .filter((line) => !hasScaffolding(line))
    .join("\n")
    .trim();
  return cleaned;
}

function layoutSummary(brief: GenBrief): string {
  const productCount = Array.isArray(brief.products) ? brief.products.length : 0;
  const segmentCount = Object.keys(brief.body || {}).filter((key) => key !== "base").length;
  const products = productCount ? `${productCount} linked product image block${productCount === 1 ? "" : "s"}` : "linked product image blocks";
  const segments = segmentCount > 1 ? ` Use the selected segment body for each audience.` : "";
  return `Layout summary: Open with the hero banner, continue into the body copy, then support the story with ${products} and a short P.S.${segments}`;
}

// ---- model_hint neutralisation -----------------------------------------

const MODEL_HINT_LABELS = ["Claude strategic", "Gemini curiosity", "ChatGPT direct-response"] as const;
const NEUTRAL_LABELS = ["A", "B", "C"] as const;
const NEUTRAL_STYLES = ["option-a", "option-b", "option-c"] as const;

function neutraliseModelHint(hint: string, index: number): string {
  const cleaned = cleanOptionLabel(hint);
  if (cleaned && !/^(?:claude|gemini|chatgpt|openai|anthropic)$/i.test(cleaned)) return cleaned;
  return NEUTRAL_LABELS[index] ?? String(index + 1);
}

function neutraliseStyle(style: string, index: number): string {
  // Strip any of the three known provider-label strings (case-insensitive)
  let result = style;
  for (const label of MODEL_HINT_LABELS) {
    result = result.replace(new RegExp(label, "gi"), "");
  }
  result = result.trim();
  // If the style was essentially just the provider label, replace wholesale
  if (!result) {
    return NEUTRAL_STYLES[index] ?? `option-${index + 1}`;
  }
  return cleanOptionLabel(result) || (NEUTRAL_STYLES[index] ?? `option-${index + 1}`);
}

// ---- recursive string walker -------------------------------------------

/**
 * Walk every string leaf of an arbitrary JSON-compatible object and apply
 * `cleanString` to it.  Arrays, plain objects, and scalar types are all
 * handled; the function returns a new object/array — it does not mutate.
 *
 * Note: `body.base` is handled specially (line-level filtering) before this
 * walk runs, so by the time the walker reaches it, the key is already clean.
 */
function walkStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return cleanString(value);
  }
  if (Array.isArray(value)) {
    return value.map(walkStrings);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walkStrings(v);
    }
    return out;
  }
  return value;
}

// ---- main export --------------------------------------------------------

/**
 * Returns a deliverable copy of `brief` with all internal scaffolding
 * stripped:
 *
 * a) `body.base` — lines containing scaffolding tokens are removed.
 * b) `subject_lines[*].options[i].model_hint` / `.style` — neutralised to
 *    "A"/"B"/"C" and "option-a"/"option-b"/"option-c" by index.
 * c) All other copy strings — scaffolding token substrings removed.
 *
 * The function is pure: it deep-clones `brief` first and never mutates the
 * original.
 */
export function toDeliverableBrief(brief: GenBrief): GenBrief {
  // Deep clone so we never mutate the caller's brief.
  const b = JSON.parse(JSON.stringify(brief)) as GenBrief;

  // (a) Clean body.base line-by-line
  if (b.body && typeof b.body.base === "string") {
    const rawBase = b.body.base;
    const cleanedBase = cleanBodyBase(rawBase);
    b.body.base = !cleanedBase || hasScaffolding(rawBase) ? layoutSummary(b) : cleanedBase;
  }

  // (b) Neutralise model_hint / style in subject_lines options
  if (b.subject_lines) {
    for (const seg of Object.values(b.subject_lines)) {
      // Top-level model_hint on the subject entry
      if (seg.model_hint) {
        const idx = MODEL_HINT_LABELS.findIndex((l) =>
          new RegExp(l, "i").test(seg.model_hint ?? "")
        );
        seg.model_hint = idx >= 0 ? NEUTRAL_LABELS[idx] : cleanOptionLabel(seg.model_hint);
      }
      // Per-option model_hint and style
      if (Array.isArray(seg.options)) {
        seg.options = seg.options.map((opt, i) => ({
          ...opt,
          model_hint: neutraliseModelHint(opt.model_hint, i),
          style: neutraliseStyle(opt.style, i),
        }));
      }
    }
  }

  // (c) Walk every remaining string field and strip scaffolding tokens.
  // We cast back through unknown because walkStrings returns `unknown`.
  const walked = walkStrings(b) as GenBrief;

  // Preserve the already-cleaned body.base (walkStrings will have run
  // cleanString on it, which is a no-op since scaffolding was already removed,
  // so the result is fine — but let's be explicit for clarity).
  return walked;
}
