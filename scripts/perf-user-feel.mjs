#!/usr/bin/env node
/**
 * Measures actual UI feedback times: time to first paint (skeleton/page appears)
 * and time to final content (H1 of real page is visible).
 */
import { chromium } from "playwright-core";

const execPath = "/Users/simonazoulay/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = process.env.BASE_URL || "https://insiders-trades-sigma.vercel.app";

const browser = await chromium.launch({ executablePath: execPath });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', "simon.azoulay.pro@gmail.com");
await page.fill('input[type="password"]', process.env.BETA_PASSWORD || "Sigma2026!");
const nav = page.waitForResponse(r => r.url().includes("/api/auth/login") && r.status() === 200, { timeout: 15000 }).catch(() => null);
await page.click('button[type="submit"]');
await nav;
await page.waitForTimeout(2000);

async function bench(targetHref, targetH1Part) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    const t0 = Date.now();

    // Kick off in parallel: page transition + observe paint events
    await Promise.all([
      page.click(`a[href="${targetHref}"]`),
      page.waitForURL((u) => u.toString().includes(targetHref), { timeout: 10000 }),
    ]);
    const urlChanged = Date.now() - t0;

    // Skeleton is visible if there's any .bg-raised pulse or we're on a new pathname
    // We measure when the <main> element rerenders
    const paint = await page.evaluate(() => performance.now()).catch(() => 0);
    const firstPaint = Date.now() - t0;

    // Wait for final content H1
    await page.waitForFunction(
      (text) => {
        const h1 = document.querySelector("h1");
        return h1 && h1.textContent && h1.textContent.toLowerCase().includes(text.toLowerCase());
      },
      targetH1Part,
      { timeout: 15000 }
    ).catch(() => {});
    const contentReady = Date.now() - t0;

    runs.push({ urlChanged, firstPaint, contentReady });
  }
  const avg = (k) => Math.round(runs.reduce((a, b) => a + b[k], 0) / runs.length);
  return { urlChanged: avg("urlChanged"), firstPaint: avg("firstPaint"), contentReady: avg("contentReady") };
}

console.log("\n⏱️  User-feel navigation times [3 runs]\n");
console.log("Page".padEnd(35), "URL".padStart(8), "Paint".padStart(8), "Content".padStart(10));
console.log("─".repeat(72));

const tests = [
  ["/companies", "Sociétés"],
  ["/insiders", "Dirigeants"],
  ["/recommendations", "Recommandations"],
  ["/backtest", "Backtest"],
  ["/portfolio", "Portfolio"],
];

for (const [href, h1] of tests) {
  const r = await bench(href, h1);
  console.log(
    href.padEnd(35),
    `${r.urlChanged}ms`.padStart(8),
    `${r.firstPaint}ms`.padStart(8),
    `${r.contentReady}ms`.padStart(10),
  );
}

await browser.close();
