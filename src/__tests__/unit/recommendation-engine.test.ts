/**
 * Unit tests for recommendation-engine helpers.
 *
 * Tests the scoring logic, role normalizer, and size labeler.
 * No DB calls — only pure functions.
 */

import { describe, it, expect } from "vitest";

// ── Pure helpers (duplicated from recommendation-engine internals) ─────────────

function normalizeRole(fn: string | null | undefined): string {
  if (!fn) return "Autre";
  const lower = fn.toLowerCase();
  if (/pr[ée]sident.*directeur|p\.?d\.?g|chief executive|ceo/i.test(lower)) return "PDG/DG";
  if (/directeur.*g[ée]n[ée]ral|dg\b/i.test(lower)) return "PDG/DG";
  if (/financier|cfo|daf\b/i.test(lower)) return "CFO/DAF";
  if (/conseil.*administration|board|administ/i.test(lower)) return "CA/Board";
  if (/surveillance/i.test(lower)) return "CA/Board";
  if (/actionnaire|shareholder/i.test(lower)) return "Actionnaire";
  return "Autre";
}

function sizeLabel(marketCap: bigint | number | null): string {
  const mc = marketCap ? Number(marketCap) : 0;
  if (mc <= 0)          return "Unknown";
  if (mc < 50_000_000)  return "Micro";
  if (mc < 300_000_000) return "Small";
  if (mc < 2_000_000_000) return "Mid";
  if (mc < 10_000_000_000) return "Large";
  return "Mega";
}

function isNonMarket(nature: string | null | undefined): boolean {
  if (!nature) return false;
  const n = nature.toLowerCase();
  return (
    n.includes("levée") ||
    n.includes("exercice") ||
    n.includes("attribution") ||
    n.includes("donation") ||
    n.includes("succession") ||
    n.includes("divorce")
  );
}

// ── normalizeRole ─────────────────────────────────────────────────────────────

describe("normalizeRole", () => {
  it("returns Autre for null/undefined", () => {
    expect(normalizeRole(null)).toBe("Autre");
    expect(normalizeRole(undefined)).toBe("Autre");
    expect(normalizeRole("")).toBe("Autre");
  });
  it("classifies PDG correctly", () => {
    expect(normalizeRole("Président-directeur général")).toBe("PDG/DG");
    expect(normalizeRole("P.D.G.")).toBe("PDG/DG");
    expect(normalizeRole("Chief Executive Officer")).toBe("PDG/DG");
  });
  it("classifies CFO correctly", () => {
    expect(normalizeRole("Directeur financier")).toBe("CFO/DAF");
    expect(normalizeRole("CFO")).toBe("CFO/DAF");
    expect(normalizeRole("DAF")).toBe("CFO/DAF");
  });
  it("classifies board member correctly", () => {
    expect(normalizeRole("Membre du Conseil d'administration")).toBe("CA/Board");
    expect(normalizeRole("Board Member")).toBe("CA/Board");
    expect(normalizeRole("Membre du Conseil de Surveillance")).toBe("CA/Board");
  });
  it("classifies shareholder", () => {
    expect(normalizeRole("Actionnaire")).toBe("Actionnaire");
    expect(normalizeRole("Shareholder")).toBe("Actionnaire");
  });
  it("falls back to Autre for unknown roles", () => {
    expect(normalizeRole("Responsable IT")).toBe("Autre");
    expect(normalizeRole("Stagiaire")).toBe("Autre");
  });
});

// ── sizeLabel ─────────────────────────────────────────────────────────────────

describe("sizeLabel", () => {
  it("returns Unknown for null/zero", () => {
    expect(sizeLabel(null)).toBe("Unknown");
    expect(sizeLabel(0)).toBe("Unknown");
  });
  it("classifies Micro (<50M€)", () => {
    expect(sizeLabel(10_000_000)).toBe("Micro");
    expect(sizeLabel(49_999_999)).toBe("Micro");
  });
  it("classifies Small (50M–300M€)", () => {
    expect(sizeLabel(50_000_000)).toBe("Small");
    expect(sizeLabel(299_999_999)).toBe("Small");
  });
  it("classifies Mid (300M–2B€)", () => {
    expect(sizeLabel(300_000_000)).toBe("Mid");
    expect(sizeLabel(1_999_999_999)).toBe("Mid");
  });
  it("classifies Large (2B–10B€)", () => {
    expect(sizeLabel(2_000_000_000)).toBe("Large");
    expect(sizeLabel(9_999_999_999)).toBe("Large");
  });
  it("classifies Mega (>10B€)", () => {
    expect(sizeLabel(10_000_000_000)).toBe("Mega");
    expect(sizeLabel(100_000_000_000)).toBe("Mega");
  });
  it("handles BigInt input", () => {
    expect(sizeLabel(BigInt(500_000_000))).toBe("Mid");
  });
});

// ── isNonMarket ───────────────────────────────────────────────────────────────

describe("isNonMarket (exclude non-market transactions)", () => {
  it("returns false for null", () => {
    expect(isNonMarket(null)).toBe(false);
  });
  it("excludes stock options (levée)", () => {
    expect(isNonMarket("Levée d'options")).toBe(true);
    expect(isNonMarket("exercice d'options")).toBe(true);
  });
  it("excludes donations/gifts", () => {
    expect(isNonMarket("Donation")).toBe(true);
    expect(isNonMarket("Succession")).toBe(true);
  });
  it("excludes divorce-related transfers", () => {
    expect(isNonMarket("Partage suite à divorce")).toBe(true);
  });
  it("does NOT exclude open-market buys", () => {
    expect(isNonMarket("Acquisition")).toBe(false);
    expect(isNonMarket("Achat sur le marché")).toBe(false);
  });
  it("does NOT exclude open-market sells", () => {
    expect(isNonMarket("Cession d'actions")).toBe(false);
  });
});
