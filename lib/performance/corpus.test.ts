import { beforeEach, describe, expect, it, vi } from "vitest";

// F1.7 (docs/IMPROVEMENT_PLAN-2026-07-02.md): exercises computeWinningExemplars/getWinningExemplars
// against a fake Supabase query builder — real chain methods (.eq/.not/.order/.limit) that return
// `this`, resolved via a thenable `.then`, mirroring how @supabase/supabase-js's
// PostgrestFilterBuilder behaves when awaited directly.

let fromResult: { data: unknown; error: unknown };

function makeChain() {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "not", "order", "limit", "maybeSingle"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // maybeSingle resolves to the row directly rather than an array-wrapped result in real Supabase,
  // but for our purposes fromResult already carries the right shape per test.
  chain.then = (resolve: (v: unknown) => void) => resolve(fromResult);
  return chain;
}

const fromMock = vi.fn(() => makeChain());
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: () => ({ from: fromMock }),
}));

beforeEach(() => {
  fromMock.mockClear();
  fromResult = { data: null, error: null };
});

describe("computeWinningExemplars", () => {
  it("returns empty when history is below the minimum sample size", async () => {
    fromResult = { data: [{ delivered: 100, unique_clicks: 5, segment_code: "21", data: { subject: "A", opener: "B" } }], error: null };
    const { computeWinningExemplars } = await import("./corpus");
    expect(await computeWinningExemplars("u1", "bra_goddess")).toEqual({ subjects: [], openers: [] });
  });

  it("picks subjects/openers only from top-quartile-CTR sends, deduped", async () => {
    fromResult = {
      data: [
        { delivered: 100, unique_clicks: 1, segment_code: "21", data: { subject: "Weak subject", opener: "Weak opener" } },
        { delivered: 100, unique_clicks: 1, segment_code: "21", data: { subject: "Weak subject 2", opener: "Weak opener 2" } },
        { delivered: 100, unique_clicks: 1, segment_code: "21", data: { subject: "Weak subject 3", opener: "Weak opener 3" } },
        { delivered: 100, unique_clicks: 20, segment_code: "21", data: { subject: "Winning subject", opener: "Winning opener" } },
        { delivered: 100, unique_clicks: 20, segment_code: "21", data: { subject: "Winning subject", opener: "Winning opener" } },
      ],
      error: null,
    };
    const { computeWinningExemplars } = await import("./corpus");
    const result = await computeWinningExemplars("u1", "bra_goddess");
    expect(result.subjects).toEqual(["Winning subject"]);
    expect(result.openers).toEqual(["Winning opener"]);
  });

  it("returns empty on a query error rather than throwing", async () => {
    fromResult = { data: null, error: { message: "boom" } };
    const { computeWinningExemplars } = await import("./corpus");
    expect(await computeWinningExemplars("u1", "bra_goddess")).toEqual({ subjects: [], openers: [] });
  });
});

describe("getWinningExemplars", () => {
  it("reads the latest snapshot's winningExemplars payload", async () => {
    fromResult = { data: { payload: { winningExemplars: { subjects: ["S1"], openers: ["O1"] } } }, error: null };
    const { getWinningExemplars } = await import("./corpus");
    expect(await getWinningExemplars("u1", "bra_goddess")).toEqual({ subjects: ["S1"], openers: ["O1"] });
  });

  it("returns empty when no snapshot exists yet", async () => {
    fromResult = { data: null, error: null };
    const { getWinningExemplars } = await import("./corpus");
    expect(await getWinningExemplars("u1", "bra_goddess")).toEqual({ subjects: [], openers: [] });
  });
});
