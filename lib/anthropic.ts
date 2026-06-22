import Anthropic from "@anthropic-ai/sdk";
import type { Message, MessageCreateParamsNonStreaming, Tool } from "@anthropic-ai/sdk/resources/messages";
import { randomUUID } from "crypto";
import type { AIModelPair, AIModelSelection, BodyVarietyProfile, Campaign, Product } from "./config/types";
import { normalizeModelPair, providerLabel } from "./config/aiModels";
import { foundationBriefJsonSchema, genBriefJsonSchema, segmentPatchJsonSchema, type ProviderJsonSchema } from "./anthropic/schema";
import { conceptPrompt, selectEmailConceptPair, type EmailConcept } from "./concept";
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
import { applySanitizeCopy } from "./present/sanitizeCopy";

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
  if (start === -1) throw new Error("No JSON object found in model output");
  if (end !== -1 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch (err) {
      const salvaged = salvagePartialJson(t.slice(start));
      if (salvaged) return salvaged;
      throw err;
    }
  }
  const salvaged = salvagePartialJson(t.slice(start));
  if (salvaged) return salvaged;
  throw new Error("No complete JSON object found in model output");
}

function salvagePartialJson(text: string): Record<string, unknown> | null {
  let out = "";
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    out += ch;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if ((ch === "}" || ch === "]") && stack[stack.length - 1] === ch) stack.pop();
  }
  if (inString) out += '"';
  out = out.replace(/,\s*$/, "");
  while (stack.length) out += stack.pop();
  try {
    const parsed = JSON.parse(out) as Record<string, unknown>;
    const existing = Array.isArray(parsed._advisory) ? parsed._advisory : [];
    parsed._advisory = [
      ...existing,
      { type: "warn", msg: "Output was truncated and salvaged from the largest valid JSON prefix; review missing fields before export." },
    ];
    return parsed;
  } catch {
    return null;
  }
}

const FIX_JSON_NOTE =
  '\n\nYour previous response was NOT valid JSON. Return ONLY one valid JSON object — escape every double-quote inside a string value as \\", escape newlines as \\n, no trailing commas, no comments, no prose.';

const PROVIDER_TIMEOUT_MS = Number(process.env.AI_PROVIDER_TIMEOUT_MS || 145_000);
function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

function envInteger(name: string, fallback: number, min: number, max: number): number {
  return Math.round(envNumber(name, fallback, min, max));
}

const AI_TEMP_A = envNumber("AI_TEMP_A", 0.85, 0, 1);
const AI_TEMP_B = envNumber("AI_TEMP_B", 1.0, 0, 1);
const AI_TEMP_B_RETRY = envNumber("AI_TEMP_B_RETRY", 0.9, 0, 1);
const AI_TOP_P = envNumber("AI_TOP_P", 0.95, 0.1, 1);
const AI_REPAIR_TEMP = envNumber("AI_REPAIR_TEMP", 0.6, 0, 1);
const AI_PROVIDER_RETRIES = envInteger("AI_PROVIDER_RETRIES", 2, 0, 4);
const AI_PROVIDER_RETRY_BASE_MS = envInteger("AI_PROVIDER_RETRY_BASE_MS", 900, 100, 10_000);
const AI_CLAUDE_STREAMING = !/^(0|false|off|no)$/i.test(process.env.AI_CLAUDE_STREAMING || "");

const OPTION_B_INITIAL_CONTRAST = `\nOPTION B CONTRAST REQUIREMENT:
You are writing Option B in parallel with Option A. Deliberately avoid the obvious/default route.
Pick a distinct angle, framework, opener mechanic, emotional arc, visual direction, CTA wording, and proof role.
Do not wait to see Option A; make Option B a clearly different usable challenger.`;

const REPAIR_SYSTEM = `You are an email copy repair specialist. Fix the listed playbook violations in the provided brief with minimal rewriting. Preserve all creative direction, product facts, prices, URLs, and supplied reviews. Return one complete JSON object in the same schema — no prose, no fences.`;

const SEGMENT_BATCH_THRESHOLD = Math.max(1, Number(process.env.AI_SEGMENT_BATCH_THRESHOLD || 1));
const SEGMENT_BATCH_SIZE = Math.max(1, Number(process.env.AI_SEGMENT_BATCH_SIZE || 1));
const SEGMENT_BATCH_CONCURRENCY = Math.max(1, Number(process.env.AI_SEGMENT_BATCH_CONCURRENCY || 2));
const AB_FAST_PARALLEL = /^(1|true|on|yes)$/i.test(process.env.AI_AB_FAST_PARALLEL || "");

const MAX_OUTPUT_TOKENS = envInteger("AI_MAX_OUTPUT_TOKENS", 32000, 4000, 64000);
const FOUNDATION_OUTPUT_TOKENS = envInteger("AI_FOUNDATION_OUTPUT_TOKENS", 14000, 4000, 32000);
const SEGMENT_PATCH_OUTPUT_TOKENS = Math.min(MAX_OUTPUT_TOKENS, 8000);

interface ModelCallOptions {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  schema?: ProviderJsonSchema;
}

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

function truncatedMessage(provider: string, model: string, maxOutputTokens = MAX_OUTPUT_TOKENS): string {
  return `${provider} ${model} hit the ${Math.round(maxOutputTokens / 1000)}k output-token limit before finishing the JSON — reduce segments/products (or lower the subject-option count), or reset prompt edits so layered generation can split the work.`;
}

function isTruncationError(err: unknown): boolean {
  return /token limit|max_output|max tokens|MAX_TOKENS|before finishing|No complete JSON/i.test(errMessage(err));
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

async function createText(system: string, user: string, selection: AIModelSelection, options: ModelCallOptions = {}): Promise<string> {
  if (selection.provider === "claude") return callClaude(system, user, selection.model, options);
  if (selection.provider === "gemini") return callGemini(system, user, selection.model, options);
  if (selection.provider === "openai") return callOpenAI(system, user, selection.model, options);
  throw new Error(`Unsupported AI provider: ${selection.provider}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientProviderError(err: unknown): boolean {
  const msg = errMessage(err);
  return /\b(429|500|502|503|504|529)\b|rate limit|overload|overloaded|high demand|temporar|try again later|unavailable|server busy|resource exhausted/i.test(msg);
}

async function createTextWithProviderRetry(
  system: string,
  user: string,
  selection: AIModelSelection,
  options: ModelCallOptions = {}
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= AI_PROVIDER_RETRIES; attempt++) {
    try {
      return await createText(system, user, selection, options);
    } catch (err) {
      lastErr = err;
      if (attempt >= AI_PROVIDER_RETRIES || !isTransientProviderError(err)) break;
      const backoff = AI_PROVIDER_RETRY_BASE_MS * 2 ** attempt;
      const jitter = Math.round(backoff * 0.2 * Math.random());
      await sleep(backoff + jitter);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Provider request failed");
}

async function createAndParseWithModel(
  system: string,
  user: string,
  selection: AIModelSelection,
  options: ModelCallOptions = {}
): Promise<Record<string, unknown>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await createTextWithProviderRetry(system, attempt === 0 ? user : user + FIX_JSON_NOTE, selection, options);
    try {
      return parseStrictJson(raw);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to parse model output");
}

function compactRecoveryUserPrompt(user: string): string {
  return `${user}

COMPACT RECOVERY MODE:
The previous full JSON ran into provider output limits. Regenerate the complete brief using the same strategy, but keep JSON lean:
- Keep exactly one selected subject/preheader pair plus concise option objects.
- Use enum-like quality_checks values only.
- Keep body copy inside 120-150 words and product overlay copy clipped.
- Do not add explanatory prose, comments, markdown fences, or extra optional arrays.`;
}

async function createFullBriefWithModel(
  system: string,
  user: string,
  selection: AIModelSelection,
  campaign: Campaign,
  options: ModelCallOptions = {}
): Promise<Record<string, unknown>> {
  try {
    return await createAndParseWithModel(system, user, selection, {
      ...options,
      maxOutputTokens: options.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      schema: genBriefJsonSchema(campaign.segments),
    });
  } catch (err) {
    if (!isTruncationError(err)) throw err;
    const recovered = await createAndParseWithModel(system, compactRecoveryUserPrompt(user), selection, {
      ...options,
      maxOutputTokens: options.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      schema: genBriefJsonSchema(campaign.segments, true),
    });
    const existing = Array.isArray(recovered._advisory) ? recovered._advisory : [];
    recovered._advisory = [
      ...existing,
      { type: "warn", msg: "Regenerated in compact mode after provider output truncation; review subject alternatives and QA fields." },
    ];
    return recovered;
  }
}

async function createFoundationBriefWithModel(
  system: string,
  user: string,
  selection: AIModelSelection,
  options: ModelCallOptions = {}
): Promise<Record<string, unknown>> {
  return createAndParseWithModel(system, user, selection, {
    ...options,
    maxOutputTokens: options.maxOutputTokens ?? FOUNDATION_OUTPUT_TOKENS,
    schema: foundationBriefJsonSchema(),
  });
}

function isSchemaParamError(message = ""): boolean {
  return /tool|schema|responseSchema|response_schema|json_schema|format/i.test(message) && /unsupported|invalid|unknown|not supported|not allowed/i.test(message);
}

function isOutputBudgetParamError(message = ""): boolean {
  return /max_?tokens|max_output_tokens|maxOutputTokens|output token/i.test(message) &&
    /invalid|unsupported|not supported|greater|too high|exceed|limit|must be/i.test(message);
}

function reducedOutputBudget(current: number): number | null {
  if (current > 16000) return 16000;
  if (current > 8192) return 8192;
  if (current > 4096) return 4096;
  return null;
}

function textFromClaudeMessage(resp: Message): string {
  const toolUse = resp.content.find((c) => c.type === "tool_use");
  if (toolUse && toolUse.type === "tool_use") return JSON.stringify(toolUse.input);
  const textPart = resp.content.find((c) => c.type === "text");
  return textPart && textPart.type === "text" ? textPart.text : "";
}

async function callClaude(system: string, user: string, model: string, options: ModelCallOptions = {}): Promise<string> {
  const temperature = options.temperature ?? AI_TEMP_A;
  const maxOutputTokens = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const tool: Tool | undefined = options.schema
    ? {
        name: "emit_brief",
        description: "Emit the complete EmailAuto Studio JSON payload. Do not include prose outside the tool input.",
        input_schema: options.schema.schema as Tool["input_schema"],
      }
    : undefined;
  const payload: MessageCreateParamsNonStreaming = {
    model,
    max_tokens: maxOutputTokens,
    temperature,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    ...(tool ? { tools: [tool], tool_choice: { type: "tool", name: tool.name } } : {}),
  };
  let resp;
  try {
    resp = AI_CLAUDE_STREAMING
      ? await getClient().messages.stream(payload, { timeout: PROVIDER_TIMEOUT_MS }).finalMessage()
      : await getClient().messages.create(payload, { timeout: PROVIDER_TIMEOUT_MS });
  } catch (err) {
    if (err instanceof Error && isOutputBudgetParamError(err.message)) {
      const nextBudget = reducedOutputBudget(maxOutputTokens);
      if (nextBudget) return callClaude(system, user, model, { ...options, maxOutputTokens: nextBudget });
    }
    if (tool && err instanceof Error && isSchemaParamError(err.message)) {
      return callClaude(system, user, model, { ...options, schema: undefined });
    }
    if (err instanceof Error && /timeout|timed out|abort/i.test(err.message)) {
      throw new Error(timeoutMessage("Claude", model));
    }
    throw err;
  }
  if (resp.stop_reason === "max_tokens") throw new Error(truncatedMessage("Claude", model, maxOutputTokens));
  return textFromClaudeMessage(resp);
}

async function callGemini(system: string, user: string, model: string, options: ModelCallOptions = {}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const temperature = options.temperature ?? AI_TEMP_A;
  const topP = options.topP ?? AI_TOP_P;
  const maxOutputTokens = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const generationConfig: Record<string, unknown> = {
    temperature,
    topP,
    maxOutputTokens,
    responseMimeType: "application/json",
  };
  if (options.schema) generationConfig.responseSchema = options.schema.schema;
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
      generationConfig,
    }),
  });
  if (!res.ok && isOutputBudgetParamError(data.error?.message)) {
    const nextBudget = reducedOutputBudget(maxOutputTokens);
    if (nextBudget) return callGemini(system, user, model, { ...options, maxOutputTokens: nextBudget });
  }
  if (!res.ok && options.schema && isSchemaParamError(data.error?.message)) {
    return callGemini(system, user, model, { ...options, schema: undefined });
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data.error?.message || "request failed"}`);
  if (data.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error(truncatedMessage("Gemini", model, maxOutputTokens));
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
}

function openAITextFromResponse(data: {
  output_text?: string;
  output?: { content?: { text?: string; type?: string; output_text?: string }[] }[];
  choices?: { message?: { content?: string }; finish_reason?: string }[];
}): string {
  if (data.output_text) return data.output_text;
  const outputText = data.output?.flatMap((item) => item.content || [])
    .map((part) => part.text || part.output_text || "")
    .join("");
  return outputText || data.choices?.[0]?.message?.content || "";
}

function isSamplingParamError(message = ""): boolean {
  return /temperature|top_p|topP|sampling/i.test(message) && /unsupported|cannot both|invalid|not supported/i.test(message);
}

async function callOpenAI(system: string, user: string, model: string, options: ModelCallOptions = {}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const topP = options.topP ?? AI_TOP_P;
  const maxOutputTokens = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const basePayload: Record<string, unknown> = {
    model,
    store: true,
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: user }] },
    ],
    max_output_tokens: maxOutputTokens,
    text: {
      format: options.schema
        ? { type: "json_schema", name: options.schema.name, schema: options.schema.schema, strict: true }
        : { type: "json_object" },
    },
  };

  type OpenAIResponse = {
    output_text?: string;
    output?: { content?: { text?: string; type?: string; output_text?: string }[] }[];
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    status?: string;
    incomplete_details?: { reason?: string };
    error?: { message?: string };
  };
  const post = (payload: Record<string, unknown>) =>
    fetchJsonWithTimeout<OpenAIResponse>("OpenAI", model, "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

  // Newer OpenAI reasoning/frontier models reject `temperature`; some also reject
  // specifying both temperature and top_p. Use top_p as the single creative-control
  // knob, then retry once with provider defaults if the selected model rejects it.
  let { res, data } = await post({ ...basePayload, top_p: topP });
  if (!res.ok && isOutputBudgetParamError(data.error?.message)) {
    const nextBudget = reducedOutputBudget(maxOutputTokens);
    if (nextBudget) return callOpenAI(system, user, model, { ...options, maxOutputTokens: nextBudget });
  }
  if (!res.ok && options.schema && isSchemaParamError(data.error?.message)) {
    return callOpenAI(system, user, model, { ...options, schema: undefined });
  }
  if (!res.ok && isSamplingParamError(data.error?.message)) {
    ({ res, data } = await post(basePayload));
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${data.error?.message || "request failed"}`);
  if (data.status === "incomplete" && data.incomplete_details?.reason === "max_output_tokens") {
    throw new Error(truncatedMessage("OpenAI", model, maxOutputTokens));
  }
  return openAITextFromResponse(data);
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
  const cd = brief.creative_direction || {};
  const anchor = {
    concept: cd.concept,
    angle: cd.angle,
    framework: cd.framework,
    route: cd.brief_route || cd.branch || cd.source_pattern,
    flow: cd.flow,
    differentiator: cd.differentiator,
    hook_contract: cd.hook_contract,
    body_variety: brief.body_variety ? {
      openerMechanic: brief.body_variety.openerMechanic,
      emotionalArc: brief.body_variety.emotionalArc,
      proofRole: brief.body_variety.proofRole,
      visualDirection: brief.body_variety.visualDirection,
    } : undefined,
    opener_mechanic: brief.quality_checks?.opener_mechanic,
    first_product: brief.products?.[0] ? {
      name: brief.products[0].name,
    } : undefined,
  };
  return `\nOPTION A CREATIVE MAP TO CONTRAST AGAINST:
${JSON.stringify(anchor).slice(0, 2600)}

Use this only as an anti-collision fingerprint, not source copy. Generate Option B from its own concept and choose a different hook contract emphasis, reader entry point, proof path, banner headline family, and payoff. Do not mirror Option A phrasing or sentence architecture.`;
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
    banner: {
      main_text_1: brief.banner?.main_text_1,
      main_text_2: brief.banner?.main_text_2,
      main_text_3: brief.banner?.main_text_3,
      sub_text_1: brief.banner?.sub_text_1,
      sub_text_2: brief.banner?.sub_text_2,
      sub_text_3: brief.banner?.sub_text_3,
      cta: brief.banner?.cta,
      trust_booster: brief.banner?.trust_booster,
      emergency: brief.banner?.emergency,
    },
    body_examples: brief.body,
    ps: brief.ps,
    products: (brief.products || []).map((p) => ({
      slot: p.slot,
      name: p.name,
      main_text: p.main_text,
      sub_text: p.sub_text,
      popup_badge: p.popup_badge,
      usps: (p.usps || []).slice(0, 2),
      review: p.review,
      cta: p.cta,
    })),
    body_variety: brief.body_variety,
  };
}

function productContextLines(products: Product[]): string {
  return products
    .map((p, i) => {
      const usps = (p.usps || []).filter(Boolean).slice(0, 4).join("; ") || "none";
      return `${i + 1}${i === 0 ? " HERO" : ""}. ${p.name} | slug:${p.slug} | ${p.url || "no URL"} | 💲${p.price || "TBD"} | USP: ${usps} | review: ${p.review || "none"}`;
    })
    .join("\n");
}

function foundationOutputSchema(products: Product[]): string {
  const productRows = products
    .map(
      (_, i) => `{"slot":${i + 1},"name":"","template_style":"","main_text":"","sub_text":"","popup_badge":"","usps":["",""],"review":"","cta":"","main_image":"","sub_image":"","alt_text":"","image_notes":""}`
    )
    .join(",\n    ");
  return `{
  "creative_direction":{"angle":"","framework":"","branch":"","brief_route":"","source_pattern":"","hook_contract":{"segment_insight":"","emotion":"","hero_product":"","proof_or_price":"","urgency":"","avoid_rule":""},"flow":"","differentiator":""},
  "theme":"",
  "banner":{"logo_stars":"","main_text_1":"","main_text_2":"","main_text_3":"","sub_text_1":"","sub_text_2":"","sub_text_3":"","image_guidance":"- bullet\\n- bullet\\n- bullet\\n- bullet","review_quote":"","review_texts":[""],"main_image":"","sub_image":"","trust_booster":"","emergency":"","cta":""},
  "body":{"base":"plain-English layout summary for designer/marketer; no internal generation terms"},
  "ps":"",
  "products":[
    ${productRows}
  ],
  "quality_checks":{"click_reason":"specific|weak|missing","hook_alignment":"aligned|weak|missing","proof_safety":"supplied|needs_review|invented_risk","spam_risk":"low|medium|high","optout_risk":"low|medium|high","photo_watchout":"clear|needs_review|missing","first_200px":"cta_visible|cta_late|missing","inline_link_plan":"ready|weak|missing","layout_risk":"low|medium|high","playbook_dos_donts":"pass|review|fail","brand_rule_alignment":"aligned|review|off_brand","accessibility_layout":"ready|review|missing","opener_mechanic":"story|fact|question|direct_problem|occasion|re_engagement|insider_reveal","hook_coherence":"fresh|reused|unclear","cta_assessment":"clear|weak|missing"}
}`;
}

function foundationRevisionPrompt(revision?: RevisionFeedback): string {
  const feedback = revision?.feedback?.trim();
  if (!feedback) return "";
  const current = JSON.stringify({
    a: summarizeBriefForContext(revision?.existingOptions?.a),
    b: summarizeBriefForContext(revision?.existingOptions?.b),
  }).slice(0, 6000);
  return `User feedback:
${feedback}

Current options context:
${current}

Apply feedback to the shared route, banner, product-image brief, P.S., and QA only. Segment subject/body patches will receive the same feedback later.`;
}

function foundationBodyBase(campaign: Campaign): string {
  if (campaign.bodyLayout === "interspersed") {
    return "Layout summary: Open with the hero banner, place a short story paragraph before the first product images, add one bridge between product rows, then close with the P.S.";
  }
  if (campaign.bodyLayout === "custom") {
    return "Layout summary: Use one to three movable text modules around product image rows, keeping the order hook, proof, offer, CTA.";
  }
  return "Layout summary: Open with the hero banner, follow with three to five short body paragraphs, then use product image rows and a short P.S. to close.";
}

function normalizeFoundationBrief(raw: Record<string, unknown>, campaign: Campaign): GenBrief {
  const brief = raw as unknown as GenBrief;
  brief.subject_lines = {};
  const incomingBody = brief.body && typeof brief.body === "object" ? brief.body : {};
  brief.body = {
    base: String((incomingBody as Record<string, unknown>).base || foundationBodyBase(campaign)),
  };
  if (!Array.isArray(brief.products)) brief.products = [];
  if (!brief.ps) brief.ps = "";
  return brief;
}

function buildFoundationPrompt(
  campaign: Campaign,
  products: Product[],
  optionLabel: "A" | "B",
  selection: AIModelSelection,
  concept: EmailConcept,
  revision?: RevisionFeedback,
  optionAAnchor?: GenBrief
): { system: string; user: string } {
  const brand = BRANDS[campaign.brandId];
  const optionContrast = optionLabel === "B" && optionAAnchor
    ? contrastInstruction(optionAAnchor.creative_direction)
    : optionLabel === "B"
      ? OPTION_B_INITIAL_CONTRAST
      : "";
  const system = renderPromptLayers([
    {
      title: "Role",
      body: `You are creating Option ${optionLabel}'s shared ecommerce email foundation for ${brand.name}. Persona: ${brand.persona}. Voice: ${brand.voice}.`,
    },
    {
      title: "What To Generate",
      body: `Generate only the shared strategy/design foundation: creative_direction, theme, banner, a plain-English body.base layout summary, P.S., product-image copy brief, and QA. Do NOT generate subject_lines or per-segment body copy; smaller segment calls handle those.`,
    },
    {
      title: "Playbook Core",
      body: `One send = one promise. Every shared surface must connect one hero product + one proof/price + one reader situation.
Use supplied facts only for reviews, ratings, counts, guarantees, stock, shipping, prices, and urgency. If proof is absent, use qualitative benefit language.
Banner uses 3 beats: main_text_1 tension/hook, main_text_2 mechanism/proof, main_text_3 resolution/offer/CTA. Product rows are image-overlay copy; main_text <=5 words, USPs <=5 words.
P.S. is 10-15 words. Renderer handles footer; do not write unsubscribe/footer copy. Tokens allowed: ==accent==, **bold**, [Product](slug:slug), [home text](home).`,
    },
    { title: "Brand Rules", body: brandPlaybookRuleBlock(campaign.brandId) },
    { title: "Chosen Concept", body: conceptPrompt(concept, optionLabel) },
    { title: "Model Lens", body: modelExecutionStyle(selection) },
    {
      title: "Output Contract",
      body: `Return ONLY valid JSON. No markdown fence. No subject_lines. No segment body fields. Do not use internal terms such as ZONE, seg_*, QA flag, renderer, generated later, injected here, foundation, or patch call.\n${foundationOutputSchema(products)}`,
    },
  ]);

  const user = renderPromptLayers([
    {
      title: "Campaign",
      body: `Brand: ${brand.name}
Send date: ${campaign.sendDate}
Theme: ${campaign.theme}
Promo: ${promoLine(campaign)}
Body layout: ${campaign.bodyLayout || "continuous"}
Product template: ${campaign.productCopyStyle || "headline_winner"}
Hook input: ${campaign.hookContract?.trim() || "Build from selected segments, hero product, promo, proof, and avoid rules."}`,
    },
    { title: "Products", body: productContextLines(products) },
    { title: "Segments To Serve Later", body: segmentPromptContext(campaign) },
    { title: "Segment Motivation Map", body: segmentBodyDirectionLines(campaign) },
    { title: "Chosen Concept", body: conceptPrompt(concept, optionLabel) },
    { title: "Option Contrast", body: optionContrast },
    { title: "User Feedback", body: foundationRevisionPrompt(revision) },
  ]);

  return { system, user };
}

function subjectPatchSchema(campaign: Campaign): string {
  const [dev0 = "open-loop", dev1 = "pattern-interrupt", dev2 = "playful-conceit"] =
    BRANDS[campaign.brandId]?.subjectDevices ?? [];
  return campaign.segments
    .map((id) => `"${segJsonKey(id)}":{"subject":"","preheader":"","style":"","model_hint":"","shared_thread":"","options":[{"style":"${dev0}","model_hint":"${dev0}","subject":"","preheader":"","shared_thread":""},{"style":"${dev1}","model_hint":"${dev1}","subject":"","preheader":"","shared_thread":""},{"style":"${dev2}","model_hint":"${dev2}","subject":"","preheader":"","shared_thread":""}]}`)
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
  const anchorJson = JSON.stringify(compactAnchorSummary(anchor)).slice(0, 7000);
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
  const parsed = await createAndParseWithModel(system, user, selection, {
    temperature: optionLabel === "B" ? AI_TEMP_B : AI_TEMP_A,
    maxOutputTokens: SEGMENT_PATCH_OUTPUT_TOKENS,
    schema: segmentPatchJsonSchema(campaign.segments),
  });
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
  const validated = sanitizeAndValidateBrief(base, campaign, products);
  validated._provider = provider;
  validated._model = model;
  validated._prompt_version = PROMPT_REGISTRY_VERSION;
  return validated;
}

function sanitizeAndValidateBrief(brief: GenBrief, campaign: Campaign, products: Product[]): GenBrief {
  applySanitizeCopy(brief, campaign.brandId);
  return validateBrief(brief, campaign, products);
}

const QUALITY_REPAIR_THRESHOLD = Number(process.env.AI_QUALITY_REPAIR_THRESHOLD || 78);
const QUALITY_REPAIR_MAX_FLAGS = Number(process.env.AI_QUALITY_REPAIR_MAX_FLAGS || 10);
const CREATIVE_REPAIR_THRESHOLD = Number(process.env.AI_CREATIVE_REPAIR_THRESHOLD || 62);

function qualityRepairEnabled(): boolean {
  return !/^(0|false|off|no)$/i.test(process.env.AI_QUALITY_REPAIR || "");
}

function creativeRepairEnabled(): boolean {
  return !/^(0|false|off|no)$/i.test(process.env.AI_CREATIVE_REPAIR || "");
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

function isHardContrastIssue(issue: string): boolean {
  return !/product grid has identical product order/i.test(issue);
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

function shouldKeepCreativeRepair(original: GenBrief, repaired: GenBrief): boolean {
  const oErr = (original._flags || []).filter((f) => f.type === "error").length;
  const rErr = (repaired._flags || []).filter((f) => f.type === "error").length;
  if (rErr > oErr) return false;
  if (countComplianceImpact(repaired) > countComplianceImpact(original)) return false;
  const before = original._creative_score ?? 0;
  const after = repaired._creative_score ?? 0;
  return after >= CREATIVE_REPAIR_THRESHOLD || after >= before + 8;
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

function buildCreativeRepairPrompt(optionLabel: "A" | "B", brief: GenBrief): string {
  const current = JSON.stringify(briefRevisionSummary(brief)).slice(0, 18000);
  return `CREATIVE REPAIR PASS FOR OPTION ${optionLabel}

The brief is compliant, but the copy is too formulaic or sales-led. Rewrite only customer-facing creative copy enough to raise the creative score while preserving all facts, products, prices, reviews, links, offer limits, and the current concept tuple.

Required changes:
1. Open body copy with one concrete scene, named-person note, or specific reader moment.
2. Keep each segment body 120-150 words, first-person from the brand persona, and less salesy.
3. Mention price/discount once in body max and free shipping once max.
4. Make subject/preheader/banner/body share the same thread, but avoid cloning sentence structure.
5. Keep product block text concise for image overlays.

Current brief JSON:
${current}

Return the complete corrected brief JSON using the exact same schema. Do not add prose or markdown fences.`;
}

async function repairCreativityIfNeeded(
  optionLabel: "A" | "B",
  brief: GenBrief,
  campaign: Campaign,
  products: Product[],
  selection: AIModelSelection
): Promise<GenBrief> {
  if (!creativeRepairEnabled()) return brief;
  if ((brief._creative_score ?? 100) >= CREATIVE_REPAIR_THRESHOLD) return brief;
  if ((brief._flags || []).some((f) => f.type === "error")) return brief;

  try {
    const repaired = sanitizeAndValidateBrief(
      (await createAndParseWithModel(REPAIR_SYSTEM, buildCreativeRepairPrompt(optionLabel, brief), selection, {
        temperature: Math.max(AI_REPAIR_TEMP, 0.7),
        schema: genBriefJsonSchema(campaign.segments, true),
      })) as unknown as GenBrief,
      campaign,
      products
    );
    if (shouldKeepCreativeRepair(brief, repaired)) {
      console.info(`[generate-copy] creative repair kept for option ${optionLabel}: ${brief._creative_score ?? "?"} -> ${repaired._creative_score ?? "?"}`);
      return repaired;
    }
    console.info(`[generate-copy] creative repair discarded for option ${optionLabel}: ${brief._creative_score ?? "?"} -> ${repaired._creative_score ?? "?"}`);
    return brief;
  } catch (err) {
    console.warn(`[generate-copy] creative repair failed for option ${optionLabel}: ${err instanceof Error ? err.message : "unknown error"}`);
    return brief;
  }
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
  if (!flags.length) return repairCreativityIfNeeded(optionLabel, brief, campaign, products, selection);

  try {
    const repaired = sanitizeAndValidateBrief(
      (await createAndParseWithModel(REPAIR_SYSTEM, buildQualityRepairPrompt(optionLabel, brief, flags), selection, {
        temperature: AI_REPAIR_TEMP,
        schema: genBriefJsonSchema(campaign.segments, true),
      })) as unknown as GenBrief,
      campaign,
      products
    );
    if (shouldKeepRepair(brief, repaired)) {
      console.info(`[generate-copy] quality repair kept for option ${optionLabel}: ${brief._score ?? "?"} -> ${repaired._score ?? "?"}`);
      return repairCreativityIfNeeded(optionLabel, repaired, campaign, products, selection);
    }
    console.info(`[generate-copy] quality repair discarded for option ${optionLabel}: ${brief._score ?? "?"} -> ${repaired._score ?? "?"}`);
    return repairCreativityIfNeeded(optionLabel, brief, campaign, products, selection);
  } catch (err) {
    console.warn(`[generate-copy] quality repair failed for option ${optionLabel}: ${err instanceof Error ? err.message : "unknown error"}`);
    return repairCreativityIfNeeded(optionLabel, brief, campaign, products, selection);
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
        createFullBriefWithModel(sysA, usrA, models.a, campaign, { temperature: AI_TEMP_A }),
        createFullBriefWithModel(sysBInitial, usrB, models.b, campaign, { temperature: AI_TEMP_B }),
      ]);
      aFailure = aSettled.status === "rejected" ? aSettled.reason : undefined;
      bFailure = bSettled.status === "rejected" ? bSettled.reason : undefined;
      a = aSettled.status === "fulfilled" ? sanitizeAndValidateBrief(aSettled.value as unknown as GenBrief, campaign, products) : undefined;
      b = bSettled.status === "fulfilled" ? sanitizeAndValidateBrief(bSettled.value as unknown as GenBrief, campaign, products) : undefined;
      [a, b] = await Promise.all([
        a ? repairBriefIfNeeded("A", a, campaign, products, sysA, models.a) : Promise.resolve(undefined),
        b ? repairBriefIfNeeded("B", b, campaign, products, sysBInitial, models.b) : Promise.resolve(undefined),
      ]);
    } else {
      try {
        a = sanitizeAndValidateBrief((await createFullBriefWithModel(sysA, usrA, models.a, campaign, { temperature: AI_TEMP_A })) as unknown as GenBrief, campaign, products);
        a = await repairBriefIfNeeded("A", a, campaign, products, sysA, models.a);
        stampBrief(a, models.a, campaignA.bodyVariety);
      } catch (err) {
        aFailure = err;
      }

      const bMessages = buildOptionBMessages(a);
      sysBInitial = bMessages.system;
      usrB = bMessages.user;
      try {
        b = sanitizeAndValidateBrief((await createFullBriefWithModel(sysBInitial, usrB, models.b, campaign, { temperature: AI_TEMP_B })) as unknown as GenBrief, campaign, products);
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
      if (a) applySanitizeCopy(a, campaign.brandId);
      if (b) applySanitizeCopy(b, campaign.brandId);
      const failedLabel = a ? "B" : "A";
      const why = errMessage(a ? bFailure : aFailure);
      console.warn(`[generate-copy] option ${failedLabel} failed, returning the other: ${why}`);
      return { a, b, warning: `Option ${failedLabel} failed (${why}). Generated the other option only — regenerate to retry the missing one.` };
    }

    // Auto-retry once if B collapses into A's strategy, route, body, banner, or product-copy shape.
    const contrastProblems = briefContrastIssues(a, b).filter(isHardContrastIssue);
    if (contrastProblems.length > 0) {
      const sysB = overrides?.system?.trim()
        ? overrides.system.trim() + "\n" + contrastInstruction(a.creative_direction)
        : buildSystemPrompt(campaignB, products, true, a.creative_direction, `${nonceB}:retry`);
      const retry = `${usrB}

WARNING: A/B contrast failed:
${contrastProblems.map((problem, i) => `${i + 1}. ${problem}`).join("\n")}

Regenerate Option B with a different production branch/brief_route, subject family, body architecture, banner pattern, product-grid emphasis, and proof path. Preserve supplied facts and the JSON schema.`;
      b = sanitizeAndValidateBrief((await createFullBriefWithModel(sysB, retry, models.b, campaign, { temperature: AI_TEMP_B_RETRY })) as unknown as GenBrief, campaign, products);
      b = await repairBriefIfNeeded("B", b, campaign, products, sysB, models.b);
      stampBrief(b, models.b, campaignB.bodyVariety);
    }

    applySanitizeCopy(a, campaign.brandId);
    applySanitizeCopy(b, campaign.brandId);
    [a, b] = validateBriefPair(a, b);

    console.info(`[generate-copy] completed A/B${batchContext ? ` batch ${batchContext.index}/${batchContext.total}` : ""} in ${Math.round((Date.now() - startedAt) / 1000)}s using ${models.a.provider}:${models.a.model} + ${models.b.provider}:${models.b.model}`);
    return { a, b };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Generation failed" };
  }
}

async function createOptionFoundation(
  campaign: Campaign,
  products: Product[],
  optionLabel: "A" | "B",
  selection: AIModelSelection,
  variety: BodyVarietyProfile | undefined,
  concept: EmailConcept,
  revision?: RevisionFeedback,
  optionAAnchor?: GenBrief
): Promise<GenBrief> {
  const { system, user } = buildFoundationPrompt(campaign, products, optionLabel, selection, concept, revision, optionAAnchor);
  const parsed = await createFoundationBriefWithModel(system, user, selection, {
    temperature: optionLabel === "B" ? AI_TEMP_B : AI_TEMP_A,
  });
  const brief = normalizeFoundationBrief(parsed, campaign);
  brief.creative_direction = {
    ...(brief.creative_direction || {}),
    angle: concept.angle,
    framework: concept.framework,
    concept,
    branch: brief.creative_direction?.branch || concept.format,
    source_pattern: brief.creative_direction?.source_pattern || concept.creativeDevice,
  };
  brief.quality_checks = {
    ...(brief.quality_checks || {}),
    opener_mechanic: brief.quality_checks?.opener_mechanic || concept.openerMechanic,
  };
  return stampBrief(brief, selection, variety) as GenBrief;
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
    const startedAt = Date.now();
    const allSegmentContext = segmentPromptContext(campaign);
    const nonceA = `${randomUUID()}:${models.a.provider}:${models.a.model}:A:foundation`;
    const nonceB = `${randomUUID()}:${models.b.provider}:${models.b.model}:B:foundation`;
    const campaignA = withOptionVariety(campaign, nonceA);
    const campaignB = withOptionVariety(campaign, nonceB);
    const concepts = selectEmailConceptPair(campaign, products);
    const warnings: string[] = [];
    let optionAAnchor: GenBrief | undefined;
    let optionBAnchor: GenBrief | undefined;
    let aFailure: unknown;
    let bFailure: unknown;

    console.info(`[generate-copy] layered generation for ${campaign.segments.length} segments: 2 foundations + ${total} segment batch(es)`);

    try {
      optionAAnchor = await createOptionFoundation(campaignA, products, "A", models.a, campaignA.bodyVariety, concepts.a, revision);
    } catch (err) {
      aFailure = err;
      warnings.push(`foundation A: ${errMessage(err)}`);
    }

    try {
      optionBAnchor = await createOptionFoundation(campaignB, products, "B", models.b, campaignB.bodyVariety, concepts.b, revision, optionAAnchor);
    } catch (err) {
      bFailure = err;
      warnings.push(`foundation B: ${errMessage(err)}`);
    }

    if (!optionAAnchor && !optionBAnchor) return { error: bestFailureMessage([aFailure, bFailure]) };

    const segmentResults = await mapWithConcurrency(
      chunks,
      SEGMENT_BATCH_CONCURRENCY,
      (segments, index) =>
        generateSegmentCopyBatch(
          withSegments(campaign, segments),
          products,
          models,
          revision,
          {
            index: index + 1,
            total,
            allSegments: campaign.segments,
            allSegmentContext,
            optionAAnchor,
            optionBAnchor,
          }
        )
    );

    segmentResults.forEach((result, index) => {
      const label = `batch ${index + 1}/${total}`;
      if (result.error) warnings.push(`${label}: ${result.error}`);
      if (result.warning) warnings.push(`${label}: ${result.warning}`);
      if (optionAAnchor && !result.a) warnings.push(`${label}: missing Option A`);
      if (optionBAnchor && !result.b) warnings.push(`${label}: missing Option B`);
    });

    const aBatches: SegmentBatchPart[] = optionAAnchor
      ? [optionAAnchor, ...segmentResults.map((result) => result.a).filter((brief): brief is SegmentBatchPart => !!brief)]
      : [];
    const bBatches: SegmentBatchPart[] = optionBAnchor
      ? [optionBAnchor, ...segmentResults.map((result) => result.b).filter((brief): brief is SegmentBatchPart => !!brief)]
      : [];
    if (!aBatches.length && !bBatches.length) {
      return { error: warnings[0] || "No segment batch returned usable output" };
    }

    let a = aBatches.length
      ? mergeOptionBatches(campaign, products, aBatches, optionAAnchor?._provider, optionAAnchor?._model)
      : undefined;
    let b = bBatches.length
      ? mergeOptionBatches(campaign, products, bBatches, optionBAnchor?._provider, optionBAnchor?._model)
      : undefined;

    if (a && b) {
      const hardContrast = briefContrastIssues(a, b).filter(isHardContrastIssue);
      if (hardContrast.length && optionAAnchor) {
        try {
          warnings.push(`contrast retry: ${hardContrast.slice(0, 3).join("; ")}`);
          const retrySeedCampaign = { ...campaign, theme: `${campaign.theme} contrast retry ${hardContrast.join(" ")}` };
          const retryConcept = selectEmailConceptPair(retrySeedCampaign, products).b;
          const retryCampaignB = withOptionVariety(campaign, `${nonceB}:retry:${hardContrast.length}`);
          const retryAnchor = await createOptionFoundation(retryCampaignB, products, "B", models.b, retryCampaignB.bodyVariety, retryConcept, revision, optionAAnchor);
          const retrySegments = await mapWithConcurrency(
            chunks,
            SEGMENT_BATCH_CONCURRENCY,
            (segments, index) =>
              generateSegmentCopyBatch(
                withSegments(campaign, segments),
                products,
                models,
                revision,
                {
                  index: index + 1,
                  total,
                  allSegments: campaign.segments,
                  allSegmentContext,
                  optionBAnchor: retryAnchor,
                }
              )
          );
          retrySegments.forEach((result, index) => {
            const label = `contrast retry batch ${index + 1}/${total}`;
            if (result.error) warnings.push(`${label}: ${result.error}`);
            if (result.warning) warnings.push(`${label}: ${result.warning}`);
            if (!result.b) warnings.push(`${label}: missing Option B`);
          });
          const retryBatches: SegmentBatchPart[] = [
            retryAnchor,
            ...retrySegments.map((result) => result.b).filter((brief): brief is SegmentBatchPart => !!brief),
          ];
          b = mergeOptionBatches(campaign, products, retryBatches, retryAnchor._provider, retryAnchor._model);
        } catch (err) {
          warnings.push(`contrast retry failed: ${errMessage(err)}`);
        }
      }
    }

    if (a && b) [a, b] = validateBriefPair(a, b);

    const warning = warnings.length
      ? `Some segment batches were incomplete: ${warnings.slice(0, 6).join(" · ")}${warnings.length > 6 ? ` · +${warnings.length - 6} more` : ""}. Generated all usable copy; missing segments are flagged in Output.`
      : undefined;

    console.info(`[generate-copy] completed layered A/B in ${Math.round((Date.now() - startedAt) / 1000)}s across ${total} segment batch(es)`);
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
  if (!hasPromptOverrides(overrides) && campaign.segments.length >= SEGMENT_BATCH_THRESHOLD) {
    return generateOptionsBatched(campaign, products, modelInput, revision);
  }
  return generateOptionsSingle(campaign, products, overrides, modelInput, revision);
}
