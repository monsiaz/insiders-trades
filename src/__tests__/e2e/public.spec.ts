/**
 * E2E tests for public (unauthenticated) pages.
 *
 * These should all be accessible without a session.
 * Any 401 redirect to /auth/login is a regression.
 */

import { test, expect } from "@playwright/test";

test.describe("Public pages load without authentication", () => {
  const PUBLIC_PAGES: Array<{ path: string; title: RegExp; timeout?: number }> = [
    { path: "/fonctionnement/", title: /How it works|Comment/i },
    { path: "/methodologie/",   title: /Methodology|Méthodologie/i },
    { path: "/performance/",    title: /Performance|Transparence/i },
    // strategie/ tested separately below (heavy page, own timeout)
    // { path: "/strategie/",   title: /Strategy/i, timeout: 45_000 },
    { path: "/pitch/",          title: /Pitch|Sigma/i },
    { path: "/docs/",           title: /API|Documentation/i },
    { path: "/auth/login/",     title: /Sigma|InsiderTrades/i },
  ];

  for (const { path, title, timeout } of PUBLIC_PAGES) {
    test(`${path} → loads (not redirected to login)`, async ({ page }) => {
      const response = await page.goto(path, { timeout: (timeout ?? 15_000) });
      expect(response?.status()).not.toBe(401);
      if (path !== "/auth/login/") {
        await expect(page).not.toHaveURL(/\/auth\/login/);
      }
      await expect(page).toHaveTitle(title, { timeout: timeout ?? 15_000 });
    });
  }
});

// Heavy page — separate test with extended timeout
test("/strategie/ → loads without auth (heavy page)", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/strategie/", { timeout: 50_000, waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/auth\/login/);
  // Just verify the page body loaded (title may not be set yet on slow cold-start)
  await expect(page.locator("body")).not.toBeEmpty();
});

test.describe("Magic link flow", () => {
  test("invalid token returns 401", async ({ page }) => {
    const response = await page.goto("/api/auth/magic/?t=wrong-token");
    expect(response?.status()).toBe(401);
  });

  test("missing token returns 401", async ({ page }) => {
    const response = await page.goto("/api/auth/magic/");
    expect(response?.status()).toBe(401);
  });
});

test.describe("Protected pages redirect to login", () => {
  const PROTECTED = ["/portfolio/", "/recommendations/", "/backtest/", "/companies/"];

  for (const path of PROTECTED) {
    test(`${path} → redirects to /auth/login/`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  }
});

test.describe("SEO and metadata", () => {
  test("homepage has correct canonical", async ({ page }) => {
    await page.goto("/auth/login/");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(/insiders-trades-sigma\.vercel\.app/);
  });

  test("robots.txt is accessible", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    expect(response?.status()).toBe(200);
    const body = await response?.text();
    expect(body).toMatch(/User-agent/i);
  });

  test("sitemap.xml is accessible", async ({ page }) => {
    const response = await page.goto("/sitemap.xml");
    expect(response?.status()).toBe(200);
  });
});
