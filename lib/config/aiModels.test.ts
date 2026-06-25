import { describe, expect, it } from "vitest";
import { modelSpeedTier } from "./aiModels";

describe("modelSpeedTier", () => {
  it("classifies fast model families", () => {
    expect(modelSpeedTier({ provider: "claude", model: "claude-haiku-4-5" })).toBe("fast");
    expect(modelSpeedTier({ provider: "gemini", model: "gemini-2.5-flash-lite" })).toBe("fast");
    expect(modelSpeedTier({ provider: "openai", model: "gpt-5-nano" })).toBe("fast");
  });

  it("classifies frontier model families", () => {
    expect(modelSpeedTier({ provider: "claude", model: "claude-opus-4-8" })).toBe("frontier");
    expect(modelSpeedTier({ provider: "gemini", model: "gemini-2.5-pro" })).toBe("frontier");
    expect(modelSpeedTier({ provider: "openai", model: "gpt-5.5-pro" })).toBe("frontier");
  });

  it("keeps unknown aliases balanced unless the name signals speed or frontier behavior", () => {
    expect(modelSpeedTier({ provider: "openai", model: "chat-latest" })).toBe("balanced");
    expect(modelSpeedTier({ provider: "gemini", model: "vendor-new-mini" })).toBe("fast");
  });
});
