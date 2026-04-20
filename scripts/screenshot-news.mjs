import { chromium } from "playwright-core";

const execPath = "/Users/simonazoulay/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const browser = await chromium.launch({ executablePath: execPath });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// LVMH — bug company, lots of news
const slug = process.argv[2] || "lvmh-moet-hennessy-louis-vuitton-6990";
await page.goto(`https://insiders-trades-sigma.vercel.app/company/${slug}`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
// Scroll to news section
await page.waitForSelector('text="Actualités"', { timeout: 15000 }).catch(() => {});
const el = await page.$('text="Actualités"');
if (el) {
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const box = await el.boundingBox();
  await page.screenshot({
    path: "/tmp/news.png",
    clip: { x: 0, y: Math.max(0, (box?.y ?? 300) - 40), width: 1280, height: 900 },
  });
  console.log("✓ /tmp/news.png (cropped to news section)");
} else {
  await page.screenshot({ path: "/tmp/news.png", fullPage: true });
  console.log("✓ /tmp/news.png (full page — heading not found)");
}
await browser.close();
