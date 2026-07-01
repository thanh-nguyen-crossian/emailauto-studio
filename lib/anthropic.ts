import Anthropic from "@anthropic-ai/sdk";
import type { Message, MessageCreateParamsNonStreaming, Tool } from "@anthropic-ai/sdk/resources/messages";
import { randomUUID } from "crypto";
import type { AIModelPair, AIModelSelection, BodyVarietyProfile, Campaign, Product } from "./config/types";
import { modelSpeedTier, normalizeModelPair, providerLabel, type AIModelSpeedTier } from "./config/aiModels";
import { foundationBriefJsonSchema, genBriefJsonSchema, segmentPatchJsonSchema, type ProviderJsonSchema } from "./anthropic/schema";
import { conceptPrompt, selectEmailConceptPair, type EmailConcept } from "./concept";
import {
  artificialProofPromptLayer,
  brandPlaybookRuleBlock,
  bodyHomepageLinkInstruction,
  briefContrastIssues,
  buildSystemPrompt,
  buildUserPrompt,
  campaignThemeInstruction,
  contrastInstruction,
  creativeSurfaceVarietyPrompt,
  isComplianceRepairFlag,
  isHighImpactFlag,
  legacyPromptAlignmentLayer,
  promoLine,
  PROMPT_REGISTRY_VERSION,
  renderPromptLayers,
  requiredProductInstruction,
  segJsonKey,
  segmentBodyDirectionLines,
  segmentPromptContext,
  selectVarietyProfile,
  templateCorpusPromptLayer,
  validateBrief,
  validateBriefPair,
  type GenBrief,
} from "./briefgen";
import { BRANDS, bodyHomepageLinkPolicy, requiredProductSlugs } from "./config/brands";
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
const AI_SOFT_DEADLINE_MS = envInteger("AI_SOFT_DEADLINE_MS", 240_000, 60_000, 295_000);
const PATCH_PROVIDER_TIMEOUT_MS = envInteger(
  "AI_PATCH_PROVIDER_TIMEOUT_MS",
  Math.min(60_000, PROVIDER_TIMEOUT_MS),
  20_000,
  PROVIDER_TIMEOUT_MS
);

const OPTION_B_INITIAL_CONTRAST = `\nOPTION B CONTRAST REQUIREMENT:
You are writing Option B in parallel with Option A. Deliberately avoid the obvious/default route.
Pick a distinct angle, framework, opener mechanic, emotional arc, visual direction, CTA wording, and proof role.
Do not wait to see Option A; make Option B a clearly different usable challenger.`;

const REPAIR_SYSTEM = `You are an email copy repair specialist. Fix the listed playbook violations in the provided brief with minimal rewriting. Preserve all creative direction, product facts, prices, URLs, and supplied reviews. Return one complete JSON object in the same schema — no prose, no fences.`;

// Layered generation starts at/above this segment count. Default 1 means "use the bounded
// foundation + segment-patch path by default"; only 1-segment prompt overrides use legacy single.
const SEGMENT_BATCH_THRESHOLD = Math.max(1, Number(process.env.AI_SEGMENT_BATCH_THRESHOLD || 1));
const SEGMENT_BATCH_SIZE_OVERRIDE = process.env.AI_SEGMENT_BATCH_SIZE ? Math.max(1, Number(process.env.AI_SEGMENT_BATCH_SIZE)) : null;
const SEGMENT_BATCH_CONCURRENCY_OVERRIDE = process.env.AI_SEGMENT_BATCH_CONCURRENCY ? Math.max(1, Number(process.env.AI_SEGMENT_BATCH_CONCURRENCY)) : null;
const AB_FAST_PARALLEL = /^(1|true|on|yes)$/i.test(process.env.AI_AB_FAST_PARALLEL || "");
const AI_GENERATION_TELEMETRY = /^(1|true|on|yes)$/i.test(process.env.AI_GENERATION_TELEMETRY || process.env.AI_PROMPT_DEBUG || "");

const MAX_OUTPUT_TOKENS = envInteger("AI_MAX_OUTPUT_TOKENS", 18000, 4000, 64000);
const FOUNDATION_OUTPUT_TOKENS = envInteger("AI_FOUNDATION_OUTPUT_TOKENS", 9000, 4000, 20000);

interface ModelCallOptions {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  schema?: ProviderJsonSchema;
  timeoutMs?: number;
  deadlineAt?: number;
  stage?: string;
  signal?: AbortSignal;
}

export type GenerationEvent =
  | { type: "stage"; stage: string; message?: string; option?: "a" | "b"; batch?: number; total?: number; elapsedMs?: number }
  | { type: "progress"; stage: string; done: number; total: number; message?: string; elapsedMs?: number }
  | { type: "partial"; option: "a" | "b"; brief: GenBrief; warning?: string; elapsedMs?: number }
  | { type: "warning"; message: string; elapsedMs?: number }
  | { type: "done"; a?: GenBrief; b?: GenBrief; warning?: string; elapsedMs?: number }
  | { type: "error"; message: string; elapsedMs?: number }
  | { type: "heartbeat"; elapsedMs?: number };

export type GenerationEventHandler = (event: GenerationEvent) => void;

interface GenerationRuntime {
  startedAt: number;
  softDeadlineAt: number;
  onEvent?: GenerationEventHandler;
  signal?: AbortSignal;
}

const PROVIDER_ENV: Record<string, string> = {
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
};

function elapsedMs(runtime?: GenerationRuntime): number | undefined {
  return runtime ? Date.now() - runtime.startedAt : undefined;
}

function emit(runtime: GenerationRuntime | undefined, event: GenerationEvent): void {
  runtime?.onEvent?.({ ...event, elapsedMs: event.elapsedMs ?? elapsedMs(runtime) });
}

function runtimeFrom(onEvent?: GenerationEventHandler, signal?: AbortSignal): GenerationRuntime {
  const startedAt = Date.now();
  return { startedAt, softDeadlineAt: startedAt + AI_SOFT_DEADLINE_MS, onEvent, signal };
}

/** @internal exported for unit testing only */
export function remainingDeadlineMs(options?: Pick<ModelCallOptions, "deadlineAt">): number {
  if (!options?.deadlineAt) return Number.POSITIVE_INFINITY;
  return options.deadlineAt - Date.now();
}

/** @internal exported for unit testing only */
export function hasDeadlineBudget(options: Pick<ModelCallOptions, "deadlineAt" | "timeoutMs">, reserveMs = 2_500): boolean {
  return remainingDeadlineMs(options) > (options.timeoutMs ?? PROVIDER_TIMEOUT_MS) + reserveMs;
}

function pairSpeedTier(models: AIModelPair): AIModelSpeedTier {
  const tiers = [modelSpeedTier(models.a), modelSpeedTier(models.b)];
  if (tiers.includes("frontier")) return "frontier";
  if (tiers.every((tier) => tier === "fast")) return "fast";
  return "balanced";
}

export function adaptiveBatchSettings(models: AIModelPair, segmentCount: number): { batchSize: number; concurrency: number; tier: AIModelSpeedTier } {
  const tier = pairSpeedTier(models);
  const count = Math.max(1, segmentCount);
  const targetBatches = tier === "fast" ? 4 : tier === "balanced" ? 3 : 2;
  const maxBatchSize = tier === "fast" ? 8 : tier === "balanced" ? 6 : 4;
  const fallbackBatchSize = Math.min(maxBatchSize, Math.max(2, Math.ceil(count / targetBatches)));
  const fallbackConcurrency = tier === "frontier" ? 1 : Math.min(tier === "fast" ? 3 : 2, Math.ceil(count / fallbackBatchSize));
  return {
    batchSize: SEGMENT_BATCH_SIZE_OVERRIDE || fallbackBatchSize,
    concurrency: SEGMENT_BATCH_CONCURRENCY_OVERRIDE || fallbackConcurrency,
    tier,
  };
}

function segmentPatchOutputTokens(segmentCount: number): number {
  return Math.min(MAX_OUTPUT_TOKENS, Math.min(16000, 4200 + Math.max(1, segmentCount) * 1700));
}

function softDeadlineWarning(runtime: GenerationRuntime, stage: string): string | null {
  const remaining = runtime.softDeadlineAt - Date.now();
  if (remaining > PATCH_PROVIDER_TIMEOUT_MS + 8_000) return null;
  return `${stage} stopped near the ${Math.round(AI_SOFT_DEADLINE_MS / 1000)}s soft deadline; generated partial copy is preserved.`;
}

function hasGenerationBudget(runtime: GenerationRuntime | undefined, timeoutMs = PROVIDER_TIMEOUT_MS, reserveMs = 5_000): boolean {
  if (!runtime) return true;
  return hasDeadlineBudget({ deadlineAt: runtime.softDeadlineAt, timeoutMs }, reserveMs);
}

function telemetry(event: string, data: Record<string, unknown>): void {
  if (!AI_GENERATION_TELEMETRY) return;
  console.info(`[generation-telemetry] ${event} ${JSON.stringify(data)}`);
}

/** True when parseStrictJson had to fall back to salvagePartialJson (see the marker it stamps). */
function isSalvagedResult(parsed: Record<string, unknown>): boolean {
  const advisory = Array.isArray(parsed._advisory) ? (parsed._advisory as { msg?: unknown }[]) : [];
  return advisory.some((a) => typeof a?.msg === "string" && a.msg.includes("truncated and salvaged"));
}

/**
 * Top-level keys that are missing, null, or empty (string/array/object) — used for salvage telemetry.
 * @internal exported for unit testing only
 */
export function missingOrEmptyTopLevelKeys(obj: Record<string, unknown>, keys: readonly string[] | undefined): string[] {
  if (!keys?.length) return [];
  return keys.filter((k) => {
    const v = obj[k];
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return v.trim() === "";
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "object") return Object.keys(v as object).length === 0;
    return false;
  });
}

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

function patchTimeoutForSelection(selection: AIModelSelection): number {
  const tier = modelSpeedTier(selection);
  // Segment patches are recoverable from the foundation brief, so keep slow models bounded here.
  // This still calls the user-selected model, but it falls back locally before the route deadline is eaten.
  if (tier === "balanced") return Math.min(Math.round(PATCH_PROVIDER_TIMEOUT_MS * 1.25), 60_000, PROVIDER_TIMEOUT_MS);
  if (tier === "frontier") return Math.min(Math.max(PATCH_PROVIDER_TIMEOUT_MS, 45_000), 60_000, PROVIDER_TIMEOUT_MS);
  return PATCH_PROVIDER_TIMEOUT_MS;
}

function timeoutMessage(provider: string, model: string, timeoutMs = PROVIDER_TIMEOUT_MS): string {
  return `${provider} ${model} timed out after ${Math.round(timeoutMs / 1000)} seconds. Try a faster model such as Claude Haiku, Gemini Flash/Lite, or a GPT mini/nano model, or reduce segments/products.`;
}

function truncatedMessage(provider: string, model: string, maxOutputTokens = MAX_OUTPUT_TOKENS): string {
  return `${provider} ${model} hit the ${Math.round(maxOutputTokens / 1000)}k output-token limit before finishing the JSON — reduce segments/products (or lower the subject-option count), or reset prompt edits so layered generation can split the work.`;
}

const PROMPT_OVERRIDE_MAX_CHARS = envInteger("AI_PROMPT_OVERRIDE_MAX_CHARS", 2200, 500, 8000);
const PROMPT_ANCHOR_MAX_CHARS = envInteger("AI_PROMPT_ANCHOR_MAX_CHARS", 4400, 1500, 12000);

/** @internal exported for unit testing only */
export function compactPromptText(text: string, maxChars: number): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 14)).trimEnd()} [truncated]`;
}

function isTruncationError(err: unknown): boolean {
  return /token limit|max_output|max tokens|MAX_TOKENS|before finishing|No complete JSON/i.test(errMessage(err));
}

function generationAbortError(): Error {
  const err = new Error("Generation cancelled");
  err.name = "AbortError";
  return err;
}

function isGenerationAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw generationAbortError();
}

function throwIfAnyAbort(reasons: unknown[]): void {
  if (reasons.some(isGenerationAbortError)) throw generationAbortError();
}

function runtimeCallOptions(runtime?: GenerationRuntime): Pick<ModelCallOptions, "deadlineAt" | "signal"> {
  return { deadlineAt: runtime?.softDeadlineAt, signal: runtime?.signal };
}

async function fetchJsonWithTimeout<T>(
  provider: string,
  model: string,
  url: string,
  init: RequestInit,
  timeoutMs = PROVIDER_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<{ res: Response; data: T }> {
  throwIfAborted(signal);
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as T;
    return { res, data };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if (!timedOut) throw generationAbortError();
      throw new Error(timeoutMessage(provider, model, timeoutMs));
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function createText(system: string, user: string, selection: AIModelSelection, options: ModelCallOptions = {}): Promise<string> {
  if (selection.provider === "claude") return callClaude(system, user, selection.model, options);
  if (selection.provider === "gemini") return callGemini(system, user, selection.model, options);
  if (selection.provider === "openai") return callOpenAI(system, user, selection.model, options);
  throw new Error(`Unsupported AI provider: ${selection.provider}`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  let onAbort: (() => void) | undefined;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    onAbort = () => {
      clearTimeout(timer);
      reject(generationAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  }).finally(() => {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  });
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
    throwIfAborted(options.signal);
    if (attempt > 0 && !hasDeadlineBudget(options, AI_PROVIDER_RETRY_BASE_MS * 2 ** attempt)) break;
    try {
      return await createText(system, user, selection, options);
    } catch (err) {
      lastErr = err;
      if (isGenerationAbortError(err)) throw err;
      if (attempt >= AI_PROVIDER_RETRIES || !isTransientProviderError(err)) break;
      const backoff = AI_PROVIDER_RETRY_BASE_MS * 2 ** attempt;
      const jitter = Math.round(backoff * 0.2 * Math.random());
      if (Date.now() + backoff + jitter + (options.timeoutMs ?? PROVIDER_TIMEOUT_MS) > (options.deadlineAt ?? Number.POSITIVE_INFINITY)) {
        break;
      }
      await sleep(backoff + jitter, options.signal);
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
      const parsed = parseStrictJson(raw);
      if (isSalvagedResult(parsed)) {
        // No token-usage accounting exists at this layer for any provider yet — rawLength is the
        // closest available proxy for how much of the response the salvage path had to discard.
        telemetry("salvage", {
          stage: options.stage || "unknown",
          provider: selection.provider,
          model: selection.model,
          attempt,
          rawLength: raw.length,
          missingOrEmptyKeys: missingOrEmptyTopLevelKeys(parsed, options.schema?.schema.required),
        });
      }
      return parsed;
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
  throwIfAborted(options.signal);
  const temperature = options.temperature ?? AI_TEMP_A;
  const maxOutputTokens = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS;
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
    const requestOptions = { timeout: timeoutMs, signal: options.signal };
    resp = AI_CLAUDE_STREAMING
      ? await getClient().messages.stream(payload, requestOptions).finalMessage()
      : await getClient().messages.create(payload, requestOptions);
  } catch (err) {
    if (err instanceof Error && isOutputBudgetParamError(err.message)) {
      const nextBudget = reducedOutputBudget(maxOutputTokens);
      if (nextBudget) return callClaude(system, user, model, { ...options, maxOutputTokens: nextBudget });
    }
    if (tool && err instanceof Error && isSchemaParamError(err.message)) {
      return callClaude(system, user, model, { ...options, schema: undefined });
    }
    if (err instanceof Error && /timeout|timed out|abort/i.test(err.message)) {
      if (options.signal?.aborted || isGenerationAbortError(err)) throw generationAbortError();
      throw new Error(timeoutMessage("Claude", model, timeoutMs));
    }
    throw err;
  }
  if (resp.stop_reason === "max_tokens") throw new Error(truncatedMessage("Claude", model, maxOutputTokens));
  return textFromClaudeMessage(resp);
}

async function callGemini(system: string, user: string, model: string, options: ModelCallOptions = {}): Promise<string> {
  throwIfAborted(options.signal);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const temperature = options.temperature ?? AI_TEMP_A;
  const topP = options.topP ?? AI_TOP_P;
  const maxOutputTokens = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS;
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
  }, timeoutMs, options.signal);
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
  throwIfAborted(options.signal);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const topP = options.topP ?? AI_TOP_P;
  const maxOutputTokens = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS;
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
    }, timeoutMs, options.signal);

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
    _technique_score: _dropTechniqueScore,
    _technique_coverage: _dropTechniqueCoverage,
    _provider: _dropProvider,
    _model: _dropModel,
    _prompt_version: _dropPromptVersion,
    body_variety: _dropVariety,
    ...copy
  } = brief as GenBrief & Record<string, unknown>;
  void _dropFlags;
  void _dropAdvisory;
  void _dropScore;
  void _dropTechniqueScore;
  void _dropTechniqueCoverage;
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
      bannerPattern: brief.body_variety.bannerPattern,
      productGridPattern: brief.body_variety.productGridPattern,
      productBlockRole: brief.body_variety.productBlockRole,
      ctaStyle: brief.body_variety.ctaStyle,
      bodyPlacement: brief.body_variety.bodyPlacement,
      copyTactics: brief.body_variety.copyTactics,
    } : undefined,
    opener_mechanic: brief.quality_checks?.opener_mechanic,
    first_product: brief.products?.[0] ? {
      name: brief.products[0].name,
    } : undefined,
  };
  return `\nOPTION A CREATIVE MAP TO CONTRAST AGAINST:
${compactPromptText(JSON.stringify(anchor), 1800)}

Use this only as an anti-collision fingerprint, not source copy. Generate Option B from its own concept and choose a different hook contract emphasis, reader entry point, proof path, banner headline family, and payoff. Do not mirror Option A phrasing or sentence architecture.`;
}

function appendRevisionFeedback(user: string, revision?: RevisionFeedback): string {
  const feedback = revision?.feedback?.trim();
  if (!feedback) return user;
  const current = JSON.stringify({
    a: summarizeBriefForContext(revision?.existingOptions?.a),
    b: summarizeBriefForContext(revision?.existingOptions?.b),
  });
  return `${user}

USER FEEDBACK FOR REGENERATION:
${compactPromptText(feedback, 1200)}

CURRENT GENERATED OPTIONS CONTEXT:
${compactPromptText(current, 4000)}

Regenerate complete updated briefs in the same JSON schema. Preserve what still works, fix the feedback directly, keep A/B angle + framework contrast, and re-check every email-campaign-playbook rule before returning JSON.`;
}

function modelExecutionStyle(selection: AIModelSelection): string {
  const label = `${providerLabel(selection.provider)} ${selection.model}`;
  if (selection.provider === "claude") {
    return `${label}: proof-ladder strategist. Prefer mechanism-first clarity, restrained language, evidence before emotion, one risk reducer, quiet CTA. Use supplied facts only; qualify unsupplied proof.`;
  }
  if (selection.provider === "gemini") {
    return `${label}: visual-curiosity storyteller. Prefer sensory scene, suspended-loop tension, occasion/use moment, product as resolution, richer image guidance. Keep visuals product-readable.`;
  }
  if (selection.provider === "openai") {
    return `${label}: direct-response editor. Prefer PAS/AIDA, offer clarity, named product solution, price/deadline once, tight hierarchy, CTA <=3 words, no filler.`;
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
    bannerPattern: variety.bannerPattern,
    productGridPattern: variety.productGridPattern,
    productBlockRole: variety.productBlockRole,
    ctaStyle: variety.ctaStyle,
    bodyPlacement: variety.bodyPlacement,
    copyTactics: variety.copyTactics,
  };
}

function withOptionVariety(campaign: Campaign, nonce: string): Campaign {
  return { ...campaign, bodyVariety: selectVarietyProfile(campaign, nonce) };
}

function varietyCollisionCount(a?: BodyVarietyProfile, b?: BodyVarietyProfile): number {
  if (!a || !b) return 0;
  const fields: (keyof BodyVarietyProfile)[] = [
    "openerMechanic",
    "emotionalArc",
    "creativeLens",
    "proofRole",
    "subjectStyle",
    "visualDirection",
    "bannerPattern",
    "productGridPattern",
    "productBlockRole",
    "ctaStyle",
    "bodyPlacement",
  ];
  return fields.filter((field) => {
    const left = a[field];
    const right = b[field];
    return String(Array.isArray(left) ? left.join("|") : left || "") === String(Array.isArray(right) ? right.join("|") : right || "");
  }).length;
}

function withContrastingOptionVariety(campaign: Campaign, nonce: string, avoid?: BodyVarietyProfile): Campaign {
  let best = selectVarietyProfile(campaign, nonce);
  let bestScore = varietyCollisionCount(avoid, best);
  for (
    let i = 1;
    avoid && i <= 12 && (
      best.productGridPattern === avoid.productGridPattern ||
      best.bannerPattern === avoid.bannerPattern ||
      best.openerMechanic === avoid.openerMechanic ||
      best.subjectStyle === avoid.subjectStyle ||
      bestScore > 2
    );
    i++
  ) {
    const candidate = selectVarietyProfile(campaign, `${nonce}:contrast:${i}`);
    const score = varietyCollisionCount(avoid, candidate);
    if (
      score < bestScore ||
      (candidate.productGridPattern !== avoid.productGridPattern &&
        candidate.bannerPattern !== avoid.bannerPattern &&
        candidate.openerMechanic !== avoid.openerMechanic &&
        candidate.subjectStyle !== avoid.subjectStyle)
    ) {
      best = candidate;
      bestScore = score;
    }
    if (
      bestScore <= 2 &&
      best.productGridPattern !== avoid.productGridPattern &&
      best.bannerPattern !== avoid.bannerPattern &&
      best.subjectStyle !== avoid.subjectStyle
    ) break;
  }
  return { ...campaign, bodyVariety: best };
}

function stampBrief(brief: GenBrief | undefined, selection: AIModelSelection, variety?: BodyVarietyProfile): GenBrief | undefined {
  if (!brief) return brief;
  brief._provider = providerLabel(selection.provider);
  brief._model = selection.model;
  brief._prompt_version = PROMPT_REGISTRY_VERSION;
  if (variety) brief.body_variety = cleanBodyVarietyProfile(variety);
  return brief;
}

function attachConceptToBrief(brief: GenBrief, concept: EmailConcept): GenBrief {
  brief.creative_direction = {
    ...(brief.creative_direction || {}),
    angle: brief.creative_direction?.angle || concept.angle,
    framework: brief.creative_direction?.framework || concept.framework,
    concept: brief.creative_direction?.concept || concept,
    branch: brief.creative_direction?.branch || concept.format,
    source_pattern: brief.creative_direction?.source_pattern || concept.creativeDevice,
  };
  brief.quality_checks = {
    ...(brief.quality_checks || {}),
    opener_mechanic: brief.quality_checks?.opener_mechanic || concept.openerMechanic,
  };
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

/** @internal exported for unit testing only */
export function segmentChunks(segments: string[], batchSize = 1): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < segments.length; i += batchSize) {
    chunks.push(segments.slice(i, i + batchSize));
  }
  return chunks;
}

function withSegments(campaign: Campaign, segments: string[]): Campaign {
  return { ...campaign, segments };
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

function compactSegmentAnchorSummary(brief: GenBrief) {
  const cd = brief.creative_direction || {};
  return {
    creative_direction: {
      angle: cd.angle,
      framework: cd.framework,
      branch: cd.branch,
      brief_route: cd.brief_route,
      source_pattern: cd.source_pattern,
      hook_contract: cd.hook_contract,
      flow: cd.flow,
      differentiator: cd.differentiator,
    },
    theme: compactPromptText(brief.theme || "", 420),
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
    body_base: compactPromptText(brief.body?.base || "", 360),
    ps: brief.ps,
    products: (brief.products || []).map((p) => ({
      slot: p.slot,
      name: p.name,
      template_style: p.template_style,
      main_text: p.main_text,
      sub_text: p.sub_text,
      popup_badge: p.popup_badge,
      usps: (p.usps || []).slice(0, 2),
      cta: p.cta,
    })),
    body_variety: brief.body_variety ? cleanBodyVarietyProfile(brief.body_variety) : undefined,
  };
}

function compactProductContextLines(products: Product[], brandId?: string): string {
  const required = brandId ? new Set(requiredProductSlugs(brandId)) : new Set<string>();
  return products
    .map((p, i) => {
      const usps = (p.usps || []).filter(Boolean).slice(0, 3).map((usp) => compactPromptText(usp, 44)).join("; ") || "none";
      const review = p.review ? ` | review:${compactPromptText(p.review, 90)}` : "";
      return `${i + 1}${i === 0 ? " HERO" : ""}${required.has(p.slug) ? " REQUIRED" : ""}. ${p.name} slug:${p.slug} 💲${p.price || "TBD"} | ${usps}${review}`;
    })
    .join("\n");
}

function compactSegmentPromptContext(campaign: Campaign, maxPerSegment = 140): string {
  return segmentPromptContext(campaign)
    .split("\n")
    .filter(Boolean)
    .map((line) => compactPromptText(line, maxPerSegment))
    .join("\n");
}

function compactSegmentBodyDirectionLines(campaign: Campaign): string {
  return segmentBodyDirectionLines(campaign)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const key = line.match(/body\.[\w_]+/)?.[0] || "body.segment";
      const motive = line.match(/audience motive:\s*(.*?)(?: Entry point:|$)/)?.[1] || "";
      const entry = line.match(/Entry point:\s*(.*?)(?: Do NOT| Soft-sell|$)/)?.[1] || "";
      const soft = line.match(/Soft-sell mode:\s*(.*)$/)?.[1] || "";
      return `• ${key}: motive=${compactPromptText(motive, 110)}; entry=${compactPromptText(entry, 90)}; soft=${compactPromptText(soft, 70)}; unique opener/proof/bridge/final line.`;
    })
    .join("\n");
}

function foundationOutputSchema(products: Product[]): string {
  return `Foundation JSON fields:
- creative_direction: angle, framework, branch, brief_route, source_pattern, hook_contract{segment_insight, emotion, hero_product, proof_or_price, urgency, avoid_rule}, flow, differentiator.
- banner: logo_stars, main_text_1/2/3, sub_text_1/2/3, image_guidance bullets, review_quote, 1-2 review_texts customer-review chips (artificial ratings/reviews/badges allowed freely — no disclaimer needed), main_image, sub_image, trust_booster, emergency, cta, exactly 2 distinct options with same fields and each option has review_texts.
- body.base: designer-facing layout summary only; no segment body copy.
- ps: 10-15 words.
- products: exactly ${products.length} rows, slot 1..${products.length}, name, template_style, main_text, sub_text, popup_badge, 2 short usps, review, cta, main_image, sub_image, alt_text, image_notes.
- quality_checks: enum values from the provided schema.`;
}

function foundationRevisionPrompt(revision?: RevisionFeedback): string {
  const feedback = revision?.feedback?.trim();
  if (!feedback) return "";
  const current = JSON.stringify({
    a: summarizeBriefForContext(revision?.existingOptions?.a),
    b: summarizeBriefForContext(revision?.existingOptions?.b),
  });
  return `User feedback:
${compactPromptText(feedback, 900)}

Current options context:
${compactPromptText(current, 3000)}

Apply feedback to the shared route, banner, product-image brief, P.S., and QA only. Segment subject/body patches will receive the same feedback later.`;
}

function promptOverrideLayer(overrides?: PromptOverrides): string {
  const system = overrides?.system?.trim();
  const user = overrides?.user?.trim();
  if (!system && !user) return "";
  return `The marketer edited the review prompts. Treat the following as steering constraints, but keep this layered call bounded to its output contract and schema.
${system ? `\nEdited system prompt:\n${compactPromptText(system, PROMPT_OVERRIDE_MAX_CHARS)}` : ""}
${user ? `\nEdited user prompt:\n${compactPromptText(user, PROMPT_OVERRIDE_MAX_CHARS)}` : ""}

If the edited text asks for full-email fields outside this call, adapt the relevant instruction to the foundation or segment patch being generated here. Do not abandon the JSON schema.`;
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
  optionAAnchor?: GenBrief,
  overrides?: PromptOverrides
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
      body: `Generate only shared foundation: creative_direction, theme, banner, body.base layout summary, P.S., product-image copy brief, and QA. No subject_lines or per-segment body copy.`,
    },
    {
      title: "Playbook Core",
      body: `One send = one promise. Every shared surface must connect one hero product + one proof/price + one reader situation.
Proof policy: artificial ratings, %-recommend, best-seller/scarcity badges, and short attributed reviews are standard on the banner and product tiles — invent them freely, no disclaimer needed. Never write a fake clinical/study claim ("studies show") or a false verification claim ("verified buyer", "as seen on", "award-winning").
Banner: 3 beats (tension -> proof/mechanism -> resolution/offer) + customer-review chip(s) + 2 distinct layout options, each with its own review_texts. Artificial reviews/ratings are allowed and encouraged. Products are image-overlay copy; main_text <=5w, USPs <=5w, distinct role/use case/mechanism per product.
P.S. is 10-15 words. Renderer handles footer; do not write unsubscribe/footer copy. Tokens allowed: ==accent==, **bold**, [Product](slug:slug), [home text](home).`,
    },
    { title: "Brand Rules", body: brandPlaybookRuleBlock(campaign.brandId) },
    { title: "Artificial Proof Mode", body: artificialProofPromptLayer() },
    { title: "Template Corpus Memory", body: templateCorpusPromptLayer() },
    { title: "Legacy Prompt Alignment", body: legacyPromptAlignmentLayer(campaign.brandId) },
    { title: "Campaign Theme Anchor", body: campaignThemeInstruction(campaign) },
    { title: "Required Products", body: requiredProductInstruction(campaign.brandId) },
    { title: "Body Homepage Link Policy", body: bodyHomepageLinkInstruction(campaign.brandId) },
    { title: "Chosen Concept", body: conceptPrompt(concept, optionLabel) },
    { title: "Surface Variety Contract", body: creativeSurfaceVarietyPrompt(campaign, optionLabel) },
    { title: "Model Lens", body: modelExecutionStyle(selection) },
    { title: "Reviewed Prompt Edits", body: promptOverrideLayer(overrides) },
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
    { title: "Products", body: compactProductContextLines(products, campaign.brandId) },
    { title: "Segments To Serve Later", body: compactSegmentPromptContext(campaign, 130) },
    { title: "Option Contrast", body: optionContrast },
    { title: "User Feedback", body: foundationRevisionPrompt(revision) },
  ]);

  return { system, user };
}

function subjectPatchSchema(campaign: Campaign): string {
  const devices = (BRANDS[campaign.brandId]?.subjectDevices ?? ["open-loop", "pattern-interrupt", "playful-conceit"]).slice(0, 3);
  return `subject_lines[seg_key]={subject, preheader, style, model_hint, shared_thread, options[3+] using styles: ${devices.join(", ")}}`;
}

function bodyPatchSchema(campaign: Campaign): string {
  return `body[seg_key]=120-150 word selected body copy for each key: ${campaign.segments.map(segJsonKey).join(", ")}`;
}

function bodyOptionsPatchSchema(): string {
  return `body_options[seg_key]=2 items: {label, model_hint, body, ps, placement_note}. Routes must differ in opener/proof/placement.`;
}

function segmentPatchOutputSchema(campaign: Campaign): string {
  return `Patch JSON only. Segment keys: ${campaign.segments.map(segJsonKey).join(", ")}.
- ${subjectPatchSchema(campaign)}
- ${bodyPatchSchema(campaign)}
- ${bodyOptionsPatchSchema()}`;
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

function segmentDisplayLabel(campaign: Campaign, segment: string): string {
  const item = BRANDS[campaign.brandId]?.productSegments.find((entry) => entry.code === segment);
  return item ? `${segment} ${item.label}` : segment;
}

function segmentGuidanceLine(campaign: Campaign, segment: string): string {
  const item = BRANDS[campaign.brandId]?.productSegments.find((entry) => entry.code === segment);
  return item?.guidance || item?.meta || "the selected audience";
}

function compactWords(text: string, maxWords: number): string {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return words.length <= maxWords ? words.join(" ") : `${words.slice(0, maxWords).join(" ")}...`;
}

function productLink(product: Product): string {
  return `[${product.name}](slug:${product.slug})`;
}

function anchorLeadProduct(anchor: GenBrief, products: Product[]): Product {
  const hero = anchor.creative_direction?.hook_contract?.hero_product || anchor.products?.[0]?.name || "";
  const cleanHero = hero.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return products.find((product) => {
    const name = product.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return name && (cleanHero.includes(name) || name.includes(cleanHero));
  }) || products[0];
}

function fallbackSegmentBody(campaign: Campaign, products: Product[], anchor: GenBrief, segment: string, variant = 0): string {
  const brand = BRANDS[campaign.brandId];
  const lead = anchorLeadProduct(anchor, products);
  const support = products.filter((product) => product.slug !== lead.slug).slice(0, 3).map((product) => product.name).join(", ");
  const guidance = compactWords(segmentGuidanceLine(campaign, segment), 24);
  const theme = campaign.theme || "today's send";
  const usp = compactWords((lead.usps || [])[variant % Math.max(1, lead.usps?.length || 1)] || (lead.usps || [])[0] || "everyday comfort", 8);
  const promo = promoLine(campaign);
  const homepage = bodyHomepageLinkPolicy(campaign.brandId) === "required"
    ? ` You can also [see the full ${brand.name} lineup](home) if you want the broader fit before choosing.`
    : "";
  const opener = variant === 0
    ? `For ${segmentDisplayLabel(campaign, segment)}, ${theme} should feel like a useful next step, not another sale alert.`
    : `${theme} gives this segment one practical reason to look again: ${guidance}.`;
  const supportLine = support
    ? ` ${support} stay in the grid too, so the email covers more than one use case without turning into a catalog.`
    : "";
  const tip = campaign.brandId === "gents_lux"
    ? " #Tip: check the waistband seated and standing; the right pair should move before it pulls."
    : campaign.brandId === "lux_fitting"
      ? " Quick fit note: a clean drape matters most when the day moves from errands to plans."
      : " Fit note: start with the closure and straps; comfort usually shows up there first.";
  return `${opener} ${productLink(lead)} leads because ${usp} answers that need in one clear click.${homepage}

The proof stays simple: ${promo}. The copy should make the product feel timed to the theme, with the offer acting as the useful reason to decide today.${supportLine}

${tip}

${brand.persona}`;
}

function fallbackSubjectLine(campaign: Campaign, products: Product[], anchor: GenBrief, segment: string, optionLabel: "A" | "B"): GenBrief["subject_lines"][string] {
  const lead = anchorLeadProduct(anchor, products);
  const themeWords = compactWords(campaign.theme || "today", 4);
  const offer = compactWords(promoLine(campaign), 7);
  const seg = segmentDisplayLabel(campaign, segment).replace(/^\S+\s+/, "");
  const directSubject = `{{first_name}}, ${lead.name} fits ${themeWords}`;
  const altSubject = `${lead.name}: ${offer}`;
  const questionSubject = `Still need the right ${lead.name}?`;
  return {
    subject: directSubject.slice(0, 60),
    preheader: `${offer} plus ${compactWords(seg, 4)} copy tied to ${lead.name}.`.slice(0, 90),
    style: optionLabel === "A" ? "deadline-safe direct" : "deadline-safe contrast",
    model_hint: "local deadline fallback",
    shared_thread: `${lead.name} + ${themeWords} + ${offer}`,
    options: [
      {
        style: "direct",
        model_hint: "local deadline fallback",
        subject: directSubject.slice(0, 60),
        preheader: `${lead.name} leads the ${themeWords} angle with ${offer}.`.slice(0, 90),
        shared_thread: `${lead.name} ${themeWords}`,
      },
      {
        style: "value",
        model_hint: "local deadline fallback",
        subject: altSubject.slice(0, 60),
        preheader: `A clearer ${seg.toLowerCase()} reason to click, with ${lead.name} up front.`.slice(0, 90),
        shared_thread: `${lead.name} ${offer}`,
      },
      {
        style: "question",
        model_hint: "local deadline fallback",
        subject: `{{first_name}}, ${questionSubject}`.slice(0, 60),
        preheader: `${themeWords} becomes practical with ${lead.name}, ${offer}, and one clean path.`.slice(0, 90),
        shared_thread: `${lead.name} ${themeWords}`,
      },
    ],
  };
}

function fallbackSegmentPatch(
  campaign: Campaign,
  products: Product[],
  optionLabel: "A" | "B",
  anchor: GenBrief,
  segments: string[]
): SegmentCopyPatch {
  const subject_lines: GenBrief["subject_lines"] = {};
  const body: GenBrief["body"] = {};
  const body_options: GenBrief["body_options"] = {};
  segments.forEach((segment) => {
    const key = segJsonKey(segment);
    const primary = fallbackSegmentBody(campaign, products, anchor, segment, 0);
    const alternate = fallbackSegmentBody(campaign, products, anchor, segment, 1);
    subject_lines[key] = fallbackSubjectLine(campaign, products, anchor, segment, optionLabel);
    body[key] = primary;
    body_options[key] = [
      { label: "Deadline-safe primary", model_hint: "local fallback", body: primary, ps: anchor.ps || "", placement_note: campaign.bodyLayout || "continuous" },
      { label: "Deadline-safe alternate", model_hint: "local fallback contrast", body: alternate, ps: anchor.ps || "", placement_note: campaign.bodyLayout === "interspersed" ? "opener + short bridge" : "continuous" },
    ];
  });
  return { subject_lines, body, body_options };
}

function missingPatchSegments(campaign: Campaign, parts: SegmentBatchPart[]): string[] {
  return campaign.segments.filter((segment) => {
    const key = segJsonKey(segment);
    return !parts.some((part) => {
      const subject = part.subject_lines?.[key]?.subject?.trim();
      const body = part.body?.[key]?.trim();
      return subject && body;
    });
  });
}

function feedbackForSegmentPatch(revision?: RevisionFeedback): string {
  const feedback = revision?.feedback?.trim();
  return feedback
    ? `Apply this user feedback to this segment batch without rewriting shared banner/product sections:\n${compactPromptText(feedback, 900)}`
    : "";
}

/** @internal exported for unit tests; final warning should describe only unrecovered generation gaps. */
export function composeLayeredGenerationWarning(input: {
  warnings: string[];
  notices: string[];
  coverageGaps: string[];
  missingOptions: string[];
}): string | undefined {
  const { warnings, notices, coverageGaps, missingOptions } = input;
  const hasUnrecoveredGaps = coverageGaps.length > 0 || missingOptions.length > 0;
  const warningParts: string[] = [];
  if (missingOptions.length) {
    warningParts.push(`Generated usable copy, but Option ${missingOptions.join(" and ")} did not complete.`);
  }
  if (hasUnrecoveredGaps && warnings.length) {
    warningParts.push(`Some segment batches had provider/deadline issues: ${warnings.slice(0, 6).join(" · ")}${warnings.length > 6 ? ` · +${warnings.length - 6} more` : ""}.`);
  }
  if (hasUnrecoveredGaps && notices.length) {
    warningParts.push(`Recovery notes: ${notices.slice(0, 4).join(" · ")}${notices.length > 4 ? ` · +${notices.length - 4} more` : ""}.`);
  }
  if (coverageGaps.length) {
    warningParts.push(`Incomplete generated coverage remains: ${coverageGaps.slice(0, 8).join(", ")}${coverageGaps.length > 8 ? `, +${coverageGaps.length - 8} more` : ""}.`);
  }
  return warningParts.length ? warningParts.join(" ") : undefined;
}

function buildSegmentPatchPrompt(
  campaign: Campaign,
  products: Product[],
  optionLabel: "A" | "B",
  anchor: GenBrief,
  ctx: SegmentBatchContext,
  selection: AIModelSelection,
  revision?: RevisionFeedback,
  overrides?: PromptOverrides
): { system: string; user: string } {
  const brand = BRANDS[campaign.brandId];
  const anchorJson = compactPromptText(JSON.stringify(compactSegmentAnchorSummary(anchor)), PROMPT_ANCHOR_MAX_CHARS);
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
Body: selected body + 2 body_options routes. 120-150w, no {{first_name}}, personal-note first, one calm urgency beat, product markdown link by para 2, 2-4 format/link beats, no hard-sell stack.
Tokens: ==accent==, **bold**, [Product](slug:slug), [home text](home). Body prose proof = sensory language + one named-human story (first name + relationship + outcome), at most one number beside that person; never a fake clinical/study claim or a bare rating/count stated as fact — save badges/ratings for the banner and product tiles.`,
    },
    { title: "Artificial Proof Mode", body: artificialProofPromptLayer() },
    { title: "Template Corpus Memory", body: templateCorpusPromptLayer() },
    { title: "Legacy Prompt Alignment", body: legacyPromptAlignmentLayer(campaign.brandId) },
    { title: "Campaign Theme Anchor", body: campaignThemeInstruction(campaign) },
    { title: "Required Products", body: requiredProductInstruction(campaign.brandId) },
    { title: "Body Homepage Link Policy", body: bodyHomepageLinkInstruction(campaign.brandId) },
    { title: "Reviewed Prompt Edits", body: promptOverrideLayer(overrides) },
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
${compactProductContextLines(products, campaign.brandId)}

Segments:
${compactSegmentPromptContext(campaign, 150)}`,
    },
    {
      title: "Anchor Brief",
      body: `Preserve Option ${optionLabel}'s hook contract, branch, visual route, product strategy, and tone. Do not rewrite shared banner/product/P.S. fields.
${anchorJson}`,
    },
    { title: "Segment Differentiation", body: compactSegmentBodyDirectionLines(campaign) },
    { title: "Surface Variety Contract", body: creativeSurfaceVarietyPrompt(campaign, optionLabel) },
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
  revision?: RevisionFeedback,
  runtime?: GenerationRuntime,
  overrides?: PromptOverrides
): Promise<SegmentCopyPatch> {
  throwIfAborted(runtime?.signal);
  const promptCampaign = anchor.body_variety
    ? { ...campaign, bodyVariety: anchor.body_variety }
    : campaign;
  const { system, user } = buildSegmentPatchPrompt(promptCampaign, products, optionLabel, anchor, ctx, selection, revision, overrides);
  const parsed = await createAndParseWithModel(system, user, selection, {
    temperature: optionLabel === "B" ? AI_TEMP_B : AI_TEMP_A,
    maxOutputTokens: segmentPatchOutputTokens(promptCampaign.segments.length),
    timeoutMs: patchTimeoutForSelection(selection),
    ...runtimeCallOptions(runtime),
    stage: `segment_patch_${optionLabel.toLowerCase()}`,
    schema: segmentPatchJsonSchema(promptCampaign.segments),
  });
  return normalizeSegmentPatch(parsed, promptCampaign);
}

async function generateSegmentCopyBatch(
  campaign: Campaign,
  products: Product[],
  models: AIModelPair,
  revision: RevisionFeedback | undefined,
  batchContext: SegmentBatchContext,
  runtime?: GenerationRuntime,
  overrides?: PromptOverrides
): Promise<SegmentCopyResult> {
  throwIfAborted(runtime?.signal);
  const tasks: Promise<SegmentCopyPatch>[] = [];
  const labels: ("A" | "B")[] = [];

  if (batchContext.optionAAnchor) {
    labels.push("A");
    tasks.push(createSegmentPatch(campaign, products, "A", batchContext.optionAAnchor, batchContext, models.a, revision, runtime, overrides));
  }
  if (batchContext.optionBAnchor) {
    labels.push("B");
    tasks.push(createSegmentPatch(campaign, products, "B", batchContext.optionBAnchor, batchContext, models.b, revision, runtime, overrides));
  }

  if (!tasks.length) return { error: "No anchor option available for segment-only batch" };

  const settled = await Promise.allSettled(tasks);
  throwIfAnyAbort(settled.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => item.reason));
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
  const anchorJson = anchor ? compactPromptText(JSON.stringify(compactSegmentAnchorSummary(anchor)), PROMPT_ANCHOR_MAX_CHARS) : "";
  const anchorInstruction = anchorJson
    ? `\n\nANCHOR BRIEF TO PRESERVE FOR OPTION ${optionLabel}:\n${anchorJson}\n\nKeep the same creative_direction, banner, product block strategy, P.S., and QA stance. Generate fresh subject_lines/body only for this batch's segment keys, unless a shared field must be copied to satisfy the schema.`
    : "\n\nThis is the anchor batch: create the shared creative direction, banner, products, P.S., and QA that later segment batches will follow.";

  return `${user}

MULTI-SEGMENT BATCH MODE:
Batch ${ctx.index} of ${ctx.total}. Full selected segment list: ${ctx.allSegments.join(", ")}.
${ctx.allSegmentContext ? `Full segment context:\n${compactPromptText(ctx.allSegmentContext, 1200)}\n` : ""}
The system schema already lists only the segment keys for this batch.
Return a complete JSON object for this batch. Do not mention omitted segments. The server will merge batches into one final A/B brief.${anchorInstruction}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      throwIfAborted(signal);
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

/** Records, per-brief, which segments never got a model-authored patch — not just in the top-level warning string. */
function flagLocallyFilledSegments(brief: GenBrief, segments: string[]): GenBrief {
  if (!segments.length) return brief;
  (brief._advisory ||= []).push({
    type: "warn",
    msg: `Segment(s) ${segments.join(", ")} did not return model-authored copy after a retry — subject/body were filled locally from body.base; review before sending.`,
  });
  return brief;
}

function sanitizeAndValidateBrief(brief: GenBrief, campaign: Campaign, products: Product[]): GenBrief {
  if (!brief.body_variety && campaign.bodyVariety) {
    brief.body_variety = cleanBodyVarietyProfile(campaign.bodyVariety);
  }
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

export function isHardContrastIssue(issue: string): boolean {
  return !/product grid (?:has identical product order|patterns? (?:are|is) the same)/i.test(issue);
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
  const current = compactPromptText(JSON.stringify(briefRevisionSummary(brief)), 11000);
  return `QUALITY REPAIR PASS FOR OPTION ${optionLabel}

Fix only the compliance, proof-safety, deliverability, and hard length problems below. Preserve the current creative direction, route, hook, product order, and sentence architecture wherever they are valid.

Problems to fix:
${flags.map((flag, i) => `${i + 1}. ${flag}`).join("\n")}

Current brief JSON:
${current}

Return the complete corrected brief JSON using the exact same schema. Do not add prose or markdown fences.`;
}

function buildCreativeRepairPrompt(optionLabel: "A" | "B", brief: GenBrief): string {
  const current = compactPromptText(JSON.stringify(briefRevisionSummary(brief)), 11000);
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
  selection: AIModelSelection,
  runtime?: GenerationRuntime
): Promise<GenBrief> {
  throwIfAborted(runtime?.signal);
  if (!creativeRepairEnabled()) return brief;
  if ((brief._creative_score ?? 100) >= CREATIVE_REPAIR_THRESHOLD) return brief;
  if ((brief._flags || []).some((f) => f.type === "error")) return brief;
  if (!hasGenerationBudget(runtime, PROVIDER_TIMEOUT_MS, 12_000)) return brief;

  try {
    const repaired = sanitizeAndValidateBrief(
      (await createAndParseWithModel(REPAIR_SYSTEM, buildCreativeRepairPrompt(optionLabel, brief), selection, {
        temperature: Math.max(AI_REPAIR_TEMP, 0.7),
        ...runtimeCallOptions(runtime),
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
    if (isGenerationAbortError(err)) throw err;
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
  selection: AIModelSelection,
  runtime?: GenerationRuntime
): Promise<GenBrief> {
  throwIfAborted(runtime?.signal);
  if (!qualityRepairEnabled()) return brief;
  const flags = repairFlagsFor(brief);
  if (!flags.length) return repairCreativityIfNeeded(optionLabel, brief, campaign, products, selection, runtime);
  if (!hasGenerationBudget(runtime, PROVIDER_TIMEOUT_MS, 12_000)) return brief;

  try {
    const repaired = sanitizeAndValidateBrief(
      (await createAndParseWithModel(REPAIR_SYSTEM, buildQualityRepairPrompt(optionLabel, brief, flags), selection, {
        temperature: AI_REPAIR_TEMP,
        ...runtimeCallOptions(runtime),
        schema: genBriefJsonSchema(campaign.segments, true),
      })) as unknown as GenBrief,
      campaign,
      products
    );
    if (shouldKeepRepair(brief, repaired)) {
      console.info(`[generate-copy] quality repair kept for option ${optionLabel}: ${brief._score ?? "?"} -> ${repaired._score ?? "?"}`);
      return repairCreativityIfNeeded(optionLabel, repaired, campaign, products, selection, runtime);
    }
    console.info(`[generate-copy] quality repair discarded for option ${optionLabel}: ${brief._score ?? "?"} -> ${repaired._score ?? "?"}`);
    return repairCreativityIfNeeded(optionLabel, brief, campaign, products, selection, runtime);
  } catch (err) {
    if (isGenerationAbortError(err)) throw err;
    console.warn(`[generate-copy] quality repair failed for option ${optionLabel}: ${err instanceof Error ? err.message : "unknown error"}`);
    return repairCreativityIfNeeded(optionLabel, brief, campaign, products, selection, runtime);
  }
}

async function generateOptionsSingle(
  campaign: Campaign,
  products: Product[],
  overrides?: PromptOverrides,
  modelInput?: Partial<AIModelPair>,
  revision?: RevisionFeedback,
  batchContext?: SegmentBatchContext,
  runtime?: GenerationRuntime
): Promise<GenerationResult> {
  try {
    throwIfAborted(runtime?.signal);
    emit(runtime, { type: "stage", stage: "single_start", message: "Generating full A/B briefs in legacy single-call mode" });
    const models = normalizeModelPair(modelInput);
    telemetry("start", {
      path: "single",
      segments: campaign.segments.length,
      modelA: `${models.a.provider}:${models.a.model}`,
      modelB: `${models.b.provider}:${models.b.model}`,
      promptOverrides: hasPromptOverrides(overrides),
    });
    const autoPrompts = !hasPromptOverrides(overrides);
    const nonceA = `${randomUUID()}:${models.a.provider}:${models.a.model}:A`;
    const nonceB = `${randomUUID()}:${models.b.provider}:${models.b.model}:B`;
    const campaignA = autoPrompts ? withOptionVariety(campaign, nonceA) : { ...campaign, bodyVariety: campaign.bodyVariety || selectVarietyProfile(campaign, nonceA) };
    const campaignB = autoPrompts ? withContrastingOptionVariety(campaign, nonceB, campaignA.bodyVariety) : { ...campaign, bodyVariety: campaign.bodyVariety || selectVarietyProfile(campaign, nonceB) };
    const concepts = selectEmailConceptPair(campaign, products);
    const sysA = overrides?.system?.trim() || buildSystemPrompt(campaignA, products, false, undefined, nonceA, concepts.a);
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
        : buildSystemPrompt(campaignB, products, true, anchor?.creative_direction, retryNonce, concepts.b);
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
        createFullBriefWithModel(sysA, usrA, models.a, campaignA, { temperature: AI_TEMP_A, ...runtimeCallOptions(runtime), stage: "single_a" }),
        createFullBriefWithModel(sysBInitial, usrB, models.b, campaignB, { temperature: AI_TEMP_B, ...runtimeCallOptions(runtime), stage: "single_b" }),
      ]);
      throwIfAnyAbort([aSettled, bSettled].filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => item.reason));
      aFailure = aSettled.status === "rejected" ? aSettled.reason : undefined;
      bFailure = bSettled.status === "rejected" ? bSettled.reason : undefined;
      a = aSettled.status === "fulfilled" ? sanitizeAndValidateBrief(attachConceptToBrief(aSettled.value as unknown as GenBrief, concepts.a), campaignA, products) : undefined;
      b = bSettled.status === "fulfilled" ? sanitizeAndValidateBrief(attachConceptToBrief(bSettled.value as unknown as GenBrief, concepts.b), campaignB, products) : undefined;
      [a, b] = await Promise.all([
        a ? repairBriefIfNeeded("A", a, campaignA, products, sysA, models.a, runtime) : Promise.resolve(undefined),
        b ? repairBriefIfNeeded("B", b, campaignB, products, sysBInitial, models.b, runtime) : Promise.resolve(undefined),
      ]);
      if (a) emit(runtime, { type: "partial", option: "a", brief: a });
      if (b) emit(runtime, { type: "partial", option: "b", brief: b });
    } else {
      try {
        emit(runtime, { type: "stage", stage: "single_a", option: "a", message: "Generating Option A" });
        a = sanitizeAndValidateBrief(attachConceptToBrief((await createFullBriefWithModel(sysA, usrA, models.a, campaignA, { temperature: AI_TEMP_A, ...runtimeCallOptions(runtime), stage: "single_a" })) as unknown as GenBrief, concepts.a), campaignA, products);
        a = await repairBriefIfNeeded("A", a, campaignA, products, sysA, models.a, runtime);
        stampBrief(a, models.a, campaignA.bodyVariety);
        emit(runtime, { type: "partial", option: "a", brief: a });
      } catch (err) {
        if (isGenerationAbortError(err)) throw err;
        aFailure = err;
      }

      const bMessages = buildOptionBMessages(a);
      sysBInitial = bMessages.system;
      usrB = bMessages.user;
      try {
        emit(runtime, { type: "stage", stage: "single_b", option: "b", message: "Generating Option B" });
        b = sanitizeAndValidateBrief(attachConceptToBrief((await createFullBriefWithModel(sysBInitial, usrB, models.b, campaignB, { temperature: AI_TEMP_B, ...runtimeCallOptions(runtime), stage: "single_b" })) as unknown as GenBrief, concepts.b), campaignB, products);
        b = await repairBriefIfNeeded("B", b, campaignB, products, sysBInitial, models.b, runtime);
        if (b) emit(runtime, { type: "partial", option: "b", brief: b });
      } catch (err) {
        if (isGenerationAbortError(err)) throw err;
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
      const retryCampaignB = withContrastingOptionVariety(campaign, `${nonceB}:retry:${contrastProblems.length}`, a.body_variety);
      const sysB = overrides?.system?.trim()
        ? overrides.system.trim() + "\n" + contrastInstruction(a.creative_direction)
        : buildSystemPrompt(retryCampaignB, products, true, a.creative_direction, `${nonceB}:retry`, concepts.b);
      const retry = `${usrB}

WARNING: A/B contrast failed:
${contrastProblems.map((problem, i) => `${i + 1}. ${problem}`).join("\n")}

Regenerate Option B with a different production branch/brief_route, subject family, body architecture, banner pattern, product-grid emphasis, and proof path. Preserve supplied facts and the JSON schema.`;
      emit(runtime, { type: "stage", stage: "contrast_retry", option: "b", message: "Retrying Option B for stronger contrast" });
      b = sanitizeAndValidateBrief(attachConceptToBrief((await createFullBriefWithModel(sysB, retry, models.b, retryCampaignB, { temperature: AI_TEMP_B_RETRY, ...runtimeCallOptions(runtime), stage: "contrast_retry" })) as unknown as GenBrief, concepts.b), retryCampaignB, products);
      b = await repairBriefIfNeeded("B", b, retryCampaignB, products, sysB, models.b, runtime);
      stampBrief(b, models.b, retryCampaignB.bodyVariety);
    }

    applySanitizeCopy(a, campaign.brandId);
    applySanitizeCopy(b, campaign.brandId);
    [a, b] = validateBriefPair(a, b);

    console.info(`[generate-copy] completed A/B${batchContext ? ` batch ${batchContext.index}/${batchContext.total}` : ""} in ${Math.round((Date.now() - startedAt) / 1000)}s using ${models.a.provider}:${models.a.model} + ${models.b.provider}:${models.b.model}`);
    telemetry("complete", { path: "single", elapsedMs: Date.now() - startedAt, hasA: !!a, hasB: !!b, scoreA: a?._score, scoreB: b?._score });
    return { a, b };
  } catch (err) {
    if (isGenerationAbortError(err)) throw err;
    telemetry("error", { path: "single", message: errMessage(err) });
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
  optionAAnchor?: GenBrief,
  runtime?: GenerationRuntime,
  overrides?: PromptOverrides
): Promise<GenBrief> {
  throwIfAborted(runtime?.signal);
  const { system, user } = buildFoundationPrompt(campaign, products, optionLabel, selection, concept, revision, optionAAnchor, overrides);
  const parsed = await createFoundationBriefWithModel(system, user, selection, {
    temperature: optionLabel === "B" ? AI_TEMP_B : AI_TEMP_A,
    ...runtimeCallOptions(runtime),
    stage: `foundation_${optionLabel.toLowerCase()}`,
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

async function generateOptionSegmentParts(
  option: "a" | "b",
  campaign: Campaign,
  products: Product[],
  models: AIModelPair,
  revision: RevisionFeedback | undefined,
  chunks: string[][],
  concurrency: number,
  allSegmentContext: string,
  anchor: GenBrief,
  runtime: GenerationRuntime | undefined,
  overrides?: PromptOverrides
): Promise<{ parts: SegmentBatchPart[]; warnings: string[]; notices: string[]; completed: number; total: number; locallyFilledSegments: string[] }> {
  throwIfAborted(runtime?.signal);
  const optionLabel = option.toUpperCase() as "A" | "B";
  const warnings: string[] = [];
  const recoverableIssues: string[] = [];
  const notices: string[] = [];
  const total = chunks.length;
  let completed = 0;
  const parts = await mapWithConcurrency(
    chunks,
    concurrency,
    async (segments, index) => {
      throwIfAborted(runtime?.signal);
      const deadlineWarning = runtime ? softDeadlineWarning(runtime, `Option ${optionLabel} segment patches`) : null;
      if (deadlineWarning) {
        recoverableIssues.push(`batch ${index + 1}/${total}: ${deadlineWarning}`);
        emit(runtime, { type: "stage", stage: "segment_recovery", option, batch: index + 1, total, message: deadlineWarning });
        return undefined;
      }
      emit(runtime, {
        type: "stage",
        stage: "segment_patch",
        option,
        batch: index + 1,
        total,
        message: `Writing Option ${optionLabel} segment batch ${index + 1}/${total}`,
      });
      const result = await generateSegmentCopyBatch(
        withSegments(campaign, segments),
        products,
        models,
        revision,
        {
          index: index + 1,
          total,
          allSegments: campaign.segments,
          allSegmentContext,
          optionAAnchor: option === "a" ? anchor : undefined,
          optionBAnchor: option === "b" ? anchor : undefined,
        },
        runtime,
        overrides
      );
      completed += 1;
      emit(runtime, { type: "progress", stage: `segments_${option}`, done: completed, total, message: `Option ${optionLabel} segments ${completed}/${total}` });
      const label = `batch ${index + 1}/${total}`;
      if (result.error) recoverableIssues.push(`${label}: ${result.error}`);
      if (result.warning) recoverableIssues.push(`${label}: ${result.warning}`);
      const patch = option === "a" ? result.a : result.b;
      if (!patch) recoverableIssues.push(`${label}: missing Option ${optionLabel}`);
      return patch;
    },
    runtime?.signal
  );
  const usableParts = parts.filter((part): part is SegmentBatchPart => !!part);
  let missing = missingPatchSegments(campaign, [anchor, ...usableParts]);
  const modelForOption = option === "a" ? models.a : models.b;
  if (missing.length && hasGenerationBudget(runtime, patchTimeoutForSelection(modelForOption), 10_000)) {
    emit(runtime, { type: "stage", stage: "segment_retry", option, message: `Retrying missing Option ${optionLabel} segment(s): ${missing.join(", ")}` });
    try {
      const retryResult = await generateSegmentCopyBatch(
        withSegments(campaign, missing),
        products,
        models,
        revision,
        {
          index: total + 1,
          total,
          allSegments: campaign.segments,
          allSegmentContext,
          optionAAnchor: option === "a" ? anchor : undefined,
          optionBAnchor: option === "b" ? anchor : undefined,
        },
        runtime,
        overrides
      );
      const retryPatch = option === "a" ? retryResult.a : retryResult.b;
      if (retryPatch) {
        usableParts.push(retryPatch);
        notices.push(`recovered Option ${optionLabel} segment copy for ${missing.join(", ")} via a targeted retry`);
        missing = missingPatchSegments(campaign, [anchor, ...usableParts]);
      }
    } catch (err) {
      if (isGenerationAbortError(err)) throw err;
      recoverableIssues.push(`segment retry for ${missing.join(", ")}: ${errMessage(err)}`);
    }
  }
  const locallyFilledSegments = [...missing];
  if (missing.length) {
    usableParts.push(fallbackSegmentPatch(withSegments(campaign, missing), products, optionLabel, anchor, missing));
    notices.push(`filled missing Option ${optionLabel} segment copy locally for ${missing.join(", ")} after provider/deadline gaps`);
  }
  if (recoverableIssues.length) {
    notices.push(`recovered Option ${optionLabel} segment provider/deadline issue(s): ${recoverableIssues.slice(0, 3).join(" · ")}${recoverableIssues.length > 3 ? ` · +${recoverableIssues.length - 3} more` : ""}`);
  }
  return {
    parts: [anchor, ...usableParts],
    warnings,
    notices,
    completed,
    total,
    locallyFilledSegments,
  };
}

async function generateOptionsBatched(
  campaign: Campaign,
  products: Product[],
  overrides?: PromptOverrides,
  modelInput?: Partial<AIModelPair>,
  revision?: RevisionFeedback,
  runtime?: GenerationRuntime
): Promise<GenerationResult> {
  try {
    throwIfAborted(runtime?.signal);
    const models = normalizeModelPair(modelInput);
    const batchSettings = adaptiveBatchSettings(models, campaign.segments.length);
    const chunks = segmentChunks(campaign.segments, batchSettings.batchSize);
    const total = chunks.length;
    const startedAt = Date.now();
    const allSegmentContext = segmentPromptContext(campaign);
    const nonceA = `${randomUUID()}:${models.a.provider}:${models.a.model}:A:foundation`;
    const nonceB = `${randomUUID()}:${models.b.provider}:${models.b.model}:B:foundation`;
    const campaignA = withOptionVariety(campaign, nonceA);
    const campaignB = withContrastingOptionVariety(campaign, nonceB, campaignA.bodyVariety);
    const concepts = selectEmailConceptPair(campaign, products);
    const warnings: string[] = [];
    const notices: string[] = [];
    let optionAAnchor: GenBrief | undefined;
    let optionBAnchor: GenBrief | undefined;
    let aFailure: unknown;
    let bFailure: unknown;

    console.info(`[generate-copy] layered generation for ${campaign.segments.length} segments: 2 foundations + ${total} segment batch(es), tier=${batchSettings.tier}, batchSize=${batchSettings.batchSize}, concurrency=${batchSettings.concurrency}`);
    telemetry("start", {
      path: "layered",
      segments: campaign.segments.length,
      batches: total,
      modelA: `${models.a.provider}:${models.a.model}`,
      modelB: `${models.b.provider}:${models.b.model}`,
      speedTier: batchSettings.tier,
      promptOverrides: hasPromptOverrides(overrides),
    });
    emit(runtime, {
      type: "stage",
      stage: "layered_start",
      message: `Layered generation: ${campaign.segments.length} segment(s), ${total} batch(es), ${batchSettings.tier} model plan`,
    });

    emit(runtime, { type: "stage", stage: "foundation_a", option: "a", message: "Creating Option A foundation" });
    emit(runtime, { type: "stage", stage: "foundation_b", option: "b", message: "Creating Option B foundation" });
    let foundationsReady = 0;
    const [aFoundation, bFoundation] = await Promise.allSettled([
      createOptionFoundation(campaignA, products, "A", models.a, campaignA.bodyVariety, concepts.a, revision, undefined, runtime, overrides),
      createOptionFoundation(campaignB, products, "B", models.b, campaignB.bodyVariety, concepts.b, revision, undefined, runtime, overrides),
    ]);
    throwIfAnyAbort([aFoundation, bFoundation].filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => item.reason));
    if (aFoundation.status === "fulfilled") {
      optionAAnchor = aFoundation.value;
      foundationsReady += 1;
      emit(runtime, { type: "progress", stage: "foundations", done: foundationsReady, total: 2, message: "Option A foundation ready" });
    } else {
      aFailure = aFoundation.reason;
      warnings.push(`foundation A: ${errMessage(aFoundation.reason)}`);
      emit(runtime, { type: "warning", message: `Option A foundation failed: ${errMessage(aFoundation.reason)}` });
    }
    if (bFoundation.status === "fulfilled") {
      optionBAnchor = bFoundation.value;
      foundationsReady += 1;
      emit(runtime, { type: "progress", stage: "foundations", done: foundationsReady, total: 2, message: "Option B foundation ready" });
    } else {
      bFailure = bFoundation.reason;
      warnings.push(`foundation B: ${errMessage(bFoundation.reason)}`);
      emit(runtime, { type: "warning", message: `Option B foundation failed: ${errMessage(bFoundation.reason)}` });
    }

    if (!optionAAnchor && !optionBAnchor) return { error: bestFailureMessage([aFailure, bFailure]) };

    const aPromise = optionAAnchor
      ? generateOptionSegmentParts("a", campaign, products, models, revision, chunks, batchSettings.concurrency, allSegmentContext, optionAAnchor, runtime, overrides)
          .then((run) => {
            warnings.push(...run.warnings.map((w) => `A ${w}`));
            notices.push(...run.notices.map((w) => `A ${w}`));
            const a = flagLocallyFilledSegments(
              mergeOptionBatches(campaign, products, run.parts, optionAAnchor?._provider, optionAAnchor?._model),
              run.locallyFilledSegments
            );
            emit(runtime, { type: "stage", stage: "merge", option: "a", message: "Merged Option A" });
            emit(runtime, { type: "partial", option: "a", brief: a, warning: run.warnings.length ? run.warnings.join(" · ") : undefined });
            return a;
          })
          .catch((err) => {
            if (isGenerationAbortError(err)) throw err;
            aFailure = err;
            warnings.push(`Option A segments: ${errMessage(err)}`);
            emit(runtime, { type: "warning", message: `Option A segments failed: ${errMessage(err)}` });
            return undefined;
          })
      : Promise.resolve(undefined);

    const bPromise = optionBAnchor
      ? generateOptionSegmentParts("b", campaign, products, models, revision, chunks, batchSettings.concurrency, allSegmentContext, optionBAnchor, runtime, overrides)
          .then((run) => {
            warnings.push(...run.warnings.map((w) => `B ${w}`));
            notices.push(...run.notices.map((w) => `B ${w}`));
            const b = flagLocallyFilledSegments(
              mergeOptionBatches(campaign, products, run.parts, optionBAnchor?._provider, optionBAnchor?._model),
              run.locallyFilledSegments
            );
            emit(runtime, { type: "stage", stage: "merge", option: "b", message: "Merged Option B" });
            emit(runtime, { type: "partial", option: "b", brief: b, warning: run.warnings.length ? run.warnings.join(" · ") : undefined });
            return b;
          })
          .catch((err) => {
            if (isGenerationAbortError(err)) throw err;
            bFailure = err;
            warnings.push(`Option B segments: ${errMessage(err)}`);
            emit(runtime, { type: "warning", message: `Option B segments failed: ${errMessage(err)}` });
            return undefined;
          })
      : Promise.resolve(undefined);

    let [a, b] = await Promise.all([aPromise, bPromise]);

    if (!a && !b) {
      return { error: warnings[0] || bestFailureMessage([aFailure, bFailure]) || "No segment batch returned usable output" };
    }

    if (a && b) {
      const hardContrast = briefContrastIssues(a, b).filter(isHardContrastIssue);
      if (hardContrast.length && optionAAnchor && hasGenerationBudget(runtime, PROVIDER_TIMEOUT_MS + PATCH_PROVIDER_TIMEOUT_MS, 15_000)) {
        try {
          notices.push(`attempted Option B contrast retry for: ${hardContrast.slice(0, 3).join("; ")}`);
          emit(runtime, { type: "stage", stage: "contrast_retry", option: "b", message: "Retrying Option B contrast" });
          const retrySeedCampaign = { ...campaign, theme: `${campaign.theme} contrast retry ${hardContrast.join(" ")}` };
          const retryConcept = selectEmailConceptPair(retrySeedCampaign, products).b;
          const retryCampaignB = withContrastingOptionVariety(campaign, `${nonceB}:retry:${hardContrast.length}`, a.body_variety || optionAAnchor.body_variety);
          const retryAnchor = await createOptionFoundation(retryCampaignB, products, "B", models.b, retryCampaignB.bodyVariety, retryConcept, revision, optionAAnchor, runtime, overrides);
          const retryRun = await generateOptionSegmentParts("b", campaign, products, models, revision, chunks, batchSettings.concurrency, allSegmentContext, retryAnchor, runtime, overrides);
          warnings.push(...retryRun.warnings.map((w) => `contrast retry ${w}`));
          notices.push(...retryRun.notices.map((w) => `contrast retry ${w}`));
          b = flagLocallyFilledSegments(
            mergeOptionBatches(campaign, products, retryRun.parts, retryAnchor._provider, retryAnchor._model),
            retryRun.locallyFilledSegments
          );
          emit(runtime, { type: "partial", option: "b", brief: b, warning: retryRun.warnings.length ? retryRun.warnings.join(" · ") : undefined });
        } catch (err) {
          if (isGenerationAbortError(err)) throw err;
          notices.push(`Option B contrast retry could not complete; keeping the usable original B: ${errMessage(err)}`);
          emit(runtime, { type: "stage", stage: "contrast_retry", option: "b", message: "Contrast retry skipped; keeping usable Option B" });
        }
      }
    }

    if (a && b) [a, b] = validateBriefPair(a, b);

    const coverageGaps = [
      ...(a ? missingPatchSegments(campaign, [a]).map((segment) => `A ${segment}`) : []),
      ...(b ? missingPatchSegments(campaign, [b]).map((segment) => `B ${segment}`) : []),
    ];
    const missingOptions = [a ? "" : "A", b ? "" : "B"].filter(Boolean);
    const warning = composeLayeredGenerationWarning({ warnings, notices, coverageGaps, missingOptions });

    console.info(`[generate-copy] completed layered A/B in ${Math.round((Date.now() - startedAt) / 1000)}s across ${total} segment batch(es)`);
    telemetry("complete", {
      path: "layered",
      elapsedMs: Date.now() - startedAt,
      hasA: !!a,
      hasB: !!b,
      warnings: warnings.length,
      notices: notices.length,
      scoreA: a?._score,
      scoreB: b?._score,
    });
    return { a, b, warning };
  } catch (err) {
    if (isGenerationAbortError(err)) throw err;
    telemetry("error", { path: "layered", message: errMessage(err) });
    return { error: err instanceof Error ? err.message : "Batched generation failed" };
  }
}

/** Generate two contrasting options (A + B), each a combined content + design brief. */
export async function generateOptions(
  campaign: Campaign,
  products: Product[],
  overrides?: PromptOverrides,
  modelInput?: Partial<AIModelPair>,
  revision?: RevisionFeedback,
  onEvent?: GenerationEventHandler,
  signal?: AbortSignal
): Promise<GenerationResult> {
  const runtime = runtimeFrom(onEvent, signal);
  throwIfAborted(signal);
  const promptEdits = hasPromptOverrides(overrides);
  try {
    const useLayered = campaign.segments.length >= SEGMENT_BATCH_THRESHOLD && !(promptEdits && campaign.segments.length === 1);
    const result = useLayered
      ? await generateOptionsBatched(campaign, products, overrides, modelInput, revision, runtime)
      : await generateOptionsSingle(campaign, products, overrides, modelInput, revision, undefined, runtime);
    if (result.error) {
      emit(runtime, { type: "error", message: result.error });
    } else {
      emit(runtime, { type: "done", a: result.a, b: result.b, warning: result.warning });
    }
    return result;
  } catch (err) {
    if (isGenerationAbortError(err)) {
      emit(runtime, { type: "warning", message: "Generation cancelled." });
      throw err;
    }
    throw err;
  }
}
