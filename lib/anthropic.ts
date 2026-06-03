import Anthropic from "@anthropic-ai/sdk";
import type { Campaign, Product } from "./config/types";
import { buildSystemPrompt, buildUserPrompt, contrastInstruction, validateBrief, type GenBrief } from "./briefgen";

// Generation engine wiring. Produces two contrasting options (A/B) — each a combined
// content + design brief — using the ported brief-generator prompt, with parse-retry and
// an A/B contrast retry.

const MODEL = "claude-sonnet-4-6";

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

/** Call the model and parse JSON, retrying once with a correction note on a parse error. */
async function createAndParse(system: string, user: string): Promise<Record<string, unknown>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await getClient().messages.create({
      model: MODEL,
      max_tokens: 8192,
      temperature: 0.65,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: attempt === 0 ? user : user + FIX_JSON_NOTE }],
    });
    const textPart = resp.content.find((c) => c.type === "text");
    const raw = textPart && textPart.type === "text" ? textPart.text : "";
    try {
      return parseStrictJson(raw);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to parse model output");
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

/** Generate two contrasting options (A + B), each a combined content + design brief. */
export async function generateOptions(
  campaign: Campaign,
  products: Product[],
  overrides?: PromptOverrides
): Promise<GenerationResult> {
  try {
    const sysA = overrides?.system?.trim() || buildSystemPrompt(campaign, products, false);
    const usrA = overrides?.user?.trim() || buildUserPrompt(campaign, false);
    const a = validateBrief((await createAndParse(sysA, usrA)) as unknown as GenBrief, campaign);

    // Option B keeps the contrast requirement even when the prompts are user-edited: append it
    // to the (possibly edited) base rather than re-deriving from scratch.
    const sysB = overrides?.system?.trim()
      ? overrides.system.trim() + "\n" + contrastInstruction(a.creative_direction)
      : buildSystemPrompt(campaign, products, true, a.creative_direction);
    const usrB = overrides?.user?.trim()
      ? overrides.user.trim() + "\n\nGenerate Option B now — you MUST use a different angle AND framework than Option A."
      : buildUserPrompt(campaign, true);
    let b = validateBrief((await createAndParse(sysB, usrB)) as unknown as GenBrief, campaign);

    // Auto-retry once if B reused A's angle or framework.
    if (
      b.creative_direction?.angle === a.creative_direction?.angle ||
      b.creative_direction?.framework === a.creative_direction?.framework
    ) {
      const retry = usrB + "\n\nWARNING: your previous attempt reused Option A's direction. You MUST choose a different angle AND a different framework.";
      b = validateBrief((await createAndParse(sysB, retry)) as unknown as GenBrief, campaign);
    }

    return { a, b };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Generation failed" };
  }
}
