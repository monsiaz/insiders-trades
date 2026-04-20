import { chromium } from "playwright-core";

const execPath = "/Users/simonazoulay/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const browser = await chromium.launch({ executablePath: execPath });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// Step 1: login
await page.goto("https://insiders-trades-sigma.vercel.app/auth/login", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.fill('input[type="email"]', "simon.azoulay.pro@gmail.com");
await page.fill('input[type="password"]', process.env.BETA_PASSWORD || "Sigma2026!");
await page.click('button[type="submit"]');
await page.waitForURL(/\//, { timeout: 15000 });
await page.waitForTimeout(800);

// Step 2: go to admin
await page.goto("https://insiders-trades-sigma.vercel.app/admin", { waitUntil: "networkidle" });
await page.waitForTimeout(1800);

// Users tab screenshot
await page.screenshot({ path: "/tmp/admin-users.png", fullPage: false });
console.log("✓ /tmp/admin-users.png");

// Click Cron tab
const cronTab = page.locator('button:has-text("Tâches & Cron")');
await cronTab.click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/admin-cron.png", fullPage: false });
console.log("✓ /tmp/admin-cron.png");

// System tab
await page.locator('button:has-text("Système")').click();
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/admin-system.png", fullPage: false });
console.log("✓ /tmp/admin-system.png");

await browser.close();
