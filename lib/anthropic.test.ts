import { describe, expect, it } from "vitest";
import { adaptiveBatchSettings, compactPromptText, hasDeadlineBudget, remainingDeadlineMs, segmentChunks } from "./anthropic";
import type { AIModelPair } from "./config/types";

describe("segmentChunks", () => {
  it("returns one chunk per segment when batchSize=1 (default)", () => {
    expect(segmentChunks(["21", "22", "45"])).toEqual([["21"], ["22"], ["45"]]);
  });

  it("groups segments into batches of the given size", () => {
    expect(segmentChunks(["21", "22", "45", "8"], 2)).toEqual([["21", "22"], ["45", "8"]]);
  });

  it("handles a trailing partial batch", () => {
    expect(segmentChunks(["21", "22", "45"], 2)).toEqual([["21", "22"], ["45"]]);
  });

  it("returns an empty array for empty input", () => {
    expect(segmentChunks([])).toEqual([]);
  });

  it("returns one chunk when batchSize exceeds segment count", () => {
    expect(segmentChunks(["21", "22"], 10)).toEqual([["21", "22"]]);
  });
});

describe("adaptiveBatchSettings", () => {
  const fastPair: AIModelPair = {
    a: { provider: "claude", model: "claude-haiku-4-5" },
    b: { provider: "gemini", model: "gemini-2.5-flash-lite" },
  };
  const balancedPair: AIModelPair = {
    a: { provider: "claude", model: "claude-sonnet-4-6" },
    b: { provider: "openai", model: "gpt-5.5" },
  };
  const frontierPair: AIModelPair = {
    a: { provider: "claude", model: "claude-opus-4-8" },
    b: { provider: "openai", model: "gpt-5.5-pro" },
  };

  it("groups three selected segments into one patch batch", () => {
    expect(adaptiveBatchSettings(balancedPair, 3)).toMatchObject({ batchSize: 3, concurrency: 1, tier: "balanced" });
  });

  it("lets faster models run patch batches concurrently", () => {
    expect(adaptiveBatchSettings(fastPair, 12)).toMatchObject({ batchSize: 3, concurrency: 3, tier: "fast" });
  });

  it("keeps frontier models conservative without falling back to one segment per batch", () => {
    expect(adaptiveBatchSettings(frontierPair, 12)).toMatchObject({ batchSize: 4, concurrency: 1, tier: "frontier" });
  });
});

describe("compactPromptText", () => {
  it("normalizes pasted whitespace without changing short prompts", () => {
    expect(compactPromptText("  Keep\n\nthis\tbrief   clear. ", 80)).toBe("Keep this brief clear.");
  });

  it("marks truncated prompt context explicitly", () => {
    const compacted = compactPromptText("a ".repeat(100), 50);
    expect(compacted.length).toBeLessThanOrEqual(50);
    expect(compacted).toMatch(/\[truncated\]$/);
  });
});

describe("remainingDeadlineMs", () => {
  it("returns Infinity when no deadline is set", () => {
    expect(remainingDeadlineMs(undefined)).toBe(Number.POSITIVE_INFINITY);
    expect(remainingDeadlineMs({})).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns a positive number for a far-future deadline", () => {
    const deadlineAt = Date.now() + 60_000;
    const remaining = remainingDeadlineMs({ deadlineAt });
    expect(remaining).toBeGreaterThan(55_000);
    expect(remaining).toBeLessThanOrEqual(60_000);
  });

  it("returns a negative number for a past deadline", () => {
    const deadlineAt = Date.now() - 5_000;
    expect(remainingDeadlineMs({ deadlineAt })).toBeLessThan(0);
  });
});

describe("hasDeadlineBudget", () => {
  it("returns true when no deadline is set (Infinity remaining)", () => {
    expect(hasDeadlineBudget({ timeoutMs: 145_000 })).toBe(true);
  });

  it("returns true when there is enough time before the deadline", () => {
    const deadlineAt = Date.now() + 300_000; // 5 minutes out
    expect(hasDeadlineBudget({ deadlineAt, timeoutMs: 60_000 })).toBe(true);
  });

  it("returns false when deadline is too close to fit a retry", () => {
    const deadlineAt = Date.now() + 1_000; // 1 second left
    expect(hasDeadlineBudget({ deadlineAt, timeoutMs: 60_000 })).toBe(false);
  });

  it("uses PROVIDER_TIMEOUT_MS fallback when timeoutMs is omitted", () => {
    // With no timeoutMs and no deadline, always returns true.
    expect(hasDeadlineBudget({})).toBe(true);
  });
});
