import { describe, expect, it } from "vitest";
import { artificialProofPromptLayer, brandPlaybookRuleBlock, legacyPromptAlignmentLayer, templateCorpusPromptLayer } from "./briefgen";
import { PLAYBOOK_RULES, promptRuleBlock } from "./config/playbook";

describe("playbook artificial-proof stance (Jul 2026)", () => {
  it("never tells the model to avoid artificial proof or mark it needs-verification", () => {
    const allRuleText = PLAYBOOK_RULES.map((r) => `${r.win} ${r.fail}`).join(" ");

    expect(allRuleText.toLowerCase()).not.toContain("needs verification");
    expect(allRuleText.toLowerCase()).not.toContain("needs-verification");
    expect(allRuleText).toContain("standard and encouraged");
  });

  it("forbids fake clinical/study claims while allowing artificial badges", () => {
    const rule20 = PLAYBOOK_RULES.find((r) => r.id === "R20")!;
    const rule23 = PLAYBOOK_RULES.find((r) => r.id === "R23")!;

    expect(rule20.win.toLowerCase()).toContain("badges are standard");
    expect(rule20.fail.toLowerCase()).toContain("studies show");
    expect(rule23.name).toBe("Proof placement");
  });

  it("threads the artificial-proof stance into the assembled prompt rule block", () => {
    const block = promptRuleBlock("bra_goddess", "prompt");

    expect(block.toLowerCase()).not.toContain("needs verification");
  });
});

describe("playbook prompt alignment", () => {
  it("keeps win/fail template corpus lessons available to generation prompts", () => {
    const layer = templateCorpusPromptLayer();

    expect(layer).toContain("58 EMLs");
    expect(layer.toLowerCase()).toContain("one promise");
    expect(layer).toContain("product/model clearly visible");
    expect(layer).toContain("square crop");
    expect(layer).toContain("standard, not just draft material");
  });

  it("allows artificial proof on tiles/banner without a verification disclaimer, but keeps clinical claims banned", () => {
    const layer = artificialProofPromptLayer();

    expect(layer).toContain("banner");
    expect(layer).toContain("rating");
    expect(layer).toContain("BEST SELLER");
    expect(layer).not.toContain("needs verification");
    expect(layer.toLowerCase()).toContain("studies show");
    expect(layer.toLowerCase()).toContain("verified buyer");
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
