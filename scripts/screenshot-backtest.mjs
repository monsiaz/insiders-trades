import { chromium } from "playwright-core";

const execPath = "/Users/simonazoulay/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const BASE = "https://insiders-trades-sigma.vercel.app";

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

await page.goto(`${BASE}/backtest`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/da-audit/backtest-v2.png", fullPage: false });
console.log("✓ /tmp/da-audit/backtest-v2.png");

await browser.close();
