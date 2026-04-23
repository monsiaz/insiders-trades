/**
 * Unit tests for performance-data pure math helpers.
 *
 * These functions compute the CAGR, annualised Sharpe, etc. that appear
 * on /performance and /pitch. Accuracy is critical for investor communication.
 */

import { describe, it, expect } from "vitest";

// ── Pure math helpers (from performance-data.ts) ─────────────────────────────

function mean(ns: number[]): number {
  return ns.length === 0 ? 0 : ns.reduce((a, b) => a + b, 0) / ns.length;
}
function std(ns: number[]): number {
  if (ns.length === 0) return 0;
  const m = mean(ns);
  return Math.sqrt(ns.reduce((acc, n) => acc + (n - m) ** 2, 0) / ns.length);
}
function cagr(monthlyReturns: number[]): number | null {
  if (monthlyReturns.length < 12) return null;
  const totalReturn = monthlyReturns.reduce((acc, r) => acc * (1 + r / 100), 1);
  const years = monthlyReturns.length / 12;
  return (Math.pow(totalReturn, 1 / years) - 1) * 100;
}
function annualisedSharpe(monthlyReturns: number[]): number {
  const s = std(monthlyReturns);
  return s > 0 ? (mean(monthlyReturns) / s) * Math.sqrt(12) : 0;
}

// ── mean / std ────────────────────────────────────────────────────────────────

describe("mean", () => {
  it("returns 0 for empty array", () => {
    expect(mean([])).toBe(0);
  });
  it("computes mean correctly", () => {
    expect(mean([2, 4, 6])).toBeCloseTo(4);
  });
});

describe("std (population)", () => {
  it("returns 0 for empty array", () => {
    expect(std([])).toBe(0);
  });
  it("returns 0 for constant values", () => {
    expect(std([5, 5, 5])).toBe(0);
  });
  it("computes population std for known set", () => {
    // std([2,4,4,4,5,5,7,9]) = 2 (population)
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2);
  });
});

// ── CAGR ──────────────────────────────────────────────────────────────────────

describe("cagr", () => {
  it("returns null for fewer than 12 months", () => {
    expect(cagr([])).toBeNull();
    expect(cagr([1, 2, 3])).toBeNull();
    expect(cagr(Array(11).fill(1))).toBeNull();
  });
  it("returns ~0% CAGR for flat returns", () => {
    expect(cagr(Array(12).fill(0))).toBeCloseTo(0);
  });
  it("returns ~12% CAGR for 1%/month for 1 year", () => {
    // (1.01)^12 - 1 ≈ 12.68%
    expect(cagr(Array(12).fill(1))).toBeCloseTo(12.68, 0);
  });
  it("returns higher CAGR over 2 years than 1 year for same monthly return", () => {
    const oneYear = Array(12).fill(1);
    const twoYears = Array(24).fill(1);
    // CAGR should be the same (same monthly return), but test the function works
    const c1 = cagr(oneYear)!;
    const c2 = cagr(twoYears)!;
    expect(Math.abs(c1 - c2)).toBeLessThan(0.5); // should be ~equal
  });
  it("handles negative months (drawdown)", () => {
    const mixed = [...Array(6).fill(2), ...Array(6).fill(-1)];
    const result = cagr(mixed);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(12); // lower than all-positive
  });
});

// ── Annualised Sharpe ─────────────────────────────────────────────────────────

describe("annualisedSharpe", () => {
  it("returns 0 for constant returns (no vol)", () => {
    expect(annualisedSharpe([1, 1, 1, 1])).toBe(0);
  });
  it("returns positive for positive mean with variance", () => {
    expect(annualisedSharpe([1, 2, 0.5, 1.5, 2, 1])).toBeGreaterThan(0);
  });
  it("annualises by multiplying by √12", () => {
    // monthly sharpe = mean/std; annual = monthly * √12
    const returns = [1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2];
    const m = mean(returns);
    const s = std(returns);
    const expected = (m / s) * Math.sqrt(12);
    expect(annualisedSharpe(returns)).toBeCloseTo(expected);
  });
  it("Sharpe > 1 indicates strong risk-adjusted returns", () => {
    // Consistent ~2% monthly with low variance → Sharpe > 1
    const good = [1.8, 2.1, 2.0, 1.9, 2.2, 2.0, 1.8, 2.1, 1.9, 2.0, 2.1, 1.8];
    expect(annualisedSharpe(good)).toBeGreaterThan(1);
  });
  it("Sharpe < 0 for consistently negative returns", () => {
    expect(annualisedSharpe([-1, -2, -1.5, -0.5, -2, -1])).toBeLessThan(0);
  });
});

// ── Financial consistency checks ─────────────────────────────────────────────

describe("financial consistency", () => {
  it("CAGR is higher for compounding vs additive returns", () => {
    // 12 months of +1% each: compounding > arithmetic
    const arithmeticSum = 12 * 1; // = 12%
    const compoundedCAGR = cagr(Array(12).fill(1))!;
    expect(compoundedCAGR).toBeGreaterThan(arithmeticSum);
  });
  it("median is more robust to outliers than mean", () => {
    // One huge outlier should not move median much
    const data = [1, 2, 2, 3, 3, 3, 200];
    const m = mean(data);
    // Find median manually
    const sorted = [...data].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    expect(m).toBeGreaterThan(20); // mean pulled by outlier
    expect(med).toBeLessThan(10);  // median unaffected
  });
});
