import { describe, expect, it } from "vitest";
import { derivePerformanceSignal, performanceFeedbackPromptBlock, type SendOutcome } from "./feedback";

// F1.4 (docs/IMPROVEMENT_PLAN-2026-07-02.md): derivePerformanceSignal moved from
// above/below-brand-mean winners/laggards to quartile-based "lean into" / "avoid" directives.

function outcome(overrides: Partial<SendOutcome>): SendOutcome {
  return { date: "2026-06-01", brandId: "bra_goddess", segment: "21", ...overrides };
}

describe("derivePerformanceSignal", () => {
  it("puts only the top-quartile lever values in winners, not just above-average ones", () => {
    // Four distinct angle values with clearly separated CTRs: 1.0 (poor), 2.0, 2.0 (mid), 4.0 (best).
    const history: SendOutcome[] = [
      outcome({ angle: "value", metrics: { ctrPct: 1.0 } }),
      outcome({ angle: "value", metrics: { ctrPct: 1.0 } }),
      outcome({ angle: "urgency", metrics: { ctrPct: 2.0 } }),
      outcome({ angle: "urgency", metrics: { ctrPct: 2.0 } }),
      outcome({ angle: "curiosity", metrics: { ctrPct: 2.0 } }),
      outcome({ angle: "curiosity", metrics: { ctrPct: 2.0 } }),
      outcome({ angle: "social_proof", metrics: { ctrPct: 4.0 } }),
      outcome({ angle: "social_proof", metrics: { ctrPct: 4.0 } }),
    ];
    const sig = derivePerformanceSignal(history, "bra_goddess", 2);
    const winnerValues = sig.winners.filter((w) => w.lever === "angle").map((w) => w.value);
    expect(winnerValues).toContain("social_proof");
    expect(winnerValues).not.toContain("urgency");
    expect(winnerValues).not.toContain("curiosity");
  });

  it("requires at least 3 samples for a laggard even if minSamples is lower", () => {
    const history: SendOutcome[] = [
      outcome({ angle: "flop", metrics: { ctrPct: 0.1 } }),
      outcome({ angle: "flop", metrics: { ctrPct: 0.1 } }),
      outcome({ angle: "ok", metrics: { ctrPct: 2 } }),
      outcome({ angle: "ok", metrics: { ctrPct: 2 } }),
      outcome({ angle: "great", metrics: { ctrPct: 5 } }),
      outcome({ angle: "great", metrics: { ctrPct: 5 } }),
    ];
    const sig = derivePerformanceSignal(history, "bra_goddess", 2);
    // "flop" has only 2 samples — must not appear as a laggard despite the worst CTR.
    expect(sig.laggards.some((l) => l.value === "flop")).toBe(false);
  });

  it("scopes to the requested brand and ignores other brands' sends", () => {
    const history: SendOutcome[] = [
      outcome({ brandId: "bra_goddess", angle: "a", metrics: { ctrPct: 5 } }),
      outcome({ brandId: "bra_goddess", angle: "a", metrics: { ctrPct: 5 } }),
      outcome({ brandId: "gents_lux", angle: "b", metrics: { ctrPct: 0.1 } }),
      outcome({ brandId: "gents_lux", angle: "b", metrics: { ctrPct: 0.1 } }),
    ];
    const sig = derivePerformanceSignal(history, "bra_goddess");
    expect(sig.sends).toBe(2);
  });

  it("flags optout as rising only when the second half trends meaningfully above the first", () => {
    const history: SendOutcome[] = [
      outcome({ date: "2026-01-01", metrics: { ctrPct: 2, optoutPerDeliveredPct: 0.1 } }),
      outcome({ date: "2026-02-01", metrics: { ctrPct: 2, optoutPerDeliveredPct: 0.1 } }),
      outcome({ date: "2026-03-01", metrics: { ctrPct: 2, optoutPerDeliveredPct: 0.5 } }),
      outcome({ date: "2026-04-01", metrics: { ctrPct: 2, optoutPerDeliveredPct: 0.6 } }),
    ];
    expect(derivePerformanceSignal(history).optoutRising).toBe(true);
    const stable: SendOutcome[] = history.map((o) => ({ ...o, metrics: { ...o.metrics, optoutPerDeliveredPct: 0.1 } }));
    expect(derivePerformanceSignal(stable).optoutRising).toBe(false);
  });
});

describe("performanceFeedbackPromptBlock", () => {
  it("returns empty string with fewer than 3 sends", () => {
    expect(performanceFeedbackPromptBlock([outcome({ metrics: { ctrPct: 2 } })], "bra_goddess")).toBe("");
  });

  it("renders a bounded block for a real fixture history", () => {
    const history: SendOutcome[] = Array.from({ length: 12 }, (_, i) =>
      outcome({
        angle: i % 3 === 0 ? "urgency" : "social_proof",
        hero: i % 2 === 0 ? "daisybra" : "posybra",
        metrics: { ctrPct: i % 3 === 0 ? 0.5 : 3.5, optoutPerDeliveredPct: 0.2 },
      })
    );
    const block = performanceFeedbackPromptBlock(history, "bra_goddess");
    expect(block).toContain("ADAPTIVE PERFORMANCE FEEDBACK");
    expect(block.length).toBeLessThanOrEqual(2400);
  });

  it("caps the block at ~600 tokens (2400 chars) even with a huge winner/laggard set", () => {
    const angles = Array.from({ length: 40 }, (_, i) => `angle_${i}_${"x".repeat(30)}`);
    const history: SendOutcome[] = angles.flatMap((a, i) => [
      outcome({ angle: a, metrics: { ctrPct: i % 2 === 0 ? 5 : 0.1 } }),
      outcome({ angle: a, metrics: { ctrPct: i % 2 === 0 ? 5 : 0.1 } }),
      outcome({ angle: a, metrics: { ctrPct: i % 2 === 0 ? 5 : 0.1 } }),
    ]);
    const block = performanceFeedbackPromptBlock(history, "bra_goddess");
    expect(block.length).toBeLessThanOrEqual(2400);
  });
});
