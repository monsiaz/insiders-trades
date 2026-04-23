/**
 * Unit tests for i18n utilities.
 *
 * Covers: translateRole, localePath, stripLocale, getLocaleFromPathname.
 */

import { describe, it, expect } from "vitest";
import {
  translateRole,
  localePath,
  stripLocale,
  getLocaleFromPathname,
} from "@/lib/i18n";

// ── translateRole ─────────────────────────────────────────────────────────────

describe("translateRole", () => {
  it("returns null for null input", () => {
    expect(translateRole(null, "en")).toBeNull();
  });
  it("returns undefined for undefined input", () => {
    expect(translateRole(undefined, "en")).toBeUndefined();
  });
  it("does NOT translate when locale is fr", () => {
    expect(translateRole("Président-directeur général", "fr")).toBe(
      "Président-directeur général"
    );
  });
  it("translates PDG for EN locale", () => {
    expect(translateRole("Président-directeur général", "en")).toBe("Chairman & CEO");
  });
  it("translates board member", () => {
    expect(translateRole("Membre du Conseil d'administration", "en")).toBe("Board Member");
  });
  it("translates CFO", () => {
    expect(translateRole("Directeur financier", "en")).toBe("Chief Financial Officer");
  });
  it("translates CEO", () => {
    expect(translateRole("Directeur général", "en")).toBe("Chief Executive Officer");
  });
  it("translates supervisory board", () => {
    expect(translateRole("Membre du Conseil de Surveillance", "en")).toBe(
      "Supervisory Board Member"
    );
  });
  it("returns original string if no match found", () => {
    expect(translateRole("Poste inconnu XYZ", "en")).toBe("Poste inconnu XYZ");
  });
  it("is case-insensitive for the lookup", () => {
    // The role might come in various capitalizations from AMF data
    expect(translateRole("DIRECTEUR GÉNÉRAL", "en")).toBe("Chief Executive Officer");
  });
});

// ── stripLocale ───────────────────────────────────────────────────────────────

describe("stripLocale", () => {
  it("strips /fr from the path", () => {
    expect(stripLocale("/fr/companies/")).toBe("/companies/");
  });
  it("handles /fr root", () => {
    expect(stripLocale("/fr")).toBe("/");
  });
  it("handles /fr/ root", () => {
    expect(stripLocale("/fr/")).toBe("/");
  });
  it("does not strip en paths", () => {
    expect(stripLocale("/companies/")).toBe("/companies/");
  });
  it("handles deep paths", () => {
    expect(stripLocale("/fr/company/lvmh-1234/")).toBe("/company/lvmh-1234/");
  });
  it("does not affect paths starting with /fre or /france", () => {
    // Should not strip unless it's exactly /fr or /fr/
    expect(stripLocale("/france/")).toBe("/france/");
  });
});

// ── localePath ────────────────────────────────────────────────────────────────

describe("localePath", () => {
  it("returns / for fr root", () => {
    expect(localePath("/", "fr")).toBe("/fr");
  });
  it("returns / for en root", () => {
    expect(localePath("/", "en")).toBe("/");
  });
  it("prefixes /fr for FR locale", () => {
    expect(localePath("/companies/", "fr")).toBe("/fr/companies/");
  });
  it("returns path as-is for EN locale", () => {
    expect(localePath("/companies/", "en")).toBe("/companies/");
  });
  it("handles paths already without locale prefix", () => {
    expect(localePath("/insider/john-doe/", "fr")).toBe("/fr/insider/john-doe/");
  });
  it("strips existing /fr prefix before adding it back", () => {
    // If given a /fr path and asked for fr, should not double-prefix
    expect(localePath("/fr/companies/", "fr")).toBe("/fr/companies/");
  });
});

// ── getLocaleFromPathname ─────────────────────────────────────────────────────

describe("getLocaleFromPathname", () => {
  it("returns fr for /fr path", () => {
    expect(getLocaleFromPathname("/fr")).toBe("fr");
  });
  it("returns fr for /fr/ path", () => {
    expect(getLocaleFromPathname("/fr/")).toBe("fr");
  });
  it("returns fr for /fr/companies/", () => {
    expect(getLocaleFromPathname("/fr/companies/")).toBe("fr");
  });
  it("returns en for /companies/", () => {
    expect(getLocaleFromPathname("/companies/")).toBe("en");
  });
  it("returns en for root /", () => {
    expect(getLocaleFromPathname("/")).toBe("en");
  });
  it("returns en for /backtest/", () => {
    expect(getLocaleFromPathname("/backtest/")).toBe("en");
  });
});
