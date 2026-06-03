import Anthropic from "@anthropic-ai/sdk";
import type { Campaign, TierCode, VariantCopy, VariantCopyMap } from "./config/types";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";

// Per-tier copy generation. One Claude call per tier (not per variant) keeps each prompt
// mindset-focused (see CLAUDE.md). The brand-level system prompt is prompt-cached so the
// per-tier calls reuse it cheaply.

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

/** Strip markdown code fences and isolate the JSON object before parsing. */
function parseStrictJson(text: string): Record<string, unknown> {
  let t = text.trim();
  // Remove ```json ... ``` fences if present.
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model output");
  return JSON.parse(t.slice(start, end + 1));
}

export interface TierResult {
  tier: TierCode;
  copy: VariantCopyMap; // keyed by `${tier}${productType}`
  error?: string;
}

/**
 * Optional prompt overrides reviewed/edited on the "prompts" step.
 * What the user sees there is what gets sent.
 */
export interface PromptOverrides {
  system?: string;
  byTier?: Record<string, string>;
}

/** Generate copy for all variants in a single tier. */
export async function generateCopyForTier(
  campaign: Campaign,
  tier: TierCode,
  overrides?: PromptOverrides
): Promise<TierResult> {
  const system = overrides?.system?.trim() || buildSystemPrompt(campaign.brandId);
  const user = overrides?.byTier?.[tier]?.trim() || buildUserPrompt(campaign, tier);

  const resp = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" }, // cache the brand-level prompt across tiers
      },
    ],
    messages: [{ role: "user", content: user }],
  });

  const textPart = resp.content.find((c) => c.type === "text");
  const raw = textPart && textPart.type === "text" ? textPart.text : "";

  try {
    const parsed = parseStrictJson(raw) as Record<string, VariantCopy>;
    return { tier, copy: parsed };
  } catch (err) {
    return {
      tier,
      copy: {},
      error: err instanceof Error ? err.message : "Failed to parse model output",
    };
  }
}

/** Generate copy for every tier in the campaign, one call per tier (run in parallel). */
export async function generateAllVariants(
  campaign: Campaign,
  overrides?: PromptOverrides
): Promise<{
  copy: VariantCopyMap;
  errors: { tier: TierCode; error: string }[];
}> {
  const results = await Promise.all(
    campaign.tiers.map((tier) => generateCopyForTier(campaign, tier, overrides))
  );

  const copy: VariantCopyMap = {};
  const errors: { tier: TierCode; error: string }[] = [];
  for (const r of results) {
    if (r.error) errors.push({ tier: r.tier, error: r.error });
    Object.assign(copy, r.copy);
  }
  return { copy, errors };
}
