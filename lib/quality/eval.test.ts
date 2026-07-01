import { describe, expect, it } from "vitest";
import { checkSlop, goldenCampaign, runDiversityEval, runGoldenSet, runQualityOverhaulEval, strongBrief } from "./eval";
import { validateBrief } from "../briefgen";
import { BRANDS } from "../config/brands";
import { renderEmailHTML } from "../render/email";

// Regression guard (T5.2/T5.3 of docs/IMPLEMENTATION-PLAN-2026-07.md): the golden set makes
// prompt/validator/scoring changes measurable instead of judged by vibes. If a future change to
// lib/briefgen.ts or lib/quality/deliverability.ts inverts strong-beats-weak, this fails loudly
// instead of silently shipping a worse generator.
describe("golden set regression guard", () => {
  it("the compliant brief clearly outscores the broken one on both validation and deliverability", () => {
    const result = runGoldenSet();
    expect(result.reasons).toEqual([]);
    expect(result.pass).toBe(true);
    expect(result.strong.validationErrors).toBe(0);
    expect(result.strong.validationScore).toBeGreaterThan(result.weak.validationScore);
    expect(result.strong.deliverabilityScore).toBeGreaterThan(result.weak.deliverabilityScore);
  });

  it("the golden brief has no AI-tell slop phrases", () => {
    expect(checkSlop(strongBrief())).toMatchObject({ detected: [], pass: true });
  });

  it("diversity and quality-overhaul evals stay green", () => {
    expect(runDiversityEval().pass).toBe(true);
    expect(runQualityOverhaulEval().pass).toBe(true);
  });
});

describe("golden brief renders to email-safe HTML", () => {
  it("produces table-based markup with no raw $ and responsive images", () => {
    const { campaign, products } = goldenCampaign();
    const brief = validateBrief(strongBrief(), campaign, products);
    const brand = BRANDS[campaign.brandId];
    const html = renderEmailHTML(brand, campaign, products, brief, "21", {});

    expect(html).toMatch(/<table/i);
    expect(html).not.toMatch(/\$\d/);
    expect(html).toMatch(/max-width/i);
    // {{paramurl}} is the SendGrid link-tracking merge tag — must be emitted literally, never
    // resolved to a value. SendGrid appends its own unsubscribe block below the content at send
    // time, so there is no {{unsubscribe}} literal to assert on here.
    expect(html).toContain("{{paramurl}}");
    expect(html.toLowerCase()).toContain("opt out");
  });
});
