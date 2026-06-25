import type { AIModelPair, AIModelSelection, AIProvider } from "./types";

export interface AIModelOption {
  id: string;
  label: string;
  note?: string;
  speedTier?: AIModelSpeedTier;
}

export type AIModelSpeedTier = "fast" | "balanced" | "frontier";

export interface AIProviderOption {
  id: AIProvider;
  label: string;
  envVar: string;
  models: AIModelOption[];
}

export const AI_PROVIDERS: AIProviderOption[] = [
  {
    id: "claude",
    label: "Claude",
    envVar: "ANTHROPIC_API_KEY",
    models: [
      { id: "claude-opus-4-8", label: "Claude Opus 4.8", note: "Highest quality", speedTier: "frontier" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", note: "Balanced default", speedTier: "balanced" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", note: "Fast and economical", speedTier: "fast" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 alias", note: "Convenience alias", speedTier: "fast" },
    ],
  },
  {
    id: "gemini",
    label: "Gemini",
    envVar: "GEMINI_API_KEY",
    models: [
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", note: "Stable frontier default", speedTier: "fast" },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", note: "Highest reasoning preview", speedTier: "frontier" },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", note: "Frontier flash preview", speedTier: "fast" },
      { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite", note: "Fastest current Gemini", speedTier: "fast" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "Stable quality option", speedTier: "frontier" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "Stable price-performance", speedTier: "fast" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", note: "Stable budget option", speedTier: "fast" },
      { id: "gemini-flash-latest", label: "Gemini Flash Latest", note: "Hot-swapped latest alias", speedTier: "fast" },
    ],
  },
  {
    id: "openai",
    label: "ChatGPT",
    envVar: "OPENAI_API_KEY",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5", note: "Recommended production model", speedTier: "balanced" },
      { id: "gpt-5.5-pro", label: "GPT-5.5 Pro", note: "Highest quality, slower/costlier", speedTier: "frontier" },
      { id: "gpt-5.4", label: "GPT-5.4", note: "Lower cost frontier", speedTier: "balanced" },
      { id: "gpt-5.4-pro", label: "GPT-5.4 Pro", note: "Premium previous frontier", speedTier: "frontier" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", note: "Fast and economical", speedTier: "fast" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 Nano", note: "Lowest cost GPT-5.4 class", speedTier: "fast" },
      { id: "gpt-5-mini", label: "GPT-5 Mini", note: "Near-frontier low latency", speedTier: "fast" },
      { id: "gpt-5-nano", label: "GPT-5 Nano", note: "Fastest GPT-5 option", speedTier: "fast" },
      { id: "gpt-4.1", label: "GPT-4.1", note: "Non-reasoning fallback", speedTier: "balanced" },
      { id: "chat-latest", label: "ChatGPT Latest", note: "Tracks ChatGPT instant", speedTier: "balanced" },
    ],
  },
];

export const DEFAULT_AI_MODELS: AIModelPair = {
  a: { provider: "claude", model: "claude-sonnet-4-6" },
  b: { provider: "claude", model: "claude-sonnet-4-6" },
};

export function providerLabel(provider: AIProvider): string {
  return AI_PROVIDERS.find((p) => p.id === provider)?.label || provider;
}

export function modelLabel(selection?: AIModelSelection): string {
  if (!selection) return "";
  const provider = AI_PROVIDERS.find((p) => p.id === selection.provider);
  const model = provider?.models.find((m) => m.id === selection.model);
  return model ? `${provider?.label || selection.provider} · ${model.label}` : `${provider?.label || selection.provider} · ${selection.model}`;
}

export function modelSpeedTier(selection: AIModelSelection): AIModelSpeedTier {
  const provider = AI_PROVIDERS.find((p) => p.id === selection.provider);
  const listed = provider?.models.find((m) => m.id === selection.model);
  if (listed?.speedTier) return listed.speedTier;
  const id = selection.model.toLowerCase();
  if (/haiku|flash|lite|mini|nano/.test(id)) return "fast";
  if (/opus|pro|preview|thinking|reasoning/.test(id) && !/mini|nano|flash|lite/.test(id)) return "frontier";
  return "balanced";
}

export function normalizeModelSelection(
  selection: Partial<AIModelSelection> | undefined,
  fallback: AIModelSelection
): AIModelSelection {
  const requestedProvider = AI_PROVIDERS.find((p) => p.id === selection?.provider);
  const provider = requestedProvider || AI_PROVIDERS.find((p) => p.id === fallback.provider) || AI_PROVIDERS[0];
  const selectedModel = typeof selection?.model === "string" ? selection.model.trim() : "";
  const fallbackModel = provider.id === fallback.provider ? fallback.model.trim() : "";
  // Preserve the exact model chosen by the user for a valid provider, including newly
  // released aliases that are not in this UI list yet. Silent first-model fallback
  // makes audits impossible and can route content to the wrong model.
  const model = requestedProvider && selectedModel ? selectedModel : fallbackModel || provider.models[0].id;
  return { provider: provider.id, model };
}

export function normalizeModelPair(input?: Partial<AIModelPair>): AIModelPair {
  return {
    a: normalizeModelSelection(input?.a, DEFAULT_AI_MODELS.a),
    b: normalizeModelSelection(input?.b, DEFAULT_AI_MODELS.b),
  };
}
