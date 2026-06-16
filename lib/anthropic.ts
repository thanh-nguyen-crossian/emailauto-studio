import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import type { AIModelPair, AIModelSelection, BodyVarietyProfile, Campaign, Product } from "./config/types";
import { normalizeModelPair, providerLabel } from "./config/aiModels";
import {
  brandPlaybookRuleBlock,
  briefContrastIssues,
  buildSystemPrompt,
  buildUserPrompt,
  contrastInstruction,
  isComplianceRepairFlag,
  isHighImpactFlag,
  promoLine,
  PROMPT_REGISTRY_VERSION,
  renderPromptLayers,
  segJsonKey,
  segmentBodyDirectionLines,
  segmentPromptContext,
  selectVarietyProfile,
  validateBrief,
  validateBriefPair,
  type GenBrief,
} from "./briefgen";
import { BRANDS } from "./config/brands";

// Generation engine wiring. Produces two contrasting options (A/B) — each a combined
// content + design brief — using the ported brief-generator prompt, with parse-retry and
// an A/B contrast retry.

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** Strip markdown fences and isolate the JSON object before parsing. */
function parseStrictJson(text: string): Record<string, unknown> {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model output");
  return JSON.parse(t.slice(start, end + 1));
}

const FIX_JSON_NOTE =
  '\n\nYour previous response was NOT valid JSON. Return ONLY one valid JSON object — escape every double-quote inside a string value as \\", escape newlines as \\n, no trailing commas, no comments, no prose.';

const PROVIDER_TIMEOUT_MS = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 145_000);
function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

const AI_TEMP_A = envNumber("AI_TEMP_A", 0.85, 0, 1);
const AI_TEMP_B = envNumber("AI_TEMP_B", 1.0, 0, 1);
const AI_TEMP_B_RETRY = envNumber("AI_TEMP_B_RETRY", 0.9, 0, 1);
const AI_TOP_P = envNumber("AI_TOP_P", 0.95, 0.1, 1);
const AI_REPAIR_TEMP = envNumber("AI_REPAIR_TEMP", 0.6, 0, 1);

const OPTION_B_INITIAL_CONTRAST = `\nOPTION B CONTRAST REQUIREMENT:
You are writing Option B in parallel with Option A. Deliberately avoid the obvious/default route.
Pick a distinct angle, framework, opener mechanic, emotional arc, visual direction, CTA wording, and proof role.
Do not wait to see Option A; make Option B a clearly different usable challenger.`;

const REPAIR_SYSTEM = `You are an email copy repair specialist. Fix the listed playbook violations in the provided brief with minimal rewriting. Preserve all creative direction, product facts, prices, URLs, and supplied reviews. Return one complete JSON object in the same schema — no prose, no fences.`;

const SEGMENT_BATCH_THRESHOLD = Math.max(2, Number(process.env.AI_SEGMENT_BATCH_THRESHOLD || 2));
const SEGMENT_BATCH_SIZE = Math.max(1, Number(process.env.AI_SEGMENT_BATCH_SIZE || 2));
const SEGMENT_BATCH_CONCURRENCY = Math.max(1, Number(process.env.AI_SEGMENT_BATCH_CONCURRENCY || 2));
const AB_FAST_PARALLEL = /^(1|true|on|yes)$/i.test(process.env.AI_AB_FAST_PARALLEL || "");

const MAX_OUTPUT_TOKENS = 16000;

const PROVIDER_ENV: Record<string, string> = {
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
};

/**
 * Fail-fast check: if a selected provider's key isn't configured on this server, return a
 * user-facing, provider-specific message (never the raw env-var name) before the long generation
 * call — so the marketer can just switch providers in the model picker instead of waiting for a 500.
 */
export function providerConfigError(models: AIModelPair): string | null {
  const missing = new Set<string>();
  [models.a, models.b].forEach((m) => {
    const envKey = PROVIDER_ENV[m.provider];
    if (!envKey || !process.env[envKey]) missing.add(providerLabel(m.provider));
  });
  if (!missing.size) return null;
  const names = [...missing].join(" and ");
  const plural = missing.size > 1;
  return `The ${names} provider${plural ? "s aren't" : " isn't"} configured on this server. Switch the affected option to a configured provider in the model picker, then generate again.`;
}

function timeoutMessage(provider: string, model: string): string {
  return `${provider} ${model} timed out after ${Math.round(PROVIDER_TIMEOUT_MS / 1000)} seconds. Try a faster model such as Claude Haiku, Gemini Flash/Lite, or a GPT mini/nano model, or reduce segments/products.`;
}

function truncatedMessage(provider: string, model: string): string {
  return `${provider} ${model} hit the ${Math.round(MAX_OUTPUT_TOKENS / 1000)}k output-token limit before finishing the JSON — reduce segments/products (or lower the subject-option count), or let large segment sets auto-batch.`;
}

async function fetchJsonWithTimeout<T>(
  provider: string,
  model: string,
  url: string,
  init: RequestInit
): Promise<{ res: Response; data: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as T;
    return { res, data };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(timeoutMessage(provider, model));
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function createText(system: string, user: string, selection: AIModelSelection, temperature?: number, topP = AI_TOP_P): Promise<string> {
  if (selection.provider === "claude") return callClaude(system, user, selection.model, temperature, topP);
  if (selection.provider === "gemini") return callGemini(system, user, selection.model, temperature, topP);
  if (selection.provider === "openai") return callOpenAI(system, user, selection.model, temperature, topP);
  throw new Error(`Unsupported AI provider: ${selection.provider}`);
}

async function createAndParseWithModel(
  system: string,
  user: string,
  selection: AIModelSelection,
  temperature?: number,
  topP = AI_TOP_P
): Promise<Record<string, unknown>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await createText(system, attempt === 0 ? user : user + FIX_JSON_NOTE, selection, temperature, topP);
    try {
      return parseStrictJson(raw);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to parse model output");
}

async function callClaude(system: string, user: string, model: string, temperature = AI_TEMP_A, topP = AI_TOP_P): Promise<string> {
  let resp;
  try {
    resp = await getClient().messages.create(
      {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature,
        top_p: topP,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      },
      { timeout: PROVIDER_TIMEOUT_MS }
    );
  } catch (err) {
    if (err instanceof Error && /timeout|timed out|abort/i.test(err.message)) {
      throw new Error(timeoutMessage("Claude", model));
    }
    throw err;
  }
  if (resp.stop_reason === "max_tokens") throw new Error(truncatedMessage("Claude", model));
  const textPart = resp.content.find((c) => c.type === "text");
  return textPart && textPart.type === "text" ? textPart.text : "";
}

async function callGemini(system: string, user: string, model: string, temperature = AI_TEMP_A, topP = AI_TOP_P): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const { res, data } = await fetchJsonWithTimeout<{
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    error?: { message?: string };
  }>("Gemini", model, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        topP,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data.error?.message || "request failed"}`);
  if (data.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error(truncatedMessage("Gemini", model));
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
}

async function callOpenAI(system: string, user: string, model: string, temperature = AI_TEMP_A, topP = AI_TOP_P): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const payload: Record<string, unknown> = {
    model,
    store: true,
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: user }] },
    ],
    max_output_tokens: MAX_OUTPUT_TOKENS,
    temperature,
    top_p: topP,
    text: { format: { type: "json_object" } },
  };

  const { res, data } = await fetchJsonWithTimeout<{
    output_text?: string;
    output?: { content?: { text?: string; type?: string; output_text?: string }[] }[];
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    status?: string;
    incomplete_details?: { reason?: string };
    error?: { message?: string };
  }>("OpenAI", model, "https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${data.error?.message || "request failed"}`);
  if (data.status === "incomplete" && data.incomplete_details?.reason === "max_output_tokens") {
    throw new Error(truncatedMessage("OpenAI", model));
  }
  if (data.output_text) return data.output_text;
  const outputText = data.output?.flatMap((item) => item.content || [])
    .map((part) => part.text || part.output_text || "")
    .join("");
  return outputText || data.choices?.[0]?.message?.content || "";
}

export interface GenerationResult {
  a?: GenBrief;
  b?: GenBrief;
  error?: string;
  /** Non-fatal note when one option (or a recoverable step) failed but a usable result remains. */
  warning?: string;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Generation failed";
}

function bestFailureMessage(reasons: unknown[]): string {
  const messages = reasons.map(errMessage).filter(Boolean);
  return messages.sort((a, b) => failurePriority(b) - failurePriority(a))[0] || "Generation failed";
}

function failurePriority(message: string): number {
  if (/not configured|API_KEY|not set/i.test(message)) return 5;
  if (/timed out|timeout/i.test(message)) return 4;
  if (/token limit|max_output|max tokens|MAX_TOKENS/i.test(message)) return 3;
  if (/parse|JSON|No JSON/i.test(message)) return 2;
  return 1;
}

/** Optional user-edited prompts from the review step (what-you-see-is-what's-sent). */
export interface PromptOverrides {
  system?: string;
  user?: string;
}

export interface RevisionFeedback {
  feedback?: string;
  existingOptions?: { a?: GenBrief; b?: GenBrief };
}

function briefRevisionSummary(brief?: GenBrief) {
  if (!brief) return undefined;
  const {
    _flags: _dropFlags,
    _advisory: _dropAdvisory,
    _score: _dropScore,
    _provider: _dropProvider,
    _model: _dropModel,
    _prompt_version: _dropPromptVersion,
    body_variety: _dropVariety,
    ...copy
  } = brief as GenBrief & Record<string, unknown>;
  void _dropFlags;
  void _dropAdvisory;
  void _dropScore;
  void _dropProvider;
  void _dropModel;
  void _dropPromptVersion;
  void _dropVariety;
  return copy;
}

function summarizeBriefForContext(brief?: GenBrief) {
  if (!brief) return undefined;
  return {
    creative_direction: brief.creative_direction,
    subject_lines: brief.subject_lines,
    banner: brief.banner,
    body: brief.body,
    ps: brief.ps,
    products: brief.products,
    quality_checks: brief.quality_checks,
  };
}

function optionAContrastContext(brief: GenBrief): string {
  const anchor = {
    creative_direction: brief.creative_direction,
    body_variety: brief.body_variety,
    banner: {
      main_text_1: brief.banner?.main_text_1,
      main_text_2: brief.banner?.main_text_2,
      main_text_3: brief.banner?.main_text_3,
      image_guidance: brief.banner?.image_guidance,
      cta: brief.banner?.cta,
    },
    opener_mechanic: brief.quality_checks?.opener_mechanic,
    ps: brief.ps,
    first_product: brief.products?.[0],
  };
  return `\nOPTION A CREATIVE MAP TO CONTRAST AGAINST:
${JSON.stringify(anchor).slice(0, 6000)}

Generate Option B AFTER studying this map. B must choose a different hook contract emphasis, reader entry point, proof path, banner headline family, and payoff. Do not merely rename the angle/framework.`;
}

function appendRevisionFeedback(user: string, revision?: RevisionFeedback): string {
  const feedback = revision?.feedback?.trim();
  if (!feedback) return user;
  const current = JSON.stringify({
    a: summarizeBriefForContext(revision?.existingOptions?.a),
    b: summarizeBriefForContext(revision?.existingOptions?.b),
  }).slice(0, 7000);
  return `${user}

USER FEEDBACK FOR REGENERATION:
${feedback}

CURRENT GENERATED OPTIONS CONTEXT:
${current}

Regenerate complete updated briefs in the same JSON schema. Preserve what still works, fix the feedback directly, keep A/B angle + framework contrast, and re-check every email-campaign-playbook rule before returning JSON.`;
}

function modelExecutionStyle(selection: AIModelSelection): string {
  const label = `${providerLabel(selection.provider)} ${selection.model}`;
  if (selection.provider === "claude") {
    // Structural bias: proof-ladder routes, mechanism-first frameworks, restrained language.
    return `${label} — STRUCTURAL ROLE: proof-ladder strategist.
Framework bias: Proof Ladder or Feature-Benefit. Route bias: Proof-Led Announcement or high-evidence segment reward.
Sentence architecture: short declarative → specific mechanism proof → single risk reducer → quiet CTA.
Subject style: concrete fact or named mechanism (e.g. "The 3-second snap" not "Feel the difference").
Body: one product reason per paragraph, evidence before emotion, no urgency stacking.
Keep every claim tied to a supplied fact; if proof is absent, qualify ("designed to", not "proven to").`;
  }
  if (selection.provider === "gemini") {
    // Structural bias: visual-scene openers, sensory language, suspended-loop subjects.
    return `${label} — STRUCTURAL ROLE: visual-curiosity storyteller.
Framework bias: Sensory-Scene or Mystery/Reveal. Route bias: Occasion Hook or sensory segment reward.
Sentence architecture: scene-setting image detail → suspended-loop tension → product as resolution.
Subject style: a moment or sensation (e.g. "The morning you didn't adjust once" not "Save 💲12").
Body: open with a vivid sensory observation, product named mid-paragraph not sentence 1, richer image_guidance.
Balance emotional scene with product-readability; no purely decorative visuals.`;
  }
  if (selection.provider === "openai") {
    // Structural bias: direct-response clarity, offer-first subjects, tight CTA logic.
    return `${label} — STRUCTURAL ROLE: direct-response editor.
Framework bias: PAS or AIDA. Route bias: Direct Offer or Urgency Anchor.
Sentence architecture: problem statement → product as named solution → price/deadline → single action word CTA.
Subject style: offer-anchored (e.g. "Your Daisy Bra is 💲12.99, {{first_name}}" — price or % in subject).
Body: offer in sentence 1, feature-benefit in sentence 2, transition word before CTA, no filler.
Tighten product hierarchy: hero first, supporting products briefer, CTA copy ≤3 words.`;
  }
  return `${label}: use the provider's strengths while preserving the required route, playbook, proof, and JSON contracts.`;
}

function appendModelExecutionStyle(user: string, optionLabel: "A" | "B", selection: AIModelSelection): string {
  return `${user}

MODEL EXECUTION LENS FOR OPTION ${optionLabel} — follow this structural role:
${modelExecutionStyle(selection)}
This changes reasoning priority, sentence architecture, subject style, visual depth, and proof path — not just tone. Do not expose provider/model names as recipient-facing copy.`;
}

function cleanBodyVarietyProfile(variety?: BodyVarietyProfile): BodyVarietyProfile | undefined {
  if (!variety) return undefined;
  return {
    openerMechanic: variety.openerMechanic,
    openerMechanicLabel: variety.openerMechanicLabel,
    namedCharacter: variety.namedCharacter,
    characterRole: variety.characterRole,
    painPoint: variety.painPoint,
    sensoryPhrase: variety.sensoryPhrase,
    emotionalArc: variety.emotionalArc,
    emotionalArcLabel: variety.emotionalArcLabel,
    creativeLens: variety.creativeLens,
    proofRole: variety.proofRole,
    subjectStyle: variety.subjectStyle,
    visualDirection: variety.visualDirection,
  };
}

function withOptionVariety(campaign: Campaign, nonce: string): Campaign {
  return { ...campaign, bodyVariety: selectVarietyProfile(campaign, nonce) };
}

function stampBrief(brief: GenBrief | undefined, selection: AIModelSelection, variety?: BodyVarietyProfile): GenBrief | undefined {
  if (!brief) return brief;
  brief._provider = providerLabel(selection.provider);
  brief._model = selection.model;
  brief._prompt_version = PROMPT_REGISTRY_VERSION;
  if (variety) brief.body_variety = cleanBodyVarietyProfile(variety);
  return brief;
}

interface SegmentBatchContext {
  index: number;
  total: number;
  allSegments: string[];
  allSegmentContext?: string;
  optionAAnchor?: GenBrief;
  optionBAnchor?: GenBrief;
}

function hasPromptOverrides(overrides?: PromptOverrides): boolean {
  return !!(overrides?.system?.trim() || overrides?.user?.trim());
}

function segmentChunks(segments: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < segments.length; i += SEGMENT_BATCH_SIZE) {
    chunks.push(segments.slice(i, i + SEGMENT_BATCH_SIZE));
  }
  return chunks;
}

function withSegments(campaign: Campaign, segments: string[]): Campaign {
  return { ...campaign, segments };
}

function sharedAnchorSummary(brief?: GenBrief) {
  if (!brief) return undefined;
  return {
    creative_direction: brief.creative_direction,
    theme: brief.theme,
    banner: brief.banner,
    ps: brief.ps,
    products: brief.products,
    quality_checks: brief.quality_checks,
  };
}

interface SegmentCopyPatch {
  subject_lines?: GenBrief["subject_lines"];
  body?: GenBrief["body"];
  body_options?: GenBrief["body_options"];
}

type SegmentBatchPart = GenBrief | SegmentCopyPatch;

function isFullBrief(part: SegmentBatchPart): part is GenBrief {
  return !!(part as GenBrief).creative_direction && !!(part as GenBrief).banner && !!(part as GenBrief).products;
}

function compactAnchorSummary(brief: GenBrief) {
  return {
    creative_direction: brief.creative_direction,
    theme: brief.theme,
    banner: brief.banner,
    body_examples: brief.body,
    ps: brief.ps,
    products: brief.products,
    body_variety: brief.body_variety,
  };
}

function productContextLines(products: Product[]): string {
  return products
    .map((p, i) => {
      const usps = (p.usps || []).filter(Boolean).slice(0, 6).join("; ") || "none";
      return `${i + 1}${i === 0 ? " HERO" : ""}. ${p.name} | slug:${p.slug} | ${p.url || "no URL"} | 💲${p.price || "TBD"} | USP: ${usps} | review: ${p.review || "none"}`;
    })
    .join("\n");
}

function subjectPatchSchema(campaign: Campaign): string {
  return campaign.segments
    .map((id) => `"${segJsonKey(id)}":{"subject":"","preheader":"","style":"","model_hint":"","shared_thread":"","options":[{"style":"strategic","model_hint":"Claude strategic","subject":"","preheader":"","shared_thread":""},{"style":"curiosity","model_hint":"Gemini curiosity","subject":"","preheader":"","shared_thread":""},{"style":"direct-response","model_hint":"ChatGPT direct-response","subject":"","preheader":"","shared_thread":""}]}`)
    .join(",\n    ");
}

function bodyPatchSchema(campaign: Campaign): string {
  return campaign.segments.map((id) => `"${segJsonKey(id)}":""`).join(",\n    ");
}

function segmentPatchOutputSchema(campaign: Campaign): string {
  return `{
  "subject_lines": {
    ${subjectPatchSchema(campaign)}
  },
  "body": {
    ${bodyPatchSchema(campaign)}
  }
}`;
}

function keyVariants(key: string): string[] {
  return [key, key.toLowerCase(), key.toUpperCase()];
}

function pickRecordValue<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  if (!record) return undefined;
  for (const variant of keyVariants(key)) {
    if (variant in record) return record[variant];
  }
  return undefined;
}

function normalizeSegmentPatch(raw: Record<string, unknown>, campaign: Campaign): SegmentCopyPatch {
  const rawSubjects = raw.subject_lines && typeof raw.subject_lines === "object"
    ? raw.subject_lines as GenBrief["subject_lines"]
    : undefined;
  const rawBody = raw.body && typeof raw.body === "object" ? raw.body as GenBrief["body"] : undefined;
  const rawBodyOptions = raw.body_options && typeof raw.body_options === "object"
    ? raw.body_options as GenBrief["body_options"]
    : undefined;
  const subject_lines: GenBrief["subject_lines"] = {};
  const body: GenBrief["body"] = {};
  const body_options: GenBrief["body_options"] = {};

  campaign.segments.forEach((segment) => {
    const key = segJsonKey(segment);
    const subject = pickRecordValue(rawSubjects, key);
    const bodyText = pickRecordValue(rawBody, key);
    const options = pickRecordValue(rawBodyOptions, key);
    if (subject) subject_lines[key] = subject;
    if (typeof bodyText === "string") body[key] = bodyText;
    if (Array.isArray(options)) body_options[key] = options;
  });

  if (!Object.keys(subject_lines).length && !Object.keys(body).length) {
    throw new Error("Segment batch returned no subject_lines or body entries");
  }

  return {
    subject_lines: Object.keys(subject_lines).length ? subject_lines : undefined,
    body: Object.keys(body).length ? body : undefined,
    body_options: Object.keys(body_options).length ? body_options : undefined,
  };
}

function feedbackForSegmentPatch(revision?: RevisionFeedback): string {
  const feedback = revision?.feedback?.trim();
  return feedback
    ? `Apply this user feedback to this segment batch without rewriting shared banner/product sections:\n${feedback}`
    : "";
}

function buildSegmentPatchPrompt(
  campaign: Campaign,
  products: Product[],
  optionLabel: "A" | "B",
  anchor: GenBrief,
  ctx: SegmentBatchContext,
  selection: AIModelSelection,
  revision?: RevisionFeedback
): { system: string; user: string } {
  const brand = BRANDS[campaign.brandId];
  const anchorJson = JSON.stringify(compactAnchorSummary(anchor)).slice(0, 12000);
  const system = renderPromptLayers([
    {
      title: "Role",
      body: `You are finishing Option ${optionLabel} segment copy for ${brand.name}. The complete brief already exists; write only the requested segment subject/preheader/body patch.`,
    },
    {
      title: "Output Contract",
      body: `Return ONLY valid JSON. No prose, no markdown fence. Include only these segment keys. Schema:\n${segmentPatchOutputSchema(campaign)}`,
    },
    {
      title: "Playbook Rules",
      body: `${brandPlaybookRuleBlock(campaign.brandId)}
Subject/preheader: primary pair plus 3 options per segment; 42-60 char subject, 60-90 char preheader, {{first_name}} in subject OR preheader only, offer signal required.
Body: 120-150 words per segment, no {{first_name}}, personal-note first, one calm urgency beat, product-name markdown link by paragraph 2, 2-4 formatting/link beats, no hard-sell command stack.
Use renderer-safe tokens only: ==accent==, **bold**, [Product](slug:slug), [home text](home). Use supplied facts only for reviews, prices, proof, counts, shipping, stock, and urgency.`,
    },
  ]);

  const user = renderPromptLayers([
    {
      title: "Batch",
      body: `Batch ${ctx.index} of ${ctx.total}. Full selected segment list: ${ctx.allSegments.join(", ")}. Current batch segments: ${campaign.segments.join(", ")}.`,
    },
    {
      title: "Campaign",
      body: `Brand: ${brand.name}
Theme: ${campaign.theme}
Send date: ${campaign.sendDate}
Promo: ${promoLine(campaign)}
Products:
${productContextLines(products)}

Segments:
${segmentPromptContext(campaign)}`,
    },
    {
      title: "Anchor Brief",
      body: `Preserve Option ${optionLabel}'s hook contract, branch, visual route, product strategy, and tone. Do not rewrite shared banner/product/P.S. fields.
${anchorJson}`,
    },
    { title: "Segment Differentiation", body: segmentBodyDirectionLines(campaign) },
    {
      title: "Model Lens",
      body: `${modelExecutionStyle(selection)}
This lens should affect sentence architecture and proof path, not recipient-facing model names.`,
    },
    { title: "User Feedback", body: feedbackForSegmentPatch(revision) },
  ]);

  return { system, user };
}

interface SegmentCopyResult {
  a?: SegmentCopyPatch;
  b?: SegmentCopyPatch;
  error?: string;
  warning?: string;
}

async function createSegmentPatch(
  campaign: Campaign,
  products: Product[],
  optionLabel: "A" | "B",
  anchor: GenBrief,
  ctx: SegmentBatchContext,
  selection: AIModelSelection,
  revision?: RevisionFeedback
): Promise<SegmentCopyPatch> {
  const { system, user } = buildSegmentPatchPrompt(campaign, products, optionLabel, anchor, ctx, selection, revision);
  const parsed = await createAndParseWithModel(system, user, selection, optionLabel === "B" ? AI_TEMP_B : AI_TEMP_A);
  return normalizeSegmentPatch(parsed, campaign);
}

async function generateSegmentCopyBatch(
  campaign: Campaign,
  products: Product[],
  models: AIModelPair,
  revision: RevisionFeedback | undefined,
  batchContext: SegmentBatchContext
): Promise<SegmentCopyResult> {
  const tasks: Promise<SegmentCopyPatch>[] = [];
  const labels: ("A" | "B")[] = [];

  if (batchContext.optionAAnchor) {
    labels.push("A");
    tasks.push(createSegmentPatch(campaign, products, "A", batchContext.optionAAnchor, batchContext, models.a, revision));
  }
  if (batchContext.optionBAnchor) {
    labels.push("B");
    tasks.push(createSegmentPatch(campaign, products, "B", batchContext.optionBAnchor, batchContext, models.b, revision));
  }

  if (!tasks.length) return { error: "No anchor option available for segment-only batch" };

  const settled = await Promise.allSettled(tasks);
  const result: SegmentCopyResult = {};
  const warnings: string[] = [];
  settled.forEach((item, index) => {
    const label = labels[index];
    if (item.status === "fulfilled") {
      if (label === "A") result.a = item.value;
      else result.b = item.value;
    } else {
      warnings.push(`Option ${label}: ${errMessage(item.reason)}`);
    }
  });
  const rejectedReasons = settled
    .filter((item): item is PromiseRejectedResult => item.status === "rejected")
    .map((item) => item.reason);
  if (!result.a && !result.b) return { error: bestFailureMessage(rejectedReasons) };
  if (warnings.length) result.warning = warnings.join(" · ");
  return result;
}

function appendSegmentBatchContext(user: string, optionLabel: "A" | "B", ctx?: SegmentBatchContext): string {
  if (!ctx) return user;
  const anchor = optionLabel === "A" ? ctx.optionAAnchor : ctx.optionBAnchor;
  const anchorJson = anchor ? JSON.stringify(sharedAnchorSummary(anchor)).slice(0, 9000) : "";
  const anchorInstruction = anchorJson
    ? `\n\nANCHOR BRIEF TO PRESERVE FOR OPTION ${optionLabel}:\n${anchorJson}\n\nKeep the same creative_direction, banner, product block strategy, P.S., and QA stance. Generate fresh subject_lines/body only for this batch's segment keys, unless a shared field must be copied to satisfy the schema.`
    : "\n\nThis is the anchor batch: create the shared creative direction, banner, products, P.S., and QA that later segment batches will follow.";

  return `${user}

MULTI-SEGMENT BATCH MODE:
Batch ${ctx.index} of ${ctx.total}. Full selected segment list: ${ctx.allSegments.join(", ")}.
${ctx.allSegmentContext ? `Full segment context:\n${ctx.allSegmentContext}\n` : ""}
The system schema already lists only the segment keys for this batch.
Return a complete JSON object for this batch. Do not mention omitted segments. The server will merge batches into one final A/B brief.${anchorInstruction}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function mergeOptionBatches(
  campaign: Campaign,
  products: Product[],
  parts: SegmentBatchPart[],
  provider?: string,
  model?: string
): GenBrief {
  const anchor = parts.find(isFullBrief);
  if (!anchor) throw new Error("Cannot merge segment batches without a full anchor brief");
  const base = JSON.parse(JSON.stringify(briefRevisionSummary(anchor))) as GenBrief;
  const mergedSubjects: GenBrief["subject_lines"] = {};
  const mergedBody: GenBrief["body"] = { base: base.body?.base || "" };
  const mergedBodyOptions: GenBrief["body_options"] = {};

  parts.forEach((part) => {
    Object.assign(mergedSubjects, part.subject_lines || {});
    Object.entries(part.body || {}).forEach(([key, value]) => {
      if (key === "base") {
        if (!mergedBody.base && value) mergedBody.base = value;
      } else {
        mergedBody[key] = value;
      }
    });
    Object.assign(mergedBodyOptions, part.body_options || {});
  });

  base.subject_lines = mergedSubjects;
  base.body = mergedBody;
  if (Object.keys(mergedBodyOptions).length) base.body_options = mergedBodyOptions;
  if (anchor.body_variety) base.body_variety = anchor.body_variety;
  const validated = validateBrief(base, campaign, products);
  validated._provider = provider;
  validated._model = model;
  validated._prompt_version = PROMPT_REGISTRY_VERSION;
  return validated;
}

const QUALITY_REPAIR_THRESHOLD = Number(process.env.AI_QUALITY_REPAIR_THRESHOLD || 78);
const QUALITY_REPAIR_MAX_FLAGS = Number(process.env.AI_QUALITY_REPAIR_MAX_FLAGS || 10);

function qualityRepairEnabled(): boolean {
  return !/^(0|false|off|no)$/i.test(process.env.AI_QUALITY_REPAIR || "");
}

function repairFlagsFor(brief: GenBrief): string[] {
  // Repair only safety/compliance/deliverability flags. Creative scoring remains visible in the UI,
  // but does not trigger a homogenizing model rewrite.
  const complianceMsgs = (brief._flags || []).map((f) => f.msg).filter(isComplianceRepairFlag);
  const highImpact = complianceMsgs.filter(isHighImpactFlag);
  const lowScore = typeof brief._score === "number" && brief._score < QUALITY_REPAIR_THRESHOLD;
  if (!complianceMsgs.length || (!highImpact.length && !lowScore)) return [];
  return (highImpact.length ? highImpact : complianceMsgs).slice(0, QUALITY_REPAIR_MAX_FLAGS);
}

function countComplianceImpact(brief: GenBrief): number {
  return (brief._flags || []).filter((f) => isComplianceRepairFlag(f.msg)).length;
}

// Lexicographic: prefer fewer errors, then fewer serious/structural warnings, then higher score.
// Stops a repair that removes a compliance flag from being discarded for adding cosmetic ones.
function shouldKeepRepair(original: GenBrief, repaired: GenBrief): boolean {
  const oErr = (original._flags || []).filter((f) => f.type === "error").length;
  const rErr = (repaired._flags || []).filter((f) => f.type === "error").length;
  if (rErr !== oErr) return rErr < oErr;
  const compliance = countComplianceImpact(repaired) - countComplianceImpact(original);
  if (compliance !== 0) return compliance < 0;
  return (repaired._score ?? 0) >= (original._score ?? 0);
}

function buildQualityRepairPrompt(optionLabel: "A" | "B", brief: GenBrief, flags: string[]): string {
  const current = JSON.stringify(briefRevisionSummary(brief)).slice(0, 18000);
  return `QUALITY REPAIR PASS FOR OPTION ${optionLabel}

Fix only the compliance, proof-safety, deliverability, and hard length problems below. Preserve the current creative direction, route, hook, product order, and sentence architecture wherever they are valid.

Problems to fix:
${flags.map((flag, i) => `${i + 1}. ${flag}`).join("\n")}

Current brief JSON:
${current}

Return the complete corrected brief JSON using the exact same schema. Do not add prose or markdown fences.`;
}

async function repairBriefIfNeeded(
  optionLabel: "A" | "B",
  brief: GenBrief,
  campaign: Campaign,
  products: Product[],
  system: string,
  selection: AIModelSelection
): Promise<GenBrief> {
  if (!qualityRepairEnabled()) return brief;
  const flags = repairFlagsFor(brief);
  if (!flags.length) return brief;

  try {
    const repaired = validateBrief(
      (await createAndParseWithModel(REPAIR_SYSTEM, buildQualityRepairPrompt(optionLabel, brief, flags), selection, AI_REPAIR_TEMP)) as unknown as GenBrief,
      campaign,
      products
    );
    if (shouldKeepRepair(brief, repaired)) {
      console.info(`[generate-copy] quality repair kept for option ${optionLabel}: ${brief._score ?? "?"} -> ${repaired._score ?? "?"}`);
      return repaired;
    }
    console.info(`[generate-copy] quality repair discarded for option ${optionLabel}: ${brief._score ?? "?"} -> ${repaired._score ?? "?"}`);
    return brief;
  } catch (err) {
    console.warn(`[generate-copy] quality repair failed for option ${optionLabel}: ${err instanceof Error ? err.message : "unknown error"}`);
    return brief;
  }
}

async function generateOptionsSingle(
  campaign: Campaign,
  products: Product[],
  overrides?: PromptOverrides,
  modelInput?: Partial<AIModelPair>,
  revision?: RevisionFeedback,
  batchContext?: SegmentBatchContext
): Promise<GenerationResult> {
  try {
    const models = normalizeModelPair(modelInput);
    const autoPrompts = !hasPromptOverrides(overrides);
    const nonceA = `${randomUUID()}:${models.a.provider}:${models.a.model}:A`;
    const nonceB = `${randomUUID()}:${models.b.provider}:${models.b.model}:B`;
    const campaignA = autoPrompts ? withOptionVariety(campaign, nonceA) : { ...campaign, bodyVariety: campaign.bodyVariety || selectVarietyProfile(campaign, nonceA) };
    const campaignB = autoPrompts ? withOptionVariety(campaign, nonceB) : { ...campaign, bodyVariety: campaign.bodyVariety || selectVarietyProfile(campaign, nonceB) };
    const sysA = overrides?.system?.trim() || buildSystemPrompt(campaignA, products, false, undefined, nonceA);
    const usrABase = appendRevisionFeedback(overrides?.user?.trim() || buildUserPrompt(campaignA, false), revision);
    const usrA = appendSegmentBatchContext(appendModelExecutionStyle(usrABase, "A", models.a), "A", batchContext);

    const startedAt = Date.now();
    let a: GenBrief | undefined;
    let b: GenBrief | undefined;
    let aFailure: unknown;
    let bFailure: unknown;
    let usrB = "";
    let sysBInitial = "";

    const buildOptionBMessages = (anchor?: GenBrief, retryNonce = nonceB) => {
      const system = overrides?.system?.trim()
        ? `${overrides.system.trim()}${anchor ? "\n" + contrastInstruction(anchor.creative_direction) : ""}`
        : buildSystemPrompt(campaignB, products, true, anchor?.creative_direction, retryNonce);
      const userBase = overrides?.user?.trim()
        ? overrides.user.trim() + "\n\nGenerate Option B now — make it a clearly different challenger from Option A."
        : buildUserPrompt(campaignB, true);
      const contrast = anchor ? optionAContrastContext(anchor) : OPTION_B_INITIAL_CONTRAST;
      const user = appendSegmentBatchContext(
        appendModelExecutionStyle(appendRevisionFeedback(userBase + contrast, revision), "B", models.b),
        "B",
        batchContext
      );
      return { system, user };
    };

    if (AB_FAST_PARALLEL) {
      const bMessages = buildOptionBMessages();
      sysBInitial = bMessages.system;
      usrB = bMessages.user;
      // allSettled so a slow/failed B doesn't discard a perfectly good A (and vice versa).
      const [aSettled, bSettled] = await Promise.allSettled([
        createAndParseWithModel(sysA, usrA, models.a, AI_TEMP_A),
        createAndParseWithModel(sysBInitial, usrB, models.b, AI_TEMP_B),
      ]);
      aFailure = aSettled.status === "rejected" ? aSettled.reason : undefined;
      bFailure = bSettled.status === "rejected" ? bSettled.reason : undefined;
      a = aSettled.status === "fulfilled" ? validateBrief(aSettled.value as unknown as GenBrief, campaign, products) : undefined;
      b = bSettled.status === "fulfilled" ? validateBrief(bSettled.value as unknown as GenBrief, campaign, products) : undefined;
      [a, b] = await Promise.all([
        a ? repairBriefIfNeeded("A", a, campaign, products, sysA, models.a) : Promise.resolve(undefined),
        b ? repairBriefIfNeeded("B", b, campaign, products, sysBInitial, models.b) : Promise.resolve(undefined),
      ]);
    } else {
      try {
        a = validateBrief((await createAndParseWithModel(sysA, usrA, models.a, AI_TEMP_A)) as unknown as GenBrief, campaign, products);
        a = await repairBriefIfNeeded("A", a, campaign, products, sysA, models.a);
        stampBrief(a, models.a, campaignA.bodyVariety);
      } catch (err) {
        aFailure = err;
      }

      const bMessages = buildOptionBMessages(a);
      sysBInitial = bMessages.system;
      usrB = bMessages.user;
      try {
        b = validateBrief((await createAndParseWithModel(sysBInitial, usrB, models.b, AI_TEMP_B)) as unknown as GenBrief, campaign, products);
        b = await repairBriefIfNeeded("B", b, campaign, products, sysBInitial, models.b);
      } catch (err) {
        bFailure = err;
      }
    }

    if (!a && !b) {
      return { error: bestFailureMessage([aFailure, bFailure]) };
    }

    stampBrief(a, models.a, campaignA.bodyVariety);
    stampBrief(b, models.b, campaignB.bodyVariety);

    // One option failed — return the survivor with a non-fatal warning the UI can show.
    if (!a || !b) {
      const failedLabel = a ? "B" : "A";
      const why = errMessage(a ? bFailure : aFailure);
      console.warn(`[generate-copy] option ${failedLabel} failed, returning the other: ${why}`);
      return { a, b, warning: `Option ${failedLabel} failed (${why}). Generated the other option only — regenerate to retry the missing one.` };
    }

    // Auto-retry once if B collapses into A's strategy, route, body, banner, or product-copy shape.
    const contrastProblems = briefContrastIssues(a, b);
    if (contrastProblems.length > 0) {
      const sysB = overrides?.system?.trim()
        ? overrides.system.trim() + "\n" + contrastInstruction(a.creative_direction)
        : buildSystemPrompt(campaignB, products, true, a.creative_direction, `${nonceB}:retry`);
      const retry = `${usrB}

WARNING: A/B contrast failed:
${contrastProblems.map((problem, i) => `${i + 1}. ${problem}`).join("\n")}

Regenerate Option B with a different production branch/brief_route, subject family, body architecture, banner pattern, product-grid emphasis, and proof path. Preserve supplied facts and the JSON schema.`;
      b = validateBrief((await createAndParseWithModel(sysB, retry, models.b, AI_TEMP_B_RETRY)) as unknown as GenBrief, campaign, products);
      b = await repairBriefIfNeeded("B", b, campaign, products, sysB, models.b);
      stampBrief(b, models.b, campaignB.bodyVariety);
    }

    [a, b] = validateBriefPair(a, b);

    console.info(`[generate-copy] completed A/B${batchContext ? ` batch ${batchContext.index}/${batchContext.total}` : ""} in ${Math.round((Date.now() - startedAt) / 1000)}s using ${models.a.provider}:${models.a.model} + ${models.b.provider}:${models.b.model}`);
    return { a, b };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Generation failed" };
  }
}

async function generateOptionsBatched(
  campaign: Campaign,
  products: Product[],
  modelInput?: Partial<AIModelPair>,
  revision?: RevisionFeedback
): Promise<GenerationResult> {
  try {
    const chunks = segmentChunks(campaign.segments);
    const total = chunks.length;
    const models = normalizeModelPair(modelInput);
    const allSegmentContext = segmentPromptContext(campaign);
    const startedAt = Date.now();
    console.info(`[generate-copy] batching ${campaign.segments.length} segments into ${total} batches of up to ${SEGMENT_BATCH_SIZE}`);

    const first = await generateOptionsSingle(
      withSegments(campaign, chunks[0]),
      products,
      undefined,
      models,
      revision,
      { index: 1, total, allSegments: campaign.segments, allSegmentContext }
    );
    if (first.error && !first.a && !first.b) return first;

    const remainingChunks = chunks.slice(1);
    const remaining = await mapWithConcurrency(
      remainingChunks,
      SEGMENT_BATCH_CONCURRENCY,
      (segments, index) =>
        generateSegmentCopyBatch(
          withSegments(campaign, segments),
          products,
          models,
          revision,
          {
            index: index + 2,
            total,
            allSegments: campaign.segments,
            allSegmentContext,
            optionAAnchor: first.a,
            optionBAnchor: first.b,
          }
        )
    );

    const batchResults: Array<GenerationResult | SegmentCopyResult> = [first, ...remaining];
    const warnings: string[] = [];
    batchResults.forEach((result, index) => {
      const label = `batch ${index + 1}/${total}`;
      if (result.error) warnings.push(`${label}: ${result.error}`);
      if (result.warning) warnings.push(`${label}: ${result.warning}`);
      if (!result.a) warnings.push(`${label}: missing Option A`);
      if (!result.b) warnings.push(`${label}: missing Option B`);
    });

    const aBatches = batchResults.map((result) => result.a).filter((brief): brief is SegmentBatchPart => !!brief);
    const bBatches = batchResults.map((result) => result.b).filter((brief): brief is SegmentBatchPart => !!brief);
    if (!aBatches.length && !bBatches.length) {
      return { error: warnings[0] || "No segment batch returned usable output" };
    }

    let a = aBatches.length
      ? mergeOptionBatches(campaign, products, aBatches, first.a?._provider, first.a?._model)
      : undefined;
    let b = bBatches.length
      ? mergeOptionBatches(campaign, products, bBatches, first.b?._provider, first.b?._model)
      : undefined;
    if (a && b) [a, b] = validateBriefPair(a, b);

    const warning = warnings.length
      ? `Some segment batches were incomplete: ${warnings.slice(0, 6).join(" · ")}${warnings.length > 6 ? ` · +${warnings.length - 6} more` : ""}. Generated all usable copy; missing segments are flagged in Output.`
      : undefined;

    console.info(`[generate-copy] completed batched A/B in ${Math.round((Date.now() - startedAt) / 1000)}s across ${total} batches`);
    return { a, b, warning };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Batched generation failed" };
  }
}

/** Generate two contrasting options (A + B), each a combined content + design brief. */
export async function generateOptions(
  campaign: Campaign,
  products: Product[],
  overrides?: PromptOverrides,
  modelInput?: Partial<AIModelPair>,
  revision?: RevisionFeedback
): Promise<GenerationResult> {
  if (!hasPromptOverrides(overrides) && campaign.segments.length > SEGMENT_BATCH_THRESHOLD) {
    return generateOptionsBatched(campaign, products, modelInput, revision);
  }
  return generateOptionsSingle(campaign, products, overrides, modelInput, revision);
}
