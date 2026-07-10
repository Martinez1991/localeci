import { describe, it, expect } from "vitest";
import { estimateCost, rateForModel } from "./pricing.js";

describe("pricing", () => {
  it("mock is free", () => {
    expect(estimateCost({ model: "mock/pseudo-1", tokensIn: 1000, tokensOut: 1000 })).toBe(0);
  });

  it("matches models by substring", () => {
    expect(rateForModel("claude-haiku-4-5-20251001")).toEqual({ in: 1, out: 5 });
    expect(rateForModel("claude-sonnet-5")).toEqual({ in: 3, out: 15 });
    expect(rateForModel("gpt-4o-mini")).toEqual({ in: 0.15, out: 0.6 });
  });

  it("computes cost per token totals", () => {
    // 1M in @ $1 + 1M out @ $5 = $6 for haiku.
    expect(estimateCost({ model: "claude-haiku-4-5", tokensIn: 1_000_000, tokensOut: 1_000_000 })).toBeCloseTo(6, 5);
  });

  it("falls back for unknown models", () => {
    expect(rateForModel("some-future-model")).toEqual({ in: 2, out: 8 });
  });
});
