import Anthropic from "@anthropic-ai/sdk";
import type { AIModelPair, AIModelSelection, Campaign, Product } from "./config/types";
import { normalizeModelPair, providerLabel } from "./config/aiModels";
import { buildSystemPrompt, buildUserPrompt, contrastInstruction, validateBrief, type GenBrief } from "./briefgen";

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

const OPTION_B_INITIAL_CONTRAST = `\nOPTION B CONTRAST REQUIREMENT:
You are writing Option B in parallel with Option A. Deliberately avoid the obvious/default route.
Pick a distinct angle, framework, opener mechanic, emotional arc, visual direction, CTA wording, and proof role.
Do not wait to see Option A; make Option B a clearly different usable challenger.`;

const SEGMENT_BATCH_THRESHOLD = Math.max(2, Number(process.env.AI_SEGMENT_BATCH_THRESHOLD || 3));
const SEGMENT_BATCH_SIZE = Math.max(1, Number(process.env.AI_SEGMENT_BATCH_SIZE || 2));
const SEGMENT_BATCH_CONCURRENCY = Math.max(1, Number(process.env.AI_SEGMENT_BATCH_CONCURRENCY || 2));

function timeoutMessage(provider: string, model: string): string {
  return `${provider} ${model} timed out after ${Math.round(PROVIDER_TIMEOUT_MS / 1000)} seconds. Try a faster model such as Claude Haiku, Gemini Flash/Lite, or a GPT mini/nano model, or reduce segments/products.`;
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

async function createText(system: string, user: string, selection: AIModelSelection): Promise<string> {
  if (selection.provider === "claude") return callClaude(system, user, selection.model);
  if (selection.provider === "gemini") return callGemini(system, user, selection.model);
  if (selection.provider === "openai") return callOpenAI(system, user, selection.model);
  throw new Error(`Unsupported AI provider: ${selection.provider}`);
}

async function createAndParseWithModel(
  system: string,
  user: string,
  selection: AIModelSelection
): Promise<Record<string, unknown>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await createText(system, attempt === 0 ? user : user + FIX_JSON_NOTE, selection);
    try {
      return parseStrictJson(raw);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to parse model output");
}

async function callClaude(system: string, user: string, model: string): Promise<string> {
  let resp;
  try {
    resp = await getClient().messages.create(
      {
        model,
        max_tokens: 16000,
        temperature: 0.65,
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
  const textPart = resp.content.find((c) => c.type === "text");
  return textPart && textPart.type === "text" ? textPart.text : "";
}

async function callGemini(system: string, user: string, model: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const { res, data } = await fetchJsonWithTimeout<{
    candidates?: { content?: { parts?: { text?: string }[] } }[];
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
        temperature: 0.65,
        maxOutputTokens: 16000,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data.error?.message || "request failed"}`);
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
}

async function callOpenAI(system: string, user: string, model: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const payload: Record<string, unknown> = {
    model,
    input: [
      { role: "system", content: [{ type: "input_text", text: system }] },
      { role: "user", content: [{ type: "input_text", text: user }] },
    ],
    max_output_tokens: 16000,
    text: { format: { type: "json_object" }, verbosity: "low" },
  };
  if (/^gpt-5/i.test(model)) payload.reasoning = { effort: "low" };

  const { res, data } = await fetchJsonWithTimeout<{
    output_text?: string;
    output?: { content?: { text?: string; type?: string; output_text?: string }[] }[];
    choices?: { message?: { content?: string } }[];
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
    _score: _dropScore,
    _provider: _dropProvider,
    _model: _dropModel,
    body_variety: _dropVariety,
    ...copy
  } = brief as GenBrief & Record<string, unknown>;
  void _dropFlags;
  void _dropScore;
  void _dropProvider;
  void _dropModel;
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

interface SegmentBatchContext {
  index: number;
  total: number;
  allSegments: string[];
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
  briefs: GenBrief[],
  provider?: string,
  model?: string
): GenBrief {
  const base = JSON.parse(JSON.stringify(briefRevisionSummary(briefs[0]))) as GenBrief;
  const mergedSubjects: GenBrief["subject_lines"] = {};
  const mergedBody: GenBrief["body"] = { base: base.body?.base || "" };

  briefs.forEach((brief) => {
    Object.assign(mergedSubjects, brief.subject_lines || {});
    Object.entries(brief.body || {}).forEach(([key, value]) => {
      if (key === "base") {
        if (!mergedBody.base && value) mergedBody.base = value;
      } else {
        mergedBody[key] = value;
      }
    });
  });

  base.subject_lines = mergedSubjects;
  base.body = mergedBody;
  const validated = validateBrief(base, campaign, products);
  validated._provider = provider;
  validated._model = model;
  return validated;
}

const QUALITY_REPAIR_THRESHOLD = Number(process.env.AI_QUALITY_REPAIR_THRESHOLD || 78);
const QUALITY_REPAIR_MAX_FLAGS = Number(process.env.AI_QUALITY_REPAIR_MAX_FLAGS || 10);

function qualityRepairEnabled(): boolean {
  return !/^(0|false|off|no)$/i.test(process.env.AI_QUALITY_REPAIR || "");
}

function isRepairablePlaybookFlag(message: string): boolean {
  return /missing|required|subject|preheader|shared thread|spam|weak|generic|opt-out|invented|proof|brand avoid|hook contract|banner|cta|body|opener|persona|formatting|hyperlink|offer|price|theme|similar|p\.s\.|product|review|image brief|quality check/i.test(message);
}

function isHighImpactPlaybookFlag(message: string): boolean {
  return /missing required field|missing subject\/preheader|subject over hard cap|repeats \{\{first_name\}\}|subject and preheader too similar|needs 3\+ subject|spam word|weak\/generic|opt-out risk|invented proof|brand avoid|hook contract missing|hero banner should|structured hero banner missing|weak banner cta|body opens|missing persona|formatting beats|renderer-safe hyperlink|body over 150|body too short|missing product-name markdown link|visible price\/offer|hero, and body need|body opener should|body variants are too similar|missing p\.s\.|p\.s\. should|product .*main text|product .*usp|product .*weak cta|product .*cta should|review looks invented|image brief missing|quality check missing/i.test(message);
}

function repairFlagsFor(brief: GenBrief): string[] {
  const flags = brief._flags || [];
  const repairable = flags
    .map((flag) => flag.msg)
    .filter(isRepairablePlaybookFlag);
  const highImpact = repairable.filter(isHighImpactPlaybookFlag);
  const lowScore = typeof brief._score === "number" && brief._score < QUALITY_REPAIR_THRESHOLD;
  if (!highImpact.length && (!lowScore || repairable.length < 3)) return [];
  return (highImpact.length ? highImpact : repairable).slice(0, QUALITY_REPAIR_MAX_FLAGS);
}

function shouldKeepRepair(original: GenBrief, repaired: GenBrief): boolean {
  const originalFlags = original._flags?.length ?? 0;
  const repairedFlags = repaired._flags?.length ?? 0;
  const originalScore = original._score ?? 0;
  const repairedScore = repaired._score ?? 0;
  return repairedScore > originalScore || (repairedScore === originalScore && repairedFlags < originalFlags);
}

function buildQualityRepairPrompt(optionLabel: "A" | "B", brief: GenBrief, flags: string[]): string {
  const current = JSON.stringify(briefRevisionSummary(brief)).slice(0, 18000);
  return `QUALITY REPAIR PASS FOR OPTION ${optionLabel}

Fix only the playbook/output-quality problems below. Preserve the current creative direction where it is valid, but revise any copy that violates email-campaign-playbook.html.

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
    const repairSystem = `${system}

QUALITY REPAIR MODE:
- Fix the listed playbook failures with minimal rewriting.
- Keep valid facts, product URLs, prices, and supplied reviews unchanged.
- Return one complete JSON object only.`;
    const repaired = validateBrief(
      (await createAndParseWithModel(repairSystem, buildQualityRepairPrompt(optionLabel, brief, flags), selection)) as unknown as GenBrief,
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
    const sysA = overrides?.system?.trim() || buildSystemPrompt(campaign, products, false);
    const usrA = appendSegmentBatchContext(
      appendRevisionFeedback(overrides?.user?.trim() || buildUserPrompt(campaign, false), revision),
      "A",
      batchContext
    );

    const sysBInitial = overrides?.system?.trim()
      ? overrides.system.trim() + OPTION_B_INITIAL_CONTRAST
      : buildSystemPrompt(campaign, products, true) + OPTION_B_INITIAL_CONTRAST;
    const usrBBase = overrides?.user?.trim()
      ? overrides.user.trim() + "\n\nGenerate Option B now — make it a clearly different challenger from Option A."
      : buildUserPrompt(campaign, true);
    const usrB = appendSegmentBatchContext(appendRevisionFeedback(usrBBase, revision), "B", batchContext);

    const startedAt = Date.now();
    const [aRaw, bRaw] = await Promise.all([
      createAndParseWithModel(sysA, usrA, models.a),
      createAndParseWithModel(sysBInitial, usrB, models.b),
    ]);

    let a = validateBrief(aRaw as unknown as GenBrief, campaign, products);
    let b = validateBrief(bRaw as unknown as GenBrief, campaign, products);
    [a, b] = await Promise.all([
      repairBriefIfNeeded("A", a, campaign, products, sysA, models.a),
      repairBriefIfNeeded("B", b, campaign, products, sysBInitial, models.b),
    ]);
    a._provider = providerLabel(models.a.provider);
    a._model = models.a.model;

    b._provider = providerLabel(models.b.provider);
    b._model = models.b.model;

    // Auto-retry once if B reused A's angle or framework.
    if (
      b.creative_direction?.angle === a.creative_direction?.angle ||
      b.creative_direction?.framework === a.creative_direction?.framework
    ) {
      const sysB = overrides?.system?.trim()
        ? overrides.system.trim() + "\n" + contrastInstruction(a.creative_direction)
        : buildSystemPrompt(campaign, products, true, a.creative_direction);
      const retry = usrB + "\n\nWARNING: your previous attempt reused Option A's direction. You MUST choose a different angle AND a different framework.";
      b = validateBrief((await createAndParseWithModel(sysB, retry, models.b)) as unknown as GenBrief, campaign, products);
      b = await repairBriefIfNeeded("B", b, campaign, products, sysB, models.b);
      b._provider = providerLabel(models.b.provider);
      b._model = models.b.model;
    }

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
    const startedAt = Date.now();
    console.info(`[generate-copy] batching ${campaign.segments.length} segments into ${total} batches of up to ${SEGMENT_BATCH_SIZE}`);

    const first = await generateOptionsSingle(
      withSegments(campaign, chunks[0]),
      products,
      undefined,
      models,
      revision,
      { index: 1, total, allSegments: campaign.segments }
    );
    if (first.error || !first.a || !first.b) return first.error ? first : { error: "First segment batch did not return both A/B options" };

    const remainingChunks = chunks.slice(1);
    const remaining = await mapWithConcurrency(
      remainingChunks,
      SEGMENT_BATCH_CONCURRENCY,
      (segments, index) =>
        generateOptionsSingle(
          withSegments(campaign, segments),
          products,
          undefined,
          models,
          revision,
          {
            index: index + 2,
            total,
            allSegments: campaign.segments,
            optionAAnchor: first.a,
            optionBAnchor: first.b,
          }
        )
    );

    const failed = remaining.find((result) => result.error || !result.a || !result.b);
    if (failed) return failed.error ? failed : { error: "A segment batch did not return both A/B options" };

    const aBatches = [first.a, ...remaining.map((result) => result.a as GenBrief)];
    const bBatches = [first.b, ...remaining.map((result) => result.b as GenBrief)];
    const a = mergeOptionBatches(campaign, products, aBatches, first.a._provider, first.a._model);
    const b = mergeOptionBatches(campaign, products, bBatches, first.b._provider, first.b._model);

    console.info(`[generate-copy] completed batched A/B in ${Math.round((Date.now() - startedAt) / 1000)}s across ${total} batches`);
    return { a, b };
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
