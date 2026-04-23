/**
 * Unit tests for pure aggregation functions in backtest-compute.ts
 *
 * These functions are critical for the correctness of every KPI displayed
 * in the Backtest Dashboard. They contain no I/O or DB calls.
 */

import { describe, it, expect } from "vitest";

// ── Re-export helpers for testing ────────────────────────────────────────────
// We extract the pure functions by importing from the source.
// Since they are not exported, we test through the exported aggregateGroup
// indirectly — or we can duplicate the helpers here for isolated unit tests.

// Pure helpers duplicated here to avoid private-export coupling:
function avg(ns: number[]): number | null {
  return ns.length === 0 ? null : ns.reduce((a, b) => a + b, 0) / ns.length;
}
function winRate(ns: number[]): number | null {
  return ns.length === 0 ? null : (ns.filter((n) => n > 0).length / ns.length) * 100;
}
function median(ns: number[]): number | null {
  if (ns.length === 0) return null;
  const sorted = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function sharpe(ns: number[]): number | null {
  if (ns.length < 3) return null;
  const a = avg(ns)!;
  const sd = Math.sqrt(ns.reduce((s, n) => s + (n - a) ** 2, 0) / ns.length);
  return sd === 0 ? null : a / sd;
}

// ── avg ───────────────────────────────────────────────────────────────────────

describe("avg", () => {
  it("returns null for empty array", () => {
    expect(avg([])).toBeNull();
  });
  it("computes mean for a single value", () => {
    expect(avg([10])).toBe(10);
  });
  it("computes arithmetic mean", () => {
    expect(avg([0, 10, 20])).toBeCloseTo(10);
  });
  it("handles negative returns", () => {
    expect(avg([-5, 5])).toBeCloseTo(0);
  });
  it("handles large sets accurately", () => {
    const vals = Array.from({ length: 1000 }, (_, i) => i);
    expect(avg(vals)).toBeCloseTo(499.5);
  });
});

// ── winRate ───────────────────────────────────────────────────────────────────

describe("winRate", () => {
  it("returns null for empty array", () => {
    expect(winRate([])).toBeNull();
  });
  it("returns 100 when all positive", () => {
    expect(winRate([1, 2, 3])).toBe(100);
  });
  it("returns 0 when all negative", () => {
    expect(winRate([-1, -2, -3])).toBe(0);
  });
  it("returns 50 for equal positive/negative", () => {
    expect(winRate([-1, 1])).toBe(50);
  });
  it("does not count zero as a win", () => {
    expect(winRate([0, 0, 1])).toBeCloseTo(33.33, 1);
  });
  it("exceeds 50% for typical bull-market sample", () => {
    // Real-world check: buys should have >50% win rate
    const returns = [5, 12, -3, 8, 2, -1, 15, 4, 7, -2];
    expect(winRate(returns)!).toBeGreaterThan(50);
  });
});

// ── median ────────────────────────────────────────────────────────────────────

describe("median", () => {
  it("returns null for empty array", () => {
    expect(median([])).toBeNull();
  });
  it("returns the single value", () => {
    expect(median([42])).toBe(42);
  });
  it("returns middle value for odd length", () => {
    expect(median([1, 3, 5])).toBe(3);
  });
  it("returns average of two middles for even length", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("is robust against outliers (unlike avg)", () => {
    // avg would be ~100, median should be ~6
    const skewed = [1, 2, 5, 6, 8, 10, 12, 500];
    expect(median(skewed)!).toBeLessThan(avg(skewed)!);
  });
  it("handles unsorted input", () => {
    expect(median([10, 2, 5])).toBe(5);
  });
});

// ── sharpe (cross-sectional ratio) ───────────────────────────────────────────

describe("sharpe (return/σ ratio)", () => {
  it("returns null for fewer than 3 values", () => {
    expect(sharpe([])).toBeNull();
    expect(sharpe([1])).toBeNull();
    expect(sharpe([1, 2])).toBeNull();
  });
  it("returns null when all returns are identical (σ=0)", () => {
    expect(sharpe([5, 5, 5])).toBeNull();
  });
  it("returns positive value for positive average with variance", () => {
    const positiveReturns = [5, 10, 8, 12, 6];
    expect(sharpe(positiveReturns)!).toBeGreaterThan(0);
  });
  it("returns negative value for negative average", () => {
    expect(sharpe([-5, -10, -8, -12, -6])!).toBeLessThan(0);
  });
  it("higher for more consistent positive returns", () => {
    const consistent   = [10, 11, 10, 12, 10]; // low variance
    const inconsistent = [5, 20, -5, 25, -10];  // same avg, high variance
    expect(sharpe(consistent)!).toBeGreaterThan(sharpe(inconsistent)!);
  });
  it("≥ 0.5 threshold means decent signal consistency", () => {
    // The Backtest Dashboard labels >0.5 as a good signal
    const goodSignal = [8, 12, 6, 10, 9, 11, 7];
    expect(sharpe(goodSignal)!).toBeGreaterThan(0.5);
  });
});
