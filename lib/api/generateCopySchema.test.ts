import { describe, expect, it } from "vitest";
import { generateCopyBodySchema, zodIssueSummary } from "./generateCopySchema";

describe("generateCopyBodySchema", () => {
  it("accepts compact per-segment prompt overrides", () => {
    const parsed = generateCopyBodySchema.safeParse({
      brandId: "bra_goddess",
      segments: ["21", "22"],
      products: [{ name: "Daisy Bra", slug: "daisybra", usps: ["front snap"] }],
      promptOverrides: {
        system: "Keep the playbook crisp.",
        user: "Less salesy; keep Daisy first.",
        segments: { "21": "More reassurance", "22": "More curiosity" },
      },
      models: {
        a: { provider: "claude", model: "claude-haiku-4-5" },
        b: { provider: "gemini", model: "gemini-2.5-flash-lite" },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects oversized product sets before orchestration starts", () => {
    const parsed = generateCopyBodySchema.safeParse({
      brandId: "bra_goddess",
      segments: ["21"],
      products: Array.from({ length: 9 }, (_, index) => ({ name: `Product ${index}` })),
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(zodIssueSummary(parsed.error).join("\n")).toMatch(/products/i);
  });

  it("rejects unknown AI providers", () => {
    const parsed = generateCopyBodySchema.safeParse({
      brandId: "bra_goddess",
      segments: ["21"],
      models: { a: { provider: "other-ai", model: "fast-one" } },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(zodIssueSummary(parsed.error).join("\n")).toMatch(/provider/i);
  });
});
