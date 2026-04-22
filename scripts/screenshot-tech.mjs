import { chromium } from "playwright-core";

const execPath = "/Users/simonazoulay/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const browser = await chromium.launch({ executablePath: execPath });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// Login
await page.goto("https://insiders-trades-sigma.vercel.app/auth/login", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.fill('input[type="email"]',    "simon.azoulay.pro@gmail.com");
await page.fill('input[type="password"]', process.env.BETA_PASSWORD || "Sigma2026!");
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

// Go to /admin/tech
await page.goto("https://insiders-trades-sigma.vercel.app/admin/tech", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

await page.screenshot({ path: "/tmp/tech-top.png", fullPage: false });
console.log("✓ /tmp/tech-top.png");

await page.evaluate(() => window.scrollTo(0, 1500));
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/tech-pipeline.png", fullPage: false });
console.log("✓ /tmp/tech-pipeline.png");

await page.evaluate(() => window.scrollTo(0, 3200));
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/tech-scoring.png", fullPage: false });
console.log("✓ /tmp/tech-scoring.png");

await page.evaluate(() => window.scrollTo(0, 6000));
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/tech-roadmap.png", fullPage: false });
console.log("✓ /tmp/tech-roadmap.png");

await browser.close();
