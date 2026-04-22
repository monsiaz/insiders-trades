import { chromium } from "playwright-core";

const execPath = "/Users/simonazoulay/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "https://insiders-trades-sigma.vercel.app";

// Mix of small caps + big names + recently fixed
const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Pass slugs as args");
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: execPath });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 600 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.fill('input[type="email"]', "simon.azoulay.pro@gmail.com");
await page.fill('input[type="password"]', process.env.BETA_PASSWORD || "Sigma2026!");
const nav = page.waitForResponse(r => r.url().includes("/api/auth/login") && r.status() === 200, { timeout: 15000 }).catch(() => null);
await page.click('button[type="submit"]');
await nav;
await page.waitForTimeout(2000);

for (const slug of targets) {
  await page.goto(`${BASE}/company/${slug}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const hero = page.locator(".glass-card-static").first();
  try {
    await hero.screenshot({ path: `/tmp/logo-audit/${slug}-hero.png` });
    console.log(`✓ /tmp/logo-audit/${slug}-hero.png`);
  } catch {
    await page.screenshot({ path: `/tmp/logo-audit/${slug}-hero.png`, clip: { x: 0, y: 60, width: 1400, height: 300 } });
    console.log(`✓ /tmp/logo-audit/${slug}-hero.png (fullpage clip)`);
  }
}

await browser.close();
