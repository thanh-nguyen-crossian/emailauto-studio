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
  return {
    creative_direction: brief.creative_direction,
    subject_lines: brief.subject_lines,
    banner: brief.banner,
    body: brief.body,
    products: brief.products,
    quality_checks: brief.quality_checks,
  };
}

function appendRevisionFeedback(user: string, revision?: RevisionFeedback): string {
  const feedback = revision?.feedback?.trim();
  if (!feedback) return user;
  const current = JSON.stringify({
    a: briefRevisionSummary(revision?.existingOptions?.a),
    b: briefRevisionSummary(revision?.existingOptions?.b),
  }).slice(0, 7000);
  return `${user}

USER FEEDBACK FOR REGENERATION:
${feedback}

CURRENT GENERATED OPTIONS CONTEXT:
${current}

Regenerate complete updated briefs in the same JSON schema. Preserve what still works, fix the feedback directly, keep A/B angle + framework contrast, and re-check every email-campaign-playbook rule before returning JSON.`;
}

/** Generate two contrasting options (A + B), each a combined content + design brief. */
export async function generateOptions(
  campaign: Campaign,
  products: Product[],
  overrides?: PromptOverrides,
  modelInput?: Partial<AIModelPair>,
  revision?: RevisionFeedback
): Promise<GenerationResult> {
  try {
    const models = normalizeModelPair(modelInput);
    const sysA = overrides?.system?.trim() || buildSystemPrompt(campaign, products, false);
    const usrA = appendRevisionFeedback(overrides?.user?.trim() || buildUserPrompt(campaign, false), revision);

    const sysBInitial = overrides?.system?.trim()
      ? overrides.system.trim() + OPTION_B_INITIAL_CONTRAST
      : buildSystemPrompt(campaign, products, true) + OPTION_B_INITIAL_CONTRAST;
    const usrBBase = overrides?.user?.trim()
      ? overrides.user.trim() + "\n\nGenerate Option B now — make it a clearly different challenger from Option A."
      : buildUserPrompt(campaign, true);
    const usrB = appendRevisionFeedback(usrBBase, revision);

    const startedAt = Date.now();
    const [aRaw, bRaw] = await Promise.all([
      createAndParseWithModel(sysA, usrA, models.a),
      createAndParseWithModel(sysBInitial, usrB, models.b),
    ]);

    const a = validateBrief(aRaw as unknown as GenBrief, campaign, products);
    a._provider = providerLabel(models.a.provider);
    a._model = models.a.model;

    let b = validateBrief(bRaw as unknown as GenBrief, campaign, products);
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
      b._provider = providerLabel(models.b.provider);
      b._model = models.b.model;
    }

    console.info(`[generate-copy] completed A/B in ${Math.round((Date.now() - startedAt) / 1000)}s using ${models.a.provider}:${models.a.model} + ${models.b.provider}:${models.b.model}`);
    return { a, b };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Generation failed" };
  }
}
