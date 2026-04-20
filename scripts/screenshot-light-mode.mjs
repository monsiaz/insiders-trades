import { chromium } from "playwright-core";

const execPath = "/Users/simonazoulay/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

const browser = await chromium.launch({ executablePath: execPath });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  colorScheme: "light",
});
const page = await context.newPage();

async function forceLight() {
  // Force .light class on html + set localStorage. Run after page load.
  await page.evaluate(() => {
    try { localStorage.setItem("it-theme", "light"); } catch {}
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  });
  await page.waitForTimeout(400);
}

// Home — full page light
await page.goto("https://insiders-trades-sigma.vercel.app/", { waitUntil: "networkidle" });
await forceLight();
await page.screenshot({ path: "/tmp/home-light.png", fullPage: true });
console.log("✓ /tmp/home-light.png (fullPage)");

// Recommendations
await page.goto("https://insiders-trades-sigma.vercel.app/recommendations", { waitUntil: "networkidle" });
await forceLight();
await page.screenshot({ path: "/tmp/reco-light.png", fullPage: false });
console.log("✓ /tmp/reco-light.png");

await browser.close();
