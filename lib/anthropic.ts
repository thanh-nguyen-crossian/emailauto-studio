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
  const resp = await getClient().messages.create({
    model,
    max_tokens: 16000,
    temperature: 0.65,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  const textPart = resp.content.find((c) => c.type === "text");
  return textPart && textPart.type === "text" ? textPart.text : "";
}

async function callGemini(system: string, user: string, model: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
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
  const data = (await res.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${data.error?.message || "request failed"}`);
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
}

async function callOpenAI(system: string, user: string, model: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_completion_tokens: 16000,
      response_format: { type: "json_object" },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${data.error?.message || "request failed"}`);
  return data.choices?.[0]?.message?.content || "";
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
    const a = validateBrief((await createAndParseWithModel(sysA, usrA, models.a)) as unknown as GenBrief, campaign, products);
    a._provider = providerLabel(models.a.provider);
    a._model = models.a.model;

    // Option B keeps the contrast requirement even when the prompts are user-edited: append it
    // to the (possibly edited) base rather than re-deriving from scratch.
    const sysB = overrides?.system?.trim()
      ? overrides.system.trim() + "\n" + contrastInstruction(a.creative_direction)
      : buildSystemPrompt(campaign, products, true, a.creative_direction);
    const usrBBase = overrides?.user?.trim()
      ? overrides.user.trim() + "\n\nGenerate Option B now — you MUST use a different angle AND framework than Option A."
      : buildUserPrompt(campaign, true);
    const usrB = appendRevisionFeedback(usrBBase, revision);
    let b = validateBrief((await createAndParseWithModel(sysB, usrB, models.b)) as unknown as GenBrief, campaign, products);
    b._provider = providerLabel(models.b.provider);
    b._model = models.b.model;

    // Auto-retry once if B reused A's angle or framework.
    if (
      b.creative_direction?.angle === a.creative_direction?.angle ||
      b.creative_direction?.framework === a.creative_direction?.framework
    ) {
      const retry = usrB + "\n\nWARNING: your previous attempt reused Option A's direction. You MUST choose a different angle AND a different framework.";
      b = validateBrief((await createAndParseWithModel(sysB, retry, models.b)) as unknown as GenBrief, campaign, products);
      b._provider = providerLabel(models.b.provider);
      b._model = models.b.model;
    }

    return { a, b };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Generation failed" };
  }
}
