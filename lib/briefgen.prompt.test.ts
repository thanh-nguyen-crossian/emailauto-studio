import { describe, expect, it } from "vitest";
import { artificialProofPromptLayer, brandPlaybookRuleBlock, legacyPromptAlignmentLayer, templateCorpusPromptLayer } from "./briefgen";

describe("playbook prompt alignment", () => {
  it("keeps win/fail template corpus lessons available to generation prompts", () => {
    const layer = templateCorpusPromptLayer();

    expect(layer).toContain("58 EMLs");
    expect(layer.toLowerCase()).toContain("one promise");
    expect(layer).toContain("product/model clearly visible");
    expect(layer).toContain("square crop");
    expect(layer).toContain("synthetic/needs verification");
  });

  it("allows artificial proof as draft material without treating it as verified proof", () => {
    const layer = artificialProofPromptLayer();

    expect(layer).toContain("review");
    expect(layer).toContain("banner customer-review chips");
    expect(layer).toContain("rating");
    expect(layer).toContain("synthetic");
    expect(layer).toContain("needs verification");
    expect(layer).toContain("verified");
  });

  it("keeps GentsLux legacy prompt habits available to the app", () => {
    const brandRules = brandPlaybookRuleBlock("gents_lux");
    const alignment = legacyPromptAlignmentLayer("gents_lux");

    expect(brandRules).toContain("JettJeans");
    expect(brandRules).toContain("budget-aware");
    expect(brandRules).toContain("storewide/no code/no exclusions/no limit");
    expect(brandRules).toContain("two USP chips under 4w");
    expect(alignment).toContain("fit/cooling advice");
    expect(alignment).toContain("storewide/no-code/no-exclusions/no-limit");
    expect(alignment).toContain("Product blocks need");
  });

  it("keeps LuxFitting legacy prompt habits available to the app", () => {
    const brandRules = brandPlaybookRuleBlock("lux_fitting");
    const alignment = legacyPromptAlignmentLayer("lux_fitting");

    expect(brandRules).toContain("StretchActive");
    expect(brandRules).toContain("budget-aware");
    expect(brandRules).toContain("storewide/no code/no exclusions/no limit");
    expect(brandRules).toContain("two USP chips under 4w");
    expect(alignment).toContain("seasonal styling/comfort tips");
    expect(alignment).toContain("storewide/no-code/no-exclusions/no-limit");
    expect(alignment).toContain("visual styling/mechanism note");
  });
});
